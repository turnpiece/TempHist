const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const app = express();
const apiBase = process.env.NODE_ENV === 'production' 
  ? 'https://api.temphist.com'
  : 'http://localhost:8000';

// Add CORS headers middleware
app.use((req, res, next) => {
  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, X-API-Token, Accept');
    res.header('Access-Control-Max-Age', '600');
    return res.sendStatus(200);
  }

  // Handle regular requests
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, X-API-Token, Accept');
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
    proxyRes.headers['Access-Control-Allow-Headers'] = 'Content-Type, X-API-Token, Accept';
  },
  logLevel: 'debug' // Add debug logging
}));

const port = 3000;
app.listen(port, () => {
  console.log(`Development server running at http://localhost:${port}`);
  console.log(`Proxying /api requests to ${apiBase}`);
}); 