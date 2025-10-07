#!/bin/bash

# Simple script to upload locally built files to the server
# This bypasses the server-side build issues

# Set variables
SERVER_USER="u22-lgxgqxwpxieh"
SERVER_HOST="temphist.com"
WEB_ROOT="/home/u22-lgxgqxwpxieh/www/dev.temphist.com/public_html"
PROJECT_DIR="/home/u22-lgxgqxwpxieh/www/dev.temphist.com/repo"

echo "=== Uploading Built Files to Server ==="

# Check if dist directory exists
if [ ! -d "dist" ]; then
    echo "❌ dist directory not found. Please run 'npm run build' first."
    exit 1
fi

# Upload built files
echo "Uploading built files..."
scp -r dist/* $SERVER_USER@$SERVER_HOST:$WEB_ROOT/

if [ $? -ne 0 ]; then
    echo "❌ Upload failed."
    exit 1
fi

echo "✅ Built files uploaded successfully"

# Upload scripts folder
echo "Uploading scripts folder..."
scp -r scripts $SERVER_USER@$SERVER_HOST:$PROJECT_DIR/

if [ $? -ne 0 ]; then
    echo "⚠️ Scripts upload failed, but deployment continues"
else
    echo "✅ Scripts folder uploaded"
fi

# Upload data directory if it exists
if [ -d "public/data" ]; then
    echo "Uploading data directory..."
    scp -r public/data $SERVER_USER@$SERVER_HOST:$WEB_ROOT/
    echo "✅ Data directory uploaded"
fi

echo "=== Upload Complete ==="
echo "The application has been deployed using local build."
echo "Visit: https://dev.temphist.com"
