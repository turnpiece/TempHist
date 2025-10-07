#!/bin/bash

# Local build and deployment script
# This builds the project locally and then uploads the built files to the server

# Set variables
HOME_DIR="/home/u22-lgxgqxwpxieh"
PROJECT_DIR="$HOME_DIR/www/dev.temphist.com/repo"
WEB_ROOT="$HOME_DIR/www/dev.temphist.com/public_html"

echo "=== Local Build and Deployment ==="
echo "Building project locally..."

# Set environment variables for dev build
export VITE_API_BASE=https://devapi.temphist.com
export VITE_TEST_TOKEN=qrXrUQuLAer4
export API_TOKEN=r2whxLDXQ35Q

# Build the project locally
echo "Building project with environment variables..."
echo "VITE_API_BASE=$VITE_API_BASE"
npm run build

if [ $? -ne 0 ]; then
    echo "❌ Local build failed. Deployment aborted."
    exit 1
fi

echo "✅ Local build successful"

# Upload built files to server
echo "Uploading built files to server..."
scp -r dist/* u22-lgxgqxwpxieh@dev.temphist.com:$WEB_ROOT/

if [ $? -ne 0 ]; then
    echo "❌ Upload failed. Deployment aborted."
    exit 1
fi

echo "✅ Files uploaded successfully"

# Upload scripts folder
echo "Uploading scripts folder..."
scp -r scripts u22-lgxgqxwpxieh@dev.temphist.com:$PROJECT_DIR/

if [ $? -ne 0 ]; then
    echo "⚠️ Scripts upload failed, but deployment continues"
fi

# Upload data directory if it exists
if [ -d "public/data" ]; then
    echo "Uploading data directory..."
    scp -r public/data u22-lgxgqxwpxieh@dev.temphist.com:$WEB_ROOT/
    echo "✅ Data directory uploaded"
fi

echo "=== Deployment Complete ==="
echo "The application has been deployed using local build."
echo "Note: You may need to set up cron jobs manually on the server."
