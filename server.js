const express = require('express');
const path = require('path');
const app = express();

// Configuration
const port = process.env.PORT || 3000;

// Note: This server only serves static files. API requests are made directly
// from the browser to the API server. If you see CORS errors with status 524,
// this is a Cloudflare timeout issue - Cloudflare returns 524 errors without
// CORS headers, causing browsers to report CORS errors even when CORS is
// properly configured. This must be fixed on the API/Cloudflare side.

// Add security headers
app.use((req, res, next) => {
  res.header('X-Content-Type-Options', 'nosniff');
  res.header('X-Frame-Options', 'DENY');
  res.header('X-XSS-Protection', '1; mode=block');
  
  // Content Security Policy
  const cspDirectives = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://www.gstatic.com https://static.cloudflareinsights.com https://apis.google.com https://*.firebaseapp.com https://*.googleapis.com",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https:",
    "font-src 'self'",
    "connect-src 'self' https://stagingapi.temphist.com https://devapi.temphist.com https://api.temphist.com https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://nominatim.openstreetmap.org https://ipapi.co https://*.firebaseapp.com https://*.googleapis.com",
    "frame-src 'self' https://temphist-2c787.firebaseapp.com https://*.firebaseapp.com https://*.googleapis.com",
    "object-src 'self' data:",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "require-trusted-types-for 'script'",
    "trusted-types 'none'",
    "upgrade-insecure-requests"
  ].join('; ');
  
  res.header('Content-Security-Policy', cspDirectives);
  res.header('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.header('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  res.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  res.header('Cross-Origin-Opener-Policy', 'same-origin');
  
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

