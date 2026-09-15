/**
 * Curated location data, shared by server.js and vite.config.ts.
 *
 * The list is a committed snapshot of api/data/preapproved_locations.json rather
 * than a runtime fetch: /v1/locations/preapproved requires Firebase auth, and a
 * per-request (or per-boot) fetch would mean holding API_ACCESS_TOKEN in the web
 * tier. A snapshot also makes the rendered HTML deterministic per deploy, which
 * is a precondition for serving it with s-maxage.
 *
 * scripts/check-locations-snapshot.mjs fails the build if this drifts from the API.
 */
const locationsData = require('../data/preapproved-locations.json');

/** Slugs are lowercase alphanumeric with hyphens: london, new-york, cape-town. */
const LOCATION_SLUG_RE = /^[a-z0-9-]+$/;

/**
 * The display string the main app uses to identify a location.
 *
 * MUST match selectLocation() in src/locations/locations.ts byte for byte — this
 * string is the path segment for every /v1/records/... call and therefore the
 * API's cache key. Any divergence silently creates a second cache population
 * path for the same city.
 */
function displayStringFor(loc) {
  const parts = [loc.name];
  if (loc.admin1 && loc.admin1.trim()) parts.push(loc.admin1.trim());
  parts.push(loc.country_name);
  return parts.join(', ');
}

/**
 * The snapshot stores imageUrl as paths relative to the API origin; the API
 * absolutises them in convert_image_urls() before serving. We have to do the
 * same, or both the <img> and the og:image resolve against the web origin and 404.
 */
function absolutiseImages(loc, apiBase) {
  if (!loc.imageUrl || !apiBase) return loc.imageUrl;
  const base = apiBase.replace(/\/+$/, '');
  const abs = (u) => (typeof u === 'string' && u.startsWith('/') ? `${base}${u}` : u);
  if (typeof loc.imageUrl === 'string') return abs(loc.imageUrl);
  return { ...loc.imageUrl, webp: abs(loc.imageUrl.webp), jpeg: abs(loc.imageUrl.jpeg) };
}

const bySlug = new Map(locationsData.map((loc) => [loc.slug, loc]));

/** All curated locations, in snapshot order. */
function getAllLocations() {
  return locationsData;
}

/** One location by exact slug, or undefined. */
function getLocationBySlug(slug) {
  return bySlug.get(slug);
}

module.exports = {
  LOCATION_SLUG_RE,
  absolutiseImages,
  displayStringFor,
  getAllLocations,
  getLocationBySlug,
};
