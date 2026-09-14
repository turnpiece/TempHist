import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const require = createRequire(import.meta.url);
const {
  LOCATION_SLUG_RE, absolutiseImages, displayStringFor, getAllLocations, getLocationBySlug,
} = require('../lib/locations.cjs');
const { buildMeta, injectLocationPage, jsonForScript, regionPhrase } = require('../lib/locationPage.cjs');
const { buildSitemapXml } = require('../lib/sitemap.cjs');

const ORIGIN = 'https://temphist.com';
const API = 'https://api.temphist.com';

describe('location snapshot', () => {
  it('has the 20 curated locations, each with a URL-safe slug', () => {
    const all = getAllLocations();
    expect(all).toHaveLength(20);
    for (const loc of all) {
      expect(LOCATION_SLUG_RE.test(loc.slug), `${loc.slug} is not URL-safe`).toBe(true);
      expect(loc.id).toBeTruthy();
      expect(typeof loc.latitude).toBe('number');
      expect(typeof loc.longitude).toBe('number');
    }
  });

  it('has unique slugs', () => {
    const slugs = getAllLocations().map((l: any) => l.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it('returns undefined for an unknown slug', () => {
    expect(getLocationBySlug('atlantis')).toBeUndefined();
  });
});

describe('displayStringFor', () => {
  // This string is the path segment for every /v1/records/... call, so it IS the
  // API's cache key. It must match selectLocation() in src/locations/locations.ts
  // exactly; a divergence silently creates a second cache entry per city.
  const buildLikeClient = (loc: any) => {
    const parts = [loc.name];
    if (loc.admin1?.trim()) parts.push(loc.admin1.trim());
    parts.push(loc.country_name);
    return parts.join(', ');
  };

  it('matches the client-side construction for all 20 locations', () => {
    for (const loc of getAllLocations()) {
      expect(displayStringFor(loc), `mismatch for ${loc.slug}`).toBe(buildLikeClient(loc));
    }
  });

  it('produces the expected shape', () => {
    expect(displayStringFor(getLocationBySlug('london'))).toBe('London, England, United Kingdom');
    expect(displayStringFor(getLocationBySlug('new-york'))).toBe('New York, New York, United States');
  });
});

describe('absolutiseImages', () => {
  it('resolves relative snapshot paths against the API origin', () => {
    const img = absolutiseImages(getLocationBySlug('london'), API);
    expect(img.webp).toBe(`${API}/data/locations/processed/london.webp`);
    expect(img.jpeg).toBe(`${API}/data/locations/processed/london.jpg`);
  });

  it('does not double-prefix an already absolute URL', () => {
    const loc = { imageUrl: { webp: 'https://cdn.example/a.webp', jpeg: 'https://cdn.example/a.jpg' } };
    expect(absolutiseImages(loc, API).webp).toBe('https://cdn.example/a.webp');
  });
});

describe('regionPhrase', () => {
  it('includes the region when it differs from the city', () => {
    expect(regionPhrase(getLocationBySlug('london'))).toBe('England, United Kingdom');
  });

  it('does not repeat a city-state name', () => {
    expect(regionPhrase(getLocationBySlug('singapore'))).toBe('Singapore');
  });
});

describe('buildMeta', () => {
  it('builds a self-referencing canonical', () => {
    expect(buildMeta(getLocationBySlug('london'), ORIGIN).canonical)
      .toBe('https://temphist.com/locations/london');
  });

  it('names the city in the title and description', () => {
    const { title, description } = buildMeta(getLocationBySlug('cape-town'), ORIGIN);
    expect(title).toContain('Cape Town');
    expect(description).toContain('Cape Town');
  });

  it('emits WebPage JSON-LD with geo and breadcrumbs', () => {
    const { ldJson } = buildMeta(getLocationBySlug('london'), ORIGIN);
    expect(ldJson['@type']).toBe('WebPage');
    expect(ldJson.about['@type']).toBe('City');
    expect(ldJson.about.geo.latitude).toBeCloseTo(51.5074);
    expect(ldJson.breadcrumb.itemListElement).toHaveLength(3);
  });

  it('gives every location a distinct title', () => {
    const titles = getAllLocations().map((l: any) => buildMeta(l, ORIGIN).title);
    expect(new Set(titles).size).toBe(titles.length);
  });
});

describe('jsonForScript', () => {
  it('neutralises a closing script tag', () => {
    expect(jsonForScript({ x: '</script>' })).not.toContain('</script>');
  });

  it('escapes JS line terminators that are legal in JSON', () => {
    expect(jsonForScript({ x: '  ' })).toBe('{"x":"\\u2028\\u2029"}');
  });
});

describe('buildSitemapXml', () => {
  const xml = buildSitemapXml(ORIGIN, '2026-01-01');

  it('lists every location plus the static routes', () => {
    expect((xml.match(/<url>/g) || []).length).toBe(26);
    for (const loc of getAllLocations()) {
      expect(xml).toContain(`${ORIGIN}/locations/${loc.slug}`);
    }
  });

  it('is well-formed enough to declare the sitemap namespace', () => {
    expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(xml).toContain('http://www.sitemaps.org/schemas/sitemap/0.9');
  });

  it('strips a trailing slash from the origin', () => {
    expect(buildSitemapXml('https://temphist.com/', '2026-01-01')).not.toContain('temphist.com//');
  });
});

describe('injectLocationPage', () => {
  // Use the real built page when present so the test exercises the actual
  // markers and tag shapes rather than a hand-written approximation.
  const distIndex = resolve(__dirname, '..', 'dist', 'index.html');
  let html: string;
  try {
    html = readFileSync(distIndex, 'utf-8');
  } catch {
    html = '';
  }

  const render = (slug: string) =>
    injectLocationPage(html, getLocationBySlug(slug), ORIGIN, API, getAllLocations());

  it.skipIf(!html)('emits exactly one title, canonical and JSON-LD block', () => {
    const out = render('london');
    expect((out.match(/<title>/g) || []).length).toBe(1);
    expect((out.match(/rel="canonical"/g) || []).length).toBe(1);
    expect((out.match(/application\/ld\+json/g) || []).length).toBe(1);
  });

  it.skipIf(!html)('replaces the WebApplication schema rather than appending', () => {
    expect(render('london')).not.toContain('"@type":"WebApplication"');
  });

  it.skipIf(!html)('renders prose and sibling links without JS', () => {
    const out = render('london');
    expect(out).toContain('<h1>London temperature history</h1>');
    expect(out).toContain('href="/locations/manchester"');
    expect(out).not.toContain('href="/locations/london"'); // no self-link
    expect(out).toContain('href="/locations"');
  });

  it.skipIf(!html)('sets the location-page class so the splash is hidden without JS', () => {
    expect(render('london')).toContain('class="is-location-page"');
  });

  it.skipIf(!html)('bootstraps the client with the API-matching display string', () => {
    expect(render('london')).toContain('"location":"London, England, United Kingdom"');
  });

  it.skipIf(!html)('points og:image at the absolutised city image', () => {
    expect(render('london')).toContain(`content="${API}/data/locations/processed/london.jpg"`);
  });

  it.skipIf(!html)('consumes the SSR marker', () => {
    expect(render('london')).not.toContain('SSR:LOCATION_INTRO');
  });
});
