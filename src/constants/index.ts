/**
 * Shared constants for the TempHist application
 */

// Default location constant
export const DEFAULT_LOCATION = 'London, England, United Kingdom';

// Chart styling constants
export const CHART_AXIS_COLOR = '#ECECEC';
export const CHART_FONT_SIZE_SMALL = 11;
export const CHART_FONT_SIZE_MEDIUM = 12;

// Loading text constant
export const INITIAL_LOADING_TEXT = 'Loading temperature data…';

// Chart colors
export const CHART_COLORS = {
  BAR: '#ff6b6b',
  THIS_YEAR: '#51cf66',
  TREND: '#aaaa00',
  AVERAGE: '#4dabf7'
} as const;

// Loading message timeouts (in seconds)
export const LOADING_TIMEOUTS = {
  MIN_LOADING_TIME: 3, // Minimum time to show loading messages
  MESSAGE_CYCLES: {
    CONNECTING: 5,
    ANALYZING: 15,
    GENERATING: 30,
    PATIENCE: 45,
    LONG_WAIT: 60,
    VERY_LONG_WAIT: 90
  }
} as const;

// API configuration
export const API_CONFIG = {
  MAX_POLLS: 100,
  POLL_INTERVAL: 3000, // 3 seconds
  HEALTH_CHECK_TIMEOUT: 5000 // 5 seconds
} as const;

// Geolocation configuration
export const GEOLOCATION_CONFIG = {
  TIMEOUT_MOBILE: 20000,
  TIMEOUT_DESKTOP: 25000,
  MAX_AGE: 300000 // 5 minutes
} as const;

// OpenStreetMap API configuration
export const NOMINATIM_CONFIG = {
  TIMEOUT_MOBILE: 15000,
  TIMEOUT_DESKTOP: 10000,
  USER_AGENT: 'TempHist/1.0'
} as const;

// Cache configuration
export const CACHE_CONFIG = {
  LOCATION_COOKIE_HOURS: 1,
  PREFETCH_TIMEOUT: 7000 // 7 seconds
} as const;

// Date range validation constants
export const DATE_RANGE_CONFIG = {
  EARLIEST_YEAR: 1970, // Earliest year for which temperature data is available
  LATEST_YEAR_OFFSET: 1, // Allow data up to 1 year in the future (for timezone edge cases)
  DEFAULT_YEAR_SPAN: 50 // Default number of years to look back
} as const;
