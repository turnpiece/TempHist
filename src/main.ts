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
import { setLocationCookie, getLocationCookie, getDisplayCity, getOrdinal, getCountryCodeForLocation } from './utils/location';
import { updateDataNotice } from './utils/dataNotice';
import { LoadingManager } from './utils/LoadingManager';
import { LazyLoader } from './utils/LazyLoader';
import { DataCache } from './utils/DataCache';
import { ErrorBoundary } from './utils/ErrorBoundary';
import { Logger, LogLevel } from './utils/Logger';
import { getApiUrl, apiFetch, fetchTemperatureDataAsync } from './api/temperature';
import { detectUserLocationWithGeolocation, getLocationFromIP } from './services/locationDetection';
import { initLocationCarousel, renderImageAttributions } from './services/locationCarousel';
import { mainAppLogic } from './views/today';
import { renderPeriod } from './views/period';
import { renderAboutPage, renderPrivacyPage, buildAboutContent, buildPrivacyWebContent, buildPrivacyAppContent } from './views/about';
import { TempHistRouter } from './routing/router';
import { reportAnalytics, sendAnalytics } from './analytics/analytics';
import { setupMobileNavigation, handleWindowResize } from './splash/splash';
import { clearAllLoadingIntervals, buildLocationDisplay } from './utils/uiHelpers';
import { isSharePagePath, initSharePage } from './share';


// Initialise location carousel when DOM is ready
document.addEventListener('DOMContentLoaded', async () => {
  // ...your existing code...
  await initLocationCarousel();
});


// Import types
import type { 
  ChartDataPoint, 
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

// After prefetchedLocations loads, re-render any visible location heading with the correct flag
function refreshLocationFlag(): void {
  if (!window.tempLocation) return;
  const countryCode = getCountryCodeForLocation(window.tempLocation);
  if (!countryCode) return;
  const displayCity = getDisplayCity(window.tempLocation);
  // Update all visible location headings (today + active period views)
  const headings = document.querySelectorAll<HTMLElement>('.location-heading');
  headings.forEach(el => {
    if (el.offsetParent !== null) { // only update visible elements
      buildLocationDisplay(el, displayCity, '', countryCode);
    }
  });
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
 * Check if an error is an abort error (user navigated away or request cancelled)
 * @param error - The error to check
 * @returns True if the error is an abort error
 */
function isAbortError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  
  return error.name === 'AbortError' || 
         error.message.includes('aborted') ||
         error.message.includes('AbortError') ||
         error.message.includes('Request aborted');
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
      while (noticeEl.firstChild) {
        noticeEl.removeChild(noticeEl.firstChild);
      }
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
    // Clear any existing content (Trusted Types safe)
    while (noticeEl.firstChild) {
      noticeEl.removeChild(noticeEl.firstChild);
    }
    
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
    // Clear content (Trusted Types safe)
    while (noticeEl.firstChild) {
      noticeEl.removeChild(noticeEl.firstChild);
    }
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
 * Initialise splash screen functionality
 */
function initializeSplashScreen(): void {
  // Check if this is a standalone page (privacy, about) - don't show splash screen
  const isStandalonePage = !document.querySelector('#todayView');
  if (isStandalonePage) {
    debugLog('Standalone page detected, skipping splash screen');
    
    // Handle standalone pages by populating their content
    const currentPath = window.location.pathname;
    if (currentPath === '/privacy' || currentPath === '/privacy/app' || currentPath === '/about') {
      debugLog('Populating content for standalone page:', currentPath);

      // Set up mobile navigation for standalone pages
      setupMobileNavigation();

      // Populate content based on the page
      if (currentPath === '/privacy' || currentPath === '/privacy/app') {
        const contentDiv = document.getElementById('content');
        if (contentDiv) {
          contentDiv.textContent = '';
          const container = document.createElement('div');
          container.className = 'container';
          if (currentPath === '/privacy') {
            buildPrivacyWebContent(container);
          } else {
            buildPrivacyAppContent(container);
          }
          contentDiv.appendChild(container);
        }
      } else if (currentPath === '/about') {
        const contentDiv = document.getElementById('content');
        if (contentDiv) {
          contentDiv.textContent = '';
          const container = document.createElement('div');
          container.className = 'container';
          buildAboutContent(container);
          renderImageAttributions(container).catch(error => {
            console.warn('Failed to render image attributions:', error);
          });
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
    document.body.style.width = '100vw'; // Use viewport width to avoid padding overflow
    document.body.style.maxWidth = '100vw'; // Ensure it doesn't exceed viewport
    document.body.style.left = '0';
    document.body.style.right = '0';
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
    debugLog('No currentUser available after waiting, skipping location prefetch');
    window.TempHist = window.TempHist || {};
    window.TempHist.prefetchedLocations = [];
    return;
  }
  
  try {
    const locations = await loadPreapprovedLocations();
    debugLog('Approved locations prefetched:', locations.length, 'locations');
    
    // Store in a global cache for immediate use
    window.TempHist = window.TempHist || {};
    window.TempHist.prefetchedLocations = locations;

    // If a location heading is already visible (cookie fast-path rendered before prefetch),
    // re-render it now with the correct country flag
    refreshLocationFlag();
  } catch (error) {
    debugLog('Failed to prefetch approved locations:', error);
    // Store empty array if prefetch fails
    window.TempHist = window.TempHist || {};
    window.TempHist.prefetchedLocations = [];
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
    debugLog('Location loading failed, returning empty array');
    // Return empty array if loading fails
    return [];
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
  } catch (error: any) {
    console.warn('Geolocation failed:', error);
    
    // If user denied permission (error.code === 1), don't try IP fallback
    // Go directly to manual selection instead
    if (error?.code === 1) {
      debugLog('Geolocation permission denied by user, showing manual selection');
      showManualLocationSelection(true); // Pass true to indicate permission was denied
      return;
    }
  }

  // If geolocation fails for reasons other than permission denied, try IP-based fallback
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
 * Since the UI uses a location carousel (not a dropdown), this just shows
 * the splash actions which contain the carousel
 * @param permissionDenied - If true, hide the "Use my location" button and update heading text
 */
function showManualLocationSelection(permissionDenied: boolean = false): void {
  debugLog('showManualLocationSelection called', { permissionDenied });
  const splashActions = document.querySelector('.splash-actions');
  const locationLoading = document.getElementById('locationLoading');
  const useLocationBtn = document.getElementById('useLocationBtn');
  const heading = document.getElementById('location-picker-heading');

  // Hide loading indicator
  if (locationLoading) locationLoading.style.display = 'none';

  // If permission was denied, hide the "Use my location" button and update heading
  if (permissionDenied) {
    if (useLocationBtn) {
      useLocationBtn.style.display = 'none';
      debugLog('Hiding "Use my location" button (permission denied)');
    }
    if (heading) {
      heading.textContent = 'Choose a location:';
      debugLog('Updated heading text to "Choose a location:"');
    }
  } else {
    // Make sure button is visible if permission wasn't denied (e.g., other failure)
    if (useLocationBtn) {
      useLocationBtn.style.display = '';
    }
    if (heading) {
      heading.textContent = 'Or choose one:';
    }
  }

  // Show splash actions (which includes the location carousel)
  if (splashActions) {
    (splashActions as HTMLElement).style.display = 'flex';
    debugLog('Showing splash actions with location carousel');
  }

  // Ensure the location carousel is initialized if it hasn't been yet
  // The carousel will handle empty locations gracefully if prefetch hasn't completed
  const carousel = document.getElementById('location-carousel');
  if (carousel) {
    // The carousel initialization happens elsewhere, but we can check if locations are ready
    const locations = window.TempHist?.prefetchedLocations;
  if (locations) {
      debugLog('Location carousel available with', locations.length, 'prefetched locations');
  } else {
      debugLog('Location carousel will use locations when they become available');
    }
  }
}

/**
 * Hide manual location selection
 * Since the UI uses a location carousel (not a separate manual section),
 * this just shows the splash actions which contain the carousel
 */
function hideManualLocationSelection(): void {
  const splashActions = document.querySelector('.splash-actions');

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

  // Clear existing options (Trusted Types safe)
  while (locationSelect.firstChild) {
    locationSelect.removeChild(locationSelect.firstChild);
  }

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
      document.body.style.maxWidth = '';
      document.body.style.left = '';
      document.body.style.right = '';
      document.body.style.overflow = '';
      document.documentElement.style.overflow = '';
      
      // Force layout recalculation to prevent width miscalculation on mobile
      // This ensures the body and appShell recalculate their widths correctly
      void document.body.offsetHeight; // Force reflow
      
      // Restore scroll position
      if (savedScrollY) {
        window.scrollTo(0, savedScrollY);
        delete (window as any).savedScrollY;
      }
      
      // Ensure layout is correct after restoring body from fixed positioning
      // Force a layout recalculation to fix any width miscalculations on mobile
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          // Force browser to recalculate layout widths
          void document.body.offsetWidth;
          void document.documentElement.offsetWidth;
          
          const appShell = document.getElementById('appShell');
          const viewOutlet = document.getElementById('viewOutlet');
          
          if (appShell) {
            // Ensure appShell width is correct (remove any inline width if present)
            if (appShell.style.width) {
              appShell.style.width = '';
            }
            void appShell.offsetWidth; // Force reflow
          }
          
          if (viewOutlet) {
            // Ensure viewOutlet width is correct (remove any inline width if present)
            if (viewOutlet.style.maxWidth) {
              viewOutlet.style.maxWidth = '';
            }
            void viewOutlet.offsetWidth; // Force reflow
          }
          
          // Ensure body and html don't exceed viewport width
          if (document.body.scrollWidth > window.innerWidth) {
            document.body.style.maxWidth = `${window.innerWidth}px`;
          }
          if (document.documentElement.scrollWidth > window.innerWidth) {
            document.documentElement.style.maxWidth = `${window.innerWidth}px`;
          }
        });
      });
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
