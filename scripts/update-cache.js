#!/usr/bin/env node

/**
 * Combined script to update all cached data
 * 1. Fetches and saves preapproved locations
 * 2. Prefetches temperature data (daily, weekly, monthly, yearly) for all locations
 * Uses async API endpoints with proper authentication
 * Designed to be run via cron job on the production server
 */

const { exec } = require('child_process');
const path = require('path');
const util = require('util');

const execAsync = util.promisify(exec);

async function runScript(scriptPath, description) {
  try {
    console.log(`\n🚀 Starting: ${description}`);
    console.log('=' .repeat(50));
    
    const { stdout, stderr } = await execAsync(`node ${scriptPath}`, {
      cwd: process.cwd(),
      timeout: 300000 // 5 minute timeout
    });
    
    if (stdout) {
      console.log(stdout);
    }
    if (stderr) {
      console.error(stderr);
    }
    
    console.log(`✅ Completed: ${description}`);
    return true;
  } catch (error) {
    console.error(`❌ Failed: ${description}`);
    console.error('Error:', error.message);
    return false;
  }
}

async function main() {
  try {
    console.log('🚀 Starting complete cache update process...');
    console.log(`📅 Timestamp: ${new Date().toISOString()}`);
    console.log('=' .repeat(60));
    
    const scriptsDir = path.join(__dirname);
    const results = [];
    
    // Step 1: Fetch locations
    const locationsSuccess = await runScript(
      path.join(scriptsDir, 'fetch-locations.js'),
      'Fetching preapproved locations'
    );
    results.push({ step: 'locations', success: locationsSuccess });
    
    // Step 2: Fetch temperature data (only if locations succeeded)
    if (locationsSuccess) {
      const temperatureDataSuccess = await runScript(
        path.join(scriptsDir, 'fetch-daily-data.js'),
        'Prefetching temperature data (daily, weekly, monthly, yearly) for all locations'
      );
      results.push({ step: 'temperature_data', success: temperatureDataSuccess });
    } else {
      console.log('⏭️ Skipping temperature data fetch due to locations failure');
      results.push({ step: 'temperature_data', success: false, reason: 'locations_failed' });
    }
    
    // Summary
    console.log('\n📊 Final Summary:');
    console.log('=' .repeat(60));
    
    const successCount = results.filter(r => r.success).length;
    const totalSteps = results.length;
    
    results.forEach(result => {
      const status = result.success ? '✅' : '❌';
      const reason = result.reason ? ` (${result.reason})` : '';
      console.log(`${status} ${result.step}${reason}`);
    });
    
    console.log(`\n📈 Overall: ${successCount}/${totalSteps} steps completed successfully`);
    
    if (successCount === totalSteps) {
      console.log('🎉 All cache updates completed successfully!');
      process.exit(0);
    } else {
      console.log('⚠️ Some cache updates failed, but process completed');
      process.exit(1);
    }
    
  } catch (error) {
    console.error('💥 Cache update process failed:', error.message);
    process.exit(1);
  }
}

// Run the script
if (require.main === module) {
  main();
}
