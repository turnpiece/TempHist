const express = require('express');
const path = require('path');
const app = express();

// Configuration
const port = process.env.PORT || 3000;

// Add security headers
app.use((req, res, next) => {
  res.header('X-Content-Type-Options', 'nosniff');
  res.header('X-Frame-Options', 'DENY');
  res.header('X-XSS-Protection', '1; mode=block');
  next();
});

// Serve static files from dist directory
app.use(express.static('dist', {
  maxAge: '1d',
  etag: true
}));

// SPA fallback routing - serve appropriate HTML files
app.get('*', (req, res) => {
  const requestedPath = req.path;
  
  // Handle specific HTML pages
  if (requestedPath === '/about' || requestedPath === '/about.html') {
    return res.sendFile(path.join(__dirname, 'dist', 'about.html'));
  }
  if (requestedPath === '/privacy' || requestedPath === '/privacy.html') {
    return res.sendFile(path.join(__dirname, 'dist', 'privacy.html'));
  }
  
  // Default to index.html for all other routes (SPA behavior)
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

app.listen(port, '0.0.0.0', () => {
  console.log(`🚀 TempHist running on port ${port}`);
  console.log(`📂 Serving static files from dist/`);
});

