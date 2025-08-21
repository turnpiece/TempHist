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

// If dist folder exists, serve it with priority (for production builds)
if (require('fs').existsSync('./dist')) {
  console.log('📁 Found dist folder, serving built files');
  app.use(express.static('./dist'));
}

// Development mode: Serve mock API data
if (process.env.NODE_ENV !== 'production') {
  console.log('🔧 Development mode: Serving mock API data');
  
  // Mock API endpoint for temperature data
  app.get('/data/:location/:date', (req, res) => {
    const { location, date } = req.params;
    console.log(`📊 Mock API called: /data/${location}/${date}`);
    
    // Return mock data structure
    res.json({
      weather: {
        data: [
          { x: 15.2, y: 2024 },
          { x: 14.8, y: 2023 },
          { x: 16.1, y: 2022 },
          { x: 13.9, y: 2021 },
          { x: 15.7, y: 2020 }
        ]
      },
      average: {
        average: 15.14
      },
      trend: {
        slope: 0.23,
        units: "°C per year"
      },
      summary: `Today's temperature in ${location} is ${Math.random() > 0.5 ? 'warmer' : 'cooler'} than average.`
    });
  });
  
  // Health check endpoint
  app.get('/health', (req, res) => {
    res.json({ status: 'ok', mode: 'development', timestamp: new Date().toISOString() });
  });
  
} else {
  // Production mode: Proxy to actual API
  console.log('🚀 Production mode: Proxying to production API');
  app.use('/api', createProxyMiddleware({
    target: apiBase,
    changeOrigin: true,
    pathRewrite: {
      '^/api': '', // remove /api prefix when forwarding
    },
    onProxyRes: function(proxyRes, req, res) {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-API-Token, Accept, Authorization');
    },
    logLevel: 'debug'
  }));
}

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
  console.log(`Mode: ${process.env.NODE_ENV || 'development'}`);
  if (process.env.NODE_ENV === 'production') {
    console.log(`Proxying /api requests to ${apiBase}`);
  } else {
    console.log('Serving mock API data for development');
  }
}); 