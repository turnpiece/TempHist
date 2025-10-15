#!/usr/bin/env node

/**
 * Railway Cron Job: Fetch Daily Data
 * Runs hourly to update daily temperature data
 * Designed to exit cleanly after completion
 * Optimized for Railway cron job execution
 */

const fs = require('fs').promises;
const path = require('path');
const axios = require('axios');

// Configuration
const API_BASE = process.env.VITE_API_BASE || 'https://temphist-api-develop.up.railway.app';
const API_TOKEN = process.env.API_TOKEN;
const OUTPUT_DIR = process.env.OUTPUT_DIR || './dist/data'; // Allow override via environment variable
const LOCATIONS_FILE = 'preapproved-locations.json';

// Railway-specific configuration
const IS_RAILWAY = process.env.RAILWAY_ENVIRONMENT !== undefined;
const RAILWAY_DATA_DIR = IS_RAILWAY ? '/app/data' : OUTPUT_DIR;

// Debug logging control
const DEBUGGING = process.env.DEBUG_LOGGING === 'true' || process.env.NODE_ENV !== 'production';

// Helper functions for debug logging
function debugLog(...args) {
  if (DEBUGGING) {
    console.log(...args);
  }
}

function log(...args) {
  console.log(...args);
}

function errorLog(...args) {
  console.error(...args);
}

log('🚀 Starting cron job: fetch-daily-data');
log(`📡 API Base: ${API_BASE}`);
log(`📂 Output Dir: ${RAILWAY_DATA_DIR}`);
log(`🚂 Railway Environment: ${IS_RAILWAY ? 'Yes' : 'No'}`);
debugLog(`🔑 API Token: ${API_TOKEN ? `${API_TOKEN.substring(0, 8)}...` : 'NOT SET'}`);
debugLog(`🔑 API Token Length: ${API_TOKEN ? API_TOKEN.length : 0}`);
debugLog(`🔑 API Token Type: ${typeof API_TOKEN}`);
debugLog(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
debugLog(`📋 All env vars starting with VITE_:`, Object.keys(process.env).filter(key => key.startsWith('VITE_')).map(key => `${key}=${process.env[key]}`));
debugLog(`📋 All env vars starting with API_:`, Object.keys(process.env).filter(key => key.startsWith('API_')).map(key => `${key}=${process.env[key]}`));
debugLog(`📋 Raw process.env.API_TOKEN:`, JSON.stringify(process.env.API_TOKEN));

async function checkApiHealth() {
  try {
    const healthUrl = `${API_BASE}/health`;
    debugLog(`🏥 Checking API health at: ${healthUrl}`);
    
    const response = await axios.get(healthUrl, {
      timeout: 10000,
      headers: {
        'Accept': 'application/json'
      }
    });

    if (response.status === 200) {
      debugLog('✅ API health check passed');
      return true;
    } else {
      errorLog(`❌ API health check failed with status: ${response.status}`);
      return false;
    }
  } catch (error) {
    errorLog('❌ API health check failed:', error.message);
    if (error.code) {
      debugLog(`🔧 Error code: ${error.code}`);
    }
    return false;
  }
}

async function loadLocations() {
  try {
    const locationsPath = path.join(RAILWAY_DATA_DIR, LOCATIONS_FILE);
    const data = await fs.readFile(locationsPath, 'utf8');
    const parsed = JSON.parse(data);
    
    if (parsed.locations && Array.isArray(parsed.locations)) {
      debugLog(`📖 Loaded ${parsed.locations.length} locations`);
      return parsed.locations;
    } else {
      throw new Error('Invalid locations file format');
    }
  } catch (error) {
    errorLog('❌ Failed to load locations:', error.message);
    throw error;
  }
}

async function fetchDailyData(location, identifier) {
  try {
    if (!API_TOKEN) {
      throw new Error('API_TOKEN environment variable is required');
    }

    // Use sync API for faster execution in cron jobs
    const url = `${API_BASE}/v1/records/daily/${encodeURIComponent(location)}/${identifier}`;
    
    debugLog(`📡 Fetching daily data for: ${location}`);
    debugLog(`🔗 Full URL: ${url}`);
    debugLog(`🔑 API Token: ${API_TOKEN.substring(0, 8)}...`);
    debugLog(`🌐 API Base: ${API_BASE}`);
    
    const response = await axios.get(url, {
      timeout: 30000,
      headers: {
        'Authorization': `Bearer ${API_TOKEN}`,
        'Accept': 'application/json'
      }
    });

    debugLog(`✅ Response status: ${response.status}`);
    debugLog(`📊 Response data keys: ${Object.keys(response.data || {}).join(', ')}`);

    if (response.status !== 200) {
      throw new Error(`API returned status ${response.status}`);
    }

    return response.data;
    
  } catch (error) {
    errorLog(`❌ Failed to fetch data for ${location}:`, error.message);
    if (error.response) {
      debugLog(`📊 Response status: ${error.response.status}`);
      debugLog(`📄 Response data:`, error.response.data);
      
      // Handle rate limiting (429) - exit immediately
      if (error.response.status === 429) {
        errorLog(`🚫 Rate limit exceeded for ${location}. Exiting to avoid further rate limit violations.`);
        errorLog('❌ Cron job failed due to rate limiting');
        process.exit(1);
      }
      
      // Handle authentication errors (401/403) - continue with other locations
      if (error.response.status === 401 || error.response.status === 403) {
        errorLog(`🔐 Authentication failed for ${location}. This may indicate an API token issue.`);
        return null;
      }
    }
    if (error.code) {
      debugLog(`🔧 Error code: ${error.code}`);
      
      // Handle connection errors - these might be temporary
      if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND' || error.code === 'ETIMEDOUT') {
        debugLog(`🌐 Connection error for ${location}. This may be a temporary network issue.`);
        return null;
      }
    }
    return null;
  }
}

async function saveLocationData(location, data, identifier) {
  try {
    // Create a safe filename from the location
    const safeLocation = location.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
    const filename = `${safeLocation}_${identifier}.json`;
    const dailyDataDir = path.join(RAILWAY_DATA_DIR, 'daily-data');
    
    debugLog(`📁 Creating directory: ${dailyDataDir}`);
    
    // Ensure daily-data directory exists
    await fs.mkdir(dailyDataDir, { recursive: true });
    
    // Verify directory was created
    try {
      const stats = await fs.stat(dailyDataDir);
      if (!stats.isDirectory()) {
        throw new Error(`Path exists but is not a directory: ${dailyDataDir}`);
      }
      debugLog(`✅ Directory verified: ${dailyDataDir}`);
    } catch (statError) {
      throw new Error(`Failed to create or verify directory: ${dailyDataDir} - ${statError.message}`);
    }
    
    const filepath = path.join(dailyDataDir, filename);
    
    const fileData = {
      location: location,
      identifier: identifier,
      fetched_at: new Date().toISOString(),
      data: data
    };
    
    debugLog(`💾 Writing file: ${filepath}`);
    await fs.writeFile(filepath, JSON.stringify(fileData, null, 2));
    
    // Verify file was written
    try {
      const stats = await fs.stat(filepath);
      if (stats.size === 0) {
        throw new Error(`File was created but is empty: ${filepath}`);
      }
      debugLog(`✅ File verified: ${filename} (${stats.size} bytes)`);
    } catch (verifyError) {
      throw new Error(`Failed to verify file was written: ${filepath} - ${verifyError.message}`);
    }
    
    log(`💾 Data saved: ${filename}`);
    
    return filepath;
    
  } catch (error) {
    errorLog(`❌ Failed to save data for ${location}:`, error.message);
    errorLog(`❌ Output directory: ${RAILWAY_DATA_DIR}`);
    errorLog(`❌ Daily data directory: ${path.join(RAILWAY_DATA_DIR, 'daily-data')}`);
    throw error;
  }
}

async function main() {
  try {
    // Check API health first
    const isHealthy = await checkApiHealth();
    if (!isHealthy) {
      throw new Error('API health check failed - API is not accessible');
    }

    // Get today's date in MM-DD format
    const today = new Date();
    const identifier = `${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    
    log(`📅 Processing data for: ${identifier}`);
    
    // Load locations
    const locations = await loadLocations();
    
    // Ensure output directory exists
    await fs.mkdir(RAILWAY_DATA_DIR, { recursive: true });
    
    // Track results
    let successCount = 0;
    let failureCount = 0;
    
    // Process each location
    for (const location of locations) {
      try {
        debugLog(`\n📍 Processing: ${location}`);
        
        // Fetch daily data (using sync API for speed)
        const data = await fetchDailyData(location, identifier);
        
        if (data) {
          await saveLocationData(location, data, identifier);
          successCount++;
        } else {
          failureCount++;
        }
        
        // Small delay to avoid overwhelming the API
        await new Promise(resolve => setTimeout(resolve, 1000));
        
      } catch (error) {
        errorLog(`❌ Error processing ${location}:`, error.message);
        
        // If it's a rate limit error, exit immediately
        if (error.message.includes('Rate limit exceeded')) {
          errorLog(`🚫 Rate limit exceeded. Stopping processing to avoid further violations.`);
          errorLog(`📊 Processed ${successCount} locations successfully before rate limit hit.`);
          errorLog('❌ Cron job failed due to rate limiting');
          process.exit(1);
        }
        
        failureCount++;
      }
    }
    
    // Save summary
    const summary = {
      identifier: identifier,
      totalLocations: locations.length,
      successCount,
      failureCount,
      processed_at: new Date().toISOString()
    };
    
    const dailyDataDir = path.join(RAILWAY_DATA_DIR, 'daily-data');
    debugLog(`📁 Ensuring summary directory exists: ${dailyDataDir}`);
    await fs.mkdir(dailyDataDir, { recursive: true });
    
    // Verify directory exists
    try {
      const stats = await fs.stat(dailyDataDir);
      if (!stats.isDirectory()) {
        throw new Error(`Summary directory path exists but is not a directory: ${dailyDataDir}`);
      }
      debugLog(`✅ Summary directory verified: ${dailyDataDir}`);
    } catch (statError) {
      throw new Error(`Failed to create or verify summary directory: ${dailyDataDir} - ${statError.message}`);
    }
    
    const summaryPath = path.join(dailyDataDir, `summary_${identifier}.json`);
    debugLog(`💾 Writing summary file: ${summaryPath}`);
    await fs.writeFile(summaryPath, JSON.stringify(summary, null, 2));
    
    // Verify summary file was written
    try {
      const stats = await fs.stat(summaryPath);
      if (stats.size === 0) {
        throw new Error(`Summary file was created but is empty: ${summaryPath}`);
      }
      debugLog(`✅ Summary file verified: summary_${identifier}.json (${stats.size} bytes)`);
    } catch (verifyError) {
      throw new Error(`Failed to verify summary file was written: ${summaryPath} - ${verifyError.message}`);
    }
    
    log('\n✅ Cron job completed successfully');
    log(`📊 Summary: ${successCount} successful, ${failureCount} failed out of ${locations.length} locations`);
    log(`📄 Summary saved to: ${summaryPath}`);
    
    // List files in the daily-data directory for verification
    try {
      const files = await fs.readdir(dailyDataDir);
      log(`📁 Files in daily-data directory: ${files.length} files`);
      files.forEach(file => {
        const filePath = path.join(dailyDataDir, file);
        fs.stat(filePath).then(stats => {
          debugLog(`  - ${file} (${stats.size} bytes, ${stats.mtime.toISOString()})`);
        }).catch(() => {
          debugLog(`  - ${file} (size unknown)`);
        });
      });
    } catch (listError) {
      errorLog(`⚠️ Could not list files in daily-data directory: ${listError.message}`);
    }
    
    // Exit cleanly as required by cron jobs
    process.exit(0);
    
  } catch (error) {
    errorLog('❌ Cron job failed:', error.message);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGTERM', () => {
  debugLog('📡 Received SIGTERM, shutting down gracefully...');
  process.exit(0);
});

process.on('SIGINT', () => {
  debugLog('📡 Received SIGINT, shutting down gracefully...');
  process.exit(0);
});

// Run the job
main();
