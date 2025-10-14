#!/bin/bash

# Manual Node.js installation script
# Run this on the server via SSH

echo "=== Manual Node.js Installation ==="

# Check current version
echo "Current Node.js version:"
node --version 2>/dev/null || echo "Node.js not found"

# Download and install Node.js LTS
NODE_VERSION="20.18.0"  # LTS version known to be stable
ARCH="linux-x64"

echo "Downloading Node.js v$NODE_VERSION..."
cd ~
wget https://nodejs.org/dist/v$NODE_VERSION/node-v$NODE_VERSION-$ARCH.tar.xz

echo "Extracting Node.js..."
tar -xf node-v$NODE_VERSION-$ARCH.tar.xz

echo "Moving to /usr/local..."
sudo mv node-v$NODE_VERSION-$ARCH /usr/local/node

echo "Creating symlinks..."
sudo ln -sf /usr/local/node/bin/node /usr/local/bin/node
sudo ln -sf /usr/local/node/bin/npm /usr/local/bin/npm
sudo ln -sf /usr/local/node/bin/npx /usr/local/bin/npx

# Add to PATH in bashrc
echo 'export PATH="/usr/local/node/bin:$PATH"' >> ~/.bashrc
source ~/.bashrc

# Clean up
rm node-v$NODE_VERSION-$ARCH.tar.xz

echo "Verifying installation..."
node --version
npm --version

echo "=== Installation Complete ==="
