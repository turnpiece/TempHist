# Server-Side Caching Scripts

This directory contains scripts for server-side caching of TempHist data to improve performance and reduce API calls.

## Overview

The caching system consists of two main script types:

### Node.js Scripts (Recommended for Railway, Vercel, etc.)

1. **`cron-fetch-locations.js`** - Fetches preapproved locations from the API and saves them to a static JSON file
2. **`cron-fetch-daily-data.js`** - Prefetches daily temperature data for all locations

### PHP Scripts (Alternative for traditional servers)

1. **`cron-fetch-locations.php`** - PHP version of locations fetcher
2. **`cron-fetch-daily-data.php`** - PHP version of daily data fetcher

## Scripts

### Node.js Scripts

#### cron-fetch-locations.js

Fetches preapproved locations from the API and saves them to `/dist/data/preapproved-locations.json`.

**Usage:**

```bash
node scripts/cron-fetch-locations.js
```

**Output:**

- Creates `/dist/data/preapproved-locations.json` with locations data
- Includes metadata: lastUpdated, count, source (api/fallback)
- Uses file-based fallback if API fails

#### cron-fetch-daily-data.js

Prefetches daily temperature data for all preapproved locations and saves them to individual JSON files.

**Usage:**

```bash
node scripts/cron-fetch-daily-data.js
```

**Output:**

- Creates `/dist/data/daily-data/` directory
- Saves individual files: `{location}_{date}.json`
- Creates summary file: `summary_{date}.json`

### PHP Scripts

#### cron-fetch-locations.php

PHP version of the locations fetcher for traditional servers.

**Usage:**

```bash
php scripts/cron-fetch-locations.php
```

#### cron-fetch-daily-data.php

PHP version of the daily data fetcher for traditional servers.

**Usage:**

```bash
php scripts/cron-fetch-daily-data.php
```

## Configuration

### Environment Variables

Create a `.env` file or set these environment variables:

```bash
# API Configuration
VITE_API_BASE=https://api.temphist.com
API_TOKEN=your_api_token_here

# Output Configuration
OUTPUT_DIR=./dist/data
```

### Default Values

- `VITE_API_BASE`: `https://api.temphist.com` (or `https://temphist-api-develop.up.railway.app` for dev)
- `API_TOKEN`: Required for API authentication
- `OUTPUT_DIR`: `./dist/data` (Node.js) or `./public/data` (PHP)

## Cron Job Setup

### Railway Deployment (Recommended)

For Railway deployment, use separate cron services:

#### Locations Cron Service

- **Start Command**: `npm run cron:locations`
- **Schedule**: `0 0 * * *` (daily at midnight UTC)

#### Daily Data Cron Service

- **Start Command**: `npm run cron:daily-data`
- **Schedule**: `0 * * * *` (hourly)

### Traditional Server Setup

#### Node.js Scripts

```bash
# Fetch locations daily at midnight UTC
0 0 * * * cd /path/to/temphist && node scripts/cron-fetch-locations.js >> /var/log/temphist-locations.log 2>&1

# Fetch daily data hourly
0 * * * * cd /path/to/temphist && node scripts/cron-fetch-daily-data.js >> /var/log/temphist-temperature.log 2>&1
```

#### PHP Scripts

```bash
# Fetch locations daily at midnight UTC
0 0 * * * cd /path/to/temphist && php scripts/cron-fetch-locations.php >> /var/log/temphist-locations.log 2>&1

# Fetch daily data daily at 3 AM
0 3 * * * cd /path/to/temphist && php scripts/cron-fetch-daily-data.php >> /var/log/temphist-temperature.log 2>&1
```

### Log Rotation (Optional)

To prevent logs from growing too large, add log rotation:

```bash
# Compress large log files weekly
0 2 * * 0 find /path/to/temphist/logs -name '*.log' -size +10M -exec gzip {} \;

# Delete old compressed logs after 30 days
0 2 * * 0 find /path/to/temphist/logs -name '*.log.gz' -mtime +30 -delete
```

## File Structure

After running the scripts, your directory structure will look like:

### Railway Deployment

```
dist/
├── data/
│   ├── preapproved-locations.json    # Locations data
│   └── daily-data/                   # Daily temperature data
│       ├── london__england__united_kingdom_10-15.json
│       ├── new_york__new_york__united_states_10-15.json
│       └── summary_10-15.json
└── [other build files...]
```

### Traditional Server

```
public/
├── data/
│   ├── preapproved-locations.json    # Locations data
│   └── daily-data/                   # Daily temperature data
│       ├── london__england__united_kingdom_10-15.json
│       ├── new_york__new_york__united_states_10-15.json
│       └── summary_10-15.json
└── [other web files...]
```

## Client-Side Integration

The client-side code automatically tries to load locations from the static file first:

1. **Primary**: Loads from `/data/preapproved-locations.json`
2. **Fallback**: Falls back to API if static file is unavailable
3. **Final Fallback**: Uses hardcoded locations if both fail

## Benefits

1. **Faster Loading**: Static files load much faster than API calls
2. **Reduced API Load**: Fewer requests to the main API server
3. **Better UX**: Users see location options immediately
4. **Resilience**: App works even if API is temporarily down
5. **Cost Savings**: Reduced API usage costs

## Monitoring

### Logs

All scripts provide detailed logging:

- `🚀 Starting process...` - Process start
- `📁 Output directory ensured` - Directory creation
- `🔄 Fetching from API...` - API request
- `✅ Successfully fetched X locations` - Success
- `❌ Failed to fetch` - Error
- `💾 Saved to file` - File save
- `📊 Summary: X successful, Y failed` - Final summary

### Error Handling

- Scripts exit with code 0 on success, 1 on failure
- Fallback locations are used if API fails
- Individual location failures don't stop the entire process
- Detailed error messages in logs

## Troubleshooting

### Common Issues

1. **Permission Denied**: Make sure scripts are executable (`chmod +x scripts/*.js`)
2. **API Timeout**: Increase timeout in script configuration
3. **Directory Not Found**: Ensure OUTPUT_DIR exists or is writable
4. **API Errors**: Check API_BASE URL and network connectivity

### Debug Mode

Run scripts with debug logging:

```bash
DEBUG=1 node scripts/fetch-locations.js
```

## Development

### Testing Scripts

Test individual scripts:

```bash
# Test locations fetching (Node.js)
node scripts/cron-fetch-locations.js

# Test daily data fetching (Node.js)
node scripts/cron-fetch-daily-data.js

# Test locations fetching (PHP)
php scripts/cron-fetch-locations.php

# Test daily data fetching (PHP)
php scripts/cron-fetch-daily-data.php
```

### Local Development

For local development, set VITE_API_BASE to your local API:

```bash
VITE_API_BASE=http://localhost:8000 node scripts/cron-fetch-locations.js
```
