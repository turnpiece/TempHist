// Core application types
export interface TempHistLocation {
  location: string;
  source: 'detected' | 'manual' | 'cookie' | 'default';
  isDetected: boolean;
}

export interface CookieData {
  location: string | null;
  source: string | null;
}

// API response types
export interface TemperatureDataPoint {
  date: string;
  year: number;
  temperature: number;
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
  };
  trend: {
    slope: number;
    unit: string;
  };
  summary: string;
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
}

// Analytics types
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
  title?: string;
  subtitle?: string;
  useStructuredHtml?: boolean;
  debugOnly?: boolean;
  extraInfo?: string;
  largeTitle?: boolean;
  secondarySubtitle?: boolean;
}

// Global window extensions
declare global {
  interface Window {
    tempLocation: string | null;
    tempLocationSource: string | null;
    tempLocationIsDetected: boolean | null;
    currentUser: FirebaseUser | null;
    TempHist: {
      cache: {
        prefetch: {
          week?: TemperatureDataResponse;
          month?: TemperatureDataResponse;
          year?: TemperatureDataResponse;
        };
        prefetchPromise?: Promise<any>;
      };
      prefetchedLocations?: string[];
      lastIdentifier?: string;
      analytics: {
        errors: ErrorLog[];
        apiCalls: number;
        apiFailures: number;
        retryAttempts: number;
        locationFailures: number;
        startTime: number;
      };
    };
    TempHistViews: Record<string, {
      render: () => void | Promise<void>;
    }>;
    TempHistRouter: {
      navigate: (path: string) => void;
      handleRoute: () => void;
      registerView: (key: string, view: { render: () => void | Promise<void> }) => void;
      updateNavigationHighlight: (route: string) => void;
    };
    updateDataNotice: (message: string | null, options?: DataNoticeOptions) => void;
    DEBUGGING: boolean;
    debugLog: (...args: any[]) => void;
    debugTime: (label: string) => void;
    debugTimeEnd: (label: string) => void;
    getApiUrl: (path: string) => string;
    getDisplayCity: (fullLocation: string) => string;
    getOrdinal: (n: number) => string;
    mainAppLogic: () => void;
    calculateTrendLine: (points: ChartDataPoint[], startX: number, endX: number) => {
      points: ChartDataPoint[];
      slope: number;
    };
    TempHistAnalytics: () => any;
    TempHistSendAnalytics: () => Promise<void>;
  }
}

export {};