/**
 * Splash screen functionality - location selection and initialization
 */

import { setLocationCookie, getLocationCookie } from '../utils/location';
import { detectUserLocationWithGeolocation, getLocationFromIP } from '../services/locationDetection';
import { resetCarouselState } from '../services/locationCarousel';
import { apiFetch, getApiUrl } from '../api/temperature';
import { LazyLoader } from '../utils/LazyLoader';
import { DataCache } from '../utils/DataCache';
import { LoadingManager } from '../utils/LoadingManager';
import { fetchTemperatureDataAsync } from '../api/temperature';
import type { PreapprovedLocation } from '../types/index';
import { renderAboutPage, renderPrivacyPage } from '../views/about';

declare const Chart: any;
declare const debugLog: (...args: any[]) => void;

/**
 * Setup mobile navigation functionality
 */
export function setupMobileNavigation(): void {
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
export function handleWindowResize(): void {
  const burgerBtn = document.getElementById('burgerBtn');
  if (burgerBtn && window.innerWidth <= 900) {
    // Only re-setup if we're in mobile view and the button is visible
    const computedStyle = window.getComputedStyle(burgerBtn);
    if (computedStyle.display !== 'none') {
      setupMobileNavigation();
    }
  }
}

/**
 * Type guard for preapproved location
 */
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

/**
 * Parse preapproved locations from API response
 */
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
 * Prefetch approved locations for manual selection
 */
export async function prefetchApprovedLocations(): Promise<void> {
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
  } catch (error) {
    debugLog('Failed to prefetch approved locations:', error);
    // Store empty array if prefetch fails
    window.TempHist = window.TempHist || {};
    window.TempHist.prefetchedLocations = [];
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
export function showManualLocationSelection(permissionDenied: boolean = false): void {
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
export function hideManualLocationSelection(): void {
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
export async function handleManualLocationSelection(selectedLocation: string): Promise<void> {
  debugLog('Manual location selected:', selectedLocation);
  await proceedWithLocation(selectedLocation, false, 'manual'); // Mark as manual selection
}

/**
 * Clear all cached data when location or date changes
 */
export function clearAllCachedData(): void {
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
  LoadingManager.clearAllIntervals();
  
  debugLog('All cached data cleared');
}

/**
 * Check if we need to clear data due to date change
 */
export function checkAndHandleDateChange(): boolean {
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
 * Start prefetching period data (week, month, year) in background
 */
export function startPeriodDataPrefetch(): void {
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
 * Initialize splash screen functionality
 */
export function initializeSplashScreen(): void {
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
        renderPrivacyPage();
      } else if (currentPath === '/about') {
        renderAboutPage();
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
 * Handle location change - navigate back to splash screen
 */
export function handleLocationChangeInternal(): void {
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
    document.body.style.width = '100%'; // Use percentage instead of 100vw to avoid scrollbar issues
    document.body.style.maxWidth = '100%'; // Ensure it doesn't exceed viewport
    document.body.style.left = '0';
    document.body.style.right = '0';
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
  const useLocationBtn = document.getElementById('useLocationBtn');
  const heading = document.getElementById('location-picker-heading');
  
  if (locationLoading) locationLoading.style.display = 'none';
  if (splashActions) (splashActions as HTMLElement).style.display = 'flex';
  if (manualLocationSection) manualLocationSection.style.display = 'none';
  
  // Reset "Use my location" button and heading text to initial state
  if (useLocationBtn) {
    useLocationBtn.style.display = '';
  }
  if (heading) {
    heading.textContent = 'Or choose one:';
  }
  
  // Navigate to today page
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

// Expose handleManualLocationSelection globally for use by location carousel
(window as any).handleManualLocationSelection = handleManualLocationSelection;

