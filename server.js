const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const app = express();

// Load environment variables
require('dotenv').config();

// Configuration from environment variables with defaults
const apiBase = process.env.API_BASE || 'http://localhost:8000';
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

// If dist folder exists, serve it with priority (for production builds)
if (require('fs').existsSync('./dist')) {
  console.log('📁 Found dist folder, serving built files');
  app.use(express.static('./dist'));
}

// Proxy all requests to the FastAPI server
app.use('/', createProxyMiddleware({
  target: apiBase,
  changeOrigin: true,
  logLevel: 'debug',
  onError: (err, req, res) => {
    console.error('Proxy error:', err.message);
    if (err.code === 'ECONNREFUSED') {
      res.status(503).json({
        error: 'Backend service unavailable',
        message: `Cannot connect to ${apiBase}. Please ensure your FastAPI server is running.`,
        details: err.message
      });
    } else {
      res.status(500).json({
        error: 'Proxy error',
        message: err.message
      });
    }
  },
  filter: (pathname, req) => {
    // Don't proxy static file requests (HTML, CSS, JS, images)
    return !pathname.match(/\.(html|css|js|png|jpg|jpeg|gif|svg|ico)$/);
  }
}));

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
  console.log(`Proxying all requests to ${apiBase}`);
}); 