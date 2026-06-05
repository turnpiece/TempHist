import { apiFetch, getApiUrl } from '../api/temperature';

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

function buildLocationItem(loc: PopularLocation): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.className = 'location-item';
  btn.type = 'button';
  btn.setAttribute('aria-label', `${loc.name}, ${loc.country_name}`);

  const flag = document.createElement('span');
  flag.className = 'location-item__flag';
  flag.setAttribute('aria-hidden', 'true');
  flag.textContent = countryCodeToFlag(loc.country_code);

  const nameEl = document.createElement('span');
  nameEl.className = 'location-item__name';
  nameEl.textContent = loc.name;

  const countryEl = document.createElement('span');
  countryEl.className = 'location-item__country';
  countryEl.textContent = loc.country_name;

  btn.appendChild(flag);
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

let _loaded = false;

async function initLocationsPage(): Promise<void> {
  if (_loaded) return;

  const view = document.getElementById('locationsView');
  if (!view) return;

  const grid = view.querySelector<HTMLElement>('.locations-grid');
  if (!grid) return;

  while (grid.firstChild) grid.removeChild(grid.firstChild);
  const loadingEl = document.createElement('p');
  loadingEl.className = 'locations-status';
  loadingEl.textContent = 'Loading locations…';
  grid.appendChild(loadingEl);

  try {
    const res = await apiFetch(getApiUrl('/v1/locations/popular'));
    if (!res.ok) throw new Error(`API ${res.status}`);
    const data = await res.json();

    let locations: PopularLocation[] = [];
    if (Array.isArray(data)) locations = data;
    else if (Array.isArray(data?.data)) locations = data.data;
    else if (Array.isArray(data?.locations)) locations = data.locations;

    while (grid.firstChild) grid.removeChild(grid.firstChild);

    if (!locations.length) {
      const empty = document.createElement('p');
      empty.className = 'locations-status';
      empty.textContent = 'No locations available.';
      grid.appendChild(empty);
      return;
    }

    locations.forEach(loc => grid.appendChild(buildLocationItem(loc)));
    _loaded = true;
  } catch {
    while (grid.firstChild) grid.removeChild(grid.firstChild);
    const err = document.createElement('p');
    err.className = 'locations-status locations-status--error';
    err.textContent = 'Failed to load locations. Please try again.';
    grid.appendChild(err);
  }
}

export function showLocationsView(): void {
  const splashScreen = document.getElementById('splashScreen');
  const locationsView = document.getElementById('locationsView');
  if (!splashScreen || !locationsView) return;

  if (splashScreen.style.display === 'none') {
    splashScreen.style.display = 'block';
  }

  document.querySelectorAll<HTMLElement>('.hero-section, .explainer, .snapshots, .splash-footer')
    .forEach(el => { el.hidden = true; });
  locationsView.hidden = false;

  splashScreen.scrollTop = 0;

  if (window.location.hash !== '#/locations') {
    window.location.hash = '#/locations';
  }

  initLocationsPage();
}

export function hideLocationsView(): void {
  const locationsView = document.getElementById('locationsView');
  if (locationsView) locationsView.hidden = true;

  document.querySelectorAll<HTMLElement>('.hero-section, .explainer, .snapshots, .splash-footer')
    .forEach(el => { el.hidden = false; });

  const splashScreen = document.getElementById('splashScreen');
  if (splashScreen) splashScreen.scrollTop = 0;

  history.replaceState(null, '', window.location.pathname);
}

// Expose globally for router and inline handlers
(window as any).__showLocationsView = showLocationsView;
(window as any).__hideLocationsView = hideLocationsView;
