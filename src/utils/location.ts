import type { CookieData, TempHistLocation } from '../types/index';

/**
 * Cookie management functions with proper TypeScript types
 */
export function setLocationCookie(city: string, source: string | null = null): void {
  const expiry = new Date();
  expiry.setHours(expiry.getHours() + 1); // Expire after 1 hour
  
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
    
    // Also store the location source if provided
    if (sourceString) {
      const encodedSource = encodeURIComponent(sourceString);
      const sourceCookie = `tempLocationSource=${encodedSource};expires=${expiry.toUTCString()};path=/`;
      document.cookie = sourceCookie;
    }
  } catch (error) {
    console.error('setLocationCookie: Error setting cookies:', error);
  }
}

export function getLocationCookie(): CookieData {
  const cookies = document.cookie.split(';');
  let location: string | null = null;
  let source: string | null = null;
  
  for (const cookie of cookies) {
    const [name, value] = cookie.trim().split('=');
    if (name === 'tempLocation' && value) {
      location = decodeURIComponent(value);
    } else if (name === 'tempLocationSource' && value) {
      source = decodeURIComponent(value);
    }
  }
  
  return { location, source };
}

/**
 * Extract city name from full location string
 */
export function getDisplayCity(fullLocation: string): string {
  if (!fullLocation) return fullLocation;
  
  // Decode URL-encoded location first
  const decodedLocation = decodeURIComponent(fullLocation);
  
  // Split by commas and get the first part (city)
  const parts = decodedLocation.split(',').map(part => part.trim());
  return parts[0];
}

/**
 * Format ordinal numbers (1st, 2nd, 3rd, etc.)
 */
export function getOrdinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}
