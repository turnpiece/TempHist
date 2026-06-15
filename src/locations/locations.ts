import { apiFetch, getApiUrl } from '../api/temperature';
import { resetTrendBackground } from '../utils/uiHelpers';
import type { PreapprovedLocation } from '../types/index';

interface PopularLocation {
  id: string;
  slug: string;
  name: string;
  country_name: string;
  country_code: string;
  latitude?: number;
  longitude?: number;
  timezone?: string;
  admin1?: string | null;
}

// Kept for backward compatibility with utils that still use emoji flags
export function countryCodeToFlag(code: string): string {
  if (!code || code.length !== 2) return '';
  try {
    return [...code.toUpperCase()].map(c =>
      String.fromCodePoint(0x1F1E6 + c.charCodeAt(0) - 65)
    ).join('');
  } catch {
    return '';
  }
}

export function flagImg(code: string, width: 20 | 40 = 20): HTMLImageElement {
  const cc = code.toLowerCase();
  const img = document.createElement('img');
  img.className = 'flag-img';
  img.src = `https://flagcdn.com/w${width}/${cc}.png`;
  img.srcset = `https://flagcdn.com/w${width * 2}/${cc}.png 2x`;
  img.width = width;
  img.height = Math.round(width * 0.75);
  img.alt = '';
  img.setAttribute('aria-hidden', 'true');
  return img;
}

function buildFeaturedItem(loc: PreapprovedLocation): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.className = 'location-item location-item--featured';
  btn.type = 'button';
  btn.setAttribute('aria-label', `${loc.name}, ${loc.country_name}`);

  const imageWrapper = document.createElement('div');
  imageWrapper.className = 'location-item__image-wrapper';

  if (loc.imageUrl) {
    if (typeof loc.imageUrl === 'object' && loc.imageUrl.webp && loc.imageUrl.jpeg) {
      const picture = document.createElement('picture');
      const source = document.createElement('source');
      source.srcset = loc.imageUrl.webp;
      source.type = 'image/webp';
      picture.appendChild(source);
      const img = document.createElement('img');
      img.className = 'location-item__image';
      img.src = loc.imageUrl.jpeg;
      img.alt = loc.imageAlt || loc.name;
      img.loading = 'lazy';
      // Intrinsic served size — CSS (object-fit: cover in a 4/3 wrapper) controls display
      img.width = 320;
      img.height = 200;
      picture.appendChild(img);
      imageWrapper.appendChild(picture);
    } else if (typeof loc.imageUrl === 'string') {
      const img = document.createElement('img');
      img.className = 'location-item__image';
      img.src = loc.imageUrl;
      img.alt = loc.imageAlt || loc.name;
      img.loading = 'lazy';
      img.width = 320;
      img.height = 200;
      imageWrapper.appendChild(img);
    }
  } else {
    const placeholder = document.createElement('div');
    placeholder.className = 'location-item__image-placeholder';
    imageWrapper.appendChild(placeholder);
  }

  btn.appendChild(imageWrapper);

  const overlay = document.createElement('div');
  overlay.className = 'location-item__overlay';
  overlay.appendChild(flagImg(loc.country_code, 20));
  const nameEl = document.createElement('span');
  nameEl.className = 'location-item__name';
  nameEl.textContent = loc.name;
  overlay.appendChild(nameEl);
  btn.appendChild(overlay);

  btn.addEventListener('click', async () => {
    const valueParts = [loc.name];
    if (loc.admin1 && loc.admin1.trim()) valueParts.push(loc.admin1.trim());
    valueParts.push(loc.country_name);

    apiFetch(getApiUrl('/v1/locations/selections'), {
      method: 'POST',
      body: JSON.stringify({ location_id: loc.id }),
    }).catch(() => {});

    const fn = globalThis.handleManualLocationSelection;
    if (typeof fn === 'function') {
      await fn(
        valueParts.join(', '),
        loc.timezone ?? null,
        loc.latitude ?? null,
        loc.longitude ?? null,
        loc.country_code ?? null
      );
    }
  });

  return btn;
}

async function waitForAuth(maxMs = 5000): Promise<void> {
  const deadline = Date.now() + maxMs;
  while (!globalThis.currentUser && Date.now() < deadline) {
    await new Promise(r => setTimeout(r, 100));
  }
}

function parseLocArr(result: PromiseSettledResult<any>): any[] {
  if (result.status !== 'fulfilled' || !result.value) return [];
  const d = result.value;
  const arr = Array.isArray(d) ? d
    : Array.isArray(d?.data) ? d.data
    : Array.isArray(d?.locations) ? d.locations
    : [];
  return arr.filter((x: any) => x?.id && x?.name && x?.country_code);
}

// ── Region grouping ──────────────────────────────────────────────────────────
// Visitors think geographically before they think alphabetically, so the page
// is grouped by region. Each location's country code lands in exactly one
// bucket; the ordered REGION_BUCKETS array also controls render order so the
// page reads top-to-bottom in a stable, familiar sequence.

type RegionLabel =
  | 'Europe'
  | 'North America'
  | 'Latin America'
  | 'Asia Pacific'
  | 'Middle East'
  | 'Africa'
  | 'Other';

const REGION_BUCKETS: ReadonlyArray<RegionLabel> = [
  'Europe',
  'North America',
  'Latin America',
  'Asia Pacific',
  'Middle East',
  'Africa',
  'Other',
];

function regionFor(countryCode: string | undefined | null): RegionLabel {
  const cc = (countryCode || '').toUpperCase();
  if (['GB','FR','DE','IT','ES','NL','BE','CH','AT','SE','NO','DK','FI','PT','IE','PL','CZ','GR','HU','RO','UA','RU'].includes(cc)) return 'Europe';
  if (['US','CA'].includes(cc)) return 'North America';
  if (['MX','BR','AR','CL','CO','PE','UY','VE'].includes(cc)) return 'Latin America';
  if (['JP','CN','IN','SG','HK','KR','TH','VN','ID','MY','PH','AU','NZ','TW'].includes(cc)) return 'Asia Pacific';
  if (['AE','SA','IL','TR','EG','QA','KW','JO','LB'].includes(cc)) return 'Middle East';
  if (['ZA','NG','KE','GH','MA','ET','TN','DZ'].includes(cc)) return 'Africa';
  return 'Other';
}

function groupPreapprovedByRegion(
  featured: PreapprovedLocation[],
): Map<RegionLabel, PreapprovedLocation[]> {
  const grouped = new Map<RegionLabel, PreapprovedLocation[]>();
  featured.forEach(loc => {
    const r = regionFor(loc.country_code);
    const bucket = grouped.get(r) ?? [];
    bucket.push(loc);
    grouped.set(r, bucket);
  });
  return grouped;
}

const POPULAR_LIMIT = 20;

/**
 * Compact one-line list item used in the "Popular" section: flag + city name
 * only, no surrounding card, no country label. Reuses the click behaviour of
 * the text card so selection routes through the same handler.
 */
function buildPopularRow(loc: PopularLocation): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.className = 'locations-popular-row';
  btn.type = 'button';
  btn.setAttribute('aria-label', `${loc.name}, ${loc.country_name}`);

  btn.appendChild(flagImg(loc.country_code, 20));

  const nameEl = document.createElement('span');
  nameEl.className = 'locations-popular-row__name';
  nameEl.textContent = loc.name;
  btn.appendChild(nameEl);

  btn.addEventListener('click', async () => {
    const valueParts = [loc.name];
    if (loc.admin1 && loc.admin1.trim()) valueParts.push(loc.admin1.trim());
    valueParts.push(loc.country_name);

    apiFetch(getApiUrl('/v1/locations/selections'), {
      method: 'POST',
      body: JSON.stringify({ location_id: loc.id }),
    }).catch(() => {});

    const fn = globalThis.handleManualLocationSelection;
    if (typeof fn === 'function') {
      await fn(
        valueParts.join(', '),
        loc.timezone ?? null,
        loc.latitude ?? null,
        loc.longitude ?? null,
        loc.country_code ?? null
      );
    }
  });

  return btn;
}

/**
 * Apply the search term to every location card and hide region sections that
 * end up with nothing visible. Matching is case-insensitive and runs against
 * the city + country name strings cached on the card via data-* attributes,
 * so the filter is O(n) over the DOM and never touches the API.
 */
function applyLocationsFilter(root: HTMLElement, query: string): void {
  const needle = query.trim().toLowerCase();
  const sections = root.querySelectorAll<HTMLElement>('.locations-region');
  sections.forEach(section => {
    let visibleInSection = 0;
    section.querySelectorAll<HTMLElement>('[data-search]').forEach(card => {
      const haystack = card.dataset.search || '';
      const matches = !needle || haystack.includes(needle);
      card.hidden = !matches;
      if (matches) visibleInSection++;
    });
    section.hidden = visibleInSection === 0;
  });

  // If every section is hidden, surface a "no results" message so the page
  // doesn't look broken.
  const empty = root.querySelector<HTMLElement>('.locations-empty-state');
  if (empty) empty.hidden = Array.from(sections).some(s => !s.hidden);
}

function annotateCardForSearch(
  card: HTMLElement,
  loc: { name: string; country_name: string; admin1?: string | null },
): void {
  const haystack = [loc.name, loc.country_name, loc.admin1 || '']
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  card.dataset.search = haystack;
}

/**
 * Render the Locations page content into the standalone /locations page's
 * #locationsView section.
 */
export async function renderLocationsPage(): Promise<void> {
  resetTrendBackground();

  const view = document.getElementById('locationsView');
  if (!view) return;

  view.textContent = '';

  const container = document.createElement('div');
  container.className = 'container';

  const heading = document.createElement('h2');
  heading.textContent = 'Locations';
  container.appendChild(heading);

  const content = document.createElement('div');
  content.className = 'locations-content';
  container.appendChild(content);

  view.appendChild(container);

  const loadingEl = document.createElement('p');
  loadingEl.className = 'locations-status';
  loadingEl.textContent = 'Loading locations…';
  content.appendChild(loadingEl);

  await waitForAuth();

  try {
    // Request a generous upper bound on popular; the API may ignore the
    // `limit` query param today, in which case we still clamp client-side below.
    const [preapprovedRes, popularRes] = await Promise.allSettled([
      apiFetch(getApiUrl('/v1/locations/preapproved')).then(r => r.ok ? r.json() : null),
      apiFetch(getApiUrl(`/v1/locations/popular?limit=${POPULAR_LIMIT}`)).then(r => r.ok ? r.json() : null),
    ]);

    while (content.firstChild) content.removeChild(content.firstChild);

    const featured: PreapprovedLocation[] = parseLocArr(preapprovedRes);
    const popular: PopularLocation[] = parseLocArr(popularRes);
    const featuredIds = new Set(featured.map(l => l.id));
    // Popular only shows entries that aren't already in the curated set, and
    // is capped at POPULAR_LIMIT.
    const popularItems = popular.filter(l => !featuredIds.has(l.id)).slice(0, POPULAR_LIMIT);

    if (!featured.length && !popularItems.length) {
      const empty = document.createElement('p');
      empty.className = 'locations-status';
      empty.textContent = 'No locations available.';
      content.appendChild(empty);
      return;
    }

    // Client-side filter input. Stays at the top of the content; the filter
    // never calls the API — it only toggles `hidden` on already-rendered cards.
    const filterRow = document.createElement('div');
    filterRow.className = 'locations-filter';
    const filterInput = document.createElement('input');
    filterInput.type = 'search';
    filterInput.className = 'locations-filter__input';
    filterInput.placeholder = 'Filter locations…';
    filterInput.setAttribute('aria-label', 'Filter locations by name');
    filterInput.autocomplete = 'off';
    filterRow.appendChild(filterInput);
    content.appendChild(filterRow);

    // Regional sections cover only the curated/preapproved set — those are the
    // ones with images and the careful geographic grouping. Popular entries
    // (which may be anywhere in the world and won't have images) get a single
    // dedicated section below.
    const grouped = groupPreapprovedByRegion(featured);

    for (const label of REGION_BUCKETS) {
      const group = grouped.get(label);
      if (!group || !group.length) continue;

      const section = document.createElement('section');
      section.className = 'locations-region';
      const labelId = `region-${label.replace(/\s+/g, '-').toLowerCase()}`;
      section.setAttribute('aria-labelledby', labelId);

      const header = document.createElement('h3');
      header.className = 'locations-region__header';
      header.id = labelId;
      header.textContent = label;
      section.appendChild(header);

      const grid = document.createElement('div');
      grid.className = 'locations-grid locations-grid--featured';
      group.forEach(loc => {
        const card = buildFeaturedItem(loc);
        annotateCardForSearch(card, loc);
        grid.appendChild(card);
      });
      section.appendChild(grid);

      content.appendChild(section);
    }

    if (popularItems.length) {
      const section = document.createElement('section');
      section.className = 'locations-region locations-region--popular';
      section.setAttribute('aria-labelledby', 'region-popular');

      const header = document.createElement('h3');
      header.className = 'locations-region__header';
      header.id = 'region-popular';
      header.textContent = 'Popular';
      section.appendChild(header);

      const list = document.createElement('div');
      list.className = 'locations-popular-list';
      popularItems.forEach(loc => {
        const row = buildPopularRow(loc);
        annotateCardForSearch(row, loc);
        list.appendChild(row);
      });
      section.appendChild(list);

      content.appendChild(section);
    }

    const emptyState = document.createElement('p');
    emptyState.className = 'locations-status locations-empty-state';
    emptyState.textContent = 'No locations match that filter.';
    emptyState.hidden = true;
    content.appendChild(emptyState);

    filterInput.addEventListener('input', () => {
      applyLocationsFilter(content, filterInput.value);
    });
  } catch {
    while (content.firstChild) content.removeChild(content.firstChild);
    const err = document.createElement('p');
    err.className = 'locations-status locations-status--error';
    err.textContent = 'Failed to load locations. Please try again.';
    content.appendChild(err);
  }
}

