#!/usr/bin/env php
<?php
/**
 * Server-side script to prefetch temperature data for all preapproved locations
 * This script fetches daily, weekly, monthly, and yearly data for each location
 * Uses the async API endpoints with proper authentication
 * Designed to be run via cron job on the production server
 */

// Load .env file if it exists
function loadEnvFile($path = '.env') {
    if (file_exists($path)) {
        $lines = file($path, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
        foreach ($lines as $line) {
            if (strpos(trim($line), '#') === 0) continue; // Skip comments
            
            list($name, $value) = explode('=', $line, 2) + [null, null];
            if ($name && $value !== null) {
                $name = trim($name);
                $value = trim($value);
                if (!getenv($name)) {
                    putenv("$name=$value");
                }
            }
        }
    }
}

// Load .env file from script directory or parent
$scriptDir = dirname(__FILE__);
loadEnvFile("$scriptDir/../.env");
loadEnvFile("$scriptDir/.env");

// Configuration
$apiBase = getenv('VITE_API_BASE') ?: (getenv('NODE_ENV') === 'development' ? 'http://localhost:3000' : 'https://api.temphist.com');
$apiToken = getenv('API_TOKEN');
$outputDir = getenv('OUTPUT_DIR') ?: './public/data';
$locationsFile = 'preapproved-locations.json';
$dailyDataDir = 'daily-data';

// Global auth token
$authToken = null;

function getAuthToken() {
    global $apiToken, $apiBase;
    
    // Use API_TOKEN environment variable for authentication
    if ($apiToken) {
        echo "✅ Using API_TOKEN for authentication\n";
        return $apiToken;
    }
    
    // Fallback: use test token for development
    if (strpos($apiBase, 'localhost') !== false) {
        $testToken = getenv('TEST_TOKEN') ?: 'test_token';
        echo "🔧 Using development mode - using test token from environment\n";
        return $testToken;
    }
    
    throw new Exception('API_TOKEN environment variable is required for production API');
}

function loadLocations($outputDir, $locationsFile) {
    $locationsPath = "$outputDir/$locationsFile";
    
    if (!file_exists($locationsPath)) {
        throw new Exception("Locations file not found: $locationsPath");
    }
    
    $data = json_decode(file_get_contents($locationsPath), true);
    
    if ($data && isset($data['locations']) && is_array($data['locations'])) {
        echo "📖 Loaded " . count($data['locations']) . " locations from $locationsPath\n";
        return $data['locations'];
    } else {
        throw new Exception('Invalid locations file format');
    }
}

function ensureOutputDir($outputDir, $dailyDataDir) {
    $dailyDataPath = "$outputDir/$dailyDataDir";
    
    if (!file_exists($dailyDataPath)) {
        if (!mkdir($dailyDataPath, 0755, true)) {
            throw new Exception("Failed to create daily data directory: $dailyDataPath");
        }
        echo "📁 Daily data directory created: $dailyDataPath\n";
    } else {
        echo "📁 Daily data directory exists: $dailyDataPath\n";
    }
}

function createAsyncJob($period, $location, $identifier, $apiBase, $authToken) {
    $apiPeriod = match($period) {
        'week' => 'weekly',
        'month' => 'monthly',
        'year' => 'yearly',
        default => 'daily'
    };
    
    $url = "$apiBase/v1/records/$apiPeriod/" . urlencode($location) . "/$identifier/async";
    
    echo "🔄 Creating $period job for $location ($identifier)...\n";
    
    $headers = [
        'Content-Type: application/json',
        'User-Agent: TempHist-DataFetcher/1.0'
    ];
    
    // Only add Authorization header if we have a token
    if ($authToken) {
        $headers[] = "Authorization: Bearer $authToken";
    }
    
    $ch = curl_init();
    curl_setopt($ch, CURLOPT_URL, $url);
    curl_setopt($ch, CURLOPT_POST, true);
    curl_setopt($ch, CURLOPT_POSTFIELDS, '{}');
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_TIMEOUT, 30);
    curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);
    curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
    
    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $error = curl_error($ch);
    curl_close($ch);
    
    if ($response === false || $httpCode !== 200) {
        $errorMsg = "Failed to create $period job for $location";
        if ($error) {
            $errorMsg .= ": $error";
        }
        $errorMsg .= " (HTTP $httpCode)";
        throw new Exception($errorMsg);
    }
    
    $data = json_decode($response, true);
    
    if ($data && isset($data['job_id'])) {
        echo "✅ Job created: {$data['job_id']}\n";
        return $data['job_id'];
    } else {
        throw new Exception('Invalid job response: missing job_id');
    }
}

function pollJobStatus($jobId, $apiBase, $authToken, $maxPolls = 100, $pollInterval = 3) {
    $pollCount = 0;
    
    while ($pollCount < $maxPolls) {
        $url = "$apiBase/v1/jobs/$jobId";
        $headers = [
            'User-Agent: TempHist-DataFetcher/1.0'
        ];
        
        // Only add Authorization header if we have a token
        if ($authToken) {
            $headers[] = "Authorization: Bearer $authToken";
        }
        
        $ch = curl_init();
        curl_setopt($ch, CURLOPT_URL, $url);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_TIMEOUT, 10);
        curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);
        curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
        
        $response = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);
        
        if ($httpCode === 404) {
            throw new Exception("Job $jobId not found");
        }
        
        if ($response !== false && $httpCode === 200) {
            $job = json_decode($response, true);
            
            if ($job) {
                if ($job['status'] === 'completed' || $job['status'] === 'ready') {
                    echo "✅ Job $jobId completed (status: {$job['status']})\n";
                    return $job['result'];
                } else if ($job['status'] === 'failed') {
                    $errorMsg = isset($job['error']) ? $job['error'] : 'Unknown error';
                    throw new Exception("Job $jobId failed: $errorMsg");
                } else if (in_array($job['status'], ['running', 'pending', 'processing'])) {
                    $pollCount++;
                    echo "⏳ Job $jobId status: {$job['status']} ($pollCount/$maxPolls)\n";
                    sleep($pollInterval);
                } else {
                    throw new Exception("Unknown job status: {$job['status']}");
                }
            } else {
                throw new Exception('Invalid job status response');
            }
        }
    }
    
    throw new Exception("Job $jobId timed out after $maxPolls polls");
}

function checkDataUpdated($period, $location, $identifier, $apiBase, $authToken) {
    $apiPeriod = match($period) {
        'week' => 'weekly',
        'month' => 'monthly',
        'year' => 'yearly',
        default => 'daily'
    };
    
    $url = "$apiBase/v1/records/$apiPeriod/" . urlencode($location) . "/$identifier/updated";
    
    $headers = [
        'User-Agent: TempHist-DataFetcher/1.0'
    ];
    
    // Only add Authorization header if we have a token
    if ($authToken) {
        $headers[] = "Authorization: Bearer $authToken";
    }
    
    $ch = curl_init();
    curl_setopt($ch, CURLOPT_URL, $url);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_TIMEOUT, 10);
    curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);
    curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
    
    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    
    if ($response !== false && $httpCode === 200) {
        $data = json_decode($response, true);
        if ($data) {
            return $data;
        }
    }
    
    echo "❌ Failed to check $period data update status for $location\n";
    // If we can't check the status, assume we need to fetch
    return ['updated' => null, 'cached' => false];
}

function fetchDataForLocation($location, $periods, $identifier, $apiBase, $authToken, $outputDir, $dailyDataDir) {
    $results = [];
    
    foreach ($periods as $period) {
        try {
            echo "🔄 Processing $period data for $location...\n";
            
            // Check if data needs to be updated
            $updateStatus = checkDataUpdated($period, $location, $identifier, $apiBase, $authToken);
            
            if ($updateStatus['updated'] === null) {
                echo "📥 $period data has never been fetched, fetching now...\n";
            } else {
                echo "📅 $period data last updated: {$updateStatus['updated']}\n";
                echo "💾 $period data is cached: " . ($updateStatus['cached'] ? 'true' : 'false') . "\n";
                
                // Check if we already have this data locally
                $safeLocation = preg_replace('/[^a-zA-Z0-9]/', '_', strtolower($location));
                $localDataPath = "$outputDir/$dailyDataDir/{$safeLocation}_$identifier.json";
                
                if (file_exists($localDataPath)) {
                    $localData = json_decode(file_get_contents($localDataPath), true);
                    
                    if ($localData && isset($localData['data'][$period])) {
                        $localUpdated = strtotime($localData['lastUpdated']);
                        $apiUpdated = strtotime($updateStatus['updated']);
                        
                        if ($localUpdated >= $apiUpdated) {
                            echo "✅ $period data is up to date locally, skipping fetch\n";
                            $results[$period] = $localData['data'][$period];
                            continue;
                        } else {
                            echo "🔄 $period data has been updated on API, fetching new data...\n";
                        }
                    } else {
                        echo "📥 $period data missing locally, fetching now...\n";
                    }
                } else {
                    echo "📥 $period data not found locally, fetching now...\n";
                }
            }
            
            // Create async job
            $jobId = createAsyncJob($period, $location, $identifier, $apiBase, $authToken);
            
            // Poll for completion
            $data = pollJobStatus($jobId, $apiBase, $authToken);
            
            if ($data && isset($data['data'])) {
                $results[$period] = $data['data'];
                echo "✅ $period data fetched for $location\n";
            } else {
                echo "⚠️ No $period data returned for $location\n";
                $results[$period] = null;
            }
            
            // Small delay between periods
            sleep(1);
            
        } catch (Exception $e) {
            echo "❌ Failed to fetch $period data for $location: " . $e->getMessage() . "\n";
            $results[$period] = null;
        }
    }
    
    return $results;
}

function saveLocationData($location, $data, $identifier, $outputDir, $dailyDataDir) {
    // Create a safe filename from the location
    $safeLocation = preg_replace('/[^a-zA-Z0-9]/', '_', strtolower($location));
    $filename = "{$safeLocation}_$identifier.json";
    $filepath = "$outputDir/$dailyDataDir/$filename";
    
    $fileData = [
        'location' => $location,
        'identifier' => $identifier,
        'data' => $data,
        'lastUpdated' => date('c')
    ];
    
    if (file_put_contents($filepath, json_encode($fileData, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES)) === false) {
        throw new Exception("Failed to save data for $location");
    }
    
    echo "💾 Data saved for $location: $filename\n";
    return $filepath;
}

function cleanupOldData($outputDir, $dailyDataDir) {
    $dailyDataPath = "$outputDir/$dailyDataDir";
    
    if (!file_exists($dailyDataPath)) {
        return;
    }
    
    // Get today's identifier
    $today = new DateTime();
    $useYesterday = (int)$today->format('H') < 1;
    $dateToUse = clone $today;
    
    if ($useYesterday) {
        $dateToUse->modify('-1 day');
    }
    
    // Handle 29 Feb fallback
    $isLeapDay = (int)$dateToUse->format('d') === 29 && (int)$dateToUse->format('m') === 2;
    if ($isLeapDay) {
        $dateToUse->setDate((int)$dateToUse->format('Y'), 2, 28);
    }
    
    $currentIdentifier = $dateToUse->format('m-d');
    
    $files = scandir($dailyDataPath);
    $cleanedCount = 0;
    
    foreach ($files as $file) {
        if (substr($file, -5) === '.json' && strpos($file, $currentIdentifier) === false && $file !== '.' && $file !== '..') {
            $filepath = "$dailyDataPath/$file";
            if (unlink($filepath)) {
                $cleanedCount++;
            }
        }
    }
    
    if ($cleanedCount > 0) {
        echo "🧹 Cleaned up $cleanedCount old data files\n";
    }
}

// Main execution
try {
    echo "🚀 Starting temperature data prefetch process...\n";
    echo "📅 Timestamp: " . date('c') . "\n";
    echo "🌐 Using API: $apiBase\n";
    
    // Get authentication token
    $authToken = getAuthToken();
    
    // Get current date identifier
    $now = new DateTime();
    $useYesterday = (int)$now->format('H') < 1;
    $dateToUse = clone $now;
    
    if ($useYesterday) {
        $dateToUse->modify('-1 day');
    }
    
    // Handle 29 Feb fallback
    $isLeapDay = (int)$dateToUse->format('d') === 29 && (int)$dateToUse->format('m') === 2;
    if ($isLeapDay) {
        $dateToUse->setDate((int)$dateToUse->format('Y'), 2, 28);
    }
    
    $identifier = $dateToUse->format('m-d');
    echo "📅 Fetching data for identifier: $identifier\n";
    
    // Load locations
    $locations = loadLocations($outputDir, $locationsFile);
    
    // Ensure output directory exists
    ensureOutputDir($outputDir, $dailyDataDir);
    
    // Define periods to fetch
    $periods = ['daily', 'week', 'month', 'year'];
    
    // Track results
    $successCount = 0;
    $failureCount = 0;
    $results = [];
    
    // Clean up old data first
    cleanupOldData($outputDir, $dailyDataDir);
    
    // Fetch data for each location
    foreach ($locations as $location) {
        try {
            echo "\n📍 Processing location: $location\n";
            
            $data = fetchDataForLocation($location, $periods, $identifier, $apiBase, $authToken, $outputDir, $dailyDataDir);
            
            // Check if we got any data
            $hasData = false;
            foreach ($data as $periodData) {
                if ($periodData !== null) {
                    $hasData = true;
                    break;
                }
            }
            
            if ($hasData) {
                saveLocationData($location, $data, $identifier, $outputDir, $dailyDataDir);
                $successCount++;
                
                $successfulPeriods = [];
                foreach ($data as $p => $d) {
                    if ($d !== null) {
                        $successfulPeriods[] = $p;
                    }
                }
                $results[] = [
                    'location' => $location,
                    'status' => 'success',
                    'periods' => $successfulPeriods
                ];
            } else {
                $failureCount++;
                $results[] = [
                    'location' => $location,
                    'status' => 'no_data'
                ];
            }
            
            // Add a delay to avoid overwhelming the API
            sleep(2);
            
        } catch (Exception $e) {
            echo "💥 Error processing $location: " . $e->getMessage() . "\n";
            $failureCount++;
            $results[] = [
                'location' => $location,
                'status' => 'error',
                'error' => $e->getMessage()
            ];
        }
    }
    
    // Save summary
    $summary = [
        'identifier' => $identifier,
        'totalLocations' => count($locations),
        'successCount' => $successCount,
        'failureCount' => $failureCount,
        'lastUpdated' => date('c'),
        'results' => $results
    ];
    
    $summaryPath = "$outputDir/$dailyDataDir/summary_$identifier.json";
    file_put_contents($summaryPath, json_encode($summary, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES));
    
    echo "\n✅ Temperature data prefetch process completed\n";
    echo "📊 Summary: $successCount successful, $failureCount failed out of " . count($locations) . " locations\n";
    echo "📄 Summary saved to: $summaryPath\n";
    
    exit(0);
    
} catch (Exception $e) {
    echo "💥 Temperature data prefetch process failed: " . $e->getMessage() . "\n";
    exit(1);
}

