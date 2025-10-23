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
  
  // Content Security Policy
  const cspDirectives = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://www.gstatic.com",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https:",
    "font-src 'self'",
    "connect-src 'self' https://stagingapi.temphist.com https://devapi.temphist.com https://api.temphist.com https://identitytoolkit.googleapis.com https://securetoken.googleapis.com",
    "frame-src 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "upgrade-insecure-requests"
  ].join('; ');
  
  res.header('Content-Security-Policy', cspDirectives);
  res.header('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.header('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  
  next();
});

// Serve static files from dist directory
app.use(express.static('dist', {
  maxAge: '1d',
  etag: true
}));

// SPA fallback routing - serve appropriate HTML files
// Using middleware instead of app.get('*') for Express 5 compatibility
app.use((req, res, next) => {
  const requestedPath = req.path;
  
  // Exclude data files and API routes from SPA routing
  if (requestedPath.startsWith('/data/') || 
      requestedPath.startsWith('/api/') ||
      requestedPath.endsWith('.json') ||
      requestedPath.endsWith('.xml') ||
      requestedPath.endsWith('.csv')) {
    return res.status(404).send('File not found');
  }
  
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

