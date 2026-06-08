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
      picture.appendChild(img);
      imageWrapper.appendChild(picture);
    } else if (typeof loc.imageUrl === 'string') {
      const img = document.createElement('img');
      img.className = 'location-item__image';
      img.src = loc.imageUrl;
      img.alt = loc.imageAlt || loc.name;
      img.loading = 'lazy';
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

    const fn = (window as any).handleManualLocationSelection;
    if (typeof fn === 'function') {
      await fn(
        valueParts.join(', '),
        loc.timezone ?? null,
        loc.latitude ?? null,
        loc.longitude ?? null
      );
    }
  });

  return btn;
}

function buildTextItem(loc: PopularLocation): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.className = 'location-item';
  btn.type = 'button';
  btn.setAttribute('aria-label', `${loc.name}, ${loc.country_name}`);

  btn.appendChild(flagImg(loc.country_code, 20));

  const nameEl = document.createElement('span');
  nameEl.className = 'location-item__name';
  nameEl.textContent = loc.name;

  const countryEl = document.createElement('span');
  countryEl.className = 'location-item__country';
  countryEl.textContent = loc.country_name;

  btn.appendChild(nameEl);
  btn.appendChild(countryEl);

  btn.addEventListener('click', async () => {
    const valueParts = [loc.name];
    if (loc.admin1 && loc.admin1.trim()) valueParts.push(loc.admin1.trim());
    valueParts.push(loc.country_name);

    apiFetch(getApiUrl('/v1/locations/selections'), {
      method: 'POST',
      body: JSON.stringify({ location_id: loc.id }),
    }).catch(() => {});

    const fn = (window as any).handleManualLocationSelection;
    if (typeof fn === 'function') {
      await fn(
        valueParts.join(', '),
        loc.timezone ?? null,
        loc.latitude ?? null,
        loc.longitude ?? null
      );
    }
  });

  return btn;
}

async function waitForAuth(maxMs = 5000): Promise<void> {
  const deadline = Date.now() + maxMs;
  while (!(window as any).currentUser && Date.now() < deadline) {
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
    const [preapprovedRes, popularRes] = await Promise.allSettled([
      apiFetch(getApiUrl('/v1/locations/preapproved')).then(r => r.ok ? r.json() : null),
      apiFetch(getApiUrl('/v1/locations/popular')).then(r => r.ok ? r.json() : null),
    ]);

    while (content.firstChild) content.removeChild(content.firstChild);

    const featured: PreapprovedLocation[] = parseLocArr(preapprovedRes);
    const popular: PopularLocation[] = parseLocArr(popularRes);
    const featuredIds = new Set(featured.map(l => l.id));
    const extras = popular.filter(l => !featuredIds.has(l.id));

    if (!featured.length && !extras.length) {
      const empty = document.createElement('p');
      empty.className = 'locations-status';
      empty.textContent = 'No locations available.';
      content.appendChild(empty);
      return;
    }

    if (featured.length) {
      const label = document.createElement('p');
      label.className = 'locations-section-label';
      label.textContent = 'Featured';
      content.appendChild(label);
      const grid = document.createElement('div');
      grid.className = 'locations-grid locations-grid--featured';
      featured.forEach(loc => grid.appendChild(buildFeaturedItem(loc)));
      content.appendChild(grid);
    }

    if (extras.length) {
      const label = document.createElement('p');
      label.className = 'locations-section-label';
      label.textContent = 'More locations';
      content.appendChild(label);
      const grid = document.createElement('div');
      grid.className = 'locations-grid';
      extras.forEach(loc => grid.appendChild(buildTextItem(loc)));
      content.appendChild(grid);
    }
  } catch {
    while (content.firstChild) content.removeChild(content.firstChild);
    const err = document.createElement('p');
    err.className = 'locations-status locations-status--error';
    err.textContent = 'Failed to load locations. Please try again.';
    content.appendChild(err);
  }
}

