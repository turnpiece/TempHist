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
const OUTPUT_DIR = './dist/data'; // Write directly to dist for serving
const LOCATIONS_FILE = 'preapproved-locations.json';

console.log('🚀 Starting cron job: fetch-daily-data');
console.log(`📡 API Base: ${API_BASE}`);
console.log(`📂 Output Dir: ${OUTPUT_DIR}`);
console.log(`🔑 API Token: ${API_TOKEN ? `${API_TOKEN.substring(0, 8)}...` : 'NOT SET'}`);
console.log(`🔑 API Token Length: ${API_TOKEN ? API_TOKEN.length : 0}`);
console.log(`🔑 API Token Type: ${typeof API_TOKEN}`);
console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
console.log(`📋 All env vars starting with VITE_:`, Object.keys(process.env).filter(key => key.startsWith('VITE_')).map(key => `${key}=${process.env[key]}`));
console.log(`📋 All env vars starting with API_:`, Object.keys(process.env).filter(key => key.startsWith('API_')).map(key => `${key}=${process.env[key]}`));
console.log(`📋 Raw process.env.API_TOKEN:`, JSON.stringify(process.env.API_TOKEN));

async function checkApiHealth() {
  try {
    const healthUrl = `${API_BASE}/health`;
    console.log(`🏥 Checking API health at: ${healthUrl}`);
    
    const response = await axios.get(healthUrl, {
      timeout: 10000,
      headers: {
        'Accept': 'application/json'
      }
    });

    if (response.status === 200) {
      console.log('✅ API health check passed');
      return true;
    } else {
      console.error(`❌ API health check failed with status: ${response.status}`);
      return false;
    }
  } catch (error) {
    console.error('❌ API health check failed:', error.message);
    if (error.code) {
      console.error(`🔧 Error code: ${error.code}`);
    }
    return false;
  }
}

async function loadLocations() {
  try {
    const locationsPath = path.join(OUTPUT_DIR, LOCATIONS_FILE);
    const data = await fs.readFile(locationsPath, 'utf8');
    const parsed = JSON.parse(data);
    
    if (parsed.locations && Array.isArray(parsed.locations)) {
      console.log(`📖 Loaded ${parsed.locations.length} locations`);
      return parsed.locations;
    } else {
      throw new Error('Invalid locations file format');
    }
  } catch (error) {
    console.error('❌ Failed to load locations:', error.message);
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
    
    console.log(`📡 Fetching daily data for: ${location}`);
    console.log(`🔗 Full URL: ${url}`);
    console.log(`🔑 API Token: ${API_TOKEN.substring(0, 8)}...`);
    console.log(`🌐 API Base: ${API_BASE}`);
    
    const response = await axios.get(url, {
      timeout: 30000,
      headers: {
        'Authorization': `Bearer ${API_TOKEN}`,
        'Accept': 'application/json'
      }
    });

    console.log(`✅ Response status: ${response.status}`);
    console.log(`📊 Response data keys: ${Object.keys(response.data || {}).join(', ')}`);

    if (response.status !== 200) {
      throw new Error(`API returned status ${response.status}`);
    }

    return response.data;
    
  } catch (error) {
    console.error(`❌ Failed to fetch data for ${location}:`, error.message);
    if (error.response) {
      console.error(`📊 Response status: ${error.response.status}`);
      console.error(`📄 Response data:`, error.response.data);
      
      // Handle rate limiting (429) - exit immediately
      if (error.response.status === 429) {
        console.error(`🚫 Rate limit exceeded for ${location}. Exiting to avoid further rate limit violations.`);
        console.error('❌ Cron job failed due to rate limiting');
        process.exit(1);
      }
      
      // Handle authentication errors (401/403) - continue with other locations
      if (error.response.status === 401 || error.response.status === 403) {
        console.error(`🔐 Authentication failed for ${location}. This may indicate an API token issue.`);
        return null;
      }
    }
    if (error.code) {
      console.error(`🔧 Error code: ${error.code}`);
      
      // Handle connection errors - these might be temporary
      if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND' || error.code === 'ETIMEDOUT') {
        console.error(`🌐 Connection error for ${location}. This may be a temporary network issue.`);
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
    const dailyDataDir = path.join(OUTPUT_DIR, 'daily-data');
    
    // Ensure daily-data directory exists
    await fs.mkdir(dailyDataDir, { recursive: true });
    
    const filepath = path.join(dailyDataDir, filename);
    
    const fileData = {
      location: location,
      identifier: identifier,
      fetched_at: new Date().toISOString(),
      data: data
    };
    
    await fs.writeFile(filepath, JSON.stringify(fileData, null, 2));
    console.log(`💾 Data saved: ${filename}`);
    
    return filepath;
    
  } catch (error) {
    console.error(`❌ Failed to save data for ${location}:`, error.message);
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
    
    console.log(`📅 Processing data for: ${identifier}`);
    
    // Load locations
    const locations = await loadLocations();
    
    // Ensure output directory exists
    await fs.mkdir(OUTPUT_DIR, { recursive: true });
    
    // Track results
    let successCount = 0;
    let failureCount = 0;
    
    // Process each location
    for (const location of locations) {
      try {
        console.log(`\n📍 Processing: ${location}`);
        
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
        console.error(`❌ Error processing ${location}:`, error.message);
        
        // If it's a rate limit error, exit immediately
        if (error.message.includes('Rate limit exceeded')) {
          console.error(`🚫 Rate limit exceeded. Stopping processing to avoid further violations.`);
          console.error(`📊 Processed ${successCount} locations successfully before rate limit hit.`);
          console.error('❌ Cron job failed due to rate limiting');
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
    
    const dailyDataDir = path.join(OUTPUT_DIR, 'daily-data');
    await fs.mkdir(dailyDataDir, { recursive: true });
    
    const summaryPath = path.join(dailyDataDir, `summary_${identifier}.json`);
    await fs.writeFile(summaryPath, JSON.stringify(summary, null, 2));
    
    console.log('\n✅ Cron job completed successfully');
    console.log(`📊 Summary: ${successCount} successful, ${failureCount} failed out of ${locations.length} locations`);
    console.log(`📄 Summary saved to: ${summaryPath}`);
    
    // Exit cleanly as required by cron jobs
    process.exit(0);
    
  } catch (error) {
    console.error('❌ Cron job failed:', error.message);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGTERM', () => {
  console.log('📡 Received SIGTERM, shutting down gracefully...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('📡 Received SIGINT, shutting down gracefully...');
  process.exit(0);
});

// Run the job
main();
