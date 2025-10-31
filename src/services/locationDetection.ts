import type { NominatimResponse, IPLocationResponse, PreapprovedLocation, GeolocationPosition, GeolocationError } from '../types/index';
import { detectDeviceAndPlatform } from '../utils/platform';
import { DEFAULT_LOCATION, NOMINATIM_CONFIG, GEOLOCATION_CONFIG } from '../constants/index';

/**
 * Get city name from coordinates using OpenStreetMap Nominatim API
 */
export async function getCityFromCoords(lat: number, lon: number): Promise<string> {
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

/**
 * Get fallback locations for manual selection
 */
const FALLBACK_LOCATIONS: PreapprovedLocation[] = [
  {
    id: 'london',
    slug: 'london',
    name: 'London',
    admin1: 'England',
    country_name: 'United Kingdom',
    country_code: 'GB',
    latitude: 51.5074,
    longitude: -0.1278,
    timezone: 'Europe/London',
    tier: 'global'
  },
  {
    id: 'new_york',
    slug: 'new-york',
    name: 'New York',
    admin1: 'New York',
    country_name: 'United States',
    country_code: 'US',
    latitude: 40.7128,
    longitude: -74.006,
    timezone: 'America/New_York',
    tier: 'global'
  },
  {
    id: 'paris',
    slug: 'paris',
    name: 'Paris',
    admin1: 'Île-de-France',
    country_name: 'France',
    country_code: 'FR',
    latitude: 48.8566,
    longitude: 2.3522,
    timezone: 'Europe/Paris',
    tier: 'global'
  },
  {
    id: 'tokyo',
    slug: 'tokyo',
    name: 'Tokyo',
    admin1: 'Tokyo',
    country_name: 'Japan',
    country_code: 'JP',
    latitude: 35.6762,
    longitude: 139.6503,
    timezone: 'Asia/Tokyo',
    tier: 'global'
  },
  {
    id: 'sydney',
    slug: 'sydney',
    name: 'Sydney',
    admin1: 'New South Wales',
    country_name: 'Australia',
    country_code: 'AU',
    latitude: -33.8688,
    longitude: 151.2093,
    timezone: 'Australia/Sydney',
    tier: 'global'
  },
  {
    id: 'berlin',
    slug: 'berlin',
    name: 'Berlin',
    admin1: 'Tempelhof',
    country_name: 'Germany',
    country_code: 'DE',
    latitude: 52.52,
    longitude: 13.405,
    timezone: 'Europe/Berlin',
    tier: 'global'
  },
  {
    id: 'madrid',
    slug: 'madrid',
    name: 'Madrid',
    admin1: 'Madrid',
    country_name: 'Spain',
    country_code: 'ES',
    latitude: 40.4168,
    longitude: -3.7038,
    timezone: 'Europe/Madrid',
    tier: 'global'
  },
  {
    id: 'rome',
    slug: 'rome',
    name: 'Rome',
    admin1: 'Lazio',
    country_name: 'Italy',
    country_code: 'IT',
    latitude: 41.9028,
    longitude: 12.4964,
    timezone: 'Europe/Rome',
    tier: 'global'
  },
  {
    id: 'amsterdam',
    slug: 'amsterdam',
    name: 'Amsterdam',
    admin1: 'North Holland',
    country_name: 'Netherlands',
    country_code: 'NL',
    latitude: 52.3676,
    longitude: 4.9041,
    timezone: 'Europe/Amsterdam',
    tier: 'global'
  },
  {
    id: 'dublin',
    slug: 'dublin',
    name: 'Dublin',
    admin1: 'Leinster',
    country_name: 'Ireland',
    country_code: 'IE',
    latitude: 53.3498,
    longitude: -6.2603,
    timezone: 'Europe/Dublin',
    tier: 'global'
  },
  {
    id: 'toronto',
    slug: 'toronto',
    name: 'Toronto',
    admin1: 'Ontario',
    country_name: 'Canada',
    country_code: 'CA',
    latitude: 43.6532,
    longitude: -79.3832,
    timezone: 'America/Toronto',
    tier: 'global'
  },
  {
    id: 'mumbai',
    slug: 'mumbai',
    name: 'Mumbai',
    admin1: 'Maharashtra',
    country_name: 'India',
    country_code: 'IN',
    latitude: 19.076,
    longitude: 72.8777,
    timezone: 'Asia/Kolkata',
    tier: 'global'
  },
  {
    id: 'singapore',
    slug: 'singapore',
    name: 'Singapore',
    admin1: 'Singapore',
    country_name: 'Singapore',
    country_code: 'SG',
    latitude: 1.3521,
    longitude: 103.8198,
    timezone: 'Asia/Singapore',
    tier: 'global'
  },
  {
    id: 'hong_kong',
    slug: 'hong-kong',
    name: 'Hong Kong',
    admin1: 'Hong Kong',
    country_name: 'Hong Kong',
    country_code: 'HK',
    latitude: 22.3193,
    longitude: 114.1694,
    timezone: 'Asia/Hong_Kong',
    tier: 'global'
  },
  {
    id: 'seoul',
    slug: 'seoul',
    name: 'Seoul',
    admin1: 'Seoul',
    country_name: 'South Korea',
    country_code: 'KR',
    latitude: 37.5665,
    longitude: 126.978,
    timezone: 'Asia/Seoul',
    tier: 'global'
  },
  {
    id: 'mexico_city',
    slug: 'mexico-city',
    name: 'Mexico City',
    admin1: 'Mexico City',
    country_name: 'Mexico',
    country_code: 'MX',
    latitude: 19.4326,
    longitude: -99.1332,
    timezone: 'America/Mexico_City',
    tier: 'global'
  },
  {
    id: 'sao_paulo',
    slug: 'sao-paulo',
    name: 'São Paulo',
    admin1: 'São Paulo',
    country_name: 'Brazil',
    country_code: 'BR',
    latitude: -23.5505,
    longitude: -46.6333,
    timezone: 'America/Sao_Paulo',
    tier: 'global'
  },
  {
    id: 'buenos_aires',
    slug: 'buenos-aires',
    name: 'Buenos Aires',
    admin1: 'Buenos Aires',
    country_name: 'Argentina',
    country_code: 'AR',
    latitude: -34.6118,
    longitude: -58.396,
    timezone: 'America/Argentina/Buenos_Aires',
    tier: 'global'
  },
  {
    id: 'cape_town',
    slug: 'cape-town',
    name: 'Cape Town',
    admin1: 'Western Cape',
    country_name: 'South Africa',
    country_code: 'ZA',
    latitude: -33.9249,
    longitude: 18.4241,
    timezone: 'Africa/Johannesburg',
    tier: 'global'
  },
  {
    id: 'cairo',
    slug: 'cairo',
    name: 'Cairo',
    admin1: 'Cairo',
    country_name: 'Egypt',
    country_code: 'EG',
    latitude: 30.0444,
    longitude: 31.2357,
    timezone: 'Africa/Cairo',
    tier: 'global'
  }
];

export function getFallbackLocations(): PreapprovedLocation[] {
  return FALLBACK_LOCATIONS.map(location => ({ ...location }));
}
