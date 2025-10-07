#!/bin/bash

# Script to update Node.js on SiteGround server
# Run this on the server via SSH

echo "=== Node.js Update Script ==="

# Check current Node.js version
echo "Current Node.js version:"
node --version
npm --version

# Check if nvm is available
if command -v nvm &> /dev/null; then
    echo "✅ NVM is available"
    nvm --version
else
    echo "❌ NVM not found, installing..."
    
    # Install NVM
    curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
    
    # Source NVM
    export NVM_DIR="$HOME/.nvm"
    [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
    [ -s "$NVM_DIR/bash_completion" ] && \. "$NVM_DIR/bash_completion"
    
    # Reload bash profile
    source ~/.bashrc
fi

# List available Node.js versions
echo "Available Node.js versions:"
nvm list-remote --lts | tail -10

# Install latest LTS version
echo "Installing latest LTS Node.js..."
nvm install --lts

# Use the new version
nvm use --lts

# Set as default
nvm alias default node

# Verify installation
echo "New Node.js version:"
node --version
npm --version

echo "=== Update Complete ==="
echo "You may need to restart your terminal or run 'source ~/.bashrc'"
