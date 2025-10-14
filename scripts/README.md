# Server-Side Caching Scripts

This directory contains scripts for server-side caching of TempHist data to improve performance and reduce API calls.

## Overview

The caching system consists of three main scripts:

1. **`fetch-locations.js`** - Fetches preapproved locations from the API and saves them to a static JSON file
2. **`fetch-daily-data.js`** - Prefetches daily temperature data for all locations
3. **`update-cache.js`** - Combined script that runs both location and daily data fetching

## Scripts

### fetch-locations.js

Fetches preapproved locations from the API and saves them to `/public/data/preapproved-locations.json`.

**Usage:**

```bash
node scripts/fetch-locations.js
```

**Output:**

- Creates `/public/data/preapproved-locations.json` with locations data
- Includes metadata: lastUpdated, count, source (api/fallback)

### fetch-daily-data.js

Prefetches daily temperature data for all preapproved locations and saves them to individual JSON files.

**Usage:**

```bash
node scripts/fetch-daily-data.js
```

**Output:**

- Creates `/public/data/daily-data/` directory
- Saves individual files: `{location}_{date}.json`
- Creates summary file: `summary_{date}.json`

### update-cache.js

Runs both location and daily data fetching scripts in sequence.

**Usage:**

```bash
node scripts/update-cache.js
```

## Configuration

### Environment Variables

Create a `.env` file or set these environment variables:

```bash
# API Configuration
API_BASE=https://api.temphist.com

# Output Configuration
OUTPUT_DIR=./public/data

# Server Configuration (for update-cache.js)
SERVER_URL=https://temphist.com
```

### Default Values

- `API_BASE`: `https://api.temphist.com`
- `OUTPUT_DIR`: `./public/data`
- `SERVER_URL`: `https://temphist.com`

## Cron Job Setup

### Basic Setup (Locations Only)

```bash
# Fetch locations every 6 hours (with logging)
0 */6 * * * cd /path/to/temphist && node scripts/fetch-locations.js >> /path/to/temphist/logs/temphist-locations.log 2>&1

# Or fetch daily at 2 AM
0 2 * * * cd /path/to/temphist && node scripts/fetch-locations.js >> /path/to/temphist/logs/temphist-locations.log 2>&1
```

### Advanced Setup (Locations + Daily Data)

```bash
# Update all cache data every 6 hours
0 */6 * * * cd /path/to/temphist && node scripts/update-cache.js >> /path/to/temphist/logs/temphist-cache.log 2>&1

# Or update daily at 2 AM
0 2 * * * cd /path/to/temphist && node scripts/update-cache.js >> /path/to/temphist/logs/temphist-cache.log 2>&1
```

### Production Setup

For production, you might want to run locations more frequently than daily data:

```bash
# Fetch locations every 2 hours
0 */2 * * * cd /path/to/temphist && node scripts/fetch-locations.js >> /path/to/temphist/logs/temphist-locations.log 2>&1

# Fetch daily data once per day at 3 AM
0 3 * * * cd /path/to/temphist && node scripts/fetch-daily-data.js >> /path/to/temphist/logs/temphist-daily.log 2>&1
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

```
/home/u22-lgxgqxwpxieh/www/
├── dev.temphist.com/
│   ├── repo/                    # Git repository (gets overwritten on deploy)
│   │   ├── scripts/
│   │   └── public/data/         # Cached data (copied to web root)
│   ├── logs/                    # Logs directory (persistent across deployments)
│   │   ├── temphist-locations.log
│   │   ├── temphist-daily.log
│   │   └── temphist-cache.log
│   └── public_html/             # Web root
│       └── data/                # Cached data served to users
└── temphist.com/                # Production (same structure)
    ├── repo/
    ├── logs/
    └── public_html/
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
# Test locations fetching
node scripts/fetch-locations.js

# Test daily data fetching (requires locations file)
node scripts/fetch-daily-data.js

# Test combined update
node scripts/update-cache.js
```

### Local Development

For local development, set API_BASE to your local API:

```bash
API_BASE=http://localhost:8000 node scripts/fetch-locations.js
```
