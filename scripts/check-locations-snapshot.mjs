#!/usr/bin/env node
/**
 * Fail the build if web/data/preapproved-locations.json has drifted from the
 * API's api/data/preapproved_locations.json.
 *
 * The web app renders /locations/:slug pages from a committed snapshot rather
 * than fetching the (auth-gated) /v1/locations/preapproved endpoint. That trade
 * is only safe if drift is loud, which is what this check is for.
 *
 * Skips silently when the API repo isn't checked out alongside (e.g. CI that
 * only clones the web repo) — it can't compare what isn't there.
 */
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const webSnapshot = join(here, '..', 'data', 'preapproved-locations.json');
const apiSource = join(here, '..', '..', 'api', 'data', 'preapproved_locations.json');

if (!existsSync(apiSource)) {
  console.log(`[locations-snapshot] API source not found at ${apiSource} — skipping drift check.`);
  process.exit(0);
}

const web = JSON.parse(readFileSync(webSnapshot, 'utf-8'));
const api = JSON.parse(readFileSync(apiSource, 'utf-8'));

const webById = new Map(web.map((l) => [l.id, l]));
const apiById = new Map(api.map((l) => [l.id, l]));

const problems = [];
for (const id of apiById.keys()) if (!webById.has(id)) problems.push(`missing from web snapshot: ${id}`);
for (const id of webById.keys()) if (!apiById.has(id)) problems.push(`extra in web snapshot: ${id}`);
for (const [id, apiLoc] of apiById) {
  const webLoc = webById.get(id);
  if (webLoc && JSON.stringify(apiLoc) !== JSON.stringify(webLoc)) problems.push(`content differs: ${id}`);
}

if (problems.length) {
  console.error('[locations-snapshot] web/data/preapproved-locations.json has drifted from the API:');
  for (const p of problems) console.error(`  - ${p}`);
  console.error('\nRe-copy it:  cp ../api/data/preapproved_locations.json data/preapproved-locations.json');
  process.exit(1);
}

console.log(`[locations-snapshot] OK — ${web.length} locations match the API source.`);
