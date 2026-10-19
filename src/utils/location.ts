import type { CookieData } from '../types/index';
import { CACHE_CONFIG } from '../constants/index';

/**
 * Cookie management functions with proper TypeScript types
 */
export function setLocationCookie(city: string, source: string | null = null, timezone: string | null = null): void {
  const expiry = new Date();
  expiry.setHours(expiry.getHours() + CACHE_CONFIG.LOCATION_COOKIE_HOURS); // Expire after configured hours

  // Safety check: if city is an object, don't store it
  if (typeof city === 'object' && city !== null) {
    console.error('setLocationCookie received an object instead of string:', city);
    return;
  }

  // Ensure we're storing a string, not an object
  const cityString = String(city);
  const sourceString = source ? String(source) : null;

  try {
    const encodedLocation = encodeURIComponent(cityString);
    const locationCookie = `tempLocation=${encodedLocation};expires=${expiry.toUTCString()};path=/`;
    document.cookie = locationCookie;

    if (sourceString) {
      const encodedSource = encodeURIComponent(sourceString);
      document.cookie = `tempLocationSource=${encodedSource};expires=${expiry.toUTCString()};path=/`;
    }

    if (timezone) {
      const encodedTz = encodeURIComponent(timezone);
      document.cookie = `tempLocationTimezone=${encodedTz};expires=${expiry.toUTCString()};path=/`;
    } else {
      document.cookie = 'tempLocationTimezone=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/';
    }
  } catch (error) {
    console.error('setLocationCookie: Error setting cookies:', error);
  }
}

export function getLocationCookie(): CookieData {
  const cookies = document.cookie.split(';');
  let location: string | null = null;
  let source: string | null = null;
  let timezone: string | null = null;

  for (const cookie of cookies) {
    const [name, value] = cookie.trim().split('=');
    if (name === 'tempLocation' && value) {
      try {
        location = decodeURIComponent(value);
      } catch (error) {
        console.warn('getLocationCookie: Failed to decode tempLocation cookie value:', error);
        location = null;
      }
    } else if (name === 'tempLocationSource' && value) {
      try {
        source = decodeURIComponent(value);
      } catch (error) {
        console.warn('getLocationCookie: Failed to decode tempLocationSource cookie value:', error);
        source = null;
      }
    } else if (name === 'tempLocationTimezone' && value) {
      try {
        timezone = decodeURIComponent(value);
      } catch (error) {
        console.warn('getLocationCookie: Failed to decode tempLocationTimezone cookie value:', error);
        timezone = null;
      }
    }
  }

  return { location, source, timezone };
}

/**
 * Extract city name from full location string
 */
export function getDisplayCity(fullLocation: string, maxLength?: number): string {
  if (!fullLocation) return fullLocation;

  // Decode URL-encoded location first
  const decodedLocation = decodeURIComponent(fullLocation);

  // Split by commas and get the first part (city)
  const parts = decodedLocation.split(',').map(part => part.trim());
  const city = parts[0];
  if (maxLength && city.length > maxLength) {
    return city.slice(0, maxLength - 1) + '…';
  }
  return city;
}

/**
 * Format ordinal numbers (1st, 2nd, 3rd, etc.)
 */
export function getOrdinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

/**
 * Convert ISO 3166-1 alpha-2 country code to emoji flag.
 * On older Windows the flag renders as two-letter country code letters — still legible.
 */
export function countryCodeToFlag(code: string): string {
  return [...code.toUpperCase()].map(c =>
    String.fromCodePoint(0x1F1E6 + c.codePointAt(0)! - 65)
  ).join('');
}

/**
 * Look up the country code for the current location string against the prefetched
 * approved locations list. Returns null if no match (e.g. GPS-detected location
 * not in the approved list).
 */
export function getCountryCodeForLocation(locationSlug: string): string | null {
  const locations = globalThis.TempHist?.prefetchedLocations;
  if (locations) {
    const decoded = decodeURIComponent(locationSlug);
    const city = decoded.split(',')[0].trim().toLowerCase();
    const match = locations.find(l =>
      l.slug === locationSlug ||
      l.name.toLowerCase() === city
    );
    if (match) return match.country_code;
  }
  // Fall back to the country code stored from geolocation/IP detection
  return globalThis.tempLocationCountryCode ?? null;
}

/**
 * Two locations closer than this are treated as the same place for UI purposes
 * (e.g. detected "Greater London" vs preapproved "London"). Mirrors the API's
 * METRO_CACHE_SNAP_KM — the distance within which both share one temperature
 * record — rather than its 2 km SAME_LOCATION_RADIUS_KM, which is too small for
 * a GPS fix in outer Greater London to match the city's centre point.
 */
export const SAME_PLACE_RADIUS_KM = 30;

const EARTH_RADIUS_KM = 6371;
const DETECTED_COORDS_KEY = 'temphist_detected_coords';

export interface Coords {
  latitude: number | null | undefined;
  longitude: number | null | undefined;
}

/** Great-circle distance in kilometres. */
export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(a));
}

function hasCoords(c: Coords | null): c is { latitude: number; longitude: number } {
  return !!c && Number.isFinite(c.latitude) && Number.isFinite(c.longitude);
}

/** True when both points have coordinates and lie within `radiusKm` of each other. */
export function isSamePlace(a: Coords | null, b: Coords | null, radiusKm: number = SAME_PLACE_RADIUS_KM): boolean {
  if (!hasCoords(a) || !hasCoords(b)) return false;
  return haversineKm(a.latitude, a.longitude, b.latitude, b.longitude) <= radiusKm;
}

/**
 * Remember where the user was actually detected, so a later manual pick can be
 * compared against it. Mirrored to sessionStorage so it survives the full-page
 * navigation from the standalone /locations page back into the SPA.
 */
export function rememberDetectedCoords(latitude: number, longitude: number): void {
  globalThis.tempDetectedLatitude = latitude;
  globalThis.tempDetectedLongitude = longitude;
  try {
    sessionStorage.setItem(DETECTED_COORDS_KEY, JSON.stringify({ latitude, longitude }));
  } catch {
    // sessionStorage unavailable (private mode, quota) — in-memory copy still works
  }
}

export function getDetectedCoords(): { latitude: number; longitude: number } | null {
  const memory = { latitude: globalThis.tempDetectedLatitude, longitude: globalThis.tempDetectedLongitude };
  if (hasCoords(memory)) return memory;
  try {
    const stored = JSON.parse(sessionStorage.getItem(DETECTED_COORDS_KEY) ?? 'null');
    if (hasCoords(stored)) {
      globalThis.tempDetectedLatitude = stored.latitude;
      globalThis.tempDetectedLongitude = stored.longitude;
      return { latitude: stored.latitude, longitude: stored.longitude };
    }
  } catch {
    // ignore malformed or unavailable storage
  }
  return null;
}

/**
 * Whether the current location is "the user's own": either it was detected, or
 * it was picked from the list and sits within SAME_PLACE_RADIUS_KM of the
 * detected position. Locations without coordinates behave as before.
 */
export function isOwnLocation(loc: { isDetected: boolean; source: string | null } & Coords): boolean {
  if (loc.isDetected) return true;
  if (loc.source !== 'manual') return false;
  return isSamePlace(loc, getDetectedCoords());
}
