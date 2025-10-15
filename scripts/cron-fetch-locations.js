#!/usr/bin/env node

/**
 * Railway Cron Job: Fetch Locations
 * Runs daily to update preapproved locations
 * Designed to exit cleanly after completion
 */

const fs = require('fs').promises;
const path = require('path');
const axios = require('axios');

// Configuration
const API_BASE = process.env.VITE_API_BASE || 'https://temphist-api-develop.up.railway.app';
const API_TOKEN = process.env.API_TOKEN;
const OUTPUT_DIR = './dist/data'; // Write directly to dist for serving

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

log('🚀 Starting cron job: fetch-locations');
log(`📡 API Base: ${API_BASE}`);
log(`📂 Output Dir: ${OUTPUT_DIR}`);
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

async function loadFallbackLocations() {
  try {
    const fallbackPath = path.join(OUTPUT_DIR, 'preapproved-locations.json');
    const data = await fs.readFile(fallbackPath, 'utf8');
    const parsed = JSON.parse(data);
    
    if (parsed.locations && Array.isArray(parsed.locations)) {
      debugLog(`📖 Loaded ${parsed.locations.length} fallback locations from file`);
      return parsed.locations;
    } else {
      throw new Error('Invalid fallback locations file format');
    }
  } catch (error) {
    errorLog('❌ Failed to load fallback locations:', error.message);
    throw error;
  }
}

async function fetchLocations() {
  try {
    if (!API_TOKEN) {
      throw new Error('API_TOKEN environment variable is required');
    }

    // Check API health first
    const isHealthy = await checkApiHealth();
    if (!isHealthy) {
      throw new Error('API health check failed - API is not accessible');
    }

    const url = `${API_BASE}/v1/locations/preapproved`;
    log('📡 Fetching locations from API...');
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

    const data = response.data;
    log(`✅ Fetched ${data.locations?.length || 0} locations from API`);

    // Ensure output directory exists
    await fs.mkdir(OUTPUT_DIR, { recursive: true });

    // Write to dist directory for immediate serving
    const outputPath = path.join(OUTPUT_DIR, 'preapproved-locations.json');
    await fs.writeFile(outputPath, JSON.stringify(data, null, 2));
    
    log(`💾 Locations saved to: ${outputPath}`);
    log('✅ Cron job completed successfully');
    
    // Exit cleanly as required by cron jobs
    process.exit(0);
    
  } catch (error) {
    errorLog('❌ API fetch failed, using fallback locations:', error.message);
    if (error.response) {
      debugLog(`📊 Response status: ${error.response.status}`);
      debugLog(`📄 Response data:`, error.response.data);
      
      // Handle rate limiting (429) - exit immediately
      if (error.response.status === 429) {
        errorLog(`🚫 Rate limit exceeded. Exiting to avoid further rate limit violations.`);
        errorLog('❌ Cron job failed due to rate limiting');
        process.exit(1);
      }
      
      // Handle authentication errors (401/403) - use fallback
      if (error.response.status === 401 || error.response.status === 403) {
        errorLog(`🔐 Authentication failed. This may indicate an API token issue.`);
      }
    }
    if (error.code) {
      debugLog(`🔧 Error code: ${error.code}`);
      
      // Handle connection errors - these might be temporary
      if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND' || error.code === 'ETIMEDOUT') {
        debugLog(`🌐 Connection error. This may be a temporary network issue.`);
      }
    }
    
    try {
      // Load fallback locations from existing file
      const fallbackLocations = await loadFallbackLocations();
      
      // Ensure output directory exists
      await fs.mkdir(OUTPUT_DIR, { recursive: true });
      
      // Save fallback locations with updated timestamp
      const outputPath = path.join(OUTPUT_DIR, 'preapproved-locations.json');
      const fallbackData = {
        locations: fallbackLocations,
        lastUpdated: new Date().toISOString(),
        count: fallbackLocations.length,
        source: 'fallback'
      };
      
      await fs.writeFile(outputPath, JSON.stringify(fallbackData, null, 2));
      log(`💾 Fallback locations saved to: ${outputPath}`);
      log('✅ Cron job completed with fallback data');
      
      process.exit(0);
      
    } catch (fallbackError) {
      errorLog('❌ Cron job failed completely:', fallbackError.message);
      
      // If it's a rate limit error, exit with specific code
      if (fallbackError.message.includes('Rate limit exceeded')) {
        errorLog(`🚫 Rate limit exceeded. Cannot proceed with fallback either.`);
        process.exit(1);
      }
      
      process.exit(1);
    }
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
fetchLocations();
