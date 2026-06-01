import { detectUserLocationWithGeolocation } from './locationDetection';
import { fetchTemperatureDataAsync } from '../api/temperature';
import { DataCache } from '../utils/DataCache';
import { FeatureFlags } from '../utils/FeatureFlags';
import { getEffectiveDateForLocation } from '../utils/dateUtils';
import { getLocationCookie } from '../utils/location';

const LS_LAST_GEO_LOCATION = 'temphist_last_geo_location';
const SS_GEO_PREFETCH = 'temphist_geo_prefetch';

export interface GeoPrefetchResult {
  location: string;
  latitude: number;
  longitude: number;
}

let prefetchPromise: Promise<GeoPrefetchResult | null> | null = null;
let locationKnownPromise: Promise<GeoPrefetchResult | null> | null = null;

export function getGeoPrefetchPromise(): Promise<GeoPrefetchResult | null> | null {
  return prefetchPromise;
}

export function getLocationKnownPromise(): Promise<GeoPrefetchResult | null> | null {
  return locationKnownPromise;
}

export function startGeolocationPrefetch(): void {
  const cookieData = getLocationCookie();
  if (cookieData.location) return; // Return visitor — don't trigger permission dialog
  let onLocationKnown!: (result: GeoPrefetchResult | null) => void;
  locationKnownPromise = new Promise(resolve => { onLocationKnown = resolve; });
  prefetchPromise = runPrefetch(onLocationKnown);
}

function waitForCurrentUser(timeoutMs = 5000): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.currentUser) { resolve(); return; }
    const start = Date.now();
    const interval = setInterval(() => {
      if (window.currentUser) {
        clearInterval(interval);
        resolve();
      } else if (Date.now() - start > timeoutMs) {
        clearInterval(interval);
        reject(new Error('Auth timeout waiting for currentUser'));
      }
    }, 100);
  });
}

async function runPrefetch(onLocationKnown: (result: GeoPrefetchResult | null) => void): Promise<GeoPrefetchResult | null> {
  try {
    const { location, latitude, longitude } = await detectUserLocationWithGeolocation();

    // Signal immediately that location is known — callers can update UI before data arrives
    onLocationKnown({ location, latitude, longitude });

    try {
      localStorage.setItem(LS_LAST_GEO_LOCATION, JSON.stringify({ location, latitude, longitude, storedAt: Date.now() }));
    } catch { /* quota exceeded */ }

    await waitForCurrentUser();

    const { day, month } = getEffectiveDateForLocation(null);
    const identifier = `${month}-${day}`;

    const data = await fetchTemperatureDataAsync('daily', location, identifier);

    if (FeatureFlags.isEnabled('data_caching')) {
      const cacheKey = DataCache.generateTemperatureKey('daily', location, identifier);
      DataCache.set(cacheKey, data, 10 * 60 * 1000);
    }

    try {
      sessionStorage.setItem(SS_GEO_PREFETCH, JSON.stringify({ location, latitude, longitude, identifier, fetchedAt: Date.now() }));
    } catch { /* quota exceeded */ }

    return { location, latitude, longitude };
  } catch {
    onLocationKnown(null);
    return null;
  }
}
