#!/bin/bash

# Simple script to upload locally built files to the server
# This bypasses the server-side build issues

# Set variables
SERVER_HOST="temphist"  # Using SSH config alias
WEB_ROOT="/home/u22-lgxgqxwpxieh/www/dev.temphist.com/public_html"
PROJECT_DIR="/home/u22-lgxgqxwpxieh/www/dev.temphist.com/repo"

echo "=== Building and Uploading to Dev Server ==="

# Set environment variables for dev build
export VITE_API_BASE=https://devapi.temphist.com
export VITE_TEST_TOKEN=qrXrUQuLAer4
export API_TOKEN=r2whxLDXQ35Q

echo "Building project with environment variables..."
echo "VITE_API_BASE=$VITE_API_BASE"
echo "VITE_TEST_TOKEN=$VITE_TEST_TOKEN"
echo "API_TOKEN=$API_TOKEN"

# Build the project
npm run build

if [ $? -ne 0 ]; then
    echo "❌ Build failed. Deployment aborted."
    exit 1
fi

echo "✅ Build successful"

# Upload built files
echo "Uploading built files..."
scp -r dist/* $SERVER_HOST:$WEB_ROOT/

if [ $? -ne 0 ]; then
    echo "❌ Upload failed."
    exit 1
fi

echo "✅ Built files uploaded successfully"

# Upload scripts folder
echo "Uploading scripts folder..."
scp -r scripts $SERVER_HOST:$PROJECT_DIR/

if [ $? -ne 0 ]; then
    echo "⚠️ Scripts upload failed, but deployment continues"
else
    echo "✅ Scripts folder uploaded"
fi

# Ensure data directory exists on server (but don't upload local data)
echo "Ensuring data directory exists on server..."
ssh $SERVER_HOST "mkdir -p $WEB_ROOT/data/daily-data && chmod 755 $WEB_ROOT/data && chmod 755 $WEB_ROOT/data/daily-data"

if [ $? -eq 0 ]; then
    echo "✅ Data directory structure verified"
else
    echo "⚠️ Could not verify data directory, but deployment continues"
fi

echo "=== Upload Complete ==="
echo "The application has been deployed using local build."
echo "Visit: https://dev.temphist.com"
