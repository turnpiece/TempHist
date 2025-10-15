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

// For Railway cron jobs, use public API if internal URL fails
const getApiBase = () => {
  const base = process.env.VITE_API_BASE || 'https://temphist-api-develop.up.railway.app';
  // If it's an internal Railway URL and we're in production, try public URL first
  if (base.includes('.railway.internal') && process.env.NODE_ENV === 'production') {
    console.log('🔄 Internal Railway URL detected, using public API URL for cron job');
    return 'https://temphist-api-develop.up.railway.app';
  }
  return base;
};
const API_TOKEN = process.env.API_TOKEN;
const OUTPUT_DIR = './dist/data'; // Write directly to dist for serving

console.log('🚀 Starting Railway cron job: fetch-locations');
console.log(`📡 API Base: ${API_BASE}`);
console.log(`📂 Output Dir: ${OUTPUT_DIR}`);
console.log(`🔑 API Token: ${API_TOKEN ? `${API_TOKEN.substring(0, 8)}...` : 'NOT SET'}`);
console.log(`🔑 API Token Length: ${API_TOKEN ? API_TOKEN.length : 0}`);
console.log(`🔑 API Token Type: ${typeof API_TOKEN}`);
console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
console.log(`📋 All env vars starting with VITE_:`, Object.keys(process.env).filter(key => key.startsWith('VITE_')).map(key => `${key}=${process.env[key]}`));
console.log(`📋 All env vars starting with API_:`, Object.keys(process.env).filter(key => key.startsWith('API_')).map(key => `${key}=${process.env[key]}`));
console.log(`📋 Raw process.env.API_TOKEN:`, JSON.stringify(process.env.API_TOKEN));

async function loadFallbackLocations() {
  try {
    const fallbackPath = path.join(OUTPUT_DIR, 'preapproved-locations.json');
    const data = await fs.readFile(fallbackPath, 'utf8');
    const parsed = JSON.parse(data);
    
    if (parsed.locations && Array.isArray(parsed.locations)) {
      console.log(`📖 Loaded ${parsed.locations.length} fallback locations from file`);
      return parsed.locations;
    } else {
      throw new Error('Invalid fallback locations file format');
    }
  } catch (error) {
    console.error('❌ Failed to load fallback locations:', error.message);
    throw error;
  }
}

async function fetchLocations() {
  try {
    if (!API_TOKEN) {
      throw new Error('API_TOKEN environment variable is required');
    }

    const apiBase = getApiBase();
    const url = `${apiBase}/v1/locations/preapproved`;
    console.log('📡 Fetching locations from API...');
    console.log(`🔗 Full URL: ${url}`);
    console.log(`🔑 API Token: ${API_TOKEN.substring(0, 8)}...`);
    console.log(`🌐 API Base: ${apiBase}`);
    
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

    const data = response.data;
    console.log(`✅ Fetched ${data.locations?.length || 0} locations from API`);

    // Ensure output directory exists
    await fs.mkdir(OUTPUT_DIR, { recursive: true });

    // Write to dist directory for immediate serving
    const outputPath = path.join(OUTPUT_DIR, 'preapproved-locations.json');
    await fs.writeFile(outputPath, JSON.stringify(data, null, 2));
    
    console.log(`💾 Locations saved to: ${outputPath}`);
    console.log('✅ Railway cron job completed successfully');
    
    // Exit cleanly as required by Railway cron jobs
    process.exit(0);
    
  } catch (error) {
    console.error('❌ API fetch failed, using fallback locations:', error.message);
    if (error.response) {
      console.error(`📊 Response status: ${error.response.status}`);
      console.error(`📄 Response data:`, error.response.data);
      
      // Handle rate limiting (429) - exit immediately
      if (error.response.status === 429) {
        console.error(`🚫 Rate limit exceeded. Exiting to avoid further rate limit violations.`);
        throw new Error(`Rate limit exceeded: ${error.response.data?.detail || 'Too many requests'}`);
      }
      
      // Handle authentication errors (401/403) - use fallback
      if (error.response.status === 401 || error.response.status === 403) {
        console.error(`🔐 Authentication failed. This may indicate an API token issue.`);
      }
    }
    if (error.code) {
      console.error(`🔧 Error code: ${error.code}`);
      
      // Handle connection errors - these might be temporary
      if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND' || error.code === 'ETIMEDOUT') {
        console.error(`🌐 Connection error. This may be a temporary network issue.`);
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
      console.log(`💾 Fallback locations saved to: ${outputPath}`);
      console.log('✅ Railway cron job completed with fallback data');
      
      process.exit(0);
      
    } catch (fallbackError) {
      console.error('❌ Railway cron job failed completely:', fallbackError.message);
      
      // If it's a rate limit error, exit with specific code
      if (fallbackError.message.includes('Rate limit exceeded')) {
        console.error(`🚫 Rate limit exceeded. Cannot proceed with fallback either.`);
        process.exit(1);
      }
      
      process.exit(1);
    }
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
fetchLocations();
