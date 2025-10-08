#!/bin/bash

# Combined script to update all cached data
# 1. Fetches and saves preapproved locations
# 2. Prefetches temperature data for all locations

echo "🚀 Starting complete cache update process..."
echo "📅 Timestamp: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo "============================================================"

# Step 1: Fetch locations
echo ""
echo "🚀 Starting: Fetching preapproved locations"
echo "=================================================="
php scripts/fetch-locations.php
LOCATIONS_SUCCESS=$?

if [ $LOCATIONS_SUCCESS -eq 0 ]; then
    echo "✅ Completed: Fetching preapproved locations"
else
    echo "❌ Failed: Fetching preapproved locations"
fi

# Step 2: Fetch temperature data (only if locations succeeded)
if [ $LOCATIONS_SUCCESS -eq 0 ]; then
    echo ""
    echo "🚀 Starting: Prefetching temperature data"
    echo "=================================================="
    php scripts/fetch-daily-data.php
    TEMPERATURE_SUCCESS=$?
    
    if [ $TEMPERATURE_SUCCESS -eq 0 ]; then
        echo "✅ Completed: Prefetching temperature data"
    else
        echo "❌ Failed: Prefetching temperature data"
    fi
else
    echo "⏭️ Skipping temperature data fetch due to locations failure"
    TEMPERATURE_SUCCESS=1
fi

# Summary
echo ""
echo "📊 Final Summary:"
echo "============================================================"

if [ $LOCATIONS_SUCCESS -eq 0 ]; then
    echo "✅ locations"
else
    echo "❌ locations"
fi

if [ $LOCATIONS_SUCCESS -eq 0 ]; then
    if [ $TEMPERATURE_SUCCESS -eq 0 ]; then
        echo "✅ temperature_data"
    else
        echo "❌ temperature_data"
    fi
else
    echo "❌ temperature_data (locations_failed)"
fi

if [ $LOCATIONS_SUCCESS -eq 0 ] && [ $TEMPERATURE_SUCCESS -eq 0 ]; then
    echo ""
    echo "🎉 All cache updates completed successfully!"
    exit 0
else
    echo ""
    echo "⚠️ Some cache updates failed, but process completed"
    exit 1
fi

