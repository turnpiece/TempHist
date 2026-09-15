/**
 * sitemap.xml generation. Shared by server.js and the vite dev plugin.
 *
 * lastmod comes from the mtime of the location snapshot, read once at module
 * load — the file only changes on deploy, so there is no reason to stat per request.
 */
const fs = require('node:fs');
const path = require('node:path');
const { getAllLocations } = require('./locations.cjs');

const SNAPSHOT_PATH = path.join(__dirname, '..', 'data', 'preapproved-locations.json');

let _lastmod = null;
function snapshotLastmod() {
  if (!_lastmod) {
    try {
      _lastmod = fs.statSync(SNAPSHOT_PATH).mtime.toISOString().slice(0, 10);
    } catch {
      _lastmod = new Date().toISOString().slice(0, 10);
    }
  }
  return _lastmod;
}

/** Static routes, in rough priority order. Mirrors htmlFileForPath / the SPA catch-all. */
const STATIC_ROUTES = [
  { path: '/', changefreq: 'daily', priority: '1.0' },
  { path: '/locations', changefreq: 'weekly', priority: '0.8' },
  { path: '/about', changefreq: 'monthly', priority: '0.5' },
  { path: '/feed', changefreq: 'daily', priority: '0.5' },
  { path: '/privacy', changefreq: 'yearly', priority: '0.3' },
  { path: '/privacy/app', changefreq: 'yearly', priority: '0.3' },
];

function urlEntry(loc, lastmod) {
  return `  <url>
    <loc>${loc.loc}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>${loc.changefreq}</changefreq>
    <priority>${loc.priority}</priority>
  </url>`;
}

function buildSitemapXml(origin, lastmod = snapshotLastmod()) {
  const base = origin.replace(/\/+$/, '');
  const entries = [
    ...STATIC_ROUTES.map((r) => ({
      loc: `${base}${r.path === '/' ? '/' : r.path}`,
      changefreq: r.changefreq,
      priority: r.priority,
    })),
    ...getAllLocations().map((l) => ({
      loc: `${base}/locations/${l.slug}`,
      changefreq: 'daily',
      priority: '0.7',
    })),
  ];

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries.map((e) => urlEntry(e, lastmod)).join('\n')}
</urlset>
`;
}

module.exports = { buildSitemapXml, snapshotLastmod, STATIC_ROUTES };
