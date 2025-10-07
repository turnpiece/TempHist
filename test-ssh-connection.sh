#!/bin/bash

# Test SSH connection to the server
# This will help diagnose connection issues

echo "=== Testing SSH Connection ==="

SERVER_USER="u22-lgxgqxwpxieh"
SERVER_HOST="dev.temphist.com"

echo "Testing connection to $SERVER_USER@$SERVER_HOST..."

# Test basic SSH connection
echo "1. Testing basic SSH connection..."
ssh -o ConnectTimeout=10 -o BatchMode=yes $SERVER_USER@$SERVER_HOST "echo 'SSH connection successful'" 2>&1

if [ $? -eq 0 ]; then
    echo "✅ SSH connection works"
else
    echo "❌ SSH connection failed"
    echo ""
    echo "Possible issues:"
    echo "- SSH key not set up"
    echo "- Wrong hostname"
    echo "- Firewall blocking connection"
    echo "- Server not responding"
    echo ""
    echo "Trying to diagnose..."
    
    # Test if hostname resolves
    echo "2. Testing hostname resolution..."
    nslookup $SERVER_HOST 2>&1
    
    # Test if port 22 is open
    echo "3. Testing port 22..."
    nc -z -v $SERVER_HOST 22 2>&1
    
    echo ""
    echo "To fix SSH connection:"
    echo "1. Make sure you have SSH keys set up"
    echo "2. Check if the hostname is correct"
    echo "3. Contact SiteGround support if needed"
fi

echo "=== SSH Test Complete ==="
