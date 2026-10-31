/**
 * robots.txt generation.
 *
 * Share pages (/s/:id) are per-user snapshots with no search value, and crawlers
 * that run the page JS fail anonymous sign-in and flood App Check with invalid
 * requests. So when indexing is on we name the search/AI crawlers and keep them
 * off /s/.
 *
 * Do NOT turn this into `User-agent: *` / `Disallow: /s/`: link-preview fetchers
 * (facebookexternalhit, Twitterbot, Slack, LinkedIn) honour robots.txt too, and
 * blocking them would break the social previews the OG-tag middleware exists for.
 *
 * Each named group repeats `Allow: /` because a crawler follows only its most
 * specific group and ignores `*`.
 */

/** User-agent tokens kept off /s/. Googlebot-* variants fall back to Googlebot. */
const SHARE_PAGE_BLOCKED_CRAWLERS = [
  'Reflectionbot',
  'AhrefsBot',
  'Googlebot',
  'Applebot',
  'DuckDuckBot',
  'Bingbot',
];

function buildRobotsTxt(origin, allowIndexing) {
  if (!allowIndexing) return 'User-agent: *\nDisallow: /\n';

  const base = origin.replace(/\/+$/, '');
  const blocked = SHARE_PAGE_BLOCKED_CRAWLERS.map((ua) => `User-agent: ${ua}`).join('\n');
  return `${blocked}\nAllow: /\nDisallow: /s/\n\nUser-agent: *\nAllow: /\nSitemap: ${base}/sitemap.xml\n`;
}

module.exports = { buildRobotsTxt, SHARE_PAGE_BLOCKED_CRAWLERS };
