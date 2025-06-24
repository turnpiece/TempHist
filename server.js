const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const app = express();

// Load environment variables
require('dotenv').config();

// Configuration from environment variables with defaults
const apiBase = process.env.API_BASE || (process.env.NODE_ENV === 'production' 
  ? 'https://api.temphist.com'
  : 'http://localhost:8000');
const port = process.env.PORT || 3000;

// Add CORS headers middleware
app.use((req, res, next) => {
  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, X-API-Token, Accept, Authorization');
    res.header('Access-Control-Max-Age', '600');
    return res.sendStatus(200);
  }

  // Handle regular requests
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, X-API-Token, Accept, Authorization');
  next();
});

// Serve static files from the current directory
app.use(express.static('./'));

// Proxy all /api requests to the actual API
app.use('/api', createProxyMiddleware({
  target: apiBase,
  changeOrigin: true,
  pathRewrite: {
    '^/api': '', // remove /api prefix when forwarding
  },
  onProxyRes: function(proxyRes, req, res) {
    proxyRes.headers['Access-Control-Allow-Origin'] = '*';
    proxyRes.headers['Access-Control-Allow-Headers'] = 'Content-Type, X-API-Token, Accept, Authorization';
  },
  logLevel: 'debug' // Add debug logging
}));

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
  console.log(`Proxying /api requests to ${apiBase}`);
}); 