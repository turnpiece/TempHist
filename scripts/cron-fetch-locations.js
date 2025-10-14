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

console.log('🚀 Starting Railway cron job: fetch-locations');
console.log(`📡 API Base: ${API_BASE}`);
console.log(`📂 Output Dir: ${OUTPUT_DIR}`);

async function fetchLocations() {
  try {
    if (!API_TOKEN) {
      throw new Error('API_TOKEN environment variable is required');
    }

    console.log('📡 Fetching locations from API...');
    
    const response = await axios.get(`${API_BASE}/v1/locations/preapproved`, {
      timeout: 30000,
      headers: {
        'Authorization': `Bearer ${API_TOKEN}`,
        'Accept': 'application/json'
      }
    });

    if (response.status !== 200) {
      throw new Error(`API returned status ${response.status}`);
    }

    const data = response.data;
    console.log(`✅ Fetched ${data.locations?.length || 0} locations`);

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
    console.error('❌ Railway cron job failed:', error.message);
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
fetchLocations();
