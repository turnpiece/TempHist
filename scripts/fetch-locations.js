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
const API_BASE = process.env.API_BASE || 'https://api.temphist.com';
const OUTPUT_DIR = process.env.OUTPUT_DIR || './public/data';
const LOCATIONS_FILE = 'preapproved-locations.json';

// Fallback locations if API fails
const fallbackLocations = [
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
      return fallbackLocations;
    }
  } catch (error) {
    console.error('❌ Failed to fetch locations from API:', error.message);
    console.log('🔄 Using fallback locations');
    return fallbackLocations;
  }
}

async function saveLocationsToFile(locations) {
  try {
    const outputPath = path.join(OUTPUT_DIR, LOCATIONS_FILE);
    const data = {
      locations: locations,
      lastUpdated: new Date().toISOString(),
      count: locations.length,
      source: locations === fallbackLocations ? 'fallback' : 'api'
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

module.exports = { fetchLocationsFromAPI, saveLocationsToFile, fallbackLocations };
