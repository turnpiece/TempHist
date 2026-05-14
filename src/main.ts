// Allow Chart.js tooltip innerHTML writes under Trusted Types CSP
if (typeof window !== 'undefined' && (window as any).trustedTypes?.createPolicy) {
  (window as any).trustedTypes.createPolicy('default', {
    createHTML: (s: string) => s,
    createScriptURL: (s: string) => s,
  });
}

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
import { getDisplayCity, getOrdinal } from './utils/location';
import { updateDataNotice } from './utils/dataNotice';
import { DataCache } from './utils/DataCache';
import { ErrorBoundary } from './utils/ErrorBoundary';
import { Logger, LogLevel } from './utils/Logger';
import { getApiUrl } from './api/temperature';
import { initLocationCarousel } from './services/locationCarousel';
import { mainAppLogic } from './views/today';
import { renderPeriod } from './views/period';
import { renderAboutPage, renderPrivacyPage } from './views/about';
import { TempHistRouter } from './routing/router';
import { reportAnalytics, sendAnalytics, setupAnalyticsReporting } from './analytics/analytics';
import { setupMobileNavigation, handleWindowResize, initializeSplashScreen } from './splash/splash';
import { clearAllLoadingIntervals, checkDataCompleteness, showFatalError, hideChartElements, showChartElements, hideIncompleteDataNotice } from './utils/uiHelpers';
import { isSharePagePath, initSharePage } from './share';


// Initialise location carousel when DOM is ready
document.addEventListener('DOMContentLoaded', async () => {
  // ...your existing code...
  await initLocationCarousel();
});


// Import types
import type { 
  ChartDataPoint, 
  FirebaseUser
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
// Legacy functions for backward compatibility (exported from utils/uiHelpers)
// Re-export for backward compatibility with router
export { clearAllLoadingIntervals } from './utils/uiHelpers';

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

/**
 * Update trend line on chart with calculated trend data
 * @param chart - The Chart.js chart instance
 * @param chartData - The chart data points (format: {x: temperature, y: year})
 * @param startYear - The starting year for trend calculation
 * @param endYear - The ending year for trend calculation
 */
function updateChartTrendLine(
  chart: any,
  chartData: ChartDataPoint[],
  startYear: number,
  endYear: number
): void {
  if (!chart || !chart.data || !chart.data.datasets) {
    return;
  }
  
  // Use global calculateTrendLine function (available via window.calculateTrendLine)
  const calculateTrendLineFn = window.calculateTrendLine;
  if (!calculateTrendLineFn) {
    console.warn('calculateTrendLine not available');
    return;
  }
  
  // chartData is {x: temperature, y: year}, but calculateTrendLine expects {x: year, y: temperature}
  const calculatedTrendData = calculateTrendLineFn(
    chartData.map((d: ChartDataPoint) => ({ x: d.y, y: d.x })), 
    startYear - 0.5, 
    endYear + 0.5
  );
  chart.data.datasets[0].data = calculatedTrendData.points.map((p: { x: number; y: number }) => ({ x: p.y, y: p.x }));
  chart.update();
}

/**
 * Update summary, average, and trend text elements
 */
function updateSummaryTextElements(
  summaryText: string | null,
  averageData: { temp: number; stdDev?: number },
  trendData: { slope: number; slopeError?: number; unit?: string },
  periodKey: string = ''
): void {
  const summaryElId = periodKey ? `${periodKey}SummaryText` : 'summaryText';
  const avgElId = periodKey ? `${periodKey}AvgText` : 'avgText';
  const trendElId = periodKey ? `${periodKey}TrendText` : 'trendText';
  const summaryTextEl = document.getElementById(summaryElId);
  const avgTextEl = document.getElementById(avgElId);
  const trendTextEl = document.getElementById(trendElId);

  if (summaryTextEl) {
    summaryTextEl.textContent = summaryText || 'No summary available.';
    if (periodKey) {
      summaryTextEl.classList.add('summary-text');
    }
  }

  if (avgTextEl) {
    let avgStr = `mean: ${averageData.temp.toFixed(1)}°C`;
    if (averageData.stdDev !== undefined) {
      avgStr += ` ± ${averageData.stdDev.toFixed(1)}°C`;
    }
    avgTextEl.textContent = avgStr;
    avgTextEl.classList.add('avg-text');
    wrapInStatsBubble(avgTextEl, trendTextEl);
  }

  if (trendTextEl && trendData) {
    const direction = Math.abs(trendData.slope) < 0.05 ? 'stable' :
      trendData.slope > 0 ? 'rising' : 'falling';
    const unit = trendData.unit || '°C/decade';
    const slopeAbs = Math.abs(trendData.slope);
    let trendStr = `trend: ${direction} at ${slopeAbs.toFixed(2)}${unit}`;
    if (trendData.slopeError !== undefined && Math.round(trendData.slopeError * 10) >= 1) {
      trendStr += ` ± ${trendData.slopeError.toFixed(2)}${unit}`;
    }
    trendTextEl.textContent = trendStr;
    trendTextEl.classList.add('trend-text');
  }
}

/**
 * Wrap avg and trend elements inside a shared .stats-bubble if not already done.
 */
function wrapInStatsBubble(avgEl: HTMLElement, trendEl: HTMLElement | null): void {
  if (avgEl.parentElement?.classList.contains('stats-bubble')) return;
  const bubble = document.createElement('div');
  bubble.className = 'stats-bubble';
  avgEl.parentNode?.insertBefore(bubble, avgEl);
  bubble.appendChild(avgEl);
  if (trendEl) bubble.appendChild(trendEl);
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
function hideIncompleteDataNoticeWrapper(periodKey?: string): void {
  // Use the helper from uiHelpers.ts
  hideIncompleteDataNotice(periodKey);
}

/**
 * Retry data fetch (called from the retry button)
 */
function retryDataFetch(): void {
  // Hide the incomplete data notice
  hideIncompleteDataNoticeWrapper();
  
  // Clear the data notice (for other types of notices)
  const currentView = getCurrentView();
  if (currentView === 'today') {
    updateDataNotice(null);
  } else if (currentView) {
    const noticeEl = document.getElementById(`${currentView}DataNotice`);
    if (noticeEl) {
      noticeEl.style.display = 'none';
      // Clear content (Trusted Types safe)
      while (noticeEl.firstChild) {
        noticeEl.removeChild(noticeEl.firstChild);
      }
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

  // If this is a share page (/s/:id), hand off to the share page module
  if (isSharePagePath()) {
    initSharePage();
    return;
  }

  // Initialise analytics reporting
  setupAnalyticsReporting();
  
  // Initialise splash screen functionality (now currentUser is available)
  initializeSplashScreen();
}

// Make mainAppLogic globally available
window.mainAppLogic = mainAppLogic;

// Register view renderers
window.TempHistViews.week = { render: () => renderPeriod('weekView', 'week', 'Week') };
window.TempHistViews.month = { render: () => renderPeriod('monthView', 'month', 'Month') };
window.TempHistViews.year = { render: () => renderPeriod('yearView', 'year', 'Year') };
window.TempHistViews.about = { render: () => renderAboutPage() };
window.TempHistViews.privacy = { render: () => renderPrivacyPage() };

// Note: The old mainAppLogic function body has been extracted to:
// - views/today.ts (Today view logic)
// - views/period.ts (Period views logic)
// - views/about.ts (About/Privacy pages)
// All remaining initialization code is below.

// Initialize router and register views (not needed on share pages — the router's
// constructor fires handleRoute() via setTimeout and would fight with the share
// page's own DOM setup)
if (!isSharePagePath()) {
  window.TempHistRouter = new TempHistRouter();
  if (window.TempHistRouter && typeof window.TempHistRouter.registerView === 'function') {
    window.TempHistRouter.registerView('week', window.TempHistViews.week);
    window.TempHistRouter.registerView('month', window.TempHistViews.month);
    window.TempHistRouter.registerView('year', window.TempHistViews.year);
    window.TempHistRouter.registerView('about', window.TempHistViews.about);
    window.TempHistRouter.registerView('privacy', window.TempHistViews.privacy);
  }
}

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
