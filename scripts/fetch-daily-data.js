#!/usr/bin/env node

/**
 * Server-side script to prefetch temperature data for all preapproved locations
 * This script fetches daily, weekly, monthly, and yearly data for each location
 * Uses the async API endpoints with proper authentication
 * Designed to be run via cron job on the production server
 */

const fs = require('fs').promises;
const path = require('path');
const axios = require('axios');
require('dotenv').config();

// Configuration
const API_BASE = process.env.API_BASE || (process.env.NODE_ENV === 'development' ? 'http://localhost:3000' : 'https://api.temphist.com');
const OUTPUT_DIR = process.env.OUTPUT_DIR || './public/data';
const LOCATIONS_FILE = 'preapproved-locations.json';
const DAILY_DATA_DIR = 'daily-data';

// Firebase Admin SDK for server-side authentication
let admin = null;
let authToken = null;

async function initializeFirebase() {
  try {
    // Try to use Firebase Admin SDK if available
    try {
      admin = require('firebase-admin');
      
      // Initialize with service account if available
      const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
      if (serviceAccountPath && require('fs').existsSync(serviceAccountPath)) {
        const serviceAccount = require(serviceAccountPath);
        admin.initializeApp({
          credential: admin.credential.cert(serviceAccount)
        });
        console.log('✅ Firebase Admin SDK initialized with service account');
      } else {
        // Fallback: use default credentials or environment
        admin.initializeApp();
        console.log('✅ Firebase Admin SDK initialized with default credentials');
      }
      
      // Get a custom token for API authentication
      const customToken = await admin.auth().createCustomToken('cron-job-user');
      console.log('✅ Firebase custom token created');
      return customToken;
    } catch (firebaseError) {
      console.log('⚠️ Firebase Admin SDK not available, using fallback authentication');
      
      // Fallback: use a test token for development
      if (API_BASE.includes('localhost')) {
        console.log('🔧 Using development mode - using test token');
        return 'test_token'; // Use test token for local dev
      } else {
        throw new Error('Firebase authentication required for production API');
      }
    }
  } catch (error) {
    console.error('❌ Failed to initialize Firebase:', error.message);
    throw error;
  }
}

async function loadLocations() {
  try {
    const locationsPath = path.join(OUTPUT_DIR, LOCATIONS_FILE);
    const data = await fs.readFile(locationsPath, 'utf8');
    const parsed = JSON.parse(data);
    
    if (parsed.locations && Array.isArray(parsed.locations)) {
      console.log(`📖 Loaded ${parsed.locations.length} locations from ${locationsPath}`);
      return parsed.locations;
    } else {
      throw new Error('Invalid locations file format');
    }
  } catch (error) {
    console.error('❌ Failed to load locations:', error.message);
    throw error;
  }
}

async function ensureOutputDir() {
  try {
    const dailyDataPath = path.join(OUTPUT_DIR, DAILY_DATA_DIR);
    await fs.mkdir(dailyDataPath, { recursive: true });
    console.log(`📁 Daily data directory ensured: ${dailyDataPath}`);
  } catch (error) {
    console.error('❌ Failed to create daily data directory:', error.message);
    throw error;
  }
}

async function createAsyncJob(period, location, identifier) {
  try {
    const apiPeriod = period === 'week' ? 'weekly' : 
                     period === 'month' ? 'monthly' : 
                     period === 'year' ? 'yearly' : 
                     'daily';
    
    const url = `${API_BASE}/v1/records/${apiPeriod}/${encodeURIComponent(location)}/${identifier}/async`;
    
    console.log(`🔄 Creating ${period} job for ${location} (${identifier})...`);
    
    const headers = {
      'Content-Type': 'application/json',
      'User-Agent': 'TempHist-DataFetcher/1.0'
    };
    
    // Only add Authorization header if we have a token
    if (authToken) {
      headers['Authorization'] = `Bearer ${authToken}`;
    }
    
    const response = await axios.post(url, {}, {
      timeout: 30000,
      headers
    });
    
    if (response.data && response.data.job_id) {
      console.log(`✅ Job created: ${response.data.job_id}`);
      return response.data.job_id;
    } else {
      throw new Error('Invalid job response: missing job_id');
    }
  } catch (error) {
    console.error(`❌ Failed to create ${period} job for ${location}:`, error.message);
    throw error;
  }
}

async function pollJobStatus(jobId, maxPolls = 100, pollInterval = 3000) {
  let pollCount = 0;
  
  while (pollCount < maxPolls) {
    try {
      const url = `${API_BASE}/v1/jobs/${jobId}`;
      const headers = {
        'User-Agent': 'TempHist-DataFetcher/1.0'
      };
      
      // Only add Authorization header if we have a token
      if (authToken) {
        headers['Authorization'] = `Bearer ${authToken}`;
      }
      
      const response = await axios.get(url, {
        timeout: 10000,
        headers
      });
      
      if (response.data) {
        const job = response.data;
        
        if (job.status === 'completed' || job.status === 'ready') {
          console.log(`✅ Job ${jobId} completed (status: ${job.status})`);
          return job.result;
        } else if (job.status === 'failed') {
          throw new Error(`Job ${jobId} failed: ${job.error || 'Unknown error'}`);
        } else if (job.status === 'running' || job.status === 'pending' || job.status === 'processing') {
          console.log(`⏳ Job ${jobId} status: ${job.status} (${pollCount + 1}/${maxPolls})`);
          await new Promise(resolve => setTimeout(resolve, pollInterval));
          pollCount++;
        } else {
          throw new Error(`Unknown job status: ${job.status}`);
        }
      } else {
        throw new Error('Invalid job status response');
      }
    } catch (error) {
      if (error.response && error.response.status === 404) {
        throw new Error(`Job ${jobId} not found`);
      }
      throw error;
    }
  }
  
  throw new Error(`Job ${jobId} timed out after ${maxPolls} polls`);
}

async function fetchDataForLocation(location, periods, identifier) {
  const results = {};
  
  for (const period of periods) {
    try {
      console.log(`🔄 Processing ${period} data for ${location}...`);
      
      // Create async job
      const jobId = await createAsyncJob(period, location, identifier);
      
      // Poll for completion
      const data = await pollJobStatus(jobId);
      
      if (data && data.data) {
        results[period] = data.data;
        console.log(`✅ ${period} data fetched for ${location}`);
      } else {
        console.log(`⚠️ No ${period} data returned for ${location}`);
        results[period] = null;
      }
      
      // Small delay between periods
      await new Promise(resolve => setTimeout(resolve, 1000));
      
    } catch (error) {
      console.error(`❌ Failed to fetch ${period} data for ${location}:`, error.message);
      results[period] = null;
    }
  }
  
  return results;
}

async function saveLocationData(location, data, identifier) {
  try {
    // Create a safe filename from the location
    const safeLocation = location.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
    const filename = `${safeLocation}_${identifier}.json`;
    const filepath = path.join(OUTPUT_DIR, DAILY_DATA_DIR, filename);
    
    const fileData = {
      location: location,
      identifier: identifier,
      data: data,
      lastUpdated: new Date().toISOString()
    };
    
    await fs.writeFile(filepath, JSON.stringify(fileData, null, 2));
    console.log(`💾 Data saved for ${location}: ${filename}`);
    
    return filepath;
  } catch (error) {
    console.error(`❌ Failed to save data for ${location}:`, error.message);
    throw error;
  }
}

async function cleanupOldData() {
  try {
    const dailyDataPath = path.join(OUTPUT_DIR, DAILY_DATA_DIR);
    const files = await fs.readdir(dailyDataPath);
    
    // Get today's identifier
    const today = new Date();
    const useYesterday = today.getHours() < 1;
    const dateToUse = new Date(today);
    if (useYesterday) {
      dateToUse.setDate(dateToUse.getDate() - 1);
    }
    
    // Handle 29 Feb fallback
    const isLeapDay = dateToUse.getDate() === 29 && dateToUse.getMonth() === 1;
    if (isLeapDay) {
      dateToUse.setDate(28);
    }
    
    const currentIdentifier = `${String(dateToUse.getMonth() + 1).padStart(2, '0')}-${String(dateToUse.getDate()).padStart(2, '0')}`;
    
    let cleanedCount = 0;
    for (const file of files) {
      if (file.endsWith('.json') && !file.includes(currentIdentifier)) {
        const filepath = path.join(dailyDataPath, file);
        await fs.unlink(filepath);
        cleanedCount++;
      }
    }
    
    if (cleanedCount > 0) {
      console.log(`🧹 Cleaned up ${cleanedCount} old data files`);
    }
  } catch (error) {
    console.error('⚠️ Failed to cleanup old data:', error.message);
  }
}

async function main() {
  try {
    console.log('🚀 Starting temperature data prefetch process...');
    console.log(`📅 Timestamp: ${new Date().toISOString()}`);
    console.log(`🌐 Using API: ${API_BASE}`);
    
    // Initialize Firebase authentication
    authToken = await initializeFirebase();
    
    // Get current date identifier
    const now = new Date();
    const useYesterday = now.getHours() < 1;
    const dateToUse = new Date(now);
    if (useYesterday) {
      dateToUse.setDate(dateToUse.getDate() - 1);
    }
    
    // Handle 29 Feb fallback
    const isLeapDay = dateToUse.getDate() === 29 && dateToUse.getMonth() === 1;
    if (isLeapDay) {
      dateToUse.setDate(28);
    }
    
    const identifier = `${String(dateToUse.getMonth() + 1).padStart(2, '0')}-${String(dateToUse.getDate()).padStart(2, '0')}`;
    console.log(`📅 Fetching data for identifier: ${identifier}`);
    
    // Load locations
    const locations = await loadLocations();
    
    // Ensure output directory exists
    await ensureOutputDir();
    
    // Define periods to fetch
    const periods = ['daily', 'week', 'month', 'year'];
    
    // Track results
    let successCount = 0;
    let failureCount = 0;
    const results = [];
    
    // Clean up old data first
    await cleanupOldData();
    
    // Fetch data for each location
    for (const location of locations) {
      try {
        console.log(`\n📍 Processing location: ${location}`);
        
        const data = await fetchDataForLocation(location, periods, identifier);
        
        // Check if we got any data
        const hasData = Object.values(data).some(periodData => periodData !== null);
        
        if (hasData) {
          await saveLocationData(location, data, identifier);
          successCount++;
          results.push({ location, status: 'success', periods: Object.keys(data).filter(p => data[p] !== null) });
        } else {
          failureCount++;
          results.push({ location, status: 'no_data' });
        }
        
        // Add a delay to avoid overwhelming the API
        await new Promise(resolve => setTimeout(resolve, 2000));
        
      } catch (error) {
        console.error(`💥 Error processing ${location}:`, error.message);
        failureCount++;
        results.push({ location, status: 'error', error: error.message });
      }
    }
    
    // Save summary
    const summary = {
      identifier: identifier,
      totalLocations: locations.length,
      successCount,
      failureCount,
      lastUpdated: new Date().toISOString(),
      results
    };
    
    const summaryPath = path.join(OUTPUT_DIR, DAILY_DATA_DIR, `summary_${identifier}.json`);
    await fs.writeFile(summaryPath, JSON.stringify(summary, null, 2));
    
    console.log('\n✅ Temperature data prefetch process completed');
    console.log(`📊 Summary: ${successCount} successful, ${failureCount} failed out of ${locations.length} locations`);
    console.log(`📄 Summary saved to: ${summaryPath}`);
    
    // Exit with success code
    process.exit(0);
    
  } catch (error) {
    console.error('💥 Temperature data prefetch process failed:', error.message);
    process.exit(1);
  }
}

// Run the script
if (require.main === module) {
  main();
}

module.exports = { fetchDataForLocation, saveLocationData };