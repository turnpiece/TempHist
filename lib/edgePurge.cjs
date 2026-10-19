// Purge Cloudflare's cached HTML for server-rendered pages when a new build boots.
//
// /locations/:slug and /s/:id responses are edge-cacheable (see server.js) and
// reference the build's fingerprinted JS bundle. A deploy replaces that bundle,
// so any HTML the edge kept from before the deploy points at a file that no
// longer exists. Nothing else invalidates it, so the server does it itself once
// it is up: by then the new build is serving, and anything the edge re-fetches
// is current. (Purging from CI instead would race the deploy and could re-cache
// the old build's HTML.)
//
// Opt-in: does nothing unless all three variables are set on the deployment.
//   CLOUDFLARE_ZONE_ID      zone containing the hostnames below
//   CLOUDFLARE_API_TOKEN    token with only the "Cache Purge" permission on that zone
//   CLOUDFLARE_PURGE_HOSTS  comma-separated public hostnames fronted by that zone,
//                           e.g. "staging.temphist.com"
// No setup is needed on environments that aren't behind Cloudflare (dev).

const PURGED_PATH_PREFIXES = ['/locations/', '/s/'];

function parseHosts(value) {
  return String(value || '')
    .split(',')
    .map((h) => h.trim().toLowerCase())
    .filter((h) => /^[a-z0-9.-]+$/.test(h));
}

async function purgeServerRenderedPages(env = process.env, fetchImpl = fetch) {
  const zoneId = env.CLOUDFLARE_ZONE_ID;
  const token = env.CLOUDFLARE_API_TOKEN;
  const hosts = parseHosts(env.CLOUDFLARE_PURGE_HOSTS);
  if (!zoneId || !token || hosts.length === 0) return { skipped: true };

  const prefixes = hosts.flatMap((host) => PURGED_PATH_PREFIXES.map((p) => `${host}${p}`));
  const res = await fetchImpl(
    `https://api.cloudflare.com/client/v4/zones/${encodeURIComponent(zoneId)}/purge_cache`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ prefixes }),
      signal: AbortSignal.timeout(10_000),
    },
  );
  if (!res.ok) throw new Error(`Cloudflare purge failed: HTTP ${res.status}`);
  return { skipped: false, prefixes };
}

module.exports = { purgeServerRenderedPages, parseHosts, PURGED_PATH_PREFIXES };
