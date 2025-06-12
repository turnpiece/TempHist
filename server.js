const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const app = express();
const apiBase = 'https://api.temphist.com';

// Add CORS headers middleware
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
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
  }
}));

const port = 3000;
app.listen(port, () => {
  console.log(`Development server running at http://localhost:${port}`);
}); 