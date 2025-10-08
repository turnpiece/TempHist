#!/usr/bin/env php
<?php
/**
 * Server-side script to fetch preapproved locations from API and save to file
 * This script is designed to be run via cron job on the production server
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
$apiBase = getenv('VITE_API_BASE') ?: 'https://api.temphist.com';
$outputDir = getenv('OUTPUT_DIR') ?: './public/data';
$locationsFile = 'preapproved-locations.json';

// Fallback locations if API fails
$fallbackLocations = [
    'London, England, United Kingdom',
    'New York, New York, United States',
    'Paris, Île-de-France, France',
    'Tokyo, Tokyo, Japan',
    'Sydney, New South Wales, Australia',
    'Berlin, Berlin, Germany',
    'Madrid, Madrid, Spain',
    'Rome, Lazio, Italy',
    'Amsterdam, North Holland, Netherlands',
    'Vancouver, British Columbia, Canada',
    'Melbourne, Victoria, Australia',
    'Barcelona, Catalonia, Spain',
    'Munich, Bavaria, Germany',
    'Vienna, Vienna, Austria',
    'Prague, Prague, Czech Republic',
    'Warsaw, Masovian Voivodeship, Poland',
    'Stockholm, Stockholm, Sweden',
    'Copenhagen, Capital Region, Denmark',
    'Oslo, Oslo, Norway',
    'Helsinki, Uusimaa, Finland'
];

function ensureOutputDir($dir) {
    if (!file_exists($dir)) {
        if (!mkdir($dir, 0755, true)) {
            throw new Exception("Failed to create output directory: $dir");
        }
        echo "📁 Output directory created: $dir\n";
    } else {
        echo "📁 Output directory exists: $dir\n";
    }
}

function fetchLocationsFromAPI($apiBase, $fallbackLocations) {
    $url = "$apiBase/v1/locations/preapproved";
    echo "🔄 Fetching locations from API: $url\n";
    
    // Initialize cURL
    $ch = curl_init();
    curl_setopt($ch, CURLOPT_URL, $url);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_TIMEOUT, 30);
    curl_setopt($ch, CURLOPT_USERAGENT, 'TempHist-LocationFetcher/1.0');
    curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
    
    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $error = curl_error($ch);
    curl_close($ch);
    
    if ($response === false || $httpCode !== 200) {
        echo "❌ Failed to fetch locations from API";
        if ($error) {
            echo ": $error";
        }
        echo " (HTTP $httpCode)\n";
        echo "🔄 Using fallback locations\n";
        return $fallbackLocations;
    }
    
    $data = json_decode($response, true);
    
    if ($data && isset($data['locations']) && is_array($data['locations'])) {
        echo "✅ Successfully fetched " . count($data['locations']) . " locations from API\n";
        return $data['locations'];
    } else {
        echo "⚠️ API returned invalid data structure, using fallback locations\n";
        return $fallbackLocations;
    }
}

function saveLocationsToFile($locations, $outputDir, $fileName, $fallbackLocations) {
    $outputPath = "$outputDir/$fileName";
    
    $data = [
        'locations' => $locations,
        'lastUpdated' => date('c'),
        'count' => count($locations),
        'source' => ($locations === $fallbackLocations) ? 'fallback' : 'api'
    ];
    
    $json = json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);
    
    if (file_put_contents($outputPath, $json) === false) {
        throw new Exception("Failed to save locations to file: $outputPath");
    }
    
    echo "💾 Locations saved to: $outputPath\n";
    echo "📊 Saved " . count($locations) . " locations (source: {$data['source']})\n";
    
    return $outputPath;
}

// Main execution
try {
    echo "🚀 Starting location fetch process...\n";
    echo "📅 Timestamp: " . date('c') . "\n";
    
    // Ensure output directory exists
    ensureOutputDir($outputDir);
    
    // Fetch locations from API
    $locations = fetchLocationsFromAPI($apiBase, $fallbackLocations);
    
    // Save to file
    $outputPath = saveLocationsToFile($locations, $outputDir, $locationsFile, $fallbackLocations);
    
    echo "✅ Location fetch process completed successfully\n";
    echo "📄 Output file: $outputPath\n";
    
    exit(0);
    
} catch (Exception $e) {
    echo "💥 Location fetch process failed: " . $e->getMessage() . "\n";
    exit(1);
}

