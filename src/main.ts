import '@fontsource/inter/latin-400.css';
import '@fontsource/inter/latin-500.css';
import '@fontsource/inter/latin-600.css';
import '@fontsource/inter/latin-700.css';
import '../styles.scss';
import { signInAnonymously, onAuthStateChanged } from "firebase/auth";
import { app, auth } from './firebase';

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
import { startGeolocationPrefetch } from './services/geolocationPrefetch';
import { mainAppLogic } from './views/today';
import { renderPeriod } from './views/period';
import { TempHistRouter } from './routing/router';
import { reportAnalytics, sendAnalytics, setupAnalyticsReporting } from './analytics/analytics';
import { setupMobileNavigation, handleWindowResize, initializeSplashScreen } from './splash/splash';
import { showFatalError, hideChartElements, showChartElements, hideIncompleteDataNotice, reapplyTrendBackground } from './utils/uiHelpers';
import { isSharePagePath, initSharePage } from './share';
// installDevTestHooks is loaded dynamically inside the DEBUGGING guard below so it is
// excluded from production bundles entirely. To re-enable, ensure DEBUGGING is true (i.e.
// run the dev server) — no code change needed.


// Initialise location carousel and geolocation prefetch when DOM is ready —
// but only on the splash screen (index.html, where #todayView exists). Standalone
// pages (about/privacy/feed/share) have no use for the user's location and
// shouldn't trigger the browser's permission prompt.
document.addEventListener('DOMContentLoaded', async () => {
  if (!document.querySelector('#todayView')) return;
  await initLocationCarousel();
  startGeolocationPrefetch();
});


// Import types
import type { FirebaseUser } from './types/index.js';

// Global namespace and cache
globalThis.TempHist = globalThis.TempHist || {};
globalThis.TempHist.cache = globalThis.TempHist.cache || {
  prefetch: {
    // example shape expected:
    // week: { location: 'London', startISO: '2025-09-19', endISO: '2025-09-25', series: [...] }
    // month: { ... }, year: { ... }
  }
};
globalThis.TempHistViews = globalThis.TempHistViews || {};

// Global loading interval management - now handled by LoadingManager
// Legacy functions for backward compatibility (exported from utils/uiHelpers)
// Re-export for backward compatibility with router
export { clearAllLoadingIntervals } from './utils/uiHelpers';

// Error monitoring and analytics
globalThis.TempHist.analytics = globalThis.TempHist.analytics || {
  errors: [],
  apiCalls: 0,
  apiFailures: 0,
  retryAttempts: 0,
  locationFailures: 0,
  startTime: Date.now(),
  lastRequestMetadata: null,
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
  if (globalThis.TempHist?.analytics) {
    globalThis.TempHist.analytics.errors.push({
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
globalThis.DEBUGGING = DEBUGGING;
globalThis.debugLog = debugLog;
globalThis.debugTime = debugTime;
globalThis.debugTimeEnd = debugTimeEnd;

if (DEBUGGING) {
  // Dynamic import keeps testHooks out of the production bundle — Rollup eliminates this
  // branch entirely when DEBUGGING (= import.meta.env.DEV) is false at build time.
  import('./dev/testHooks').then(({ installDevTestHooks }) => installDevTestHooks(debugLog));
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
      noticeEl.replaceChildren();
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
  if (globalThis.fetchHistoricalData && typeof globalThis.fetchHistoricalData === 'function') {
    globalThis.fetchHistoricalData();
  } else {
    // Fallback to page reload if function not available
    window.location.reload();
  }
}

// Make utility functions globally available
globalThis.getApiUrl = getApiUrl;
globalThis.getOrdinal = getOrdinal;
globalThis.getDisplayCity = getDisplayCity;
globalThis.updateDataNotice = updateDataNotice;
globalThis.retryDataFetch = retryDataFetch;
globalThis.showFatalError = showFatalError;
globalThis.hideChartElements = hideChartElements;
globalThis.showChartElements = showChartElements;

// Sign in anonymously
debugLog('Starting Firebase anonymous sign-in...');
debugLog('Firebase project ID:', app.options.projectId);
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
  globalThis.currentUser = user;

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
globalThis.mainAppLogic = mainAppLogic;

// Register view renderers
globalThis.TempHistViews.today = { render: () => reapplyTrendBackground() };
globalThis.TempHistViews.week = { render: () => renderPeriod('weekView', 'week', 'Week') };
globalThis.TempHistViews.month = { render: () => renderPeriod('monthView', 'month', 'Month') };
globalThis.TempHistViews.year = { render: () => renderPeriod('yearView', 'year', 'Year') };

// Note: The old mainAppLogic function body has been extracted to:
// - views/today.ts (Today view logic)
// - views/period.ts (Period views logic)
// - views/about.ts (About/Privacy pages — now standalone-only, see splash.ts)
// All remaining initialization code is below.

// Initialize router and register views (not needed on share pages or standalone
// static pages — the router hides all [data-view] elements on the page and would
// blank the standalone page's own content, which has no matching route to restore it)
const isStandaloneStaticPage = !document.querySelector('#todayView');
if (!isSharePagePath() && !isStandaloneStaticPage) {
  globalThis.TempHistRouter = new TempHistRouter();
  if (globalThis.TempHistRouter && typeof globalThis.TempHistRouter.registerView === 'function') {
    globalThis.TempHistRouter.registerView('today', globalThis.TempHistViews.today);
    globalThis.TempHistRouter.registerView('week', globalThis.TempHistViews.week);
    globalThis.TempHistRouter.registerView('month', globalThis.TempHistViews.month);
    globalThis.TempHistRouter.registerView('year', globalThis.TempHistViews.year);
  }

  // About/Privacy/Snapshots always navigate away from the SPA — they belong in
  // the footer (now shown on every page), not the in-app sidebar nav.
  document.querySelectorAll<HTMLElement>(
    'nav a[data-route="/about"], nav a[data-route="/privacy"], nav a[data-route="/feed"]'
  ).forEach(link => {
    const li = link.closest('li');
    if (li) (li as HTMLElement).hidden = true;
  });
}

// Make analytics functions globally available
globalThis.TempHistAnalytics = reportAnalytics;
globalThis.TempHistSendAnalytics = sendAnalytics;

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
