const express = require('express');
const path = require('path');
const fs = require('node:fs');
const { getOrdinal } = require('./lib/getOrdinal');
require('dotenv').config();
const app = express();
app.set('trust proxy', true);

// Configuration
const port = process.env.PORT || 3000;
const isProd = process.env.NODE_ENV === 'production' || process.env.NODE_ENV === 'staging';

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
    "script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://www.gstatic.com https://static.cloudflareinsights.com https://apis.google.com https://*.firebaseapp.com https://*.googleapis.com https://www.google.com/recaptcha/ https://www.gstatic.com/recaptcha/",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https:",
    "font-src 'self'",
    "connect-src 'self' https://stagingapi.temphist.com https://devapi.temphist.com https://api.temphist.com https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://nominatim.openstreetmap.org https://ipapi.co https://*.firebaseapp.com https://*.googleapis.com https://cloudflareinsights.com https://www.google.com/recaptcha/ https://recaptchaenterprise.googleapis.com https://cdn.jsdelivr.net",
    "frame-src 'self' https://temphist-2c787.firebaseapp.com https://*.firebaseapp.com https://*.googleapis.com https://www.google.com/recaptcha/ https://recaptcha.google.com/recaptcha/",
    "object-src 'self' data:",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "require-trusted-types-for 'script'",
    "trusted-types default decodeHTMLEntitiesPolicy goog#html firebase-js-sdk gapi#gapi 'allow-duplicates'",
    "upgrade-insecure-requests"
  ].join('; ');
  
  res.header('Content-Security-Policy', cspDirectives);
  res.header('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.header('Permissions-Policy', 'geolocation=(self), microphone=(), camera=()');
  res.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  res.header('Cross-Origin-Opener-Policy', 'same-origin');
  
  next();
});

/** Public site origin for OG / JSON-LD URLs (honours reverse proxies). */
function getPublicOrigin(req) {
  const xfProto = req.get('x-forwarded-proto');
  const proto = xfProto?.split(',')[0].trim() || req.protocol || 'https';
  const host = req.get('x-forwarded-host') || req.get('host') || 'temphist.com';
  return `${proto}://${host}`;
}

/** Rewrite baked-in production URLs so link previews use this host’s assets (e.g. dev vs prod). */
function applySiteOriginToHtml(html, req) {
  return html.replaceAll('https://temphist.com', getPublicOrigin(req));
}

function injectCountryCode(html, req) {
  const raw = (req.headers['cf-ipcountry'] || '').trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(raw)) return html;
  return html.replace('</head>', `<script>globalThis.__TH_COUNTRY="${raw}"</script></head>`);
}

function sendDistHtml(req, res, filename) {
  const filePath = path.join(__dirname, 'dist', filename);
  let html = applySiteOriginToHtml(fs.readFileSync(filePath, 'utf-8'), req);
  html = injectCountryCode(html, req);
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache');
  res.send(html);
}

function htmlFileForPath(urlPath) {
  switch (urlPath) {
    case '/':
    case '/index.html':       return 'index.html';
    case '/about.html':       return 'about.html';
    case '/privacy.html':     return 'privacy.html';
    case '/privacy-app.html': return 'privacy-app.html';
    case '/feed.html':        return 'feed.html';
    case '/locations.html':   return 'locations.html';
    default:                  return null;
  }
}

// HTML entry points: rewrite canonical https://temphist.com → request origin before static
// (otherwise express.static index would serve / without this pass).
app.use((req, res, next) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') return next();
  const file = htmlFileForPath(req.path);
  if (!file) return next();
  try {
    sendDistHtml(req, res, file);
  } catch (e) {
    next(e);
  }
});

// --- Open Graph tag injection for /s/:id share pages ---

// Cache the base HTML to avoid repeated disk reads on every share page request
let _indexHtmlCache = null;
function getIndexHtml() {
  if (!_indexHtmlCache) {
    _indexHtmlCache = fs.readFileSync(path.join(__dirname, 'dist', 'index.html'), 'utf-8');
  }
  return _indexHtmlCache;
}

function formatSharePeriodHeading(meta) {
  const { period, identifier, ref_year } = meta;
  let friendlyDate = '';

  if (
    period === 'daily' || period === 'weekly' || period === 'monthly' ||
    (period === 'yearly' && identifier?.includes('-'))
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

// Intercept /s/:id before static file serving so crawlers get OG-enriched HTML
app.use(async (req, res, next) => {
  const match = req.path.match(/^\/s\/([^/]+)$/);
  if (!match) return next();

  const shareId = match[1];

  // Only allow characters that are safe to forward to the API
  if (!/^[a-zA-Z0-9_-]+$/.test(shareId)) return next();

  const apiBase = process.env.API_BASE || process.env.VITE_API_BASE;
  if (!apiBase || !apiBase.startsWith('http')) {
    console.warn('[OG] No absolute API base URL configured — skipping OG injection for', shareId);
    return next();
  }

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
      return next(); // Network error / timeout — serve plain SPA
    }

    const cityName = meta.location.split(',')[0].trim().toUpperCase();
    const heading = formatSharePeriodHeading(meta);
    const title = `${cityName} \u00b7 ${heading} | TempHist`;
    const description = `Historical temperature data for ${cityName}: ${heading}.`;
    const shareUrl = `${getPublicOrigin(req)}/s/${shareId}`;

    const imageUrl = `${apiBase}/v1/og/${shareId}.png`;
    const ogTags = [
      `<meta property="og:type" content="website">`,
      `<meta property="og:site_name" content="TempHist">`,
      `<meta property="og:title" content="${escapeAttr(title)}">`,
      `<meta property="og:description" content="${escapeAttr(description)}">`,
      `<meta property="og:url" content="${escapeAttr(shareUrl)}">`,
      `<meta property="og:image" content="${escapeAttr(imageUrl)}">`,
      `<meta property="og:image:width" content="1200">`,
      `<meta property="og:image:height" content="630">`,
      `<meta name="twitter:card" content="summary_large_image">`,
      `<meta name="twitter:title" content="${escapeAttr(title)}">`,
      `<meta name="twitter:description" content="${escapeAttr(description)}">`,
      `<meta name="twitter:image" content="${escapeAttr(imageUrl)}">`,
    ].join('\n    ');

    const ldJson = JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'WebPage',
      'name': title,
      'description': description,
      'url': shareUrl,
      'isPartOf': { '@type': 'WebSite', 'name': 'TempHist', 'url': 'https://temphist.com' },
    });

    // Replace the home-page JSON-LD with a share-specific WebPage schema in place,
    // and strip generic og:/twitter: tags so crawlers only see the share-specific ones.
    let html = getIndexHtml()
      .replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>/gi, `<script type="application/ld+json">${ldJson}</script>`)
      .replace(/<meta\s+(?:property="og:[^"]*"|name="twitter:[^"]*")[^>]*\/?\s*>/gi, '')
      .replace(/<title>[^<]*<\/title>/, `<title>${escapeAttr(title)}</title>`)
      .replace('</head>', `    ${ogTags}\n  </head>`);
    html = applySiteOriginToHtml(html, req);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache');
    return res.send(html);
  } catch (err) {
    console.error('[OG] Unexpected error for share', shareId, ':', err.message);
    return next();
  }
});

// Serve static files from dist directory with per-pattern cache headers
app.use(express.static('dist', {
  etag: true,
  setHeaders(res, filePath) {
    if (!isProd) {
      // In non-production environments, disable all caching so changes are
      // always visible immediately without needing to clear the browser cache
      res.setHeader('Cache-Control', 'no-cache');
      return;
    }
    if (/\/assets\/.*\.(js|css)$/.test(filePath)) {
      // Vite-fingerprinted bundles: immutable for 1 year
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    } else if (/\/assets\//.test(filePath)) {
      // Other assets (images, fonts): 30 days
      res.setHeader('Cache-Control', 'public, max-age=2592000');
    } else if (/\.html$/.test(filePath)) {
      // HTML entry points: always revalidate
      res.setHeader('Cache-Control', 'no-cache');
    } else if (/favicon|logo\./.test(filePath)) {
      // Favicons and logos: 7 days
      res.setHeader('Cache-Control', 'public, max-age=604800');
    } else {
      // Everything else: 1 day
      res.setHeader('Cache-Control', 'public, max-age=86400');
    }
  }
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
  
  // Handle specific HTML pages (clean URLs — *.html is handled above)
  if (requestedPath === '/about') {
    return sendDistHtml(req, res, 'about.html');
  }
  if (requestedPath === '/privacy') {
    return sendDistHtml(req, res, 'privacy.html');
  }
  if (requestedPath === '/privacy/app') {
    return sendDistHtml(req, res, 'privacy-app.html');
  }
  if (requestedPath === '/feed') {
    return sendDistHtml(req, res, 'feed.html');
  }
  if (requestedPath === '/locations') {
    return sendDistHtml(req, res, 'locations.html');
  }
  
  // Default to index.html for all other routes (SPA behavior)
  return sendDistHtml(req, res, 'index.html');
});

app.listen(port, '0.0.0.0', () => {
  console.log(`🚀 TempHist running on port ${port}`);
  console.log(`📂 Serving static files from dist/`);
});

