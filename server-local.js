const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const path = require('node:path');
const { getOrdinal } = require('./lib/getOrdinal');
const app = express();

// Load environment variables
require('dotenv').config();

// Configuration from environment variables with defaults
const apiBase = process.env.API_BASE || 'http://localhost:8000';
const port = process.env.PORT || 3000;

// Add security headers and CORS middleware
app.use((req, res, next) => {
  // Security headers
  res.header('X-Content-Type-Options', 'nosniff');
  res.header('X-Frame-Options', 'DENY');
  res.header('X-XSS-Protection', '1; mode=block');
  
  // Content Security Policy (relaxed for development)
  const cspDirectives = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.jsdelivr.net https://www.gstatic.com https://static.cloudflareinsights.com https://apis.google.com",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https: http://localhost:*",
    "font-src 'self'",
    "connect-src 'self' http://localhost:* https://stagingapi.temphist.com https://devapi.temphist.com https://api.temphist.com https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://nominatim.openstreetmap.org https://ipapi.co",
    "frame-src 'self' https://temphist-2c787.firebaseapp.com https://*.firebaseapp.com https://*.googleapis.com",
    "object-src 'self' data:",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "require-trusted-types-for 'script'",
    "trusted-types 'none'"
  ].join('; ');
  
  res.header('Content-Security-Policy', cspDirectives);
  res.header('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.header('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  res.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  res.header('Cross-Origin-Opener-Policy', 'same-origin');
  
  // CORS headers for development
  const allowedOrigins = [
    'http://localhost:5173',  // Vite dev server
    'http://localhost:3000',  // This proxy server
    'http://127.0.0.1:5173',
    'http://127.0.0.1:3000'
  ];
  
  const origin = req.headers.origin;
  const isAllowedOrigin = !origin || allowedOrigins.includes(origin);
  
  if (isAllowedOrigin && origin) {
    res.header('Access-Control-Allow-Origin', origin);
  } else if (isAllowedOrigin) {
    res.header('Access-Control-Allow-Origin', '*');
  }
  
  res.header('Access-Control-Allow-Credentials', 'true');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, X-API-Token, Accept, Authorization, X-Requested-With');
  res.header('Access-Control-Max-Age', '86400'); // 24 hours
  
  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    console.log('🔍 CORS preflight request from:', origin);
    return res.sendStatus(200);
  }
  
  console.log('🌐 CORS request from:', origin, 'to:', req.path);
  next();
});

// Determine which directory to serve
const distExists = require('node:fs').existsSync('./dist');
const staticDir = distExists ? './dist' : './';

if (distExists) {
  console.log('📁 Found dist folder, serving built files from ./dist');
} else {
  console.log('📁 No dist folder found, serving from current directory');
}

// --- Open Graph tag injection for /s/:id share pages ---

let _indexHtmlCache = null;
function getIndexHtml() {
  if (!_indexHtmlCache) {
    _indexHtmlCache = require('node:fs').readFileSync(path.join(__dirname, staticDir, 'index.html'), 'utf-8');
  }
  return _indexHtmlCache;
}

function formatSharePeriodHeading(meta) {
  const { period, identifier, ref_year } = meta;
  let friendlyDate = '';
  if (
    period === 'daily' || period === 'weekly' || period === 'monthly' ||
    (period === 'yearly' && identifier && identifier.includes('-'))
  ) {
    const [monthStr, dayStr] = identifier.split('-');
    const month = Number.parseInt(monthStr, 10);
    const day = Number.parseInt(dayStr, 10);
    const monthName = new Date(ref_year, month - 1, 1).toLocaleString('en-GB', { month: 'long' });
    friendlyDate = `${getOrdinal(day)} ${monthName}`;
  }
  switch (period) {
    case 'daily':   return friendlyDate;
    case 'weekly':  return `Week ending ${friendlyDate}`;
    case 'monthly': return `Month ending ${friendlyDate}`;
    case 'yearly':  return `Year ending ${friendlyDate}`;
    default:        return friendlyDate;
  }
}

function escapeAttr(str) {
  return str.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

app.use(async (req, res, next) => {
  const match = req.path.match(/^\/s\/([^/]+)$/);
  if (!match) return next();

  const shareId = match[1];
  if (!/^[a-zA-Z0-9_-]+$/.test(shareId)) return next();

  try {
    const apiUrl = `${apiBase}/v1/shares/${encodeURIComponent(shareId)}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);

    let meta;
    try {
      const apiRes = await fetch(apiUrl, { signal: controller.signal });
      clearTimeout(timeout);
      if (!apiRes.ok) {
        console.warn('[OG] API returned', apiRes.status, 'for share', shareId, '— serving plain SPA');
        return next();
      }
      meta = await apiRes.json();
    } catch (fetchErr) {
      clearTimeout(timeout);
      console.warn('[OG] Fetch failed for share', shareId, ':', fetchErr.message);
      return next();
    }

    const cityName = meta.location.split(',')[0].trim();
    const heading = formatSharePeriodHeading(meta);
    const title = `${cityName} \u00b7 ${heading} | TempHist`;
    const description = `Historical temperature data for ${cityName}: ${heading}.`;
    const shareUrl = `${req.protocol}://${req.get('host')}/s/${shareId}`;
    const imageUrl = `${apiBase}/v1/og/${shareId}.png`;

    const ogTags = [
      `<meta property="og:type" content="website">`,
      `<meta property="og:site_name" content="TempHist">`,
      `<meta property="og:title" content="${escapeAttr(title)}">`,
      `<meta property="og:description" content="${escapeAttr(description)}">`,
      `<meta property="og:url" content="${escapeAttr(shareUrl)}">`,
      `<meta property="og:image" content="${escapeAttr(imageUrl)}">`,
      `<meta name="twitter:card" content="summary_large_image">`,
      `<meta name="twitter:title" content="${escapeAttr(title)}">`,
      `<meta name="twitter:description" content="${escapeAttr(description)}">`,
      `<meta name="twitter:image" content="${escapeAttr(imageUrl)}">`,
    ].join('\n    ');

    const html = getIndexHtml()
      .replace(/<title>[^<]*<\/title>/, `<title>${escapeAttr(title)}</title>`)
      .replace('</head>', `    ${ogTags}\n  </head>`);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache');
    return res.send(html);
  } catch (err) {
    console.error('[OG] Unexpected error for share', shareId, ':', err.message);
    return next();
  }
});

// Serve static files with proper configuration
app.use(express.static(staticDir, {
  index: false // Don't automatically serve index.html yet
}));

// Proxy API requests (before catch-all route)
app.use('/api', createProxyMiddleware({
  target: apiBase,
  changeOrigin: true,
  logLevel: 'debug',
  pathRewrite: {
    '^/api': '' // Remove /api prefix when forwarding
  },
  onProxyReq: (proxyReq, req, res) => {
    // For local development, inject test token if no Authorization header is present
    const authHeader = req.headers.authorization;
    if (!authHeader && process.env.VITE_TEST_TOKEN) {
      console.log('🔑 Injecting test token for local development');
      proxyReq.setHeader('Authorization', `Bearer ${process.env.VITE_TEST_TOKEN}`);
    }
    
    console.log('🔄 Proxying request:', req.method, req.url, '→', `${apiBase}${req.url.replace('/api', '')}`);
  },
  onProxyRes: (proxyRes, req, res) => {
    console.log('✅ Proxy response:', proxyRes.statusCode, 'for', req.url);
  },
  onError: (err, req, res) => {
    console.error('❌ Proxy error:', err.message);
    console.error('❌ Request details:', req.method, req.url, 'from origin:', req.headers.origin);
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
  }
}));

// SPA fallback - serve index.html for all other routes
// This replaces .htaccess rewrite rules
app.use((req, res, next) => {
  const requestedPath = req.path;
  
  // Skip if this is an API request (should be handled by proxy)
  if (requestedPath.startsWith('/api/')) {
    return next();
  }
  
  // Handle specific HTML pages
  if (requestedPath === '/about' || requestedPath === '/about.html') {
    return res.sendFile(path.join(__dirname, staticDir, 'about.html'));
  }
  if (requestedPath === '/privacy' || requestedPath === '/privacy.html') {
    return res.sendFile(path.join(__dirname, staticDir, 'privacy.html'));
  }
  
  // Default to index.html for all other routes
  res.sendFile(path.join(__dirname, staticDir, 'index.html'));
});

app.listen(port, '0.0.0.0', () => {
  console.log(`🚀 Server running at http://localhost:${port}`);
  console.log(`📡 Proxying API requests to ${apiBase}`);
  console.log(`📂 Serving static files from ${staticDir}`);
}); 