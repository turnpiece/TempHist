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
import { getApiUrl, apiFetch, checkApiHealth, fetchTemperatureDataAsync, transformToChartData, calculateTemperatureRange } from './api/temperature';
import { detectUserLocationWithGeolocation, getLocationFromIP, getFallbackLocations } from './services/locationDetection';

// Chart styling constants
const CHART_AXIS_COLOR = '#ECECEC';
const CHART_FONT_SIZE_SMALL = 11;
const CHART_FONT_SIZE_MEDIUM = 12;

// Default location constant
const DEFAULT_LOCATION = 'London, England, United Kingdom';

// Loading text constant
const INITIAL_LOADING_TEXT = 'Loading temperature data…';

// Import types
import type { 
  ChartDataPoint, 
  AsyncJobResponse,
  FirebaseUser,
  TemperatureDataMetadata
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

// Global loading interval management
const activeLoadingIntervals = new Set<NodeJS.Timeout>();
let globalLoadingCheckInterval: NodeJS.Timeout | null = null;
let globalLoadingStartTime: number | null = null;

// Clear all loading intervals (useful when navigating between pages)
  function clearAllLoadingIntervals(): void {
    activeLoadingIntervals.forEach(interval => clearInterval(interval));
    activeLoadingIntervals.clear();
    if (globalLoadingCheckInterval) {
      clearInterval(globalLoadingCheckInterval);
      globalLoadingCheckInterval = null;
    }
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

// Global debug configuration
const DEBUGGING = true;

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
function checkDataCompleteness(metadata: TemperatureDataMetadata | undefined): boolean {
  debugLog('checkDataCompleteness called with metadata:', metadata);
  
  if (!metadata) {
    debugLog('No metadata provided, assuming data is complete');
    return true; // No metadata means we assume data is complete
  }
  
  debugLog('Metadata completeness:', metadata.completeness, '%');
  
  // Consider data incomplete if completeness is less than 100%
  const isIncomplete = metadata.completeness < 100;
  
  debugLog('Is data incomplete?', isIncomplete);
  
  if (isIncomplete) {
    debugLog('Showing incomplete data notice');
    showIncompleteDataNotice(metadata);
    return false;
  }
  
  debugLog('Data is complete, no notice needed');
  return true;
}

/**
 * Show notice for incomplete data with retry option
 */
function showIncompleteDataNotice(metadata: TemperatureDataMetadata): void {
  debugLog('showIncompleteDataNotice called with metadata:', metadata);
  
  const missingCount = metadata.missing_years.length;
  const completeness = Math.round(metadata.completeness);
  
  debugLog('Missing years count:', missingCount);
  debugLog('Completeness:', completeness, '%');
  
  const noticeHtml = `
    <div class="notice-content warning">
      <h3 class="notice-title large">Incomplete Data</h3>
      <p class="notice-subtitle secondary">
        Only ${completeness}% of the expected data is available (${metadata.available_years} of ${metadata.total_years} years).
        ${missingCount > 0 ? `${missingCount} years are missing.` : ''}
      </p>
      <p>This will affect the accuracy of the temperature trend.</p>
      <button class="btn btn-primary" onclick="retryDataFetch()">
        Try Again
      </button>
    </div>
  `;
  
  debugLog('Calling updateDataNotice with HTML:', noticeHtml);
  
  // Create a new warning element and insert it after the trend text
  const trendTextEl = document.getElementById('trendText');
  if (trendTextEl) {
    // Remove any existing warning notice first
    const existingWarning = document.getElementById('incompleteDataWarning');
    if (existingWarning) {
      existingWarning.remove();
    }
    
    // Create the warning element
    const warningEl = document.createElement('div');
    warningEl.id = 'incompleteDataWarning';
    warningEl.className = 'notice status-warning';
    warningEl.innerHTML = noticeHtml;
    
    // Insert after the trend text
    trendTextEl.parentNode?.insertBefore(warningEl, trendTextEl.nextSibling);
    debugLog('Incomplete data warning inserted after trend text');
  } else {
    debugLog('Trend text element not found, cannot place warning');
  }
  
  debugLog('updateDataNotice called');
}

/**
 * Retry data fetch (called from the retry button)
 */
function retryDataFetch(): void {
  // Remove the incomplete data warning
  const incompleteDataWarning = document.getElementById('incompleteDataWarning');
  if (incompleteDataWarning) {
    incompleteDataWarning.remove();
  }
  
  updateDataNotice(null); // Clear the notice
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

// Initialize Firebase
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
  
  // Initialize analytics reporting
  setupAnalyticsReporting();
  
  // Initialize splash screen functionality (now currentUser is available)
  initializeSplashScreen();
}

/**
 * Setup analytics reporting
 */
function setupAnalyticsReporting(): void {
  // Send analytics when page is about to unload
  window.addEventListener('beforeunload', () => {
    // Send analytics data on page unload
    sendAnalytics();
  });

  // Send analytics periodically (every 5 minutes) for long sessions
  setInterval(() => {
    if (window.TempHist.analytics.apiCalls > 0 || window.TempHist.analytics.errors.length > 0) {
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
    const analyticsData = reportAnalytics();
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
 * Initialize splash screen functionality
 */
function initializeSplashScreen(): void {
  // Check if this is a standalone page (privacy, about) - don't show splash screen
  const isStandalonePage = !document.querySelector('#todayView');
  if (isStandalonePage) {
    debugLog('Standalone page detected, skipping splash screen');
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

/**
 * Load preapproved locations from static file
 */
async function loadPreapprovedLocations(): Promise<string[]> {
  try {
    debugLog('Loading preapproved locations from static file...');
    
    // Try to load from static file first
    const response = await fetch('/data/preapproved-locations.json');
    if (response.ok) {
      const data = await response.json();
      if (data.locations && Array.isArray(data.locations)) {
        debugLog('Static file returned locations:', data.locations.length, 'locations');
        debugLog('Last updated:', data.lastUpdated);
        return data.locations;
      }
    }
    
    // Fallback to API if static file doesn't exist or is invalid
    debugLog('Static file not available, trying API...');
    const apiResponse = await apiFetch(getApiUrl('/v1/locations/preapproved'));
    if (apiResponse.ok) {
      const data = await apiResponse.json();
      debugLog('API returned locations:', data.locations?.length || 0, 'locations');
      return data.locations || [];
    }
    
    throw new Error('Both static file and API failed');
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
    
    // Set up timeout to use fallback locations after 7 seconds
    const timeoutId = setTimeout(() => {
      debugLog('Location loading timeout reached, using fallback locations');
      const fallbackLocations = getFallbackLocations();
      debugLog('Using fallback locations due to timeout:', fallbackLocations);
      populateLocationDropdown(fallbackLocations);
    }, 7000); // 7 second timeout

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
function populateLocationDropdown(locations: string[]): void {
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
    
    // Handle both API objects and fallback strings
    if (typeof location === 'object' && (location as any).name) {
      // API location object - display just city name, but store full location for API
      const locationObj = location as any;
      const displayName = locationObj.name;
      const apiString = `${locationObj.name}${locationObj.admin1 ? ', ' + locationObj.admin1 : ''}, ${locationObj.country_name}`;
      
      option.value = apiString;
      option.textContent = displayName;
    } else {
      // Fallback string location - extract city name for display
      const cityName = location.split(',')[0].trim();
      option.value = location;
      option.textContent = cityName;
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

  // Hide splash screen and show app
  const splashScreen = document.getElementById('splashScreen');
  const appShell = document.getElementById('appShell');

  if (splashScreen) {
    splashScreen.style.display = 'none';
  }

  if (appShell) {
    appShell.classList.remove('hidden');
    appShell.style.display = 'grid'; // Explicitly set to grid
  }

  // Initialize the main app FIRST (this sets up the DOM elements)
  window.mainAppLogic();

  // THEN navigate to Today page (router will now see window.tempLocation is set)
  debugLog('Navigating to Today page after location selection');
  
  // Activate the router now that everything is initialized
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
  
  // Clear loading intervals and reset loading state
  clearAllLoadingIntervals();
  globalLoadingStartTime = null;
  globalLoadingCheckInterval = null;
  
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
  debugLog('Starting period data prefetch in background...');
  
  // Use requestIdleCallback for better performance, fallback to setTimeout
  const ric = window.requestIdleCallback || ((callback: () => void) => setTimeout(callback, 0));
  
  const prefetchStartTime = Date.now();
  
  ric(() => {
    const bundlePrefetchPromise = (async () => {
      try {
        debugLog('Prefetch: Starting parallel period data fetch...');
        const fetchStartTime = Date.now();
        
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
        
        // Fetch all period data in parallel
        const [weeklyData, monthlyData, yearlyData] = await Promise.allSettled([
          fetchTemperatureDataAsync('week', location, identifier),
          fetchTemperatureDataAsync('month', location, identifier),
          fetchTemperatureDataAsync('year', location, identifier)
        ]);
        
        const fetchEndTime = Date.now();
        debugLog('Prefetch: Parallel async jobs completed in', fetchEndTime - fetchStartTime, 'ms');
        
        // Process all results using helper function
        processPrefetchResult('Weekly', weeklyData, 'week');
        processPrefetchResult('Monthly', monthlyData, 'month');
        processPrefetchResult('Yearly', yearlyData, 'year');
        
      } catch (e: any) {
        debugLog('Prefetch: Period data prefetch error', e.message);
      }
    })();
    
    // Store the promise so other parts can wait for it
    window.TempHist.cache.prefetchPromise = bundlePrefetchPromise;
    
    debugLog('Prefetch: Stored prefetch promise, scheduling execution');
    ric(() => {
      bundlePrefetchPromise.then(() => {
        const totalTime = Date.now() - prefetchStartTime;
        debugLog('Prefetch: Total prefetch operation completed in', totalTime, 'ms');
      }).catch(() => {
        const totalTime = Date.now() - prefetchStartTime;
        debugLog('Prefetch: Total prefetch operation failed after', totalTime, 'ms');
      });
    });
  });
}

/**
 * Render the About page content
 */
function renderAboutPage(): void {
  const aboutView = document.getElementById('aboutView');
  if (!aboutView) return;

  aboutView.innerHTML = `
    <div class="container">
      <h2>About TempHist</h2>
      <p>TempHist shows you how today's temperature compares to the same date over the past 50 years. It can also compare this past week, month or year with the same period over the past 50 years.</p>

      <h3>How it works</h3>
      <p>TempHist uses your location to fetch historical weather data and displays it in an easy-to-read chart. Each bar represents the temperature on this date, or this past week/month/year, in a different year, with the current year highlighted in green.</p>

      <h3>Data sources</h3>
      <p>Weather and climate data are provided via the TempHist API, which sources historical weather data from trusted meteorological providers.</p>

      <h3>Contact</h3>
      <p>TempHist is operated by Turnpiece Ltd. For questions or feedback, please visit <a href="https://turnpiece.com">turnpiece.com</a>.</p>
    </div>
  `;
}

/**
 * Render the Privacy page content
 */
function renderPrivacyPage(): void {
  const privacyView = document.getElementById('privacyView');
  if (!privacyView) return;

  privacyView.innerHTML = `
    <div class="container">
      <h2>Privacy Policy</h2>
      <p>Effective date: September 2025</p>

      <p>TempHist, operated by Turnpiece Ltd., respects your privacy.</p>

      <h3>No personal data collected</h3>
      <p>TempHist does not collect, store, or share any personal information.</p>

      <h3>Location use</h3>
      <p>If you grant permission, the app uses your current location once to retrieve historical weather data for your area. Location data is never shared but is temporarily stored in a cookie on your machine for one hour.</p>

      <h3>Third-party services and cookies</h3>
      <p>TempHist uses Firebase for anonymous authentication, which may set third-party cookies from Google services (including identitytoolkit.googleapis.com and securetoken.googleapis.com). These cookies are used solely for authentication purposes and do not track personal information or enable cross-site tracking.</p>
      
      <p><strong>Third-party cookie usage:</strong> Firebase authentication may use third-party cookies to maintain your anonymous session. These cookies are essential for the app's authentication functionality and are not used for advertising or tracking purposes.</p>

      <h3>No tracking or analytics</h3>
      <p>The app does not include analytics, advertising or third-party tracking beyond the authentication service mentioned above. We do not use cookies for tracking, advertising, or cross-site user profiling.</p>

      <h3>Data sources</h3>
      <p>Weather and climate data are provided via the TempHist API, which sources historical weather data from trusted providers. Requests are processed anonymously.</p>

      <h3>Contact</h3>
      <p>If you have questions, please contact Turnpiece Ltd. at <a href="https://turnpiece.com">https://turnpiece.com</a>.</p>
    </div>
  `;
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
  const canvasEl = document.getElementById('tempChart');
  
  // Clean up any existing chart on the main canvas before starting
  if (canvasEl) {
    const existingChart = Chart.getChart(canvasEl);
    if (existingChart) {
      debugLog('Destroying existing chart before creating new one');
      existingChart.destroy();
    }
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
    const barColour = '#ff6b6b';
    const thisYearColour = '#51cf66';
    const trendColour = '#aaaa00';
    const avgColour = '#4dabf7';
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

    // Check for date changes and clear cache if needed
    checkAndHandleDateChange();

    // Check if the app is properly initialized
    if (!window.tempLocation) {
      // Wait a bit for the app to initialize
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
      </div>
    `;

    const loadingEl = document.getElementById(`${periodKey}Loading`) as HTMLElement;
    const canvas = document.getElementById(`${periodKey}Chart`) as HTMLCanvasElement;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    debugLog(`${periodKey} canvas dimensions:`, {
      width: canvas.clientWidth,
      height: canvas.clientHeight,
      offsetWidth: canvas.offsetWidth,
      offsetHeight: canvas.offsetHeight
    });
    
    // Ensure canvas has proper dimensions
    canvas.width = canvas.clientWidth || 800;
    canvas.height = canvas.clientHeight || 400;

    // Set the date text to match Today page format
    const dateTextEl = document.getElementById(`${periodKey}DateText`);
    if (dateTextEl) {
      dateTextEl.textContent = `${title} ending ${friendlyDate}`;
    }
    
    // Set location text early to prevent layout shifts
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
    const periodLoadingStartTime = Date.now();
    let periodLoadingInterval: NodeJS.Timeout | null = null;
    
    // Set up the interval after all early returns
    periodLoadingInterval = setInterval(() => {
      updatePeriodLoadingMessage(periodKey, periodLoadingStartTime);
    }, 1000);
    
    // Track this interval
    activeLoadingIntervals.add(periodLoadingInterval);

    try {
      // Check for prefetched data first
      let weatherData: any;
      
      if (window.TempHist.cache.prefetch[periodKey]) {
        debugLog(`${periodKey}: Using prefetched data`);
        weatherData = window.TempHist.cache.prefetch[periodKey];
      } else {
        // Check if prefetch is in progress and wait for it
        const prefetchPromise = window.TempHist.cache.prefetchPromise;
        if (prefetchPromise) {
          debugLog(`${periodKey}: Waiting for prefetch to complete...`);
          try {
            await prefetchPromise;
            weatherData = window.TempHist.cache.prefetch[periodKey];
            if (weatherData) {
              debugLog(`${periodKey}: Got prefetched data after waiting`);
            }
          } catch (e) {
            debugLog(`${periodKey}: Prefetch failed, proceeding with direct API call`);
          }
        }
        
        // If still no prefetched data, fetch directly
        if (!weatherData) {
          const identifier = `${String(dateToUse.getMonth() + 1).padStart(2, '0')}-${String(dateToUse.getDate()).padStart(2, '0')}`;
          
          // Progress callback for async job
          const onProgress = (status: AsyncJobResponse) => {
            debugLog(`${periodKey} job progress:`, status);
          };

          debugLog(`Starting async ${periodKey} data fetch...`);
          const jobResult = await fetchTemperatureDataAsync(periodKey, window.tempLocation!, identifier, onProgress);
          weatherData = jobResult;
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
      const isDataComplete = checkDataCompleteness(metadata);
      if (!isDataComplete) {
        debugLog(`${periodKey}: Data is incomplete, showing warning notice`);
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
      
      // Ensure minimum loading time has elapsed (3 seconds) to show cycling messages
      const minLoadingTime = 3000; // 3 seconds
      const elapsedTime = Date.now() - periodLoadingStartTime;
      const remainingTime = Math.max(0, minLoadingTime - elapsedTime);
      
      if (remainingTime > 0) {
        setTimeout(() => {
          actuallyShowPeriodChart();
        }, remainingTime);
      } else {
        actuallyShowPeriodChart();
      }
      
      function actuallyShowPeriodChart() {
        // Hide loading and show chart
        loadingEl.classList.add('hidden');
        loadingEl.classList.remove('visible');
        canvas.classList.add('visible');
        canvas.classList.remove('hidden');
        
        // Clear the loading message interval
        if (periodLoadingInterval) {
          clearInterval(periodLoadingInterval);
          activeLoadingIntervals.delete(periodLoadingInterval);
        }

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
          maxYear
        );

        // Update trend line if enabled
        if (chart && chart.data && chart.data.datasets) {
          // chartData is now {x: temperature, y: year} (after transformation), but calculateTrendLine expects {x: year, y: temperature}
          const calculatedTrendData = calculateTrendLine(chartData.map(d => ({ x: d.y, y: d.x })), 
            minYear - 0.5, maxYear + 0.5);
          chart.data.datasets[0].data = calculatedTrendData.points.map(p => ({ x: p.y, y: p.x }));
          chart.update();
        }

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
      if (periodLoadingInterval) {
        clearInterval(periodLoadingInterval);
        activeLoadingIntervals.delete(periodLoadingInterval);
      }
      
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
    
    showInitialLoadingState();
    hideError();

    try {
      // Check temperature data server health first (with timeout)
      const isApiHealthy = await Promise.race([
        checkApiHealth(),
        new Promise<boolean>((_, reject) => setTimeout(() => reject(new Error('Health check timeout')), 5000))
      ]).catch(() => {
        console.warn('Health check failed or timed out, proceeding anyway...');
        return true; // Proceed anyway if health check fails
      });
      
      if (!isApiHealthy) {
        console.warn('API health check failed, but proceeding with data fetch...');
      }

      // Fetch weather data using async jobs
      const identifier = `${month}-${day}`;
      
      // Progress callback for async job
      const onProgress = (status: AsyncJobResponse) => {
        debugLog('Daily job progress:', status);
      };

      debugLog('Starting async daily data fetch...');
      const jobResult = await fetchTemperatureDataAsync('daily', window.tempLocation!, identifier, onProgress);
      
      // Extract the data from the job result
      const jobResultData = jobResult;
      debugLog('Job result structure:', jobResult);
      debugLog('Extracted weather data:', jobResultData);
      
      // Job result contains the temperature data in the 'data' property
      if (!jobResultData || !jobResultData.data || !jobResultData.data.values || !Array.isArray(jobResultData.data.values)) {
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
      const isDataComplete = checkDataCompleteness(metadata);
      if (!isDataComplete) {
        debugLog('Daily data is incomplete, showing warning notice');
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
        debugTime('Chart initialization');
        
        // Double-check that no chart exists on this canvas
        const existingChart = Chart.getChart(canvasEl);
        if (existingChart) {
          debugLog('Found existing chart during creation, destroying it first');
          existingChart.destroy();
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
        
        debugTimeEnd('Chart initialization');
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

      // Send analytics after successful data load
      sendAnalytics();

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
        return;
      }
      
      hideChart();
      
      // Generate context-specific error message
      const errorMessage = generateErrorMessage(error);
      showError(errorMessage);
    }

    debugTimeEnd('Total fetch time');
  }

  // Make fetchHistoricalData globally accessible
  window.fetchHistoricalData = fetchHistoricalData;

  // Add loading state management (using global variables)
  // Note: loadingStartTime and loadingCheckInterval are now global variables

  function updateLoadingMessage(): void {
    if (!globalLoadingStartTime) return;
    
    const elapsedSeconds = Math.floor((Date.now() - globalLoadingStartTime) / 1000);
    const loadingText = document.getElementById('loadingText');
    
    // Get current page/period
    const currentHash = window.location.hash;
    const isTodayPage = currentHash === '' || currentHash === '#today' || currentHash === '#/today';
    const isWeekPage = currentHash === '#week' || currentHash === '#/week';
    const isMonthPage = currentHash === '#month' || currentHash === '#/month';
    const isYearPage = currentHash === '#year' || currentHash === '#/year';
    
    const displayCity = window.tempLocation ? getDisplayCity(window.tempLocation) : 'your location';
    
    if (elapsedSeconds < 5) {
      if (loadingText) loadingText.textContent = 'Connecting to the temperature data server...';
    } else if (elapsedSeconds < 15) {
      if (isTodayPage) {
        if (loadingText) loadingText.textContent = `Is today warmer or cooler than average in ${displayCity}?`;
      } else if (isWeekPage) {
        if (loadingText) loadingText.textContent = `Has this past week been warmer or cooler than average in ${displayCity}?`;
      } else if (isMonthPage) {
        if (loadingText) loadingText.textContent = `Has this past month been warmer or cooler than average in ${displayCity}?`;
      } else if (isYearPage) {
        if (loadingText) loadingText.textContent = `Has this past year been warmer or cooler than average in ${displayCity}?`;
      } else {
        if (loadingText) loadingText.textContent = 'Getting temperature data for '+friendlyDate+' over the past 50 years...';
      }
    } else if (elapsedSeconds < 30) {
      if (isTodayPage) {
        if (loadingText) loadingText.textContent = `Analysing today's temperature in ${displayCity}...`;
      } else if (isWeekPage) {
        if (loadingText) loadingText.textContent = `Analysing this week's temperatures in ${displayCity}...`;
      } else if (isMonthPage) {
        if (loadingText) loadingText.textContent = `Analysing this month's temperatures in ${displayCity}...`;
      } else if (isYearPage) {
        if (loadingText) loadingText.textContent = `Analysing this year's temperatures in ${displayCity}...`;
      } else {
        if (loadingText) loadingText.textContent = 'Analysing historical data for '+displayCity+'...';
      }
    } else if (elapsedSeconds < 45) {
      if (isTodayPage) {
        if (loadingText) loadingText.textContent = 'Generating today\'s temperature comparison...';
      } else if (isWeekPage) {
        if (loadingText) loadingText.textContent = 'Generating weekly temperature comparison...';
      } else if (isMonthPage) {
        if (loadingText) loadingText.textContent = 'Generating monthly temperature comparison...';
      } else if (isYearPage) {
        if (loadingText) loadingText.textContent = 'Generating yearly temperature comparison...';
      } else {
        if (loadingText) loadingText.textContent = 'Generating temperature comparison chart...';
      }
    } else if (elapsedSeconds < 60) {
      if (loadingText) loadingText.textContent = 'You should be seeing a bar chart soon...';
    } else if (elapsedSeconds < 90) {
      if (loadingText) loadingText.textContent = 'This is taking longer than usual. Please wait...';
    } else {
      if (loadingText) loadingText.textContent = 'This really is taking a while, maybe due to a slow internet connection, high server load or something may have gone wrong.';
    }
  }

  // Dynamic loading messages for period pages
  function updatePeriodLoadingMessage(periodKey: 'week' | 'month' | 'year', startTime: number): void {
    const elapsedSeconds = Math.floor((Date.now() - startTime) / 1000);
    const loadingText = document.getElementById(`${periodKey}LoadingText`);
    
    if (!loadingText) return;
    
    const displayCity = window.tempLocation ? getDisplayCity(window.tempLocation) : 'your location';
    
    if (elapsedSeconds < 5) {
      loadingText.textContent = 'Connecting to the temperature data server...';
    } else if (elapsedSeconds < 15) {
      if (periodKey === 'week') {
        loadingText.textContent = `Has this past week been warmer or cooler than average in ${displayCity}?`;
      } else if (periodKey === 'month') {
        loadingText.textContent = `Has this past month been warmer or cooler than average in ${displayCity}?`;
      } else if (periodKey === 'year') {
        loadingText.textContent = `Has this past year been warmer or cooler than average in ${displayCity}?`;
      }
    } else if (elapsedSeconds < 30) {
      if (periodKey === 'week') {
        loadingText.textContent = `Analysing this week's temperatures in ${displayCity}...`;
      } else if (periodKey === 'month') {
        loadingText.textContent = `Analysing this month's temperatures in ${displayCity}...`;
      } else if (periodKey === 'year') {
        loadingText.textContent = `Analysing this year's temperatures in ${displayCity}...`;
      }
    } else if (elapsedSeconds < 45) {
      if (periodKey === 'week') {
        loadingText.textContent = 'Generating weekly temperature comparison...';
      } else if (periodKey === 'month') {
        loadingText.textContent = 'Generating monthly temperature comparison...';
      } else if (periodKey === 'year') {
        loadingText.textContent = 'Generating yearly temperature comparison...';
      }
    } else if (elapsedSeconds < 60) {
      loadingText.textContent = 'You should be seeing a bar chart soon...';
    } else if (elapsedSeconds < 90) {
      loadingText.textContent = 'This is taking longer than usual. Please wait...';
    } else {
      loadingText.textContent = 'The data processing is taking a while. This may be due to high server load.';
    }
  }

  // Show initial loading state (only after date and location are known)
  function showInitialLoadingState(): void {
    // Clear any existing loading intervals
    clearAllLoadingIntervals();
    
    globalLoadingStartTime = Date.now();
    globalLoadingCheckInterval = setInterval(updateLoadingMessage, 1000);
    activeLoadingIntervals.add(globalLoadingCheckInterval);
    
    // Ensure loading is visible for at least 3 seconds to show cycling messages

    if (loadingEl) {
      loadingEl.classList.add('visible');
      loadingEl.classList.remove('hidden');
    }

    if (canvasEl) {
      canvasEl.classList.remove('visible');
      canvasEl.classList.add('hidden');
    }
    
    // Update loading message for fetching stage
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
    const minLoadingTime = 3000; // 3 seconds
    const elapsedTime = globalLoadingStartTime ? Date.now() - globalLoadingStartTime : 0;
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
    if (globalLoadingCheckInterval) {
      clearInterval(globalLoadingCheckInterval);
      activeLoadingIntervals.delete(globalLoadingCheckInterval);
      globalLoadingCheckInterval = null;
    }
    globalLoadingStartTime = null;

    if (loadingEl) {
      loadingEl.classList.add('hidden');
      loadingEl.classList.remove('visible');
    }

    if (canvasEl) {
      canvasEl.classList.add('visible');
      canvasEl.classList.remove('hidden');
    }
    
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
    
    if (chart) {
      chart.update();
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

  // Handle change location - navigate to splash screen
  function handleChangeLocation(): void {
    debugLog('Change location clicked, navigating to splash screen');
    
    // Show splash screen
    const splashScreen = document.getElementById('splashScreen');
    const appShell = document.getElementById('appShell');
    
    if (splashScreen) {
      splashScreen.style.display = 'flex';
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
    if (window.TempHistRouter && typeof window.TempHistRouter.navigate === 'function') {
      window.TempHistRouter.navigate('/today');
    } else {
      window.location.hash = '#/today';
    }
    
    // Re-setup splash screen event listeners (in case they were lost)
    setupSplashScreenListeners();
    
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
      
      // Update navigation highlighting
      this.updateNavigationHighlight(route);
      
      // Render the view if it has a render function
      if (this.views[viewKey] && typeof this.views[viewKey].render === 'function') {
        debugLog('Rendering view:', viewKey);
        this.views[viewKey].render();
      } else if (viewKey === 'today') {
        // Today view doesn't have a separate render function, it's handled by mainAppLogic
        debugLog('Today view - no additional rendering needed');
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

// Initialize router
window.TempHistRouter = new TempHistRouter();

// Make analytics functions globally available
window.TempHistAnalytics = reportAnalytics;
window.TempHistSendAnalytics = sendAnalytics;

// Initialize mobile navigation for all pages
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
