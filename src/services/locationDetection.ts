import type { NominatimResponse, IPLocationResponse, GeolocationPosition, GeolocationError } from '../types/index';
import { detectDeviceAndPlatform } from '../utils/platform';
import { DEFAULT_LOCATION, NOMINATIM_CONFIG, GEOLOCATION_CONFIG } from '../constants/index';

/**
 * Get city name from coordinates using OpenStreetMap Nominatim API
 * @internal Only used internally by detectUserLocationWithGeolocation
 */
async function getCityFromCoords(lat: number, lon: number): Promise<string> {
  try {
    // Add timeout to the OpenStreetMap API call - longer timeout for mobile
    const platform = detectDeviceAndPlatform();
    const timeoutMs = platform.isMobile ? NOMINATIM_CONFIG.TIMEOUT_MOBILE : NOMINATIM_CONFIG.TIMEOUT_DESKTOP;
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    
    const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}&zoom=10&addressdetails=1`, {
      signal: controller.signal,
      headers: {
        'Accept': 'application/json',
        'User-Agent': NOMINATIM_CONFIG.USER_AGENT
      }
    });
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      throw new Error(`OpenStreetMap API error: ${response.status}`);
    }
    
    const data: NominatimResponse = await response.json();
    
    // Get city name with multiple fallbacks
    const city = data.address.city || 
                data.address.town || 
                data.address.village || 
                data.address.hamlet ||
                data.address.suburb ||
                data.address.neighbourhood;
    
    // Get state/province information with multiple fallbacks
    const state = data.address.state || 
                 data.address.province || 
                 data.address.county || 
                 data.address.region;
    
    // Get country name (prefer full name over code for better API compatibility)
    const country = data.address.country || data.address.country_code;
    
    if (city && country) {
      // Build location string with state/province and country
      if (state) {
        return `${city}, ${state}, ${country}`;
      } else {
        return `${city}, ${country}`;
      }
    }
    
    // If we have city but no country, try to get country from display_name
    if (city && !country && data.display_name) {
      const displayParts = data.display_name.split(',').map(part => part.trim());
      const lastPart = displayParts[displayParts.length - 1];
      if (lastPart && lastPart !== city) {
        return `${city}, ${lastPart}`;
      }
    }
    
    // Fallback to just city name if no country info
    if (city) {
      return city;
    }
    
    // Last resort: use display_name if available
    if (data.display_name) {
      const displayParts = data.display_name.split(',').map(part => part.trim());
      if (displayParts.length >= 2) {
        return `${displayParts[0]}, ${displayParts[displayParts.length - 1]}`;
      }
      return displayParts[0];
    }
    
    // Ultimate fallback
    return DEFAULT_LOCATION;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('OpenStreetMap API timeout');
    } else {
      console.warn('OpenStreetMap API error:', error);
      throw error;
    }
  }
}

/**
 * Detect user location using browser geolocation API
 */
export function detectUserLocationWithGeolocation(): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocation not supported'));
      return;
    }

    const platform = detectDeviceAndPlatform();
    const timeout = platform.isMobile ? GEOLOCATION_CONFIG.TIMEOUT_MOBILE : GEOLOCATION_CONFIG.TIMEOUT_DESKTOP;

    navigator.geolocation.getCurrentPosition(
      async (position: GeolocationPosition) => {
        try {
          const { latitude, longitude } = position.coords;
          const location = await getCityFromCoords(latitude, longitude);
          resolve(location);
        } catch (error) {
          reject(error);
        }
      },
      (error: GeolocationError) => {
        reject(error);
      },
      {
        enableHighAccuracy: false,
        timeout: timeout,
        maximumAge: GEOLOCATION_CONFIG.MAX_AGE
      }
    );
  });
}

/**
 * Get location from IP address using ipapi.co
 */
export async function getLocationFromIP(): Promise<string | null> {
  try {
    const response = await fetch('https://ipapi.co/json/');
    if (!response.ok) throw new Error('IP lookup failed');
    
    const data: IPLocationResponse = await response.json();
    if (data.city && data.country_name) {
      return `${data.city}, ${data.country_name}`;
    }
    return null;
  } catch (error) {
    console.warn('IP-based location lookup failed:', error);
    return null;
  }
}

