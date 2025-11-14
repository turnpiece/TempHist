import '../styles.scss';
import { initializeApp } from "firebase/app";
import { getAuth, signInAnonymously, onAuthStateChanged } from "firebase/auth";

// Chart.js types
declare global {
  interface Window {
    Chart: any;
    'chartjs-plugin-annotation': any;
  }
}

declare const Chart: any;

// Import our TypeScript modules
import { setLocationCookie, getLocationCookie, getDisplayCity, getOrdinal } from './utils/location';
import { updateDataNotice } from './utils/dataNotice';
import { LoadingManager } from './utils/LoadingManager';
import { LazyLoader } from './utils/LazyLoader';
import { Debouncer } from './utils/Debouncer';
import { DataCache } from './utils/DataCache';
import { ErrorBoundary } from './utils/ErrorBoundary';
import { Logger, LogLevel } from './utils/Logger';
import { FeatureFlags } from './utils/FeatureFlags';
import { PerformanceMonitor } from './utils/PerformanceMonitor';
import { getApiUrl, apiFetch, checkApiHealth, fetchTemperatureDataAsync, transformToChartData, calculateTemperatureRange } from './api/temperature';
import { detectUserLocationWithGeolocation, getLocationFromIP, getFallbackLocations } from './services/locationDetection';
import { initLocationCarousel, resetCarouselState } from './services/locationCarousel';

// Initialise location carousel when DOM is ready
document.addEventListener('DOMContentLoaded', async () => {
  // ...your existing code...
  await initLocationCarousel();
});


// Import constants
import { 
  DEFAULT_LOCATION, 
  CHART_AXIS_COLOR, 
  CHART_FONT_SIZE_SMALL, 
  CHART_FONT_SIZE_MEDIUM, 
  INITIAL_LOADING_TEXT,
  CHART_COLORS,
  LOADING_TIMEOUTS,
  API_CONFIG,
  GEOLOCATION_CONFIG,
  NOMINATIM_CONFIG,
  CACHE_CONFIG
} from './constants/index';

// Import types
import type { 
  ChartDataPoint, 
  AsyncJobResponse,
  FirebaseUser,
  TemperatureDataMetadata,
  PreapprovedLocation
} from './types/index.js';

// Global namespace and cache
window.TempHist = window.TempHist || {};
window.TempHist.cache = window.TempHist.cache || {
  prefetch: {
    // example shape expected:
    // week: { location: 'London', startISO: '2025-09-19', endISO: '2025-09-25', series: [...] }
    // month: { ... }, year: { ... }
  }
};
window.TempHistViews = window.TempHistViews || {};

// Global loading interval management - now handled by LoadingManager
// Legacy functions for backward compatibility
function clearAllLoadingIntervals(): void {
  LoadingManager.clearAllIntervals();
}

// Error monitoring and analytics
window.TempHist.analytics = window.TempHist.analytics || {
  errors: [],
  apiCalls: 0,
  apiFailures: 0,
  retryAttempts: 0,
  locationFailures: 0,
  startTime: Date.now()
};

// Global debug configuration - only enabled in development
const DEBUGGING = import.meta.env.DEV || false;

// Configure logger - use WARN level in production to reduce console noise
Logger.configure({
  level: DEBUGGING ? LogLevel.DEBUG : LogLevel.WARN,
  maxLogs: 1000
});

// Configure data cache
DataCache.configure({
  ttl: 10 * 60 * 1000, // 10 minutes for temperature data
  maxSize: 50, // Maximum 50 cached entries
  maxAge: 60 * 60 * 1000 // 1 hour maximum age
});

// Set up error reporting
ErrorBoundary.onError((error, errorInfo) => {
  console.error('ErrorBoundary: Error caught:', error, errorInfo);
  
  // Report to analytics
  if (window.TempHist?.analytics) {
    window.TempHist.analytics.errors.push({
      timestamp: new Date().toISOString(),
      error: error.message,
      stack: error.stack,
      context: {
        type: 'error_boundary',
        component: errorInfo.errorBoundary || 'unknown',
        componentStack: errorInfo.componentStack
      },
      userAgent: navigator.userAgent,
      url: window.location.href
    });
  }
});

// Helper functions for debug logging (global scope)
function debugLog(...args: any[]): void {
  if (DEBUGGING) {
    console.log(...args);
  }
}

function debugTime(label: string): void {
  if (DEBUGGING) {
    console.time(label);
  }
}

function debugTimeEnd(label: string): void {
  if (DEBUGGING) {
    console.timeEnd(label);
  }
}

// Make debug functions and configuration globally available
window.DEBUGGING = DEBUGGING;
window.debugLog = debugLog;
window.debugTime = debugTime;
window.debugTimeEnd = debugTimeEnd;

// Test functions only available in debug mode
if (DEBUGGING) {
  // Test function to simulate incomplete data
  window.testIncompleteData = function() {
    debugLog('Testing incomplete data scenario...');
    const testMetadata = {
      total_years: 50,
      available_years: 35,
      missing_years: [
        { year: 1975, reason: 'Data unavailable' },
        { year: 1980, reason: 'Data unavailable' },
        { year: 1985, reason: 'Data unavailable' }
      ],
      completeness: 70,
      period_days: 1,
      end_date: '2024-01-01'
    };

    debugLog('Test metadata:', testMetadata);
    checkDataCompleteness(testMetadata, 'today');
  };

  // Test function to simulate fatal error (no data)
  window.testFatalError = function() {
    debugLog('Testing fatal error scenario...');
    debugLog('testFatalError function called');

    const testMetadata = {
      total_years: 51,
      available_years: 0,
      missing_years: [],
      completeness: 0,
      period_days: 1,
      end_date: '2024-01-01'
    };

    debugLog('Test metadata:', testMetadata);
    debugLog('About to call checkDataCompleteness...');

    const result = checkDataCompleteness(testMetadata, 'today');
    debugLog('checkDataCompleteness returned:', result);

    // Also test the showFatalError function directly
    debugLog('Testing showFatalError directly...');
    showFatalError('today');
  };

  // Simple test function to test basic functionality
  window.testBasicFunctions = function() {
    debugLog('Testing basic functions...');
    debugLog('Testing showFatalError with no periodKey...');
    showFatalError();

    debugLog('Testing hideChartElements with no periodKey...');
    hideChartElements();

    debugLog('Testing showChartElements with no periodKey...');
    showChartElements();

    debugLog('Testing showFatalError with "today" periodKey...');
    showFatalError('today');

    debugLog('Basic function tests complete');
  };

  // Test function to test retry button functionality
  window.testRetryButton = function() {
    debugLog('Testing retry button functionality...');

    // Show fatal error
    showFatalError();

    // Wait a moment, then simulate clicking retry
    setTimeout(() => {
      debugLog('Simulating retry button click...');
      retryDataFetch();
    }, 2000);

    debugLog('Retry button test complete');
  };
}

// Helper function to generate location display with edit icon
function generateLocationDisplayHTML(displayText: string, periodKey: string = ''): string {
  const buttonId = periodKey ? `changeLocationBtn-${periodKey}` : 'changeLocationBtn';
  return `
    ${displayText}
    <button 
      id="${buttonId}" 
      class="location-edit-icon" 
      title="Change location"
      aria-label="Change location">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z" fill="currentColor"/>
      </svg>
    </button>
  `;
}

// Helper function to generate context-specific error messages
function generateErrorMessage(error: unknown): string {
  // Default message
  let errorMessage = 'Sorry, there was a problem processing the temperature data. Please try again later.';
  
  if (error instanceof Error) {
    if (error.message.includes('Job failed')) {
      if (error.message.includes('set_cache_value') || error.message.includes('redis_client')) {
        errorMessage = 'The server is experiencing technical difficulties with data caching. Please try again in a few minutes.';
      } else {
        errorMessage = 'The data processing job failed. This may be due to server issues. Please try again later.';
      }
    } else if (error.message.includes('Job polling timed out')) {
      errorMessage = 'The data processing has timed out. Please try again later.';
    } else if (error.message.includes('Failed to create job')) {
      errorMessage = 'Unable to start data processing. Please check your connection and try again.';
    }
  }
  
  return errorMessage;
}

/**
 * Check if data is incomplete and show appropriate UI
 */
function checkDataCompleteness(metadata: TemperatureDataMetadata | undefined, periodKey?: string): boolean {
  debugLog('checkDataCompleteness called with metadata:', metadata, 'periodKey:', periodKey);

  if (!metadata) {
    debugLog('No metadata provided, assuming data is complete');
    return true; // No metadata means we assume data is complete
  }
  
  debugLog('Metadata completeness:', metadata.completeness, '%');

  // Check for fatal error (0% completeness - no data at all)
  if (metadata.completeness === 0) {
    debugLog('Fatal error: No data available (0% completeness)');
    showFatalError(periodKey);
    return false;
  }
  
  // Consider data incomplete if completeness is less than 100%
  const isIncomplete = metadata.completeness < 100;
  
  debugLog('Is data incomplete?', isIncomplete);

  if (isIncomplete) {
    debugLog('Showing incomplete data notice');
    showIncompleteDataNotice(metadata, periodKey);
    return false;
  }
  
  // Hide any existing incomplete data notice since data is complete
  hideIncompleteDataNotice(periodKey);
  
  debugLog('Data is complete, no notice needed');
  return true;
}

/**
 * Show fatal error when no data is available (0% completeness)
 */
function showFatalError(periodKey?: string): void {
  debugLog('showFatalError called for periodKey:', periodKey);
  debugLog('showFatalError: Starting to hide chart elements...');

  // Stop loading manager first (for Today view)
  // Today view uses no periodKey, 'today', or 'daily'
  const isTodayView = !periodKey || periodKey === 'today' || periodKey === 'daily';
  if (isTodayView) {
    LoadingManager.stopGlobalLoading();
    const loadingEl = document.getElementById('loading');
    if (loadingEl) {
      loadingEl.classList.add('hidden');
      loadingEl.classList.remove('visible');
    }
    const canvasEl = document.getElementById('tempChart');
    if (canvasEl) {
      canvasEl.classList.add('hidden');
      canvasEl.classList.remove('visible');
    }
  }

  // Hide chart and summary elements
  hideChartElements(periodKey);
  debugLog('showFatalError: Chart elements hidden');

  // Show error message at the top using dataNotice
  const errorMessage = 'Unable to load temperature data. Please check your connection and try again.';

  if (!isTodayView) {
    debugLog('showFatalError: Using period-specific dataNotice for', periodKey);
    // For period-specific views, use the period-specific dataNotice
    const noticeEl = document.getElementById(`${periodKey}DataNotice`);
    debugLog('showFatalError: Found noticeEl:', noticeEl);
    if (noticeEl) {
      noticeEl.innerHTML = '';
      noticeEl.className = 'notice status-error';
      noticeEl.style.display = 'block';
      debugLog('showFatalError: Set noticeEl display to block');

      const contentEl = document.createElement('div');
      contentEl.className = 'notice-content error';

      const titleEl = document.createElement('h3');
      titleEl.className = 'notice-title large';
      titleEl.textContent = 'Data Unavailable';

      const messageEl = document.createElement('p');
      messageEl.className = 'notice-subtitle';
      messageEl.textContent = errorMessage;

      const retryButton = document.createElement('button');
      retryButton.className = 'btn btn-primary';
      retryButton.textContent = 'Try Again';
      retryButton.onclick = retryDataFetch;

      contentEl.appendChild(titleEl);
      contentEl.appendChild(messageEl);
      contentEl.appendChild(retryButton);
      noticeEl.appendChild(contentEl);

      debugLog('Fatal error notice displayed for', periodKey);
    }
  } else if (isTodayView) {
    debugLog('showFatalError: Using Today view updateDataNotice');
    // For Today view, use the existing updateDataNotice function
    updateDataNotice(errorMessage, {
      type: 'error',
      title: 'Data Unavailable',
      useStructuredHtml: true,
      largeTitle: true
    });
    
    // Add retry button to the dataNotice element
    const dataNotice = document.getElementById('dataNotice');
    if (dataNotice) {
      // Check if we need to add a retry button
      const existingButton = dataNotice.querySelector('.btn');
      if (!existingButton) {
        const retryButton = document.createElement('button');
        retryButton.className = 'btn btn-primary';
        retryButton.textContent = 'Try Again';
        retryButton.onclick = retryDataFetch;
        retryButton.style.marginTop = '10px';
        
        // Add the button to the notice content
        const contentEl = dataNotice.querySelector('.notice-content');
        if (contentEl) {
          contentEl.appendChild(retryButton);
          debugLog('showFatalError: Added retry button to Today view');
        } else {
          // Fallback: add directly to dataNotice
          dataNotice.appendChild(retryButton);
          debugLog('showFatalError: Added retry button directly to dataNotice');
        }
      }
    }

    debugLog('Fatal error notice displayed for Today view');
    debugLog('showFatalError: Called updateDataNotice for Today view');
  }
}

/**
 * Hide chart and summary elements when fatal error occurs
 */
function hideChartElements(periodKey?: string): void {
  debugLog('hideChartElements called for periodKey:', periodKey);
  debugLog('hideChartElements: periodKey is', periodKey);

  if (periodKey && periodKey !== 'today') {
    debugLog('hideChartElements: Hiding period-specific elements for', periodKey);
    // Hide period-specific elements
    const elementsToHide = [
      `${periodKey}Chart`,
      `${periodKey}Loading`,
      `${periodKey}SummaryText`,
      `${periodKey}AvgText`,
      `${periodKey}TrendText`,
      `${periodKey}IncompleteDataNotice`
    ];

    elementsToHide.forEach(id => {
      const element = document.getElementById(id);
      debugLog(`hideChartElements: Looking for element ${id}, found:`, element);
      if (element) {
        element.style.display = 'none';
        debugLog(`Hidden element: ${id}`);
      } else {
        debugLog(`hideChartElements: Element ${id} not found`);
      }
    });
  } else {
    debugLog('hideChartElements: Hiding Today view elements');
    // Hide Today view elements
    const elementsToHide = [
      'tempChart',
      'loading',
      'summaryText',
      'avgText',
      'trendText',
      'incompleteDataNotice'
    ];

    elementsToHide.forEach(id => {
      const element = document.getElementById(id);
      debugLog(`hideChartElements: Looking for Today element ${id}, found:`, element);
      if (element) {
        element.style.display = 'none';
        debugLog(`Hidden element: ${id}`);
      } else {
        debugLog(`hideChartElements: Today element ${id} not found`);
      }
    });
  }

  // Also hide all elements with the data-field class
  const dataFields = document.querySelectorAll('.data-field');
  dataFields.forEach(element => {
    (element as HTMLElement).style.display = 'none';
    debugLog(`Hidden data-field element:`, element);
  });
}

/**
 * Show chart and summary elements when data is available
 */
function showChartElements(periodKey?: string): void {
  debugLog('showChartElements called for periodKey:', periodKey);
  
  if (periodKey && periodKey !== 'today') {
    // Show period-specific elements
    const elementsToShow = [
      `${periodKey}Chart`,
      `${periodKey}SummaryText`,
      `${periodKey}AvgText`,
      `${periodKey}TrendText`
    ];
    
    elementsToShow.forEach(id => {
      const element = document.getElementById(id);
      if (element) {
        element.style.display = '';
        debugLog(`Shown element: ${id}`);
      }
    });
  } else {
    // Show Today view elements
    const elementsToShow = [
      'tempChart',
      'summaryText',
      'avgText',
      'trendText'
    ];
    
    elementsToShow.forEach(id => {
      const element = document.getElementById(id);
      if (element) {
        element.style.display = '';
        debugLog(`Shown element: ${id}`);
      }
    });
  }
  
  // Also show all elements with the data-field class
  const dataFields = document.querySelectorAll('.data-field');
  dataFields.forEach(element => {
    (element as HTMLElement).style.display = '';
    (element as HTMLElement).classList.remove('hidden');
    debugLog(`Shown data-field element:`, element);
  });
}

/**
 * Show notice for incomplete data with retry option
 */
function showIncompleteDataNotice(metadata: TemperatureDataMetadata, periodKey?: string): void {
  debugLog('showIncompleteDataNotice called with metadata:', metadata, 'periodKey:', periodKey);

  const missingCount = metadata.missing_years.length;
  const completeness = Math.round(metadata.completeness);

  debugLog('Missing years count:', missingCount);
  debugLog('Completeness:', completeness, '%');

  // Check if this is the Today view (no periodKey, 'today', or 'daily')
  const isTodayView = !periodKey || periodKey === 'today' || periodKey === 'daily';

  if (isTodayView) {
    // For Today view, use the dataNotice element with updateDataNotice
    const warningMessage = `Only ${completeness}% of the expected data is available (${metadata.available_years} of ${metadata.total_years} years).${missingCount > 0 ? ` ${missingCount} ${missingCount === 1 ? 'year is' : 'years are'} missing.` : ''}`;

    updateDataNotice(warningMessage, {
      type: 'warning',
      title: 'Incomplete Data',
      useStructuredHtml: true,
      largeTitle: true
    });

    // Add retry button to the dataNotice element
    const dataNotice = document.getElementById('dataNotice');
    if (dataNotice) {
      // Check if we need to add a retry button
      const existingButton = dataNotice.querySelector('.btn');
      if (!existingButton) {
        const retryButton = document.createElement('button');
        retryButton.className = 'btn btn-primary';
        retryButton.textContent = 'Try Again';
        retryButton.onclick = retryDataFetch;
        retryButton.style.marginTop = '10px';

        // Add the button to the notice content
        const contentEl = dataNotice.querySelector('.notice-content');
        if (contentEl) {
          contentEl.appendChild(retryButton);
          debugLog('showIncompleteDataNotice: Added retry button to Today view');
        } else {
          // Fallback: add directly to dataNotice
          dataNotice.appendChild(retryButton);
          debugLog('showIncompleteDataNotice: Added retry button directly to dataNotice');
        }
      }
    }

    debugLog('Incomplete data warning displayed for Today view');
    return;
  }

  // For period-specific views, use the period-specific notice element
  let noticeEl: HTMLElement | null = null;
  noticeEl = document.getElementById(`${periodKey}IncompleteDataNotice`);
  debugLog(`${periodKey}IncompleteDataNotice element found:`, noticeEl);
  
  if (noticeEl) {
    // Clear any existing content
    noticeEl.innerHTML = '';
    
    // Create the warning content
    const contentEl = document.createElement('div');
    contentEl.className = 'notice-content warning';
    
    const titleEl = document.createElement('h3');
    titleEl.className = 'notice-title large';
    titleEl.textContent = 'Incomplete Data';
    
    const subtitleEl = document.createElement('p');
    subtitleEl.className = 'notice-subtitle secondary';
    subtitleEl.textContent = `Only ${completeness}% of the expected data is available (${metadata.available_years} of ${metadata.total_years} years).${missingCount > 0 ? ` ${missingCount} ${missingCount === 1 ? 'year is' : 'years are'} missing.` : ''}`;
    
    const buttonEl = document.createElement('button');
    buttonEl.className = 'btn btn-primary';
    buttonEl.textContent = 'Try Again';
    buttonEl.onclick = retryDataFetch;
    
    contentEl.appendChild(titleEl);
    contentEl.appendChild(subtitleEl);
    contentEl.appendChild(buttonEl);
    noticeEl.appendChild(contentEl);
    
    // Show the notice
    noticeEl.style.display = 'block';
    noticeEl.className = 'notice status-warning';
    
    debugLog('Incomplete data warning displayed in dedicated notice element');
  } else {
    debugLog('Incomplete data notice element not found, cannot show warning');
  }
}

/**
 * Get the current view name
 */
function getCurrentView(): string | null {
  const hash = window.location.hash;
  const route = hash === '' ? '/today' : hash.substring(1);
  
  switch (route) {
    case '/today':
      return 'today';
    case '/week':
      return 'week';
    case '/month':
      return 'month';
    case '/year':
      return 'year';
    default:
      return null;
  }
}

/**
 * Hide the incomplete data notice
 */
function hideIncompleteDataNotice(periodKey?: string): void {
  // Check if this is the Today view (no periodKey, 'today', or 'daily')
  const isTodayView = !periodKey || periodKey === 'today' || periodKey === 'daily';

  if (isTodayView) {
    // For Today view, clear the dataNotice element
    updateDataNotice(null);
    return;
  }

  // For period-specific views, hide the period-specific notice element
  const noticeEl = document.getElementById(`${periodKey}IncompleteDataNotice`);
  if (noticeEl) {
    noticeEl.style.display = 'none';
    noticeEl.innerHTML = '';
    noticeEl.className = 'notice';
  }
}

/**
 * Retry data fetch (called from the retry button)
 */
function retryDataFetch(): void {
  // Hide the incomplete data notice
  hideIncompleteDataNotice();
  
  // Clear the data notice (for other types of notices)
  const currentView = getCurrentView();
  if (currentView === 'today') {
    updateDataNotice(null);
  } else if (currentView) {
    const noticeEl = document.getElementById(`${currentView}DataNotice`);
    if (noticeEl) {
      noticeEl.style.display = 'none';
      noticeEl.innerHTML = '';
      noticeEl.className = 'notice';
    }
  }
  
  // Show chart elements in case they were hidden due to fatal error
  if (currentView === 'today') {
    showChartElements();
  } else if (currentView) {
    showChartElements(currentView);
  }
  // Call the global fetchHistoricalData function if available
  if (window.fetchHistoricalData && typeof window.fetchHistoricalData === 'function') {
    window.fetchHistoricalData();
  } else {
    // Fallback to page reload if function not available
    window.location.reload();
  }
}

// Make utility functions globally available
window.getApiUrl = getApiUrl;
window.getOrdinal = getOrdinal;
window.getDisplayCity = getDisplayCity;
window.updateDataNotice = updateDataNotice;
window.retryDataFetch = retryDataFetch;
window.showFatalError = showFatalError;
window.hideChartElements = hideChartElements;
window.showChartElements = showChartElements;

// Firebase config
const firebaseConfig = {
  apiKey: "AIzaSyC8CgPOwaXkGgCRgAtEn1VIGCxEHI-brjg",
  authDomain: "temphist-2c787.firebaseapp.com",
  projectId: "temphist-2c787",
  storageBucket: "temphist-2c787.firebasestorage.app",
  messagingSenderId: "355243461054",
  appId: "1:355243461054:web:d3471deb717abb569a51ef",
  measurementId: "G-117YTQEW98"
};

// Initialise Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

// Sign in anonymously
debugLog('Starting Firebase anonymous sign-in...');
debugLog('Firebase project ID:', firebaseConfig.projectId);
signInAnonymously(auth)
  .then((userCredential) => {
    debugLog('Firebase sign-in successful:', userCredential.user?.uid);
    debugLog('Firebase project ID from user:', userCredential.user?.tenantId);
  })
  .catch((error) => {
    console.error("Firebase anonymous sign-in error:", error);
    debugLog('Firebase sign-in failed:', error);
  });

// Wait for authentication before running the rest of your code
onAuthStateChanged(auth, (user: FirebaseUser | null) => {
  debugLog('Firebase auth state changed:', user ? `User: ${user.uid}` : 'No user');
  if (user) {
    // User is signed in, you can now use user.uid or user.getIdToken()
    // Place your main logic here, or call a function to start your app
    debugLog('Starting app with Firebase user:', user.uid);
    startAppWithFirebaseUser(user);
  } else {
    debugLog('Firebase user signed out');
  }
});

/**
 * Start the app with Firebase user
 */
function startAppWithFirebaseUser(user: FirebaseUser): void {
  // Store the Firebase user for use in apiFetch FIRST
  window.currentUser = user;
  
  debugLog('Script starting...');
  
  // Initialise analytics reporting
  setupAnalyticsReporting();
  
  // Initialise splash screen functionality (now currentUser is available)
  initializeSplashScreen();
}

/**
 * Setup analytics reporting
 */
function setupAnalyticsReporting(): void {
  // Send analytics when page is about to unload
  window.addEventListener('beforeunload', () => {
    // Send analytics data on page unload (only if Firebase is authenticated)
    if (window.currentUser) {
      sendAnalytics();
    }
  });

  // Send analytics periodically (every 5 minutes) for long sessions
  setInterval(() => {
    // Only send analytics if Firebase is authenticated and we have meaningful data
    if (window.currentUser && (window.TempHist.analytics.apiCalls > 0 || window.TempHist.analytics.errors.length > 0)) {
      sendAnalytics();
    }
  }, 5 * 60 * 1000); // 5 minutes
}

/**
 * Report analytics data
 */
function reportAnalytics() {
  const analytics = window.TempHist.analytics;
  const sessionDuration = Date.now() - analytics.startTime;
  
  // Determine the most common error type from recent errors
  const getErrorType = () => {
    if (analytics.errors.length === 0) return 'none';
    
    const errorTypes = analytics.errors.map(error => error.context?.type || 'unknown');
    const typeCounts = errorTypes.reduce((acc, type) => {
      acc[type] = (acc[type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    // Return the most common error type, or 'mixed' if multiple types
    const sortedTypes = Object.entries(typeCounts).sort((a, b) => (b[1] as number) - (a[1] as number));
    return sortedTypes.length > 1 && (sortedTypes[0][1] as number) === (sortedTypes[1][1] as number) ? 'mixed' : sortedTypes[0][0];
  };
  
  return {
    sessionDuration: Math.round(sessionDuration / 1000), // seconds
    apiCalls: analytics.apiCalls,
    apiFailureRate: analytics.apiCalls > 0 ? (analytics.apiFailures / analytics.apiCalls * 100).toFixed(1) + '%' : '0%',
    retryAttempts: analytics.retryAttempts,
    locationFailures: analytics.locationFailures,
    errorCount: analytics.errors.length,
    errorType: getErrorType(),
    recentErrors: analytics.errors.slice(-5) // Last 5 errors
  };
}

/**
 * Send analytics to server
 */
async function sendAnalytics(): Promise<void> {
  try {
    // Check if API is ready and Firebase is authenticated
    if (!window.currentUser) {
      debugLog('Analytics: Skipping send - Firebase not authenticated yet');
      return;
    }

    // Check if we have any meaningful analytics data
    const analyticsData = reportAnalytics();
    if (analyticsData.apiCalls === 0 && analyticsData.errorCount === 0) {
      debugLog('Analytics: Skipping send - no meaningful data to report');
      return;
    }

    const payload = {
      session_duration: analyticsData.sessionDuration,
      api_calls: analyticsData.apiCalls,
      api_failure_rate: analyticsData.apiFailureRate, // Keep as string like "20.0%"
      retry_attempts: analyticsData.retryAttempts,
      location_failures: analyticsData.locationFailures,
      error_count: analyticsData.errorCount,
      error_type: analyticsData.errorType,
      recent_errors: analyticsData.recentErrors,
      app_version: __APP_VERSION__,
      platform: "web"
    };

    // Debug: Log the payload being sent
    debugLog('Analytics payload being sent:', payload);

    const response = await fetch(getApiUrl('/analytics'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.warn('Analytics reporting failed:', response.status, errorText);
      debugLog('Analytics error response:', errorText);
    } else {
      debugLog('Analytics sent successfully');
    }
  } catch (error) {
    // Silently fail analytics reporting to not impact user experience
    console.warn('Analytics reporting error:', error);
  }
}

/**
 * Initialise splash screen functionality
 */
function initializeSplashScreen(): void {
  // Check if this is a standalone page (privacy, about) - don't show splash screen
  const isStandalonePage = !document.querySelector('#todayView');
  if (isStandalonePage) {
    debugLog('Standalone page detected, skipping splash screen');
    
    // Handle standalone pages by populating their content
    const currentPath = window.location.pathname;
    if (currentPath === '/privacy' || currentPath === '/about') {
      debugLog('Populating content for standalone page:', currentPath);
      
      // Set up mobile navigation for standalone pages
      setupMobileNavigation();
      
      // Populate content based on the page
      if (currentPath === '/privacy') {
        const contentDiv = document.getElementById('content');
        if (contentDiv) {
          // Clear existing content
          contentDiv.textContent = '';
          
          // Create container
          const container = document.createElement('div');
          container.className = 'container';
          
          // Create elements safely
          const title = document.createElement('h2');
          title.textContent = 'Privacy Policy';
          
          const effectiveDate = document.createElement('p');
          effectiveDate.textContent = 'Effective date: September 2025';
          
          const intro = document.createElement('p');
          intro.textContent = 'TempHist, operated by Turnpiece Ltd., respects your privacy.';
          
          // No personal data section
          const noDataTitle = document.createElement('h3');
          noDataTitle.textContent = 'No personal data collected';
          const noDataText = document.createElement('p');
          noDataText.textContent = 'TempHist does not collect, store, or share any personal information.';
          
          // Location use section
          const locationTitle = document.createElement('h3');
          locationTitle.textContent = 'Location use';
          const locationText = document.createElement('p');
          locationText.textContent = 'If you grant permission, the app uses your current location once to retrieve historical weather data for your area. Location data is never shared but is temporarily stored in a cookie on your machine for one hour.';
          
          // Third-party services section
          const thirdPartyTitle = document.createElement('h3');
          thirdPartyTitle.textContent = 'Third-party services and cookies';
          const thirdPartyText = document.createElement('p');
          thirdPartyText.textContent = 'TempHist uses Firebase for anonymous authentication, which may set third-party cookies from Google services (including identitytoolkit.googleapis.com and securetoken.googleapis.com). These cookies are used solely for authentication purposes and do not track personal information or enable cross-site tracking.';
          
          const cookieUsageText = document.createElement('p');
          const strongText = document.createElement('strong');
          strongText.textContent = 'Third-party cookie usage:';
          cookieUsageText.appendChild(strongText);
          cookieUsageText.appendChild(document.createTextNode(' Firebase authentication may use third-party cookies to maintain your anonymous session. These cookies are essential for the app\'s authentication functionality and are not used for advertising or tracking purposes.'));
          
          // No tracking section
          const noTrackingTitle = document.createElement('h3');
          noTrackingTitle.textContent = 'No tracking or analytics';
          const noTrackingText = document.createElement('p');
          noTrackingText.textContent = 'The app does not include analytics, advertising or third-party tracking beyond the authentication service mentioned above. We do not use cookies for tracking, advertising, or cross-site user profiling.';
          
          // Data sources section
          const dataSourcesTitle = document.createElement('h3');
          dataSourcesTitle.textContent = 'Data sources';
          const dataSourcesText = document.createElement('p');
          dataSourcesText.textContent = 'Weather and climate data are provided via the TempHist API, which sources historical weather data from trusted providers. Requests are processed anonymously.';
          
          // Contact section
          const contactTitle = document.createElement('h3');
          contactTitle.textContent = 'Contact';
          const contactText = document.createElement('p');
          contactText.textContent = 'If you have questions, please contact Turnpiece Ltd. at ';
          const contactLink = document.createElement('a');
          contactLink.href = 'https://turnpiece.com';
          contactLink.textContent = 'https://turnpiece.com';
          contactLink.rel = 'noopener noreferrer';
          contactText.appendChild(contactLink);
          contactText.appendChild(document.createTextNode('.'));
          
          // Append all elements
          container.appendChild(title);
          container.appendChild(effectiveDate);
          container.appendChild(intro);
          container.appendChild(noDataTitle);
          container.appendChild(noDataText);
          container.appendChild(locationTitle);
          container.appendChild(locationText);
          container.appendChild(thirdPartyTitle);
          container.appendChild(thirdPartyText);
          container.appendChild(cookieUsageText);
          container.appendChild(noTrackingTitle);
          container.appendChild(noTrackingText);
          container.appendChild(dataSourcesTitle);
          container.appendChild(dataSourcesText);
          container.appendChild(contactTitle);
          container.appendChild(contactText);
          
          contentDiv.appendChild(container);
        }
      } else if (currentPath === '/about') {
        const contentDiv = document.getElementById('content');
        if (contentDiv) {
          // Clear existing content
          contentDiv.textContent = '';
          
          // Create container
          const container = document.createElement('div');
          container.className = 'container';
          
          // Create elements safely
          const title = document.createElement('h2');
          title.textContent = 'About TempHist';
          
          const intro = document.createElement('p');
          intro.textContent = 'TempHist shows how today\'s temperature compares to the same date over the past 50 years for your location.';
          
          // How it works section
          const howItWorksTitle = document.createElement('h3');
          howItWorksTitle.textContent = 'How it works';
          const howItWorksText = document.createElement('p');
          howItWorksText.textContent = 'TempHist uses historical weather data to create a chart showing temperature trends for your location. The chart displays:';
          
          const featuresList = document.createElement('ul');
          const features = [
            { strong: 'Today\'s temperature', text: ' - the current temperature for your location' },
            { strong: 'Historical range', text: ' - the highest and lowest temperatures recorded on this date over the past 50 years' },
            { strong: 'Average temperature', text: ' - the average temperature for this date over the past 50 years' },
            { strong: 'Temperature trend', text: ' - how today\'s temperature compares to the historical average' }
          ];
          
          features.forEach(feature => {
            const listItem = document.createElement('li');
            const strongEl = document.createElement('strong');
            strongEl.textContent = feature.strong;
            listItem.appendChild(strongEl);
            listItem.appendChild(document.createTextNode(feature.text));
            featuresList.appendChild(listItem);
          });
          
          // Data sources section
          const dataSourcesTitle = document.createElement('h3');
          dataSourcesTitle.textContent = 'Data sources';
          const dataSourcesText = document.createElement('p');
          dataSourcesText.textContent = 'Temperature data is sourced from trusted weather services and processed through the TempHist API. The data includes daily temperature records going back 50 years for thousands of locations worldwide.';
          
          // Privacy section
          const privacyTitle = document.createElement('h3');
          privacyTitle.textContent = 'Privacy';
          const privacyText = document.createElement('p');
          privacyText.textContent = 'TempHist does not collect, store, or share any personal information. Your location is used only to retrieve weather data and is not stored or transmitted to third parties.';
          
          // Contact section
          const contactTitle = document.createElement('h3');
          contactTitle.textContent = 'Contact';
          const contactText = document.createElement('p');
          contactText.textContent = 'TempHist is developed by ';
          const contactLink = document.createElement('a');
          contactLink.href = 'https://turnpiece.com';
          contactLink.textContent = 'Turnpiece Ltd.';
          contactLink.rel = 'noopener noreferrer';
          contactText.appendChild(contactLink);
          contactText.appendChild(document.createTextNode(' For questions or feedback, please visit our website.'));
          
          // Append all elements
          container.appendChild(title);
          container.appendChild(intro);
          container.appendChild(howItWorksTitle);
          container.appendChild(howItWorksText);
          container.appendChild(featuresList);
          container.appendChild(dataSourcesTitle);
          container.appendChild(dataSourcesText);
          container.appendChild(privacyTitle);
          container.appendChild(privacyText);
          container.appendChild(contactTitle);
          container.appendChild(contactText);
          
          contentDiv.appendChild(container);
        }
      }
    }
    return;
  }

  const splashScreen = document.getElementById('splashScreen');
  const appShell = document.getElementById('appShell');

  // Reset to Today page when splash screen is shown (in case user was on another page)
  debugLog('Splash screen shown, resetting to Today page');
  if (window.TempHistRouter && typeof window.TempHistRouter.navigate === 'function') {
    window.TempHistRouter.navigate('/today');
  } else {
    // Fallback: update URL
    window.location.hash = '#/today';
  }

  // Always prefetch approved locations in background for potential manual selection
  // This ensures locations are available even if user has a cookie but wants to change location
  prefetchApprovedLocations();

  // Check if we already have a location (e.g., from cookie or previous session)
  const cookieData = getLocationCookie();
  if (cookieData.location) {
    debugLog('Found existing location from cookie:', cookieData.location, 'with source:', cookieData.source);
    // Skip splash screen and go directly to app
    // Use the stored source if available, otherwise default to 'cookie'
    const source = cookieData.source || 'cookie';
    
    // Proceed immediately - Firebase should be ready since we're in the auth callback
    proceedWithLocation(cookieData.location, source === 'detected', source);
    return;
  }

  // Show splash screen initially
  if (splashScreen) {
    splashScreen.style.display = 'flex';
    // Prevent body scroll when splash screen is visible (especially important for iOS Safari)
    const scrollY = window.scrollY;
    document.body.style.position = 'fixed';
    document.body.style.top = `-${scrollY}px`;
    document.body.style.width = '100%';
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
    // Store scroll position for restoration
    (window as any).savedScrollY = scrollY;
    // Ensure splash screen starts at top
    splashScreen.scrollTop = 0;
  }
  if (appShell) {
    appShell.classList.add('hidden');
  }

  // Set up splash screen event listeners
  setupSplashScreenListeners();
  
  // Set up mobile navigation
  setupMobileNavigation();
}

/**
 * Set up mobile navigation functionality
 */
function setupMobileNavigation(): void {
  const burgerBtn = document.getElementById('burgerBtn');
  const sidebar = document.getElementById('sidebar');
  
  if (!burgerBtn || !sidebar) {
    debugLog('Mobile navigation elements not found - burgerBtn:', !!burgerBtn, 'sidebar:', !!sidebar);
    return;
  }
  
  debugLog('Setting up mobile navigation - burgerBtn and sidebar found');
  
  // Remove any existing event listeners to prevent duplicates
  const newBurgerBtn = burgerBtn.cloneNode(true) as HTMLElement;
  burgerBtn.parentNode?.replaceChild(newBurgerBtn, burgerBtn);
  
  // Handle burger button interaction (both touch and click for mobile compatibility)
  const handleBurgerClick = (e: Event) => {
    e.preventDefault();
    e.stopPropagation();
    
    const isOpen = sidebar.classList.contains('open');
    
    if (isOpen) {
      // Close the sidebar
      sidebar.classList.remove('open');
      newBurgerBtn.setAttribute('aria-expanded', 'false');
      newBurgerBtn.setAttribute('aria-label', 'Open menu');
      document.body.classList.remove('menu-open');
      debugLog('Mobile menu closed');
    } else {
      // Open the sidebar
      sidebar.classList.add('open');
      newBurgerBtn.setAttribute('aria-expanded', 'true');
      newBurgerBtn.setAttribute('aria-label', 'Close menu');
      document.body.classList.add('menu-open');
      debugLog('Mobile menu opened');
    }
  };
  
  // Add both touchstart and click listeners for better mobile support
  newBurgerBtn.addEventListener('touchstart', handleBurgerClick, { passive: false });
  newBurgerBtn.addEventListener('click', handleBurgerClick);
  
  // Handle clicking outside the sidebar to close it
  document.addEventListener('click', (e) => {
    const isOpen = sidebar.classList.contains('open');
    if (isOpen && !sidebar.contains(e.target as Node) && !newBurgerBtn.contains(e.target as Node)) {
      sidebar.classList.remove('open');
      newBurgerBtn.setAttribute('aria-expanded', 'false');
      newBurgerBtn.setAttribute('aria-label', 'Open menu');
      document.body.classList.remove('menu-open');
      debugLog('Mobile menu closed by clicking outside');
    }
  });
  
  // Handle sidebar link clicks to close the menu
  const sidebarLinks = sidebar.querySelectorAll('a');
  sidebarLinks.forEach(link => {
    link.addEventListener('click', () => {
      sidebar.classList.remove('open');
      newBurgerBtn.setAttribute('aria-expanded', 'false');
      newBurgerBtn.setAttribute('aria-label', 'Open menu');
      document.body.classList.remove('menu-open');
      debugLog('Mobile menu closed by link click');
    });
  });
  
  // Handle escape key to close menu
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && sidebar.classList.contains('open')) {
      sidebar.classList.remove('open');
      newBurgerBtn.setAttribute('aria-expanded', 'false');
      newBurgerBtn.setAttribute('aria-label', 'Open menu');
      document.body.classList.remove('menu-open');
      debugLog('Mobile menu closed by escape key');
    }
  });
}

/**
 * Handle window resize to re-setup mobile navigation if needed
 */
function handleWindowResize(): void {
  const burgerBtn = document.getElementById('burgerBtn');
  if (burgerBtn && window.innerWidth <= 900) {
    // Only re-setup if we're in mobile view and the button is visible
    const computedStyle = window.getComputedStyle(burgerBtn);
    if (computedStyle.display !== 'none') {
      //debugLog('Window resized to mobile view, re-setting up mobile navigation');
      setupMobileNavigation();
    }
  }
}

/**
 * Set up splash screen event listeners
 */
function setupSplashScreenListeners(): void {
  const useLocationBtn = document.getElementById('useLocationBtn');
  const chooseLocationBtn = document.getElementById('chooseLocationBtn');
  const locationSelect = document.getElementById('locationSelect');
  const confirmLocationBtn = document.getElementById('confirmLocationBtn');
  const backToSplashBtn = document.getElementById('backToSplashBtn');

  // Use my location button handler
  if (useLocationBtn) {
    useLocationBtn.addEventListener('click', async () => {
      await handleUseLocation();
    });
  }

  // Choose location manually button handler
  if (chooseLocationBtn) {
    chooseLocationBtn.addEventListener('click', () => {
      debugLog('Choose location manually button clicked');
      showManualLocationSelection();
    });
  }

  // Back to splash button handler
  if (backToSplashBtn) {
    backToSplashBtn.addEventListener('click', () => {
      hideManualLocationSelection();
    });
  }

  // Location select change handler
  if (locationSelect) {
    locationSelect.addEventListener('change', (e) => {
      const target = e.target as HTMLSelectElement;
      const confirmBtn = document.getElementById('confirmLocationBtn') as HTMLButtonElement;
      if (confirmBtn) {
        confirmBtn.disabled = !target.value;
      }
    });
  }

  // Confirm location button handler
  if (confirmLocationBtn) {
    confirmLocationBtn.addEventListener('click', async () => {
      const selectedLocation = (locationSelect as HTMLSelectElement).value;
      if (selectedLocation) {
        await handleManualLocationSelection(selectedLocation);
      }
    });
  }
}

/**
 * Prefetch approved locations for manual selection
 */
async function prefetchApprovedLocations(): Promise<void> {
  debugLog('Prefetching approved locations in background...');
  
  // Wait for currentUser to be available
  let attempts = 0;
  const maxAttempts = 50; // 5 seconds max wait
  
  while (!window.currentUser && attempts < maxAttempts) {
    await new Promise(resolve => setTimeout(resolve, 100));
    attempts++;
  }
  
  if (!window.currentUser) {
    debugLog('No currentUser available after waiting, using fallback locations');
    window.TempHist = window.TempHist || {};
    window.TempHist.prefetchedLocations = getFallbackLocations();
    return;
  }
  
  try {
    const locations = await loadPreapprovedLocations();
    debugLog('Approved locations prefetched:', locations.length, 'locations');
    
    // Store in a global cache for immediate use
    window.TempHist = window.TempHist || {};
    window.TempHist.prefetchedLocations = locations;
  } catch (error) {
    debugLog('Failed to prefetch approved locations:', error);
    // Store fallback locations
    window.TempHist = window.TempHist || {};
    window.TempHist.prefetchedLocations = getFallbackLocations();
  }
}

function isPreapprovedLocation(value: unknown): value is PreapprovedLocation {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return typeof candidate.id === 'string'
    && typeof candidate.slug === 'string'
    && typeof candidate.name === 'string'
    && typeof candidate.country_name === 'string'
    && typeof candidate.country_code === 'string';
}

function parsePreapprovedLocations(payload: unknown): PreapprovedLocation[] | null {
  if (!payload) {
    return null;
  }
  
  // Handle response wrapped in data property
  let data: unknown = payload;
  if (typeof payload === 'object' && payload !== null) {
    const payloadObj = payload as Record<string, unknown>;
    if ('data' in payloadObj) {
      data = payloadObj.data;
    } else if ('locations' in payloadObj) {
      data = payloadObj.locations;
    }
  }
  
  if (!Array.isArray(data)) {
    debugLog('API response is not an array:', typeof data, data);
    return null;
  }

  const validLocations = (data as unknown[]).filter(isPreapprovedLocation) as PreapprovedLocation[];

  if (!validLocations.length) {
    debugLog('No valid locations found in API response. Total items:', data.length);
    return null;
  }

  return validLocations.map(location => ({ ...location }));
}

/**
 * Load preapproved locations from API
 */
async function loadPreapprovedLocations(): Promise<PreapprovedLocation[]> {
  try {
    debugLog('Loading preapproved locations from API...');
    
    // Load from API
    const apiResponse = await apiFetch(getApiUrl('/v1/locations/preapproved'));
    if (apiResponse.ok) {
      const data = await apiResponse.json();
      debugLog('API response received:', typeof data, Array.isArray(data) ? `Array with ${data.length} items` : 'Not an array', data);
      
      const locations = parsePreapprovedLocations(data);

      if (locations) {
        debugLog('API returned locations:', locations.length, 'locations');
        return locations;
      }

      debugLog('API response format invalid for preapproved locations');
    } else {
      debugLog('API request for preapproved locations failed with status:', apiResponse.status);
    }
    
    throw new Error('API failed to provide valid preapproved locations');
  } catch (error) {
    console.warn('Preapproved locations loading failed:', error);
    debugLog('Using fallback locations due to loading failure');
    // Return fallback locations instead of throwing
    return getFallbackLocations();
  }
}

/**
 * Handle use location button click
 */
async function handleUseLocation(): Promise<void> {
  const locationLoading = document.getElementById('locationLoading');
  const splashActions = document.querySelector('.splash-actions');
  const manualLocationSection = document.getElementById('manualLocationSection');

  // Show loading state
  if (splashActions) (splashActions as HTMLElement).style.display = 'none';
  if (manualLocationSection) manualLocationSection.style.display = 'none';
  if (locationLoading) locationLoading.style.display = 'flex';

  try {
    // Try geolocation first
    const location = await detectUserLocationWithGeolocation();
    if (location) {
      await proceedWithLocation(location, true, 'detected'); // Mark as detected location
      return;
    }
  } catch (error) {
    console.warn('Geolocation failed:', error);
  }

  // If geolocation fails, try IP-based fallback
  try {
    const ipLocation = await getLocationFromIP();
    if (ipLocation) {
      // Auto-select the IP-based location and proceed
      await proceedWithLocation(ipLocation, true, 'detected'); // Mark as detected location
      return;
    }
  } catch (error) {
    console.warn('IP-based location failed:', error);
  }

  // If both fail, show manual selection
  showManualLocationSelection();
}

/**
 * Show manual location selection
 */
function showManualLocationSelection(): void {
  debugLog('showManualLocationSelection called');
  const splashActions = document.querySelector('.splash-actions');
  const manualLocationSection = document.getElementById('manualLocationSection');
  const locationLoading = document.getElementById('locationLoading');
  const locationSelect = document.getElementById('locationSelect');

  // Hide loading and main actions
  if (locationLoading) locationLoading.style.display = 'none';
  if (splashActions) (splashActions as HTMLElement).style.display = 'none';

  debugLog('Hiding splash actions, showing manual section');

  // Show manual selection immediately with loading state
  if (manualLocationSection) {
    manualLocationSection.style.display = 'block';
    debugLog('Manual location section shown');
  }

  // Show loading state in the dropdown
  if (locationSelect) {
    locationSelect.innerHTML = '<option value="">Loading locations...</option>';
    (locationSelect as HTMLSelectElement).disabled = true;
  }

  // Disable confirm button while loading
  const confirmBtn = document.getElementById('confirmLocationBtn') as HTMLButtonElement;
  if (confirmBtn) {
    confirmBtn.disabled = true;
  }

  // Use prefetched locations if available, otherwise load them with timeout
  let locations = window.TempHist?.prefetchedLocations;
  if (locations) {
    debugLog('Using prefetched locations:', locations.length, 'locations');
    populateLocationDropdown(locations);
  } else {
    debugLog('No prefetched locations found, loading now...');
    
    // Set up timeout to use fallback locations after configured timeout
    const timeoutId = setTimeout(() => {
      debugLog('Location loading timeout reached, using fallback locations');
      const fallbackLocations = getFallbackLocations();
      debugLog('Using fallback locations due to timeout:', fallbackLocations);
      populateLocationDropdown(fallbackLocations);
    }, CACHE_CONFIG.PREFETCH_TIMEOUT); // Configurable timeout

    loadPreapprovedLocations()
      .then(locations => {
        clearTimeout(timeoutId); // Cancel timeout since we got the data
        debugLog('Loaded locations:', locations);
        populateLocationDropdown(locations);
      })
      .catch(error => {
        clearTimeout(timeoutId); // Cancel timeout since we're handling the error
        debugLog('Error loading locations:', error);
        // If API fails, populate with fallback locations
        const fallbackLocations = getFallbackLocations();
        debugLog('Using fallback locations due to API error:', fallbackLocations);
        populateLocationDropdown(fallbackLocations);
      });
  }
}

/**
 * Hide manual location selection
 */
function hideManualLocationSelection(): void {
  const splashActions = document.querySelector('.splash-actions');
  const manualLocationSection = document.getElementById('manualLocationSection');

  if (manualLocationSection) manualLocationSection.style.display = 'none';
  if (splashActions) (splashActions as HTMLElement).style.display = 'flex';
}

/**
 * Populate location dropdown
 */
function populateLocationDropdown(locations: PreapprovedLocation[]): void {
  const locationSelect = document.getElementById('locationSelect') as HTMLSelectElement;
  if (!locationSelect) {
    debugLog('Location select element not found');
    return;
  }

  debugLog('Populating location dropdown with', locations.length, 'locations');

  // Clear existing options
  locationSelect.innerHTML = '';

  // Add default option
  const defaultOption = document.createElement('option');
  defaultOption.value = '';
  defaultOption.textContent = 'Select a location...';
  locationSelect.appendChild(defaultOption);

  // Add location options
  locations.forEach(location => {
    const option = document.createElement('option');

    const valueParts = [location.name];
    if (location.admin1 && location.admin1.trim()) {
      valueParts.push(location.admin1.trim());
    }
    valueParts.push(location.country_name);

    option.value = valueParts.join(', ');
    option.textContent = location.name;

    option.dataset.locationId = location.id;
    option.dataset.locationSlug = location.slug;
    option.dataset.countryCode = location.country_code;
    if (location.timezone) {
      option.dataset.timezone = location.timezone;
    }
    if (location.tier) {
      option.dataset.tier = location.tier;
    }

    locationSelect.appendChild(option);
  });
  
  // Re-enable the dropdown and confirm button
  locationSelect.disabled = false;
  const confirmBtn = document.getElementById('confirmLocationBtn') as HTMLButtonElement;
  if (confirmBtn) {
    confirmBtn.disabled = false;
  }
  
  debugLog('Location dropdown populated with', locationSelect.options.length, 'options');
}

/**
 * Handle manual location selection
 */
async function handleManualLocationSelection(selectedLocation: string): Promise<void> {
  debugLog('Manual location selected:', selectedLocation);
  await proceedWithLocation(selectedLocation, false, 'manual'); // Mark as manual selection
}

// Expose handleManualLocationSelection globally for use by location carousel
(window as any).handleManualLocationSelection = handleManualLocationSelection;


/**
 * Proceed with selected location
 */
async function proceedWithLocation(
  location: string, 
  isDetectedLocation: boolean = false, 
  locationSource: string = 'unknown'
): Promise<void> {
  debugLog('Proceeding with location:', location, 'isDetectedLocation:', isDetectedLocation, 'source:', locationSource);
  
  // Set the global location FIRST - this is critical for router
  window.tempLocation = location;
  window.tempLocationIsDetected = isDetectedLocation; // Track if this was actually detected
  window.tempLocationSource = locationSource; // Track the source: 'detected', 'manual', 'default'
  debugLog('Set window.tempLocation to:', window.tempLocation);

  // Store in cookie for future visits
  setLocationCookie(location, locationSource);

  // Clear any cached data from previous location/date to prevent showing stale data
  clearAllCachedData();

  // Hide splash screen and show app with fade transition
  const splashScreen = document.getElementById('splashScreen');
  const appShell = document.getElementById('appShell');

  if (splashScreen) {
    // Start fade-out transition
    splashScreen.classList.add('fade-out');
    
    // After transition completes, fully hide splash screen and restore body scroll
    setTimeout(() => {
      splashScreen.style.display = 'none';
      splashScreen.classList.remove('fade-out');
      
      // Re-enable body scroll when splash screen is hidden (restore for iOS Safari)
      const savedScrollY = (window as any).savedScrollY || 0;
      document.body.style.position = '';
      document.body.style.top = '';
      document.body.style.width = '';
      document.body.style.overflow = '';
      document.documentElement.style.overflow = '';
      // Restore scroll position
      if (savedScrollY) {
        window.scrollTo(0, savedScrollY);
        delete (window as any).savedScrollY;
      }
    }, 1500); // Match transition duration
  }

  if (appShell) {
    appShell.style.display = 'grid'; // Explicitly set to grid
    appShell.classList.remove('hidden');
    
    // Skip fade-in transition when loading data - make visible immediately
    // so loading spinner is visible right away
    appShell.classList.remove('fading-in');
    appShell.classList.add('fade-in'); // Make fully visible immediately
  }

  // Scroll to top when transitioning from splash screen to app
  window.scrollTo({ top: 0, behavior: 'instant' });
  document.documentElement.scrollTop = 0;
  document.body.scrollTop = 0;

  // Initialise the main app FIRST (this sets up the DOM elements)
  // This will call displayLocationAndFetchData() which calls fetchHistoricalData()
  // which calls showInitialLoadingState() - and now appShell is visible so loading will show
  debugLog('Calling mainAppLogic after location change');
  window.mainAppLogic();

  // THEN navigate to Today page (router will now see window.tempLocation is set)
  debugLog('Navigating to Today page after location selection');
  
  // Activate the router now that everything is initialised
  if (window.TempHistRouter && typeof window.TempHistRouter.handleRoute === 'function') {
    window.TempHistRouter.handleRoute();
  }
  
  if (window.TempHistRouter && typeof window.TempHistRouter.navigate === 'function') {
    window.TempHistRouter.navigate('/today');
  } else {
    // Fallback: update URL and trigger route handling
    window.location.hash = '#/today';
  }
  
  // Force navigation highlighting update after a short delay
  setTimeout(() => {
    if (window.TempHistRouter && typeof window.TempHistRouter.updateNavigationHighlight === 'function') {
      window.TempHistRouter.updateNavigationHighlight('/today');
    }
  }, 200);
}

/**
 * Clear all cached data when location or date changes
 */
function clearAllCachedData(): void {
  debugLog('Clearing all cached data due to location/date change');
  
  // Clear prefetched period data
  if (window.TempHist && window.TempHist.cache) {
    window.TempHist.cache.prefetch = {};
    window.TempHist.cache.prefetchPromise = undefined;
  }
  
  // Clear lazy loader cache
  LazyLoader.clearCache();
  
  // Clear data cache
  DataCache.clear();
  
  // Destroy any existing charts to prevent stale data display
  const chartElements = [
    document.getElementById('tempChart'),
    document.getElementById('weekChart'),
    document.getElementById('monthChart'),
    document.getElementById('yearChart')
  ];
  
  chartElements.forEach(canvas => {
    if (canvas && Chart) {
      const existingChart = Chart.getChart(canvas);
      if (existingChart) {
        debugLog('Destroying existing chart on', canvas.id);
        existingChart.destroy();
      }
    }
  });
  
  // Reset the global chart variable to ensure clean state
  window.TempHist = window.TempHist || {};
  window.TempHist.mainChart = null;
  
  // Clear text content of summary, average, and trend elements
  const textElements = [
    'summaryText', 'avgText', 'trendText',
    'weekSummaryText', 'weekAvgText', 'weekTrendText',
    'monthSummaryText', 'monthAvgText', 'monthTrendText',
    'yearSummaryText', 'yearAvgText', 'yearTrendText'
  ];
  
  textElements.forEach(elementId => {
    const element = document.getElementById(elementId);
    if (element) {
      element.textContent = '';
    }
  });
  
  // Clear any loading states and error messages
  const loadingElements = document.querySelectorAll('.loading');
  loadingElements.forEach(el => {
    el.classList.add('hidden');
    el.classList.remove('visible');
  });
  
  const errorContainers = document.querySelectorAll('.error-container');
  errorContainers.forEach(el => {
    (el as HTMLElement).style.display = 'none';
  });
  
  // Clear any incomplete data warnings from previous location
  const incompleteDataWarning = document.getElementById('incompleteDataWarning');
  if (incompleteDataWarning) {
    incompleteDataWarning.remove();
    debugLog('Removed incomplete data warning from previous location');
  }
  
  // Clear loading intervals and reset loading state
  clearAllLoadingIntervals();
  
  debugLog('All cached data cleared');
}

/**
 * Check if we need to clear data due to date change
 */
function checkAndHandleDateChange(): boolean {
  const now = new Date();
  const useYesterday = now.getHours() < 1;
  const dateToUse = new Date(now);
  if (useYesterday) {
    dateToUse.setDate(dateToUse.getDate() - 1);
  }
  
  // Handle 29 Feb fallback to 28 Feb if not a leap year
  const isLeapDay = dateToUse.getDate() === 29 && dateToUse.getMonth() === 1;
  if (isLeapDay) {
    dateToUse.setDate(28);
  }
  
  const currentIdentifier = `${String(dateToUse.getMonth() + 1).padStart(2, '0')}-${String(dateToUse.getDate()).padStart(2, '0')}`;
  
  // Check if we have a stored identifier and if it's different from current
  const lastIdentifier = (window.TempHist as any)?.lastIdentifier;
  if (lastIdentifier && lastIdentifier !== currentIdentifier) {
    debugLog('Date change detected:', lastIdentifier, '->', currentIdentifier);
    clearAllCachedData();
    (window.TempHist as any).lastIdentifier = currentIdentifier;
    return true;
  }
  
  // Store current identifier
  window.TempHist = window.TempHist || {};
  (window.TempHist as any).lastIdentifier = currentIdentifier;
  return false;
}

/**
 * Helper function to process prefetched period data results
 */
function processPrefetchResult(
  periodName: string,
  result: PromiseSettledResult<any>,
  cacheKey: 'week' | 'month' | 'year'
): void {
  if (result.status === 'fulfilled') {
    window.TempHist.cache.prefetch[cacheKey] = result.value.data;
    debugLog(`Prefetch: ${periodName} data cached successfully`);
  } else {
    const isAborted = result.reason?.name === 'AbortError' || result.reason?.message?.includes('aborted');
    if (isAborted) {
      debugLog(`Prefetch: ${periodName} data aborted (likely due to navigation)`);
    } else {
      debugLog(`Prefetch: ${periodName} data failed`, result.status, result.reason?.message);
    }
  }
}

/**
 * Start prefetching period data (week, month, year) in background
 */
function startPeriodDataPrefetch(): void {
  debugLog('Starting background prefetch for period data...');
        
  // Get current date for identifier
  const now = new Date();
  const useYesterday = now.getHours() < 1;
  const dateToUse = new Date(now);
  if (useYesterday) {
    dateToUse.setDate(dateToUse.getDate() - 1);
  }
  
  // Handle 29 Feb fallback to 28 Feb if not a leap year
  const isLeapDay = dateToUse.getDate() === 29 && dateToUse.getMonth() === 1;
  if (isLeapDay) {
    dateToUse.setDate(28);
  }
  
  const identifier = `${String(dateToUse.getMonth() + 1).padStart(2, '0')}-${String(dateToUse.getDate()).padStart(2, '0')}`;
  const location = window.tempLocation!;
  
  // Prefetch period data using DataCache (same system as period pages)
  const periods: ('week' | 'month' | 'year')[] = ['week', 'month', 'year'];
  
  periods.forEach(periodKey => {
    // Check if already cached
    const cacheKey = DataCache.generateTemperatureKey(periodKey, location, identifier);
    if (DataCache.get(cacheKey)) {
      debugLog(`Prefetch: ${periodKey} data already cached, skipping`);
      return;
    }
    
    // Start background fetch
    debugLog(`Prefetch: Starting background fetch for ${periodKey} data`);
    fetchTemperatureDataAsync(periodKey, location, identifier)
      .then(data => {
        // Cache the result
        DataCache.set(cacheKey, data, 10 * 60 * 1000); // 10 minutes TTL
        debugLog(`Prefetch: ${periodKey} data cached successfully`);
      })
      .catch(error => {
        debugLog(`Prefetch: Failed to fetch ${periodKey} data:`, error);
      });
  });
  
  debugLog('Background prefetch initiated for all period data');
}

/**
 * Render the About page content
 */
function renderAboutPage(): void {
  const aboutView = document.getElementById('aboutView');
  if (!aboutView) return;

  // Clear existing content
  aboutView.textContent = '';

  // Create container
  const container = document.createElement('div');
  container.className = 'container';

  // Create elements safely
  const title = document.createElement('h2');
  title.textContent = 'About TempHist';

  const intro = document.createElement('p');
  intro.textContent = 'TempHist shows you how today\'s temperature compares to the same date over the past 50 years. It can also compare this past week, month or year with the same period over the past 50 years.';

  const howItWorksTitle = document.createElement('h3');
  howItWorksTitle.textContent = 'How it works';
  const howItWorksText = document.createElement('p');
  howItWorksText.textContent = 'TempHist uses your location to fetch historical weather data and displays it in an easy-to-read chart. Each bar represents the temperature on this date, or this past week/month/year, in a different year, with the current year highlighted in green.';

  const dataSourcesTitle = document.createElement('h3');
  dataSourcesTitle.textContent = 'Data sources';
  const dataSourcesText = document.createElement('p');
  dataSourcesText.textContent = 'Weather and climate data are provided via the TempHist API, which sources historical weather data from trusted meteorological providers.';

  const contactTitle = document.createElement('h3');
  contactTitle.textContent = 'Contact';
  const contactText = document.createElement('p');
  contactText.textContent = 'TempHist is operated by Turnpiece Ltd. For questions or feedback, please visit ';
  const contactLink = document.createElement('a');
  contactLink.href = 'https://turnpiece.com';
  contactLink.textContent = 'turnpiece.com';
  contactLink.rel = 'noopener noreferrer';
  contactText.appendChild(contactLink);
  contactText.appendChild(document.createTextNode('.'));

  // Append all elements
  container.appendChild(title);
  container.appendChild(intro);
  container.appendChild(howItWorksTitle);
  container.appendChild(howItWorksText);
  container.appendChild(dataSourcesTitle);
  container.appendChild(dataSourcesText);
  container.appendChild(contactTitle);
  container.appendChild(contactText);

  aboutView.appendChild(container);
}

/**
 * Render the Privacy page content
 */
function renderPrivacyPage(): void {
  const privacyView = document.getElementById('privacyView');
  if (!privacyView) return;

  // Clear existing content
  privacyView.textContent = '';

  // Create container
  const container = document.createElement('div');
  container.className = 'container';

  // Create elements safely
  const title = document.createElement('h2');
  title.textContent = 'Privacy Policy';

  const effectiveDate = document.createElement('p');
  effectiveDate.textContent = 'Effective date: September 2025';

  const intro = document.createElement('p');
  intro.textContent = 'TempHist, operated by Turnpiece Ltd., respects your privacy.';

  // No personal data section
  const noDataTitle = document.createElement('h3');
  noDataTitle.textContent = 'No personal data collected';
  const noDataText = document.createElement('p');
  noDataText.textContent = 'TempHist does not collect, store, or share any personal information.';

  // Location use section
  const locationTitle = document.createElement('h3');
  locationTitle.textContent = 'Location use';
  const locationText = document.createElement('p');
  locationText.textContent = 'If you grant permission, the app uses your current location once to retrieve historical weather data for your area. Location data is never shared but is temporarily stored in a cookie on your machine for one hour.';

  // Third-party services section
  const thirdPartyTitle = document.createElement('h3');
  thirdPartyTitle.textContent = 'Third-party services and cookies';
  const thirdPartyText = document.createElement('p');
  thirdPartyText.textContent = 'TempHist uses Firebase for anonymous authentication, which may set third-party cookies from Google services (including identitytoolkit.googleapis.com and securetoken.googleapis.com). These cookies are used solely for authentication purposes and do not track personal information or enable cross-site tracking.';

  const cookieUsageText = document.createElement('p');
  const strongText = document.createElement('strong');
  strongText.textContent = 'Third-party cookie usage:';
  cookieUsageText.appendChild(strongText);
  cookieUsageText.appendChild(document.createTextNode(' Firebase authentication may use third-party cookies to maintain your anonymous session. These cookies are essential for the app\'s authentication functionality and are not used for advertising or tracking purposes.'));

  // No tracking section
  const noTrackingTitle = document.createElement('h3');
  noTrackingTitle.textContent = 'No tracking or analytics';
  const noTrackingText = document.createElement('p');
  noTrackingText.textContent = 'The app does not include analytics, advertising or third-party tracking beyond the authentication service mentioned above. We do not use cookies for tracking, advertising, or cross-site user profiling.';

  // Data sources section
  const dataSourcesTitle = document.createElement('h3');
  dataSourcesTitle.textContent = 'Data sources';
  const dataSourcesText = document.createElement('p');
  dataSourcesText.textContent = 'Weather and climate data are provided via the TempHist API, which sources historical weather data from trusted providers. Requests are processed anonymously.';

  // Contact section
  const contactTitle = document.createElement('h3');
  contactTitle.textContent = 'Contact';
  const contactText = document.createElement('p');
  contactText.textContent = 'If you have questions, please contact Turnpiece Ltd. at ';
  const contactLink = document.createElement('a');
  contactLink.href = 'https://turnpiece.com';
  contactLink.textContent = 'https://turnpiece.com';
  contactLink.rel = 'noopener noreferrer';
  contactText.appendChild(contactLink);
  contactText.appendChild(document.createTextNode('.'));

  // Append all elements
  container.appendChild(title);
  container.appendChild(effectiveDate);
  container.appendChild(intro);
  container.appendChild(noDataTitle);
  container.appendChild(noDataText);
  container.appendChild(locationTitle);
  container.appendChild(locationText);
  container.appendChild(thirdPartyTitle);
  container.appendChild(thirdPartyText);
  container.appendChild(cookieUsageText);
  container.appendChild(noTrackingTitle);
  container.appendChild(noTrackingText);
  container.appendChild(dataSourcesTitle);
  container.appendChild(dataSourcesText);
  container.appendChild(contactTitle);
  container.appendChild(contactText);

  privacyView.appendChild(container);
}

// Make mainAppLogic globally available
window.mainAppLogic = function(): void {
  // Check if this is a standalone page (privacy, about) - don't run main app logic
  const isStandalonePage = !document.querySelector('#todayView');
  if (isStandalonePage) {
    debugLog('Standalone page detected, skipping main app logic');
    // Still set up mobile navigation for standalone pages
    setupMobileNavigation();
    return;
  }
  
  // Scroll to top when initialising the app (in case page was scrolled)
  window.scrollTo({ top: 0, behavior: 'instant' });
  document.documentElement.scrollTop = 0;
  document.body.scrollTop = 0;
  
  debugLog('mainAppLogic called with window.tempLocation:', window.tempLocation);

  // Check for date changes and clear cache if needed
  checkAndHandleDateChange();

  // Wait for Chart.js to be available
  if (typeof Chart === 'undefined') {
    console.error('Chart.js not loaded');
    return;
  }

  if (window['chartjs-plugin-annotation']) {
    Chart.register(window['chartjs-plugin-annotation']);
  }

  debugLog('Constants initialized');
  
  const now = new Date();
  const useYesterday = now.getHours() < 1;
  const dateToUse = new Date(now);

  debugLog('Date calculations complete:', { now, useYesterday, dateToUse });

  if (useYesterday) {
    dateToUse.setDate(dateToUse.getDate() - 1);
    debugLog('Using yesterday\'s date');
  }
  
  // Handle 29 Feb fallback to 28 Feb if not a leap year in comparison range
  const isLeapDay = dateToUse.getDate() === 29 && dateToUse.getMonth() === 1;

  if (isLeapDay) {
    dateToUse.setDate(28);
    updateDataNotice('29th February detected — comparing 28th Feb instead for consistency.');
    debugLog('Leap day detected, using 28th Feb instead');
  }

  const day = String(dateToUse.getDate()).padStart(2, '0');
  const month = String(dateToUse.getMonth() + 1).padStart(2, '0');
  const currentYear = dateToUse.getFullYear();

  debugLog('Date components prepared:', { day, month, currentYear });

  const startYear = currentYear - 50;
  const loadingEl = document.getElementById('loading');
  const tempChartNode = document.getElementById('tempChart');

  if (!tempChartNode) {
    console.error('Temperature chart canvas element not found in DOM');
    return;
  }

  if (!(tempChartNode instanceof HTMLCanvasElement)) {
    console.error('Temperature chart element is not a <canvas>. Cannot initialize chart.');
    return;
  }

  const canvasEl = tempChartNode;
  
  // Clean up any existing chart on the main canvas before starting
    const existingChart = Chart.getChart(canvasEl);
    if (existingChart) {
      debugLog('Destroying existing chart before creating new one');
      existingChart.destroy();
    }
  
  // Also reset the global chart reference
  window.TempHist = window.TempHist || {};
  window.TempHist.mainChart = null;

  const barColour = '#ff6b6b';
  const showTrend = true;

  // whether or not to show the chart
  let chart: any;
  
  // Reset the global chart variable to ensure clean state
  window.TempHist = window.TempHist || {};
  window.TempHist.mainChart = null;

  const friendlyDate = `${getOrdinal(Number(day))} ${new Date().toLocaleString('en-GB', { month: 'long' })}`;

  // display the date
  const dateTextEl = document.getElementById('dateText');
  if (dateTextEl) {
    dateTextEl.textContent = friendlyDate;
  }
  
  // Show initial status message
  updateDataNotice('Determining your location...', { type: 'neutral' });

  // Apply colors to text elements
  function applyTextColors(): void {
    // Text colors
    const summaryText = document.getElementById('summaryText');
    const avgText = document.getElementById('avgText');
    const trendText = document.getElementById('trendText');
    const header = document.getElementById('header');
    const spinner = document.querySelector('.spinner');
    
    // Apply colors only if elements exist
    if (summaryText) summaryText.classList.add('summary-text');
    if (avgText) avgText.classList.add('avg-text');
    if (trendText) trendText.classList.add('trend-text');
    
    // Header colors
    if (header) (header as HTMLElement).style.color = barColour;
    
    // Spinner colors
    if (spinner) {
      (spinner as HTMLElement).style.borderColor = `${barColour}33`; // 20% opacity
      (spinner as HTMLElement).style.borderTopColor = barColour;
    }
  }

  // Apply colors when the page loads
  applyTextColors();

  // Ensure loading state is hidden initially
  if (loadingEl) {
    loadingEl.classList.add('hidden');
    loadingEl.classList.remove('visible');
  }

  debugLog('DOM elements and variables initialized');

  // Use global tempLocation - it should be set by splash screen or cookie
  // If not set, use default (this should only happen in error cases)
  if (!window.tempLocation) {
    window.tempLocation = DEFAULT_LOCATION;
  }

  // Shared chart creation function for both Today and period pages
  function createTemperatureChart(
    ctx: CanvasRenderingContext2D,
    chartData: ChartDataPoint[],
    averageData: { temp: number },
    periodTitle: string,
    friendlyDate: string,
    minTemp: number,
    maxTemp: number,
    startYear: number,
    currentYear: number
  ): any {
    // Safety check: ensure context is valid
    if (!ctx || !ctx.canvas) {
      throw new Error('Invalid canvas context provided to createTemperatureChart');
    }
    
    // Start performance measurement
    const endChartMeasurement = PerformanceMonitor.startMeasurement('chart_creation');
    
    const barColour = CHART_COLORS.BAR;
  const thisYearColour = CHART_COLORS.THIS_YEAR;
  const trendColour = CHART_COLORS.TREND;
  const avgColour = CHART_COLORS.AVERAGE;
    const showTrend = true;

    return new Chart(ctx, {
      type: 'bar',
      data: {
        datasets: [
          {
            label: 'Trend',
            type: 'line',
            data: [],
            backgroundColor: trendColour,
            borderColor: trendColour,
            fill: false,
            pointRadius: 0,
            borderWidth: 2,
            opacity: 1,
            hidden: !showTrend
          },
          {
            label: `Temperature in ${getDisplayCity(window.tempLocation!)} ${periodTitle === 'Today' ? `on ${friendlyDate}` : `for ${periodTitle}`}`,
            type: 'bar',
            data: chartData,
            backgroundColor: chartData.map(point => 
              point.y === currentYear ? thisYearColour : barColour
            ),
            borderWidth: 0,
            base: minTemp
          }
        ]
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        parsing: false,
        animation: { duration: 0 },
        normalized: true,
        layout: {
          padding: {
            left: 0,
            right: 20,
            top: 15,
            bottom: 15
          }
        },
        plugins: {
          legend: { display: false },
          annotation: {
            annotations: {
              averageLine: {
                type: 'line',
                yMin: startYear - 1,
                yMax: currentYear + 1,
                xMin: averageData.temp,
                xMax: averageData.temp,
                borderColor: avgColour,
                borderWidth: 2,
                label: {
                  display: true,
                  content: `Average: ${averageData.temp.toFixed(1)}°C`,
                  position: 'start',
                  font: {
                    size: 12
                  }
                }
              }
            }
          },
          tooltip: {
            callbacks: {
              title: function(context: any) {
                return `${context[0].parsed.y.toString()}: ${context[0].parsed.x}°C`
              },
              label: function() {
                return ''
              }
            }
          }
        },
        scales: {
          x: {
            type: 'linear',
            title: {
              display: true,
              text: 'Temperature (°C)',
              font: {
                size: CHART_FONT_SIZE_MEDIUM
              },
              color: CHART_AXIS_COLOR
            },
            min: minTemp,
            max: maxTemp,
            ticks: {
              font: {
                size: CHART_FONT_SIZE_SMALL
              },
              color: CHART_AXIS_COLOR,
              stepSize: 2,
              callback: function(value: any) {
                return value;
              }
            }
          },
          y: {
            type: 'linear',
            min: startYear,
            max: currentYear,
            ticks: {
              maxTicksLimit: 20,
              callback: (val: any) => val.toString(),
              font: {
                size: CHART_FONT_SIZE_SMALL
              },
              color: CHART_AXIS_COLOR
            },
            title: {
              display: false,
              text: 'Year'
            },
            grid: {
              display: false
            },
            offset: true
          }
        },
        elements: {
          bar: {
            minBarLength: 30,
            maxBarThickness: 30,
            categoryPercentage: 0.1,
            barPercentage: 1.0
          }
        }
      }
    });
  }

  // Render function for period pages (week, month, year)
  async function renderPeriod(sectionId: string, periodKey: 'week' | 'month' | 'year', title: string): Promise<void> {
    const sec = document.getElementById(sectionId);
    if (!sec) return;

    // Check if the app is properly initialised
    if (!window.tempLocation) {
      // Wait a bit for the app to initialise
      await new Promise(resolve => setTimeout(resolve, 100));
      if (!window.tempLocation) {
        debugLog('renderPeriod: No location found, using default');
        window.tempLocation = DEFAULT_LOCATION;
      }
    } else {
      debugLog('renderPeriod: Using existing location:', window.tempLocation);
    }

    // Check if Firebase auth is ready
    if (!window.currentUser) {
      // Wait for Firebase auth to be ready
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    // Get current date for display
    const now = new Date();
    const useYesterday = now.getHours() < 1;
    const dateToUse = new Date(now);
    if (useYesterday) {
      dateToUse.setDate(dateToUse.getDate() - 1);
    }
    
    // Handle 29 Feb fallback to 28 Feb if not a leap year
    const isLeapDay = dateToUse.getDate() === 29 && dateToUse.getMonth() === 1;
    if (isLeapDay) {
      dateToUse.setDate(28);
    }
    
    const day = dateToUse.getDate();
    const monthName = dateToUse.toLocaleString('en-GB', { month: 'long' });
    const friendlyDate = `${getOrdinal(day)} ${monthName}`;
    
    // Match Today page layout exactly
    sec.innerHTML = `
      <div class="container">
        <h2 id="${periodKey}DateText" class="date-heading"></h2>
        <div id="${periodKey}LocationText" class="standard-text"></div>
        <div id="${periodKey}DataNotice" class="notice"></div>
        <div id="${periodKey}SummaryText" class="standard-text summary-text"></div>
        
        <div class="chart-container">
          <div id="${periodKey}Loading" class="loading">
            <div class="spinner"></div>
            <p id="${periodKey}LoadingText" class="loading-text">${INITIAL_LOADING_TEXT}</p>
          </div>
          
          <div id="${periodKey}ErrorContainer" class="error-container" style="display: none;">
            <div class="error-content">
              <div id="${periodKey}ErrorMessage" class="error-message"></div>
              <button id="${periodKey}ReloadButton" class="reload-button">Reload</button>
            </div>
          </div>
          
          <canvas id="${periodKey}Chart"></canvas>
        </div>
        
        <div id="${periodKey}AvgText" class="standard-text avg-text"></div>
        <div id="${periodKey}TrendText" class="standard-text trend-text"></div>
        <div id="${periodKey}IncompleteDataNotice" class="notice" style="display: none;"></div>
      </div>
    `;

    const loadingEl = document.getElementById(`${periodKey}Loading`) as HTMLElement;
    const periodCanvasNode = document.getElementById(`${periodKey}Chart`);
    
    if (!periodCanvasNode) {
      debugLog(`${periodKey}: Canvas element not found in DOM`);
      return;
    }
    
    if (!(periodCanvasNode instanceof HTMLCanvasElement)) {
      debugLog(`${periodKey}: Expected a <canvas> element but found`, periodCanvasNode?.nodeName);
      return;
    }
    
    const canvas = periodCanvasNode;
    
    // Ensure canvas element exists and is in the DOM
    if (!canvas.parentNode || !document.contains(canvas)) {
      debugLog(`${periodKey}: Canvas element not in DOM`);
      return;
    }
    
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      debugLog(`${periodKey}: Could not get canvas context`);
      return;
    }
    
    debugLog(`${periodKey} canvas dimensions:`, {
      width: canvas.clientWidth,
      height: canvas.clientHeight,
      offsetWidth: canvas.offsetWidth,
      offsetHeight: canvas.offsetHeight
    });
    
    // Ensure canvas has proper dimensions
    canvas.width = canvas.clientWidth || 800;
    canvas.height = canvas.clientHeight || 400;

    // Set the date text immediately (needed for page title)
    const dateTextEl = document.getElementById(`${periodKey}DateText`);
    if (dateTextEl) {
      dateTextEl.textContent = `${title} ending ${friendlyDate}`;
    }
    
    // Set location text immediately (like Today page)
    const currentLocation = window.tempLocation!;
    const displayLocation = getDisplayCity(currentLocation);
    const locationTextElement = document.getElementById(`${periodKey}LocationText`);
    if (locationTextElement) {
      // Add classes based on location source
      locationTextElement.className = `location-text location-${window.tempLocationSource || 'unknown'}`;
      
      // Show location with edit icon
      locationTextElement.innerHTML = generateLocationDisplayHTML(displayLocation, periodKey);
      
      // Add click handler for the edit icon
      const changeLocationBtn = document.getElementById(`changeLocationBtn-${periodKey}`);
      if (changeLocationBtn) {
        changeLocationBtn.addEventListener('click', (e) => {
          e.preventDefault();
          handleChangeLocation();
        });
      }
    }
    
    // Show loading state
    loadingEl.classList.add('visible');
    loadingEl.classList.remove('hidden');
    canvas.classList.add('hidden');
    canvas.classList.remove('visible');

    // Clear any existing loading intervals to prevent conflicts
    clearAllLoadingIntervals();
    
    // Start dynamic loading messages for this period
    const periodLoadingInterval = LoadingManager.startPeriodLoading(periodKey);

    try {
      // Use same caching system as Today page (DataCache)
      const identifier = `${String(dateToUse.getMonth() + 1).padStart(2, '0')}-${String(dateToUse.getDate()).padStart(2, '0')}`;
      
      // Check cache first (if feature flag is enabled)
      let weatherData: any;
      if (FeatureFlags.isEnabled('data_caching')) {
        const cacheKey = DataCache.generateTemperatureKey(periodKey, window.tempLocation!, identifier);
        debugLog(`${periodKey}: Checking cache with key:`, cacheKey);
        weatherData = DataCache.get(cacheKey);
        
        if (weatherData) {
          debugLog(`${periodKey}: Using cached data`);
        } else {
          debugLog(`${periodKey}: No cached data found`);
        }
      } else {
        debugLog(`${periodKey}: Data caching disabled by feature flag`);
      }
      
      if (!weatherData) {
        // Progress callback for async job
        const onProgress = (status: AsyncJobResponse) => {
          debugLog(`${periodKey} job progress:`, status);
        };

        debugLog(`Starting ${periodKey} data fetch...`);
        weatherData = await fetchTemperatureDataAsync(periodKey, window.tempLocation!, identifier, onProgress);
        
        // Cache the result (if feature flag is enabled)
        if (FeatureFlags.isEnabled('data_caching')) {
          const cacheKey = DataCache.generateTemperatureKey(periodKey, window.tempLocation!, identifier);
          DataCache.set(cacheKey, weatherData, 10 * 60 * 1000); // 10 minutes TTL
          debugLog(`${periodKey}: Data cached for future use`);
        }
      }
      
      // Extract the data from the result
      debugLog(`${periodKey} data structure:`, weatherData);
      
      // Handle both prefetched data (direct format) and fresh API data (job result format)
      let temperatureData: any[], averageData: any, trendData: any, summaryData: any, metadata: any;
      
      if (weatherData.data && weatherData.data.values) {
        // Fresh API data (job result format)
        temperatureData = weatherData.data.values;
        averageData = { temp: weatherData.data.average.mean };
        trendData = weatherData.data.trend;
        summaryData = weatherData.data.summary;
        metadata = weatherData.data.metadata;
      } else if (weatherData.values) {
        // Prefetched data (direct format)
        temperatureData = weatherData.values;
        averageData = { temp: weatherData.average.mean };
        trendData = weatherData.trend;
        summaryData = weatherData.summary;
        metadata = weatherData.metadata;
      } else {
        throw new Error('Invalid data format received. Expected values array.');
      }
      
      if (!Array.isArray(temperatureData)) {
        throw new Error('Temperature data is not an array.');
      }
      
      // Check data completeness and show warning if needed
      debugLog(`Checking data completeness for ${periodKey} data, metadata:`, metadata);
      const isDataComplete = checkDataCompleteness(metadata, periodKey);
      if (!isDataComplete) {
        debugLog(`${periodKey}: Data is incomplete or unavailable`);
        // If data is 0% complete (fatal error), stop processing and show error
        if (metadata && metadata.completeness === 0) {
          debugLog(`No data available for ${periodKey} (0% completeness), stopping data processing`);
          return;
        }
        debugLog(`${periodKey}: Data is incomplete but present, continuing with warning notice`);
      } else {
        debugLog(`${periodKey}: Data is complete, no warning needed`);
      }

      // Update the chart with the weather data
      const chartData = transformToChartData(temperatureData);
      debugLog(`${periodKey} chart data:`, chartData);
      debugLog(`${periodKey} chart data length:`, chartData.length);
      debugLog(`${periodKey} sample chart data point:`, chartData[0]);
      
      // Calculate temperature range for chart scaling
      const tempRange = calculateTemperatureRange(chartData);
      const minTemp = tempRange.min;
      const maxTemp = tempRange.max;
      
      // Get year range
      const years = chartData.map(d => d.y);
      const minYear = Math.min(...years);
      const maxYear = Math.max(...years);
      
      // Get the actual current year (for highlighting the current year in green)
      const actualCurrentYear = new Date().getFullYear();
      
      // Skip minimum loading time if using cached data for instant display
      const isUsingCachedData = weatherData && FeatureFlags.isEnabled('data_caching');
      
      if (isUsingCachedData) {
        // Show chart immediately for cached data
        actuallyShowPeriodChart();
      } else {
        // Ensure minimum loading time has elapsed (3 seconds) to show cycling messages for fresh data
        const minLoadingTime = LOADING_TIMEOUTS.MIN_LOADING_TIME * 1000; // Convert to milliseconds
        const elapsedTime = 0; // LoadingManager handles timing internally
        const remainingTime = Math.max(0, minLoadingTime - elapsedTime);
        
        if (remainingTime > 0) {
          setTimeout(() => {
            actuallyShowPeriodChart();
          }, remainingTime);
        } else {
          actuallyShowPeriodChart();
        }
      }
      
      function actuallyShowPeriodChart() {
        // Hide loading and show chart
        loadingEl.classList.add('hidden');
        loadingEl.classList.remove('visible');
        canvas.classList.add('visible');
        canvas.classList.remove('hidden');
        
        // Clear the loading message interval
        LoadingManager.stopPeriodLoading(periodLoadingInterval);

        // Create chart using shared function
        if (!ctx) {
          throw new Error('Canvas context not available');
        }
        
        const chart = createTemperatureChart(
          ctx,
          chartData,
          averageData,
          title,
          friendlyDate,
          minTemp,
          maxTemp,
          minYear,
          actualCurrentYear  // Use actual current year instead of maxYear
        );

        // Update trend line if enabled
        if (chart && chart.data && chart.data.datasets) {
          // chartData is now {x: temperature, y: year} (after transformation), but calculateTrendLine expects {x: year, y: temperature}
          const calculatedTrendData = calculateTrendLine(chartData.map(d => ({ x: d.y, y: d.x })), 
            minYear - 0.5, maxYear + 0.5);
          chart.data.datasets[0].data = calculatedTrendData.points.map(p => ({ x: p.y, y: p.x }));
          chart.update();
        }
        
        // Show chart elements since data loaded successfully
        showChartElements(periodKey);

        // Location text is already set at the beginning (like Today page)
        
        // Update summary, average, and trend text
        const summaryTextEl = document.getElementById(`${periodKey}SummaryText`);
        const avgTextEl = document.getElementById(`${periodKey}AvgText`);
        const trendTextEl = document.getElementById(`${periodKey}TrendText`);
        
        if (summaryTextEl) {
          summaryTextEl.textContent = summaryData || 'No summary available.';
          summaryTextEl.classList.add('summary-text');
        }
        
        if (avgTextEl) {
          avgTextEl.textContent = `Average: ${averageData.temp.toFixed(1)}°C`;
          avgTextEl.classList.add('avg-text');
        }
        
        if (trendTextEl) {
          // Use actual slope value for direction determination, not rounded display value
          const direction = Math.abs(trendData.slope) < 0.05 ? 'stable' : 
                           trendData.slope > 0 ? 'rising' : 'falling';
          const formatted = `Trend: ${direction} at ${Math.abs(trendData.slope).toFixed(1)}${trendData.unit || '°C/decade'}`;
          trendTextEl.textContent = formatted;
          trendTextEl.classList.add('trend-text');
        }

        // Add reload button functionality
        const reloadButton = document.getElementById(`${periodKey}ReloadButton`);
        if (reloadButton) {
          reloadButton.addEventListener('click', () => {
            // Re-trigger the render function
            window.TempHistViews[periodKey]?.render?.();
          });
        }
      }

    } catch (error) {
      debugLog(`Error fetching ${periodKey} data:`, error);
      
      // Check if this is an abort error (user navigated away)
      const isAbortError = error instanceof Error && (
        error.name === 'AbortError' || 
        error.message.includes('aborted') ||
        error.message.includes('AbortError')
      );
      
      if (isAbortError) {
        debugLog(`${periodKey} data fetch aborted (likely due to navigation)`);
        // Silently handle abort - don't show error to user
        return;
      }
      
      // Show error state only for real errors
      loadingEl.classList.add('hidden');
      loadingEl.classList.remove('visible');
      
      // Clear the loading message interval
      LoadingManager.stopPeriodLoading(periodLoadingInterval);
      
      const errorContainer = document.getElementById(`${periodKey}ErrorContainer`);
      const errorMessageElement = document.getElementById(`${periodKey}ErrorMessage`);
      
      if (errorContainer && errorMessageElement) {
        errorContainer.style.display = 'block';
        
        // Generate context-specific error message
        const errorMessage = generateErrorMessage(error);
        errorMessageElement.textContent = errorMessage;
        
        // Add reload button functionality
        const reloadButton = document.getElementById(`${periodKey}ReloadButton`);
        if (reloadButton) {
          reloadButton.addEventListener('click', () => {
            // Re-trigger the render function
            window.TempHistViews[periodKey]?.render?.();
          });
        }
      }
    }
  }

  // Main async data fetching function
  async function fetchHistoricalData(): Promise<void> {
    Logger.startPerformance('fetchHistoricalData');
    debugTime('Total fetch time');
    
    // Destroy any existing chart before starting
    if (canvasEl) {
      const existingChart = Chart.getChart(canvasEl);
      if (existingChart) {
        debugLog('Destroying existing chart before fetching new data');
        existingChart.destroy();
        chart = null; // Reset the chart variable
      }
    }
    
    // Ensure appShell is visible before showing loading state
    // This is especially important when transitioning from splash screen
    const appShell = document.getElementById('appShell');
    if (appShell && appShell.classList.contains('fading-in')) {
      // If still fading in, ensure loading state will be visible when fade completes
      // Remove fading-in and make visible immediately so loading is visible
      appShell.classList.remove('fading-in');
      appShell.classList.add('fade-in');
    }
    
    showInitialLoadingState();
    hideError();

    try {
      // Check temperature data server health first (with timeout)
      const isApiHealthy = await Promise.race([
        checkApiHealth(),
        new Promise<boolean>((_, reject) => setTimeout(() => reject(new Error('Health check timeout')), API_CONFIG.HEALTH_CHECK_TIMEOUT))
      ]).catch(() => {
        console.warn('Health check failed or timed out, proceeding anyway...');
        return true; // Proceed anyway if health check fails
      });
      
      if (!isApiHealthy) {
        console.warn('API health check failed, but proceeding with data fetch...');
      }

      // Fetch weather data using async jobs
      const identifier = `${month}-${day}`;
      debugLog('About to fetch data - tempLocation:', window.tempLocation, 'identifier:', identifier);
      
      // Check cache first (if feature flag is enabled)
      let jobResult;
      if (FeatureFlags.isEnabled('data_caching')) {
        const cacheKey = DataCache.generateTemperatureKey('daily', window.tempLocation!, identifier);
        debugLog('Checking cache for key:', cacheKey);
        jobResult = DataCache.get(cacheKey);
        
        if (jobResult) {
          debugLog('Daily: Using cached data');
        } else {
          debugLog('No cached data found');
        }
      }
      
      if (!jobResult) {
      debugLog('About to call fetchTemperatureDataAsync - no cached data');
      // Progress callback for async job
      const onProgress = (status: AsyncJobResponse) => {
        debugLog('Daily job progress:', status);
      };

      debugLog('Starting async daily data fetch...');
        jobResult = await fetchTemperatureDataAsync('daily', window.tempLocation!, identifier, onProgress);
        
        // Cache the result (if feature flag is enabled)
        if (FeatureFlags.isEnabled('data_caching')) {
          const cacheKey = DataCache.generateTemperatureKey('daily', window.tempLocation!, identifier);
          DataCache.set(cacheKey, jobResult, 10 * 60 * 1000); // 10 minutes TTL
          debugLog('Daily: Data cached for future use');
        }
      }
      
      // Extract the data from the job result
      const jobResultData = jobResult as any;
      debugLog('Job result structure:', jobResult);
      debugLog('Extracted weather data:', jobResultData);
      
      // Validate jobResult exists and has expected structure
      if (!jobResultData) {
        throw new Error('No data received from API. The server may be unavailable or returned an empty response.');
      }
      
      // Job result contains the temperature data in the 'data' property
      if (!jobResultData.data || !jobResultData.data.values || !Array.isArray(jobResultData.data.values)) {
        throw new Error('Invalid data format received. Expected data.values array.');
      }
      
      const temperatureData = jobResultData.data.values;
      const averageData = { temp: jobResultData.data.average.mean };
      const trendData = jobResultData.data.trend;
      const summaryData = jobResultData.data.summary;
      const metadata = jobResultData.data.metadata;
      
      if (!Array.isArray(temperatureData)) {
        throw new Error('Temperature data is not an array.');
      }
      
      // Check data completeness and show warning if needed
      debugLog('Checking data completeness for daily data, metadata:', metadata);
      const isDataComplete = checkDataCompleteness(metadata, 'daily');
      if (!isDataComplete) {
        debugLog('Daily data is incomplete or unavailable');
        // If data is 0% complete (fatal error), stop processing and show error
        if (metadata && metadata.completeness === 0) {
          debugLog('No data available (0% completeness), stopping data processing');
          // Stop loading manager and hide loading spinner
          LoadingManager.stopGlobalLoading();
          if (loadingEl) {
            loadingEl.classList.add('hidden');
            loadingEl.classList.remove('visible');
          }
          if (canvasEl) {
            canvasEl.classList.add('hidden');
            canvasEl.classList.remove('visible');
          }
          return;
        }
        debugLog('Daily data is incomplete but present, continuing with warning notice');
      } else {
        debugLog('Daily data is complete, no warning needed');
      }

      // Update the chart with the weather data
      // API returns data in {year, temperature} format, transform to {x: temperature, y: year} for horizontal bars
      const chartData = transformToChartData(temperatureData);
      
      debugLog('Raw weather data:', temperatureData);
      debugLog('Chart data:', chartData);
      
      // Create or update chart
      if (!chart) {
        debugTime('Chart initialisation');
        
        // Double-check that no chart exists on this canvas
        const existingChart = Chart.getChart(canvasEl);
        if (existingChart) {
          debugLog('Found existing chart during creation, destroying it first');
          existingChart.destroy();
        }
        
        // Ensure canvas element is still in the DOM
        if (!canvasEl || !canvasEl.parentNode || !document.contains(canvasEl)) {
          throw new Error('Canvas element is not in the DOM');
        }
        
        const ctx = (canvasEl as HTMLCanvasElement).getContext('2d');
        if (!ctx) {
          throw new Error('Could not get canvas context');
        }
        
        // Calculate available height for bars
        const numBars = currentYear - startYear + 1;
        const targetBarHeight = 3;
        const totalBarHeight = numBars * targetBarHeight;
        const containerEl = canvasEl?.parentElement;
        const containerHeight = containerEl?.clientHeight || 800;
        const availableHeight = containerHeight - 40;
        
        // Calculate temperature range
        const tempRange = calculateTemperatureRange(chartData);
        
        debugLog('Initial chart setup:', {
          windowWidth: window.innerWidth,
          targetBarHeight,
          numBars,
          totalBarHeight,
          containerHeight,
          availableHeight,
          canvasHeight: canvasEl?.clientHeight,
          minTemp: tempRange.min,
          maxTemp: tempRange.max
        });

        chart = createTemperatureChart(
          ctx,
          chartData,
          averageData,
          'Today',
          friendlyDate,
          tempRange.min,
          tempRange.max,
          startYear,
          currentYear
        );
        
        // Store the chart reference globally for proper cleanup
        window.TempHist = window.TempHist || {};
        window.TempHist.mainChart = chart;
        
        // Show chart elements since data loaded successfully
        showChartElements();
        
        debugTimeEnd('Chart initialisation');
      }

      // Update trend line if enabled
      if (showTrend && chart && chart.data && chart.data.datasets) {
        // chartData is now {x: temperature, y: year} (after transformation), but calculateTrendLine expects {x: year, y: temperature}
        const trendData = calculateTrendLine(chartData.map(d => ({ x: d.y, y: d.x })), 
          startYear - 0.5, currentYear + 0.5);
        chart.data.datasets[0].data = trendData.points.map(p => ({ x: p.y, y: p.x }));
      }

      // Update text elements with new API data
      const summaryTextEl = document.getElementById('summaryText');
      const avgTextEl = document.getElementById('avgText');
      const trendTextEl = document.getElementById('trendText');
      
      if (summaryTextEl) summaryTextEl.textContent = summaryData || 'No summary available.';
      if (avgTextEl) avgTextEl.textContent = `Average: ${averageData.temp.toFixed(1)}°C`;
      
      if (trendData && trendTextEl) {
        // Use actual slope value for direction determination, not rounded display value
        const direction = Math.abs(trendData.slope) < 0.05 ? 'stable' : 
                         trendData.slope > 0 ? 'rising' : 'falling';
        const formatted = `Trend: ${direction} at ${Math.abs(trendData.slope).toFixed(1)}${trendData.unit}`;
        trendTextEl.textContent = formatted;
      }

      // Show the chart
      showChart();
      chart.update();

      // Send analytics after successful data load (only if Firebase is authenticated)
      if (window.currentUser) {
        sendAnalytics();
      }

      // Start prefetching period data in background after Today page data is loaded
      startPeriodDataPrefetch();

    } catch (error) {
      console.error('Error fetching historical data:', error);
      
      // Check if this is an abort error (user navigated away)
      const isAbortError = error instanceof Error && (
        error.name === 'AbortError' || 
        error.message.includes('aborted') ||
        error.message.includes('AbortError') ||
        error.message.includes('Request aborted')
      );
      
      if (isAbortError) {
        debugLog('Daily data fetch aborted (likely due to navigation)');
        // Silently handle abort - don't show error to user
        // Timer will be ended in finally block
        return;
      }
      
      hideChart();
      
      // Generate context-specific error message
      const errorMessage = generateErrorMessage(error);
      showError(errorMessage);
    } finally {
      // Always end the timer, even if function returns early
      debugTimeEnd('Total fetch time');
      // End chart creation measurement
      PerformanceMonitor.recordMetric('chart_creation_complete', performance.now());
    }
  }

  // Loading message functions are now handled by LoadingManager

  // Legacy function removed - LoadingManager handles this

  // Show initial loading state (only after date and location are known)
  function showInitialLoadingState(): void {
    const loadingEl = document.getElementById('loading');
    const canvasEl = document.getElementById('tempChart');
    
    if (loadingEl) {
      loadingEl.classList.add('visible');
      loadingEl.classList.remove('hidden');
    }
    
    if (canvasEl) {
      canvasEl.classList.add('hidden');
      canvasEl.classList.remove('visible');
    }
    
    // Start global loading messages
    LoadingManager.startGlobalLoading();
    
    // Set initial loading text
    const loadingText = document.getElementById('loadingText');
    if (loadingText) {
      loadingText.textContent = INITIAL_LOADING_TEXT;
    }
  }



  // Utility functions for error UI
  function showError(message: string): void {
    const errorContainer = document.getElementById('errorContainer');
    const errorMessage = document.getElementById('errorMessage');
    if (!errorContainer || !errorMessage) {
      console.warn('Error UI elements not found in DOM when showError called');
      return;
    }
    
    // Stop loading manager first
    LoadingManager.stopGlobalLoading();
    
    if (loadingEl) {
      loadingEl.classList.add('hidden');
      loadingEl.classList.remove('visible');
    }
    
    if (canvasEl) {
      canvasEl.classList.remove('visible');
      canvasEl.classList.add('hidden');
    }
    
    errorMessage.textContent = message;
    errorContainer.style.display = 'block';
  }

  function hideError(): void {
    const errorContainer = document.getElementById('errorContainer');
    if (errorContainer) {
      errorContainer.style.display = 'none';
      const errorMessage = document.getElementById('errorMessage');
      if (errorMessage) {
        errorMessage.textContent = '';
      }
    }
  }

  function showChart(): void {
    // Ensure minimum loading time has elapsed (3 seconds) to show cycling messages
    const minLoadingTime = LOADING_TIMEOUTS.MIN_LOADING_TIME * 1000; // Convert to milliseconds
    const elapsedTime = 0; // LoadingManager handles timing internally
    const remainingTime = Math.max(0, minLoadingTime - elapsedTime);
    
    if (remainingTime > 0) {
      setTimeout(() => {
        actuallyShowChart();
      }, remainingTime);
    } else {
      actuallyShowChart();
    }
  }
  
  function actuallyShowChart(): void {
    LoadingManager.stopGlobalLoading();

    if (loadingEl) {
      loadingEl.classList.add('hidden');
      loadingEl.classList.remove('visible');
    }

    if (canvasEl) {
      canvasEl.classList.add('visible');
      canvasEl.classList.remove('hidden');
    }

    // Log performance and completion
    const duration = Logger.endPerformance('fetchHistoricalData');
    // End performance measurement
    PerformanceMonitor.recordMetric('data_fetch_complete', performance.now());
    Logger.info('Historical data fetch completed', {
      duration,
      location: window.tempLocation,
      dataPoints: 0 // Will be updated when data is available
    });
    
    // Only show success message if there's no incomplete data notice
    const incompleteDataWarning = document.getElementById('incompleteDataWarning');
    
    if (!incompleteDataWarning) {
      // Clear the data notice
      updateDataNotice('', {
        debugOnly: true,
        useStructuredHtml: true,
        type: 'success',
        title: '✅ Temperature data loaded successfully!',
        subtitle: `Showing data for ${getDisplayCity(window.tempLocation!)}`
      });
    } else {
      debugLog('Skipping success message because incomplete data warning is present');
    }
    
    if (canvasEl) {
      // Ensure the canvas element still exists before updating
      if (canvasEl.parentNode && document.contains(canvasEl)) {
        // Get the chart instance directly from the canvas element (more reliable than closure variable)
        const registeredChart = Chart.getChart(canvasEl);
        if (registeredChart) {
          try {
            registeredChart.update();
            // Also update the closure variable and global reference to keep them in sync
            chart = registeredChart;
            if (window.TempHist) {
              window.TempHist.mainChart = registeredChart;
            }
          } catch (error) {
            console.error('Error updating chart:', error);
            // If update fails, try to destroy and recreate on next render
            try {
              registeredChart.destroy();
            } catch (destroyError) {
              console.error('Error destroying chart:', destroyError);
            }
            // Reset chart references
            chart = null;
            if (window.TempHist) {
              window.TempHist.mainChart = null;
            }
          }
        } else {
          debugLog('No chart instance found on canvas element, skipping update');
          // Reset chart references if no chart is registered
          chart = null;
          if (window.TempHist) {
            window.TempHist.mainChart = null;
          }
        }
      } else {
        debugLog('Canvas element no longer in DOM, skipping chart update');
      }
    }
  }

  function hideChart(): void {
    // This function is now only called when we're about to fetch data
    // The loading state should already be shown by showInitialLoadingState()
    // Just ensure the chart is hidden
    if (canvasEl) {
      canvasEl.classList.remove('visible');
      canvasEl.classList.add('hidden');
    }
  }

  // Calculate trend line
  function calculateTrendLine(points: ChartDataPoint[], startX: number, endX: number) {
    const n = points.length;
    const sumX = points.reduce((sum, p) => sum + p.x, 0);
    const sumY = points.reduce((sum, p) => sum + p.y, 0);
    const sumXY = points.reduce((sum, p) => sum + p.x * p.y, 0);
    const sumXX = points.reduce((sum, p) => sum + p.x * p.x, 0);

    const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;

    return {
      points: [
        { x: startX, y: slope * startX + intercept },
        { x: endX, y: slope * endX + intercept }
      ],
      slope
    };
  }

  // Make calculateTrendLine globally available for period views
  window.calculateTrendLine = calculateTrendLine;

  function displayLocationAndFetchData(): void {
    debugLog('displayLocationAndFetchData called with window.tempLocation:', window.tempLocation);
    
    // Check if using the hardcoded default fallback location
    const isDefaultLocation = window.tempLocation === DEFAULT_LOCATION && 
                              window.tempLocationIsDetected === false;
    const cityName = getDisplayCity(window.tempLocation!);
    const locationDisplay = isDefaultLocation ? 
      `${cityName} (default location)` : 
      cityName;
    
    // Create location display with edit icon
    const locationTextElement = document.getElementById('locationText');
    if (locationTextElement) {
      // Add classes based on location source
      locationTextElement.className = `location-text location-${window.tempLocationSource || 'unknown'}`;
      
      // Show location with edit icon
      locationTextElement.innerHTML = generateLocationDisplayHTML(locationDisplay);
      
      // Add click handler for the edit icon
      const changeLocationBtn = document.getElementById('changeLocationBtn');
      if (changeLocationBtn) {
        changeLocationBtn.addEventListener('click', (e) => {
          e.preventDefault();
          handleChangeLocation();
        });
      }
    }
    
    // Clear the initial status message
    const locationMessage = isDefaultLocation ? 
      `📍 Using default location: <strong>${getDisplayCity(window.tempLocation!)}</strong><br><small>Enable location permissions for your actual location</small>` :
      `📍 Location detected: <strong>${getDisplayCity(window.tempLocation!)}</strong>`;
    
    updateDataNotice('', {
      debugOnly: true,
      useStructuredHtml: true,
      type: 'success',
      title: locationMessage,
      subtitle: INITIAL_LOADING_TEXT
    });
    
    setLocationCookie(window.tempLocation!, window.tempLocationSource!);
    
    fetchHistoricalData();
  }

  // Debounced location change handler
  const debouncedLocationChange = Debouncer.debounce(
    'location-change',
    () => {
      debugLog('Debounced location change triggered');
      handleLocationChangeInternal();
    },
    500, // 500ms debounce
    false
  );

  // Handle change location - navigate to splash screen
  function handleChangeLocation(): void {
    Logger.logUserInteraction('change_location_clicked');
    debugLog('Change location clicked, debouncing...');
    debouncedLocationChange();
  }

  // Internal location change handler (called after debounce)
  function handleLocationChangeInternal(): void {
    debugLog('Change location executed, navigating to splash screen');
    
    // Destroy all charts before navigating away to prevent stale references
    clearAllCachedData();
    
    // Show splash screen
    const splashScreen = document.getElementById('splashScreen');
    const appShell = document.getElementById('appShell');
    
    if (splashScreen) {
      splashScreen.style.display = 'flex';
      // Prevent body scroll when splash screen is visible (especially important for iOS Safari)
      const scrollY = window.scrollY;
      document.body.style.position = 'fixed';
      document.body.style.top = `-${scrollY}px`;
      document.body.style.width = '100%';
      document.body.style.overflow = 'hidden';
      document.documentElement.style.overflow = 'hidden';
      // Store scroll position for restoration
      (window as any).savedScrollY = scrollY;
      // Reset splash screen scroll to top
      splashScreen.scrollTop = 0;
    }
    if (appShell) {
      appShell.classList.add('hidden');
    }
    
    // Reset splash screen to initial state
    const locationLoading = document.getElementById('locationLoading');
    const splashActions = document.querySelector('.splash-actions');
    const manualLocationSection = document.getElementById('manualLocationSection');
    
    if (locationLoading) locationLoading.style.display = 'none';
    if (splashActions) (splashActions as HTMLElement).style.display = 'flex';
    if (manualLocationSection) manualLocationSection.style.display = 'none';
    
    // Navigate to today page
    Logger.logNavigation('location_change', '/today');
    if (window.TempHistRouter && typeof window.TempHistRouter.navigate === 'function') {
      window.TempHistRouter.navigate('/today');
    } else {
      window.location.hash = '#/today';
    }
    
    // Re-setup splash screen event listeners (in case they were lost)
    setupSplashScreenListeners();
    
    // Reset carousel state (scroll position and arrow visibility)
    // Use requestAnimationFrame to ensure splash screen is fully rendered
    requestAnimationFrame(() => {
      setTimeout(() => {
        resetCarouselState();
      }, 50);
    });
    
    // Prefetch approved locations for selection
    prefetchApprovedLocations();
  }

  // If we already have a location (from splash screen), proceed with data fetching
  if (window.tempLocation) {
    displayLocationAndFetchData();
  }

  // Register view renderers after renderPeriod is defined
  window.TempHistViews.week = { render: () => renderPeriod('weekView', 'week', 'Week') };
  window.TempHistViews.month = { render: () => renderPeriod('monthView', 'month', 'Month') };
  window.TempHistViews.year = { render: () => renderPeriod('yearView', 'year', 'Year') };
  window.TempHistViews.about = { render: () => renderAboutPage() };
  window.TempHistViews.privacy = { render: () => renderPrivacyPage() };
  
  // Register views with router
  if (window.TempHistRouter && typeof (window.TempHistRouter as any).registerView === 'function') {
    (window.TempHistRouter as any).registerView('week', window.TempHistViews.week);
    (window.TempHistRouter as any).registerView('month', window.TempHistViews.month);
    (window.TempHistRouter as any).registerView('year', window.TempHistViews.year);
    (window.TempHistRouter as any).registerView('about', window.TempHistViews.about);
    (window.TempHistRouter as any).registerView('privacy', window.TempHistViews.privacy);
  }

  // Router will be activated after location is set in proceedWithLocation
};

// Simple router implementation
class TempHistRouter {
  private views: Record<string, { render: () => void | Promise<void> }> = {};

  constructor() {
    debugLog('Router constructor called');
    // Listen for hash changes
    window.addEventListener('hashchange', () => {
      debugLog('Hash change detected');
      this.handleRoute();
    });
    
    // Listen for popstate events (back/forward buttons)
    window.addEventListener('popstate', () => {
      debugLog('Popstate event detected');
      this.handleRoute();
    });
    
    // Handle initial route when router is created
    setTimeout(() => {
      debugLog('Handling initial route');
      this.handleRoute();
    }, 100);
  }

  navigate(path: string): void {
    debugLog('Router navigating to:', path);
    window.location.hash = `#${path}`;
    this.handleRoute();
  }

  handleRoute(): void {
    debugLog('Router handling route change');
    
    // Clear any existing loading intervals when navigating
    clearAllLoadingIntervals();
    
    // Get current route from hash
    const hash = window.location.hash;
    const route = hash === '' ? '/today' : hash.substring(1); // Remove # prefix
    
    debugLog('Current route:', route);
    
    // Hide all views first
    const allViews = document.querySelectorAll('[data-view]');
    allViews.forEach(view => {
      (view as HTMLElement).hidden = true;
    });
    
    // Show the appropriate view
    let viewElement: HTMLElement | null = null;
    let viewKey: string = '';
    
    switch (route) {
      case '/today':
        viewElement = document.getElementById('todayView');
        viewKey = 'today';
        break;
      case '/week':
        viewElement = document.getElementById('weekView');
        viewKey = 'week';
        break;
      case '/month':
        viewElement = document.getElementById('monthView');
        viewKey = 'month';
        break;
      case '/year':
        viewElement = document.getElementById('yearView');
        viewKey = 'year';
        break;
      case '/about':
        viewElement = document.getElementById('aboutView');
        viewKey = 'about';
        break;
      case '/privacy':
        viewElement = document.getElementById('privacyView');
        viewKey = 'privacy';
        break;
      default:
        debugLog('Unknown route, defaulting to today');
        viewElement = document.getElementById('todayView');
        viewKey = 'today';
        this.navigate('/today');
        return;
    }
    
    if (viewElement) {
      viewElement.hidden = false;
      debugLog('Showing view:', viewKey);
      
      // Scroll to top when navigating to a new page
      // Use requestAnimationFrame to ensure DOM is updated first
      requestAnimationFrame(() => {
        window.scrollTo({ top: 0, behavior: 'instant' });
        document.documentElement.scrollTop = 0;
        document.body.scrollTop = 0;
        
        // Also scroll any scrollable containers to top
        const viewOutlet = document.getElementById('viewOutlet');
        if (viewOutlet) {
          viewOutlet.scrollTop = 0;
        }
      });
      
      // Update navigation highlighting
      this.updateNavigationHighlight(route);
      
      // Render the view if it has a render function
      if (this.views[viewKey] && typeof this.views[viewKey].render === 'function') {
        debugLog('Rendering view:', viewKey);
        const renderResult = this.views[viewKey].render();
        if (renderResult instanceof Promise) {
          renderResult.then(() => {
            // Scroll to top again after rendering is complete
            requestAnimationFrame(() => {
              window.scrollTo({ top: 0, behavior: 'instant' });
              document.documentElement.scrollTop = 0;
              document.body.scrollTop = 0;
              const viewOutlet = document.getElementById('viewOutlet');
              if (viewOutlet) {
                viewOutlet.scrollTop = 0;
              }
            });
          }).catch(() => {
            // Scroll to top even if render fails
            requestAnimationFrame(() => {
              window.scrollTo({ top: 0, behavior: 'instant' });
              document.documentElement.scrollTop = 0;
              document.body.scrollTop = 0;
            });
          });
        } else {
          // If render doesn't return a promise, scroll after a brief delay
          setTimeout(() => {
            window.scrollTo({ top: 0, behavior: 'instant' });
            document.documentElement.scrollTop = 0;
            document.body.scrollTop = 0;
            const viewOutlet = document.getElementById('viewOutlet');
            if (viewOutlet) {
              viewOutlet.scrollTop = 0;
            }
          }, 100);
        }
      } else if (viewKey === 'today') {
        // Today view doesn't have a separate render function, it's handled by mainAppLogic
        debugLog('Today view - no additional rendering needed');
        // Scroll to top after a brief delay to ensure content is loaded
        setTimeout(() => {
          window.scrollTo({ top: 0, behavior: 'instant' });
          document.documentElement.scrollTop = 0;
          document.body.scrollTop = 0;
          const viewOutlet = document.getElementById('viewOutlet');
          if (viewOutlet) {
            viewOutlet.scrollTop = 0;
          }
        }, 100);
      }
    } else {
      console.error('View element not found for route:', route);
    }
  }
  
  updateNavigationHighlight(route: string): void {
    debugLog('Updating navigation highlight for route:', route);
    
    // Use a small delay to ensure DOM is ready
    setTimeout(() => {
      // Try multiple selectors to find nav items
      let navItems = document.querySelectorAll('nav a[data-route]');
      if (navItems.length === 0) {
        // Fallback: try to find nav items without data-route attribute
        navItems = document.querySelectorAll('nav a');
        debugLog('No items with data-route found, trying all nav links:', navItems.length);
      }
      
      debugLog('Found nav items:', navItems.length);
      
      // Remove active class from all nav items
      navItems.forEach(item => {
        item.classList.remove('active');
      });
      
      // Add active class to current route
      let activeItem = document.querySelector(`nav a[data-route="${route}"]`);
      
      if (!activeItem) {
        // Fallback: try to match by href
        activeItem = document.querySelector(`nav a[href="#${route}"]`);
        debugLog('Trying href fallback for route:', `#${route}`);
      }
      
      if (activeItem) {
        activeItem.classList.add('active');
        debugLog('Highlighted nav item for route:', route, 'element:', activeItem);
        debugLog('Active item classes:', activeItem.className);
        debugLog('Active item computed styles:', {
          color: window.getComputedStyle(activeItem).color,
          fontWeight: window.getComputedStyle(activeItem).fontWeight,
          textDecoration: window.getComputedStyle(activeItem).textDecoration
        });
        // Force a style update
        (activeItem as HTMLElement).style.color = '';
        (activeItem as HTMLElement).style.fontWeight = '';
        (activeItem as HTMLElement).style.textDecoration = '';
      } else {
        debugLog('No nav item found for route:', route);
        // Try to find any nav items to debug
        const allNavItems = document.querySelectorAll('nav a');
        debugLog('All nav links found:', allNavItems.length);
        allNavItems.forEach((item, index) => {
          debugLog(`Nav item ${index}:`, item.getAttribute('href'), item.getAttribute('data-route'));
        });
      }
    }, 50);
  }
  
  registerView(key: string, view: { render: () => void | Promise<void> }): void {
    this.views[key] = view;
  }
}

// Initialise router
window.TempHistRouter = new TempHistRouter();

// Make analytics functions globally available
window.TempHistAnalytics = reportAnalytics;
window.TempHistSendAnalytics = sendAnalytics;

// Initialise mobile navigation for all pages
document.addEventListener('DOMContentLoaded', () => {
  setupMobileNavigation();
  
  // Add window resize listener to handle dynamic burger button visibility
  window.addEventListener('resize', handleWindowResize);
});

// Also set it up immediately if DOM is already loaded
if (document.readyState === 'loading') {
  // DOM is still loading, wait for DOMContentLoaded
} else {
  // DOM is already loaded
  setupMobileNavigation();
  
  // Add window resize listener to handle dynamic burger button visibility
  window.addEventListener('resize', handleWindowResize);
}
