#!/bin/bash

# Alternative upload method using SFTP
# This might work better than SCP

echo "=== Uploading Built Files via SFTP ==="

# Check if dist directory exists
if [ ! -d "dist" ]; then
    echo "❌ dist directory not found. Please run 'npm run build' first."
    exit 1
fi

# Create SFTP batch file
cat > sftp_upload.batch << 'EOF'
cd /home/u22-lgxgqxwpxieh/www/dev.temphist.com/public_html
lcd dist
put -r *
cd /home/u22-lgxgqxwpxieh/www/dev.temphist.com/repo
lcd ../scripts
put -r scripts
quit
EOF

echo "Uploading files via SFTP..."
sftp -b sftp_upload.batch u22-lgxgqxwpxieh@dev.temphist.com

if [ $? -eq 0 ]; then
    echo "✅ Files uploaded successfully via SFTP"
else
    echo "❌ SFTP upload failed"
    echo "Trying manual SFTP connection..."
    echo "Run: sftp u22-lgxgqxwpxieh@dev.temphist.com"
    echo "Then manually upload files"
fi

# Clean up
rm sftp_upload.batch

echo "=== SFTP Upload Complete ==="
