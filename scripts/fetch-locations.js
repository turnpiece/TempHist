#!/usr/bin/env node

/**
 * Server-side script to fetch preapproved locations from API and save to file
 * This script is designed to be run via cron job on the production server
 */

const fs = require('fs').promises;
const path = require('path');
const axios = require('axios');
require('dotenv').config();

// Configuration
const API_BASE = process.env.VITE_API_BASE || 'https://api.temphist.com';
const OUTPUT_DIR = process.env.OUTPUT_DIR || './public/data';
const LOCATIONS_FILE = 'preapproved-locations.json';

// Load fallback locations from existing file
async function loadFallbackLocations() {
  try {
    const fallbackPath = path.join(OUTPUT_DIR, LOCATIONS_FILE);
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

async function ensureOutputDir() {
  try {
    await fs.mkdir(OUTPUT_DIR, { recursive: true });
    console.log(`📁 Output directory ensured: ${OUTPUT_DIR}`);
  } catch (error) {
    console.error('❌ Failed to create output directory:', error.message);
    throw error;
  }
}

async function fetchLocationsFromAPI() {
  try {
    console.log(`🔄 Fetching locations from API: ${API_BASE}/v1/locations/preapproved`);
    
    const response = await axios.get(`${API_BASE}/v1/locations/preapproved`, {
      timeout: 30000, // 30 second timeout
      headers: {
        'User-Agent': 'TempHist-LocationFetcher/1.0'
      }
    });
    
    if (response.data && response.data.locations && Array.isArray(response.data.locations)) {
      console.log(`✅ Successfully fetched ${response.data.locations.length} locations from API`);
      return response.data.locations;
    } else {
      console.log('⚠️ API returned invalid data structure, using fallback locations');
      return await loadFallbackLocations();
    }
  } catch (error) {
    console.error('❌ Failed to fetch locations from API:', error.message);
    console.log('🔄 Using fallback locations from file');
    return await loadFallbackLocations();
  }
}

async function saveLocationsToFile(locations) {
  try {
    const outputPath = path.join(OUTPUT_DIR, LOCATIONS_FILE);
    const data = {
      locations: locations,
      lastUpdated: new Date().toISOString(),
      count: locations.length,
      source: 'api' // Will be updated to 'fallback' if needed
    };
    
    await fs.writeFile(outputPath, JSON.stringify(data, null, 2));
    console.log(`💾 Locations saved to: ${outputPath}`);
    console.log(`📊 Saved ${locations.length} locations (source: ${data.source})`);
    
    return outputPath;
  } catch (error) {
    console.error('❌ Failed to save locations to file:', error.message);
    throw error;
  }
}

async function main() {
  try {
    console.log('🚀 Starting location fetch process...');
    console.log(`📅 Timestamp: ${new Date().toISOString()}`);
    
    // Ensure output directory exists
    await ensureOutputDir();
    
    // Fetch locations from API
    const locations = await fetchLocationsFromAPI();
    
    // Save to file
    const outputPath = await saveLocationsToFile(locations);
    
    console.log('✅ Location fetch process completed successfully');
    console.log(`📄 Output file: ${outputPath}`);
    
    // Exit with success code
    process.exit(0);
    
  } catch (error) {
    console.error('💥 Location fetch process failed:', error.message);
    process.exit(1);
  }
}

// Run the script
if (require.main === module) {
  main();
}

module.exports = { fetchLocationsFromAPI, saveLocationsToFile, loadFallbackLocations };
