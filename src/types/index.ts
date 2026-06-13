// Core application types
export interface TempHistLocation {
  location: string;
  source: 'detected' | 'manual' | 'cookie' | 'default';
  isDetected: boolean;
}

export interface ImageAttribution {
  title: string;
  photographerName: string;
  sourceName: string;
  sourceUrl: string;
  licenseName?: string | null;
  licenseUrl?: string | null;
  attributionRequired?: boolean;
}

export interface PreapprovedLocation {
  id: string;
  slug: string;
  name: string;
  admin1?: string | null;
  country_name: string;
  country_code: string;
  latitude?: number;
  longitude?: number;
  timezone?: string;
  tier?: string;
  imageUrl?: {
    webp: string;
    jpeg: string;
  } | string;
  imageAlt?: string;
  imageAttribution?: ImageAttribution | null;
}

export interface CookieData {
  location: string | null;
  source: string | null;
  timezone: string | null;
}

// API response types
export interface TemperatureDataPoint {
  date: string;
  year: number;
  temperature: number;
}

export interface MissingYear {
  year: number;
  reason: string;
}

export interface TemperatureDataMetadata {
  total_years: number;
  available_years: number;
  missing_years: MissingYear[];
  completeness: number;
  period_days: number;
  end_date: string;
}

export interface TemperatureDataResponse {
  period: string;
  location: string;
  identifier: string;
  range: {
    start: string;
    end: string;
    years: number;
  };
  unit_group: string;
  values: TemperatureDataPoint[];
  average: {
    mean: number;
    standard_deviation?: number;
  };
  trend: {
    slope: number;
    slope_error?: number;
    unit: string;
    gradient_factor?: number;
  };
  summary: string;
  timezone?: string;
  metadata?: TemperatureDataMetadata;
}

export interface JobResultResponse {
  cache_key: string;
  etag: string;
  data: TemperatureDataResponse;
  computed_at: string;
}

export interface AsyncJobResponse {
  job_id: string;
  status: 'pending' | 'processing' | 'ready' | 'error';
  result?: JobResultResponse;
  error?: string;
  message?: string;
}

// Chart.js types (extended)
export interface ChartDataPoint {
  x: number; // temperature
  y: number; // year
}

export interface ChartDataset {
  label: string;
  type: 'bar' | 'line';
  data: ChartDataPoint[];
  backgroundColor?: string | string[];
  borderColor?: string;
  fill?: boolean;
  pointRadius?: number;
  borderWidth?: number;
  base?: number;
  hidden?: boolean;
}

// Firebase types
export interface FirebaseUser {
  uid: string;
  getIdToken(): Promise<string>;
}

// Geolocation types
export interface GeolocationPosition {
  coords: {
    latitude: number;
    longitude: number;
  };
}

export interface GeolocationError {
  code: number;
  message: string;
}

// OpenStreetMap API types
export interface NominatimAddress {
  city?: string;
  town?: string;
  village?: string;
  hamlet?: string;
  suburb?: string;
  neighbourhood?: string;
  state?: string;
  province?: string;
  county?: string;
  region?: string;
  country?: string;
  country_code?: string;
}

export interface NominatimResponse {
  address: NominatimAddress;
  display_name: string;
}

// IP API types
export interface IPLocationResponse {
  city: string;
  country_name: string;
  country_code?: string;
  timezone?: string;
  latitude?: number;
  longitude?: number;
}

// Analytics types
export type SelectionMethod = 'own_location' | 'carousel' | 'recent' | 'popular' | 'search';

export interface LastRequestMetadata {
  response_time_ms: number;
  cache_hit: boolean | null; // null when X-Cache header absent
  canonical_location: string;
  requested_location: string;
  selection_method: SelectionMethod | null;
}

export interface AnalyticsData {
  sessionDuration: number;
  apiCalls: number;
  apiFailureRate: string;
  retryAttempts: number;
  locationFailures: number;
  errorCount: number;
  errorType: string;
  recentErrors: ErrorLog[];
}

export interface ErrorLog {
  timestamp: string;
  error: string;
  stack?: string;
  context?: Record<string, any>;
  userAgent: string;
  url: string;
}

// Platform detection types
export interface PlatformInfo {
  os: string;
  browser: string;
  deviceType: 'Mobile' | 'Tablet' | 'Desktop';
  isMobile: boolean;
  isIOS: boolean;
  isAndroid: boolean;
  isSafari: boolean;
  isChrome: boolean;
}

// Data notice options
export interface DataNoticeOptions {
  type?: 'success' | 'error' | 'warning' | 'neutral' | 'info';
  icon?: string;
  title?: string;
  subtitle?: string;
  useStructuredHtml?: boolean;
  debugOnly?: boolean;
  extraInfo?: string;
  largeTitle?: boolean;
  secondarySubtitle?: boolean;
}

// Project globals — declared as var so they are accessible via globalThis.X
declare global {
  var tempLocation: string | null;
  var tempLocationTimezone: string | null;
  var tempLocationSource: string | null;
  var tempLocationIsDetected: boolean | null;
  var tempLocationCountryCode: string | null;
  var tempLatitude: number | null;
  var tempLongitude: number | null;
  var currentUser: FirebaseUser | null;
  var TempHist: {
    cache: {
      prefetch: {
        week?: TemperatureDataResponse;
        month?: TemperatureDataResponse;
        year?: TemperatureDataResponse;
      };
      prefetchPromise?: Promise<any>;
    };
    prefetchedLocations?: PreapprovedLocation[];
    lastIdentifier?: string;
    mainChart?: any;
    analytics: {
      errors: ErrorLog[];
      apiCalls: number;
      apiFailures: number;
      retryAttempts: number;
      locationFailures: number;
      startTime: number;
      lastRequestMetadata: LastRequestMetadata | null;
    };
  };
  var TempHistViews: Record<string, {
    render: () => void | Promise<void>;
  }>;
  var TempHistRouter: {
    navigate: (path: string) => void;
    handleRoute: () => void;
    registerView: (key: string, view: { render: () => void | Promise<void> }) => void;
    updateNavigationHighlight: (route: string) => void;
  };
  var updateDataNotice: (message: string | null, options?: DataNoticeOptions) => void;
  var DEBUGGING: boolean;
  var debugLog: (...args: any[]) => void;
  var debugTime: (label: string) => void;
  var debugTimeEnd: (label: string) => void;
  var getApiUrl: (path: string) => string;
  var getDisplayCity: (fullLocation: string) => string;
  var getOrdinal: (n: number) => string;
  var mainAppLogic: () => void;
  var handleManualLocationSelection: (selectedLocation: string, timezone?: string | null, latitude?: number | null, longitude?: number | null, countryCode?: string | null) => Promise<void>;
  var calculateTrendLine: (points: ChartDataPoint[], startX: number, endX: number) => {
    points: ChartDataPoint[];
    slope: number;
  };
  var TempHistAnalytics: () => any;
  var TempHistSendAnalytics: () => Promise<void>;
  var fetchHistoricalData: () => Promise<void>;
  var retryDataFetch: () => void;
  var testIncompleteData: () => void;
  var testFatalError: () => void;
  var testBasicFunctions: () => void;
  var testRetryButton: () => void;
  var mockTrend: (slope?: number | 'cooling' | 'warming') => void;
  var showFatalError: (periodKey?: string) => void;
  var hideChartElements: (periodKey?: string) => void;
  var showChartElements: (periodKey?: string) => void;
}

export {};