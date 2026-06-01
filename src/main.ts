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
import { renderAboutPage, renderPrivacyPage } from './views/about';
import { SNAPSHOTS_ENABLED } from './constants';
import { renderFeedPage } from './views/feed';
import { TempHistRouter } from './routing/router';
import { reportAnalytics, sendAnalytics, setupAnalyticsReporting } from './analytics/analytics';
import { setupMobileNavigation, handleWindowResize, initializeSplashScreen } from './splash/splash';
import { showFatalError, hideChartElements, showChartElements, hideIncompleteDataNotice, reapplyTrendBackground } from './utils/uiHelpers';
import { isSharePagePath, initSharePage } from './share';
// installDevTestHooks is loaded dynamically inside the DEBUGGING guard below so it is
// excluded from production bundles entirely. To re-enable, ensure DEBUGGING is true (i.e.
// run the dev server) — no code change needed.


// Initialise location carousel when DOM is ready
document.addEventListener('DOMContentLoaded', async () => {
  await initLocationCarousel();
  startGeolocationPrefetch();
});


// Import types
import type { FirebaseUser } from './types/index.js';

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
window.TempHistViews.today = { render: () => reapplyTrendBackground() };
window.TempHistViews.week = { render: () => renderPeriod('weekView', 'week', 'Week') };
window.TempHistViews.month = { render: () => renderPeriod('monthView', 'month', 'Month') };
window.TempHistViews.year = { render: () => renderPeriod('yearView', 'year', 'Year') };
window.TempHistViews.about = { render: () => renderAboutPage() };
window.TempHistViews.privacy = { render: () => renderPrivacyPage() };
if (SNAPSHOTS_ENABLED) {
  window.TempHistViews.feed = { render: () => renderFeedPage() };
}

// Note: The old mainAppLogic function body has been extracted to:
// - views/today.ts (Today view logic)
// - views/period.ts (Period views logic)
// - views/about.ts (About/Privacy pages)
// All remaining initialization code is below.

// Initialize router and register views (not needed on share pages or standalone
// static pages — the router hides all [data-view] elements and would blank the content)
const standalonePages = ['/about', '/privacy', '/privacy/app', ...(SNAPSHOTS_ENABLED ? ['/feed'] : [])];
const isStandaloneStaticPage = standalonePages.includes(window.location.pathname);
if (!isSharePagePath() && !isStandaloneStaticPage) {
  window.TempHistRouter = new TempHistRouter();
  if (window.TempHistRouter && typeof window.TempHistRouter.registerView === 'function') {
    window.TempHistRouter.registerView('today', window.TempHistViews.today);
    window.TempHistRouter.registerView('week', window.TempHistViews.week);
    window.TempHistRouter.registerView('month', window.TempHistViews.month);
    window.TempHistRouter.registerView('year', window.TempHistViews.year);
    window.TempHistRouter.registerView('about', window.TempHistViews.about);
    window.TempHistRouter.registerView('privacy', window.TempHistViews.privacy);
    if (SNAPSHOTS_ENABLED) {
      window.TempHistRouter.registerView('feed', window.TempHistViews.feed);
    }
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
