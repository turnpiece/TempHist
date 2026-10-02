import { defineConfig, loadEnv } from 'vite'
import { copyFileSync, readFileSync, existsSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { createRequire } from 'node:module'
import { execSync } from 'child_process'

// Location-page rendering is shared verbatim with server.js rather than
// reimplemented here — the two copies of the /s/:id share logic have already
// drifted (see #110), and this avoids a third.
const requireCjs = createRequire(join(__dirname, 'vite.config.ts'))
const { LOCATION_SLUG_RE, getAllLocations, getLocationBySlug } = requireCjs('./lib/locations.cjs')
const { injectLocationPage } = requireCjs('./lib/locationPage.cjs')
const { buildSitemapXml } = requireCjs('./lib/sitemap.cjs')

// Shared helpers for share-page OG/JSON-LD injection (used by Vite dev plugin and server.js)
function getOrdinalVite(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}
function formatShareHeadingVite(meta: { period: string; identifier: string; ref_year: number }): string {
  const { period, identifier, ref_year } = meta;
  let friendlyDate = '';
  if (period === 'daily' || period === 'weekly' || period === 'monthly' || (period === 'yearly' && identifier?.includes('-'))) {
    const [monthStr, dayStr] = identifier.split('-');
    const monthName = new Date(ref_year, Number(monthStr) - 1, 1).toLocaleString('en-GB', { month: 'long' });
    friendlyDate = `${getOrdinalVite(Number(dayStr))} ${monthName}`;
  }
  switch (period) {
    case 'daily':   return friendlyDate;
    case 'weekly':  return `Week ending ${friendlyDate}`;
    case 'monthly': return `Month ending ${friendlyDate}`;
    case 'yearly':  return `Year ending ${friendlyDate}`;
    default:        return friendlyDate;
  }
}
function escapeAttrVite(str: string): string {
  return str.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

// Read package.json to get version
const packageJson = JSON.parse(readFileSync('package.json', 'utf8'))

export default defineConfig(({ mode }) => {
  // Load env file based on `mode` in the current working directory.
  const env = loadEnv(mode, process.cwd(), '')
  
  return {
    define: {
      __APP_VERSION__: JSON.stringify(packageJson.version)
    },
  server: {
    proxy: {
      '/api': {
        target: env.API_TARGET || env.API_BASE || 'http://localhost:8000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      }
    }
  },
  publicDir: 'public',
  build: {
    outDir: 'dist',
    target: 'es2015',
    minify: 'terser',
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        about: resolve(__dirname, 'about.html'),
        privacy: resolve(__dirname, 'privacy.html'),
        privacyApp: resolve(__dirname, 'privacy-app.html'),
        feed: resolve(__dirname, 'feed.html'),
        locations: resolve(__dirname, 'locations.html'),
        share: resolve(__dirname, 'share.html')
      }
    }
  },
  plugins: [
    {
      // Rewrite clean URLs to HTML entry files in dev mode,
      // mirroring the production routing in server.js
      name: 'dev-url-routing',
      configureServer(server) {
        server.middlewares.use((req, _res, next) => {
          const url = req.url?.split('?')[0];
          if (url === '/about') req.url = '/about.html';
          else if (url === '/privacy') req.url = '/privacy.html';
          else if (url === '/privacy/app') req.url = '/privacy-app.html';
          else if (url === '/feed') req.url = '/feed.html';
          else if (url === '/locations') req.url = '/locations.html';
          next();
        });
      }
    },
    {
      // Server-rendered /locations/:slug pages in dev, mirroring server.js.
      // Registered before the share plugin and before Vite's own static/SPA
      // handling so unknown slugs 404 rather than falling through to index.html.
      name: 'dev-location-routing',
      configureServer(server) {
        server.middlewares.use(async (req, res, next) => {
          const url = req.url?.split('?')[0] ?? '';
          const match = url.match(/^\/locations\/([^/]+)\/?$/);
          if (!match) return next();

          const slug = decodeURIComponent(match[1]).toLowerCase();
          if (!LOCATION_SLUG_RE.test(slug)) return next();

          const canonicalPath = `/locations/${slug}`;
          if (url !== canonicalPath) {
            res.statusCode = 301;
            res.setHeader('Location', canonicalPath);
            return res.end();
          }

          const location = getLocationBySlug(slug);
          const port = server.config.server.port ?? 5173;
          const origin = `http://localhost:${port}`;

          if (!location) {
            // Match production: a real 404, with the locations index as the body.
            try {
              const raw = readFileSync(resolve(__dirname, 'locations.html'), 'utf-8');
              let html = await server.transformIndexHtml(req.url!, raw);
              html = html.replace('</head>', '    <meta name="robots" content="noindex">\n  </head>');
              res.statusCode = 404;
              res.setHeader('Content-Type', 'text/html; charset=utf-8');
              return res.end(html);
            } catch {
              return next();
            }
          }

          try {
            const apiBase = env.API_BASE
              || (env.VITE_API_BASE?.startsWith('http') ? env.VITE_API_BASE : null)
              || 'http://localhost:8000';
            const raw = readFileSync(resolve(__dirname, 'index.html'), 'utf-8');
            const transformed = await server.transformIndexHtml(req.url!, raw);
            const html = injectLocationPage(transformed, location, origin, apiBase, getAllLocations());
            res.setHeader('Content-Type', 'text/html; charset=utf-8');
            return res.end(html);
          } catch (err) {
            console.warn('[dev-location-routing] failed for', slug, err);
            return next();
          }
        });

        // sitemap.xml, mirroring the production route.
        server.middlewares.use((req, res, next) => {
          if ((req.url?.split('?')[0] ?? '') !== '/sitemap.xml') return next();
          const port = server.config.server.port ?? 5173;
          res.setHeader('Content-Type', 'application/xml; charset=utf-8');
          return res.end(buildSitemapXml(`http://localhost:${port}`));
        });
      }
    },
    {
      // Inject share-specific OG tags and JSON-LD for /s/:id routes in dev mode,
      // mirroring the production middleware in server.js
      name: 'dev-share-og-injection',
      configureServer(server) {
        server.middlewares.use(async (req, res, next) => {
            const match = req.url?.split('?')[0].match(/^\/s\/([a-zA-Z0-9_-]+)$/);
            if (!match) return next();

            const shareId = match[1];
            // Use the direct backend URL — VITE_API_BASE may be a relative proxy path (/api)
            // which is invalid for server-side fetch. API_BASE is always an absolute URL.
            const apiBase = env.API_BASE || (env.VITE_API_BASE?.startsWith('http') ? env.VITE_API_BASE : null) || 'http://localhost:8000';

            try {
              const apiRes = await fetch(`${apiBase}/v1/shares/${encodeURIComponent(shareId)}`);
              if (!apiRes.ok) return next();
              const meta = await apiRes.json() as { location: string; period: string; identifier: string; ref_year: number };

              const cityName = meta.location.split(',')[0].trim().toUpperCase();
              const heading = formatShareHeadingVite(meta);
              const title = `${cityName} · ${heading} | TempHist`;
              const description = `Historical temperature data for ${cityName}: ${heading}.`;
              const shareUrl = `http://localhost:${server.config.server.port ?? 5173}/s/${shareId}`;

              const shareHtml = readFileSync(resolve(__dirname, 'share.html'), 'utf-8');
              let html = await server.transformIndexHtml(req.url!, shareHtml);

              const ogTags = [
                `<meta property="og:type" content="website">`,
                `<meta property="og:site_name" content="TempHist">`,
                `<meta property="og:title" content="${escapeAttrVite(title)}">`,
                `<meta property="og:description" content="${escapeAttrVite(description)}">`,
                `<meta property="og:url" content="${escapeAttrVite(shareUrl)}">`,
                `<meta name="twitter:card" content="summary_large_image">`,
                `<meta name="twitter:title" content="${escapeAttrVite(title)}">`,
                `<meta name="twitter:description" content="${escapeAttrVite(description)}">`,
              ].join('\n    ');

              const ldJson = JSON.stringify({
                '@context': 'https://schema.org',
                '@type': 'WebPage',
                name: title,
                description,
                url: shareUrl,
                isPartOf: { '@type': 'WebSite', name: 'TempHist', url: 'https://temphist.com' },
              });

              html = html
                .replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>/gi, `<script type="application/ld+json">${ldJson}</script>`)
                .replace(/<meta\s+(?:property="og:[^"]*"|name="twitter:[^"]*")[^>]*\/?\s*>/gi, '')
                .replace(/<title>[^<]*<\/title>/, `<title>${escapeAttrVite(title)}</title>`)
                // head-common.html now carries a canonical pointing at the home
                // page; without this the share page would claim to be the home page.
                .replace(/<link\s+rel="canonical"[^>]*\/?\s*>/i, `<link rel="canonical" href="${escapeAttrVite(shareUrl)}" />`)
                .replace('</head>', `    ${ogTags}\n  </head>`);

              res.setHeader('Content-Type', 'text/html; charset=utf-8');
              res.end(html);
            } catch {
              next();
            }
          });
      }
    },
    {
      name: 'inject-templates',
      transformIndexHtml(html, ctx) {
        const templatesDir = resolve(__dirname, 'templates')
        
        // Determine page context for variable substitution
        const pageName = ctx.filename || 'index.html'
        const isIndex = pageName.includes('index.html')
        const isAbout = pageName.includes('about.html')
        const isPrivacyApp = pageName.includes('privacy-app.html')
        const isPrivacy = pageName.includes('privacy.html') && !isPrivacyApp
        const isFeed = pageName.includes('feed.html')
        const isLocations = pageName.includes('locations.html')

        // Define variables for template substitution
        const vars = {
          HOME_LINK: isIndex ? '#/splash' : '/',
          LOCATIONS_LINK: '/locations',
          ABOUT_LINK: '/about',
          PRIVACY_LINK: '/privacy',
          FEED_LINK: '/feed',
          LOCATIONS_ACTIVE: isLocations ? ' class="active"' : '',
          ABOUT_ACTIVE: isAbout ? ' class="active"' : '',
          PRIVACY_ACTIVE: (isPrivacy || isPrivacyApp) ? ' class="active"' : '',
          FEED_ACTIVE: isFeed ? ' class="active"' : '',
          // Hide Snapshots nav link when VITE_ENABLE_SNAPSHOTS=false
          SNAPSHOTS_NAV_HIDDEN: env.VITE_ENABLE_SNAPSHOTS === 'false' ? 'hidden' : '',
          // Self-referencing canonical per entry point. server.js rewrites the
          // origin per host via applySiteOriginToHtml, so baking in the production
          // origin here is correct. NOTE: /s/:id and /locations/:slug are served
          // from index.html, so their middleware MUST replace this tag — otherwise
          // every share and location page canonicalises itself to the home page.
          CANONICAL_URL: isLocations ? 'https://temphist.com/locations'
            : isAbout ? 'https://temphist.com/about'
            : isPrivacyApp ? 'https://temphist.com/privacy/app'
            : isPrivacy ? 'https://temphist.com/privacy'
            : isFeed ? 'https://temphist.com/feed'
            : 'https://temphist.com/'
        }
        
        // Helper function to load and substitute template
        const loadTemplate = (templateName: string, extension: string = 'html') => {
          const templatePath = join(templatesDir, `${templateName}.${extension}`)
          if (!existsSync(templatePath)) {
            console.warn(`Template not found: ${templatePath}`)
            return ''
          }
          let content = readFileSync(templatePath, 'utf-8')
          // Replace variables
          Object.entries(vars).forEach(([key, value]) => {
            content = content.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value)
          })
          return content
        }
        
        // Load WebApplication JSON template
        const webAppJson = JSON.parse(loadTemplate('webapplication-json', 'json'))
        
        // Replace template placeholders
        html = html.replaceAll('<!-- INCLUDE:head-common -->', loadTemplate('head-common'))
        html = html.replaceAll('<!-- INCLUDE:header -->', loadTemplate('header'))
        html = html.replaceAll('<!-- INCLUDE:nav -->', loadTemplate('nav'))
        html = html.replaceAll('<!-- INCLUDE:footer -->', loadTemplate('footer'))
        
        // Handle WebApplication JSON injection
        // For index.html, we need to merge with additional properties
        if (isIndex && html.includes('<!-- INCLUDE:webapplication-json -->')) {
          // Merge WebApplication JSON with additional properties
          const mergedJson = {
            ...webAppJson,
            operatingSystem: "Web Browser",
            offers: {
              "@type": "Offer",
              price: "0",
              priceCurrency: "USD"
            },
            featureList: [
              "Historical temperature comparison",
              "Location-based weather data",
              "Interactive temperature charts",
              "50-year historical data",
              "Daily, weekly, monthly, and yearly views"
            ],
            browserRequirements: "Requires JavaScript and location access",
            screenshot: "https://temphist.com/assets/og-default.png"
          }
          // Format the merged JSON with proper indentation (skip the outer braces)
          const mergedJsonStr = JSON.stringify(mergedJson, null, 2)
            .split('\n')
            .slice(1, -1) // Remove first and last lines (opening and closing braces)
            .map(line => '      ' + line)
            .join('\n')
          // Replace from after @context to the closing brace, removing the placeholder and all properties
          html = html.replace(
            /"@context": "https:\/\/schema\.org",\s*<!-- INCLUDE:webapplication-json -->,[\s\S]*?"screenshot": "https:\/\/temphist\.com\/assets\/og-default\.png"\s*\n\s*\}/m,
            `"@context": "https://schema.org",\n${mergedJsonStr}\n    }`
          )
        } else {
          // For other pages, just replace the placeholder with the JSON
          const webAppJsonStr = JSON.stringify(webAppJson, null, 2)
            .split('\n')
            .map((line, i) => i === 0 ? line : '        ' + line)
            .join('\n')
          html = html.replaceAll('<!-- INCLUDE:webapplication-json -->', webAppJsonStr)
        }
        
        return html
      }
    },
    {
      name: 'replace-env-vars',
      transformIndexHtml(html) {
        // Replace %VITE_API_BASE% with actual environment variable
        const apiBase = env.VITE_API_BASE || 'https://api.temphist.com'
        html = html.replaceAll('%VITE_API_BASE%', apiBase)
        // Optional: bake a non-production canonical origin for static-only hosts (no Node HTML rewrite)
        const siteOrigin = env.VITE_SITE_ORIGIN
        if (siteOrigin) {
          html = html.replaceAll('https://temphist.com', siteOrigin.replace(/\/$/, ''))
        }
        return html
      }
    },
    {
      name: 'copy-static-files',
      writeBundle() {
        // Copy .htaccess if it exists
        try {
          copyFileSync('.htaccess', 'dist/.htaccess')
        } catch (error) {
          // .htaccess might not exist, that's okay
        }
        // Copy favicon files
        copyFileSync('favicon.ico', 'dist/favicon.ico')
        const faviconSizes = [16, 32, 48, 64, 192, 512]
        faviconSizes.forEach(size => {
          const src = `favicon-${size}.png`
          if (existsSync(src)) {
            copyFileSync(src, `dist/${src}`)
          }
        })
        // Copy apple touch icon
        if (existsSync('apple-touch-icon.png')) {
          copyFileSync('apple-touch-icon.png', 'dist/apple-touch-icon.png')
        }
        // Assets are now in public/ directory and handled by Vite automatically
        // But we still copy them here as a backup to ensure they're present
        if (existsSync('assets')) {
          execSync('cp -r assets dist/', { stdio: 'inherit' })
        }
        
        console.log(`✅ Copied static files to dist/`)
      }
    }
  ]
  }
})
