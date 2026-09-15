/**
 * Server-rendered /locations/:slug pages.
 *
 * Shared verbatim by server.js and the vite dev plugin so the two cannot drift
 * (which is what happened with the /s/:id share injection — see #110).
 *
 * The page is index.html with location-specific <head> metadata and a static
 * prose block swapped in. The chart and temperature figures are still rendered
 * client-side; nothing here fetches temperature data.
 */
const { absolutiseImages, displayStringFor } = require('./locations.cjs');

const SITE_NAME = 'TempHist';
const YEARS_OF_DATA = 50;

function escapeAttr(str) {
  return String(str)
    .replaceAll('&', '&amp;').replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

function escapeHtml(str) {
  return String(str)
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

/** Serialise for embedding in <script>: neutralise </script> and JS line terminators. */
function jsonForScript(obj) {
  return JSON.stringify(obj)
    .replaceAll('<', '\\u003c')
    .replaceAll(' ', '\\u2028')
    .replaceAll(' ', '\\u2029');
}

/** 51.5074, -0.1278 → "51.51°N, 0.13°W" */
function formatCoords(lat, lon) {
  const ns = lat >= 0 ? 'N' : 'S';
  const ew = lon >= 0 ? 'E' : 'W';
  return `${Math.abs(lat).toFixed(2)}°${ns}, ${Math.abs(lon).toFixed(2)}°${ew}`;
}

/** "London, England, United Kingdom" without repeating a city-state's name three times. */
function placeLabel(loc) {
  const parts = [loc.name];
  if (loc.admin1 && loc.admin1.trim() && loc.admin1.trim() !== loc.name) parts.push(loc.admin1.trim());
  if (loc.country_name !== loc.name) parts.push(loc.country_name);
  return parts.join(', ');
}

/** Region phrase for prose: "England, United Kingdom" or just "Singapore". */
function regionPhrase(loc) {
  if (loc.admin1 && loc.admin1.trim() && loc.admin1.trim() !== loc.name && loc.admin1.trim() !== loc.country_name) {
    return `${loc.admin1.trim()}, ${loc.country_name}`;
  }
  return loc.country_name;
}

function buildMeta(loc, origin) {
  const title = `${loc.name} temperature history — ${YEARS_OF_DATA} years of data | ${SITE_NAME}`;
  const description =
    `How today's temperature in ${loc.name}, ${loc.country_name} compares with the same date in ` +
    `each of the past ${YEARS_OF_DATA} years. Daily, weekly, monthly and yearly charts.`;
  const canonical = `${origin}/locations/${loc.slug}`;

  const ldJson = {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: title,
    description,
    url: canonical,
    isPartOf: { '@type': 'WebSite', name: SITE_NAME, url: origin },
    about: {
      '@type': 'City',
      name: loc.name,
      address: { '@type': 'PostalAddress', addressCountry: loc.country_code },
      geo: { '@type': 'GeoCoordinates', latitude: loc.latitude, longitude: loc.longitude },
    },
    breadcrumb: {
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: origin },
        { '@type': 'ListItem', position: 2, name: 'Locations', item: `${origin}/locations` },
        { '@type': 'ListItem', position: 3, name: loc.name, item: canonical },
      ],
    },
  };

  return { title, description, canonical, ldJson };
}

/** The image the page and og:image both use. Returns null when the snapshot has none. */
function imageFor(loc, apiBase) {
  const img = absolutiseImages(loc, apiBase);
  if (!img) return null;
  if (typeof img === 'string') return { webp: null, jpeg: img };
  return { webp: img.webp || null, jpeg: img.jpeg || null };
}

function renderAttribution(loc) {
  const a = loc.imageAttribution;
  if (!a || !a.photographerName) return '';
  const who = escapeHtml(a.photographerName);
  const source = a.sourceUrl
    ? `<a href="${escapeAttr(a.sourceUrl)}" rel="noopener nofollow">${escapeHtml(a.sourceName || 'source')}</a>`
    : escapeHtml(a.sourceName || '');
  const licence = a.licenseName
    ? (a.licenseUrl
      ? ` (<a href="${escapeAttr(a.licenseUrl)}" rel="noopener nofollow">${escapeHtml(a.licenseName)}</a>)`
      : ` (${escapeHtml(a.licenseName)})`)
    : '';
  return `<p class="location-intro__attribution">Photo by ${who}${source ? ` via ${source}` : ''}${licence}</p>`;
}

// The API's processed location images are all 320x200 (16:10). Declaring the
// real intrinsic size lets the browser reserve the right box and avoids layout
// shift; claiming 1200x630 would both lie and reserve the wrong space.
const LOCATION_IMAGE_WIDTH = 320;
const LOCATION_IMAGE_HEIGHT = 200;

function renderPicture(loc, apiBase) {
  const img = imageFor(loc, apiBase);
  if (!img || !img.jpeg) return '';
  const alt = escapeAttr(loc.imageAlt || `${loc.name}, ${loc.country_name}`);
  const sources = img.webp
    ? `<source srcset="${escapeAttr(img.webp)}" type="image/webp">`
    : '';
  // Lazy, not eager: this block renders below the chart, so the image is below
  // the fold and is never the LCP element. Prioritising it would only compete
  // with the temperature data fetch.
  return `<picture class="location-intro__image">${sources}` +
    `<img src="${escapeAttr(img.jpeg)}" alt="${alt}" ` +
    `width="${LOCATION_IMAGE_WIDTH}" height="${LOCATION_IMAGE_HEIGHT}" ` +
    `loading="lazy" decoding="async"></picture>`;
}

/**
 * Links to every other curated city. This is what gets 20 otherwise-thin pages
 * crawled and indexed — it replaces the footer we lose by sitting outside #appShell.
 */
function renderSiblings(loc, allLocations) {
  const links = allLocations
    .filter((l) => l.slug !== loc.slug)
    .map((l) => `<a href="/locations/${escapeAttr(l.slug)}">${escapeHtml(l.name)}</a>`)
    .join('\n        ');
  return `<nav class="location-intro__siblings" aria-label="Other locations">
        <h2>Other locations</h2>
        ${links}
        <a class="location-intro__all" href="/locations">All locations →</a>
      </nav>`;
}

/**
 * The static prose block. Server-rendered only — no client code writes this, so
 * a crawler with JavaScript disabled still gets real content.
 */
function renderIntroHtml(loc, apiBase, allLocations) {
  const region = regionPhrase(loc);
  const coords = formatCoords(loc.latitude, loc.longitude);
  const picture = renderPicture(loc, apiBase);

  // The media/text split exists so wide screens can run the image and prose as
  // two columns; on narrow screens the grid collapses and they stack.
  const media = picture
    ? `<div class="location-intro__media">
        ${picture}
        ${renderAttribution(loc)}
      </div>`
    : '';

  return `<section id="locationIntro" class="location-intro" data-slug="${escapeAttr(loc.slug)}">
      <h1>${escapeHtml(loc.name)} temperature history</h1>
      <div class="location-intro__body${media ? '' : ' location-intro__body--no-media'}">
        ${media}
        <div class="location-intro__text">
          <p class="location-intro__lede">${escapeHtml(region)} · ${escapeHtml(coords)} · ${escapeHtml(loc.timezone)}</p>
          <p>This page charts today's temperature in ${escapeHtml(loc.name)} against the same
            calendar date in each of the past ${YEARS_OF_DATA} years, so you can see at a glance
            whether today is unusually warm or cold for the time of year in ${escapeHtml(region)}.</p>
          <p>Switch between daily, weekly, monthly and yearly views to compare a single
            date, a rolling week or month, or a full year. Each view shows the individual
            yearly readings, the long-run average, and the trend line across the period.
            Dates are resolved in ${escapeHtml(loc.name)}'s own timezone
            (${escapeHtml(loc.timezone)}), not yours, so "today" means today in
            ${escapeHtml(loc.name)}.</p>
        </div>
      </div>
      ${renderSiblings(loc, allLocations)}
    </section>`;
}

/**
 * Rewrite dist/index.html into the location page.
 *
 * Note the deliberate differences from the /s/:id share injection: only the
 * page-specific og/twitter tags are stripped (og:site_name, og:type and og:image
 * from head-common are kept and og:image is then overridden), and the JSON-LD
 * replace is /i rather than /gi so only the first (WebApplication) block is hit.
 */
function injectLocationPage(html, loc, origin, apiBase, allLocations) {
  const { title, description, canonical, ldJson } = buildMeta(loc, origin);

  // og:image is deliberately NOT overridden with the city photo. Those are only
  // 320x200 — well under the 1200x630 that link previews want — and head-common
  // already supplies a purpose-built og-default.png at the right size, along with
  // matching og:image:width/height/type. Substituting the city image would mean
  // either shipping a low-quality card or leaving those three tags describing an
  // image that is no longer there. If per-city cards are wanted later, the API
  // would need to render them (as it already does for shares via /v1/og/:id.png).
  const ogTags = [
    `<meta property="og:title" content="${escapeAttr(title)}">`,
    `<meta property="og:description" content="${escapeAttr(description)}">`,
    `<meta property="og:url" content="${escapeAttr(canonical)}">`,
    `<meta name="twitter:title" content="${escapeAttr(title)}">`,
    `<meta name="twitter:description" content="${escapeAttr(description)}">`,
  ];

  const bootstrap = {
    slug: loc.slug,
    id: loc.id,
    location: displayStringFor(loc),
    name: loc.name,
    latitude: loc.latitude,
    longitude: loc.longitude,
    timezone: loc.timezone,
    countryCode: loc.country_code,
  };

  const head = [
    ...ogTags,
    `<script>globalThis.__TH_LOCATION=${jsonForScript(bootstrap)}</script>`,
  ].filter(Boolean).join('\n    ');

  return html
    // Two classes with different lifetimes (see styles.scss):
    //   is-location-page   persistent — hides the splash, reveals the shell, and
    //                      works with JS disabled because it is in the markup.
    //   is-pending-location transient — stages the data-driven elements at
    //                      opacity:0 to avoid a flash; JS removes it once they
    //                      are staged. Emitting it here reuses the existing
    //                      removal path rather than inventing a second one.
    .replace('<html lang="en">', '<html lang="en" class="is-location-page is-pending-location">')
    .replace(/<title>[^<]*<\/title>/i, `<title>${escapeAttr(title)}</title>`)
    .replace(/<meta\s+name="description"[^>]*\/?\s*>/i,
      `<meta name="description" content="${escapeAttr(description)}" />`)
    // Strip only the page-specific tags; keep og:site_name / og:type / og:image.
    .replace(/<meta\s+(?:property="og:(?:title|description|url)"|name="twitter:(?:title|description)")[^>]*\/?\s*>/gi, '')
    .replace(/<link\s+rel="canonical"[^>]*\/?\s*>/i,
      `<link rel="canonical" href="${escapeAttr(canonical)}" />`)
    // /i not /gi: replace only the first (WebApplication) block.
    .replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>/i,
      `<script type="application/ld+json">${jsonForScript(ldJson)}</script>`)
    .replace('</head>', `    ${head}\n  </head>`)
    .replace('<!-- SSR:LOCATION_INTRO -->', renderIntroHtml(loc, apiBase, allLocations));
}

module.exports = {
  buildMeta,
  escapeAttr,
  escapeHtml,
  formatCoords,
  injectLocationPage,
  jsonForScript,
  placeLabel,
  regionPhrase,
  renderIntroHtml,
};
