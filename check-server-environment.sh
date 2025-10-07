#!/bin/bash

# Script to check server environment and Node.js availability
# Run this on the server via SSH

echo "=== Server Environment Check ==="

# Check OS
echo "Operating System:"
uname -a
cat /etc/os-release 2>/dev/null || echo "OS release info not available"

# Check current user and permissions
echo "Current user: $(whoami)"
echo "Home directory: $HOME"

# Check if Node.js is available
echo "Node.js version:"
node --version 2>/dev/null || echo "Node.js not found"

echo "NPM version:"
npm --version 2>/dev/null || echo "NPM not found"

# Check available package managers
echo "Available package managers:"
which apt-get 2>/dev/null && echo "✅ apt-get available" || echo "❌ apt-get not available"
which yum 2>/dev/null && echo "✅ yum available" || echo "❌ yum not available"
which brew 2>/dev/null && echo "✅ brew available" || echo "❌ brew not available"

# Check if we can install packages
echo "Can install packages:"
if command -v sudo &> /dev/null; then
    echo "✅ sudo available"
    sudo -l 2>/dev/null | head -5
else
    echo "❌ sudo not available"
fi

# Check memory and disk space
echo "Memory usage:"
free -h 2>/dev/null || echo "Memory info not available"

echo "Disk space:"
df -h 2>/dev/null || echo "Disk info not available"

# Check if we can write to common directories
echo "Write permissions:"
test -w /usr/local && echo "✅ Can write to /usr/local" || echo "❌ Cannot write to /usr/local"
test -w ~ && echo "✅ Can write to home directory" || echo "❌ Cannot write to home directory"

echo "=== Environment Check Complete ==="
