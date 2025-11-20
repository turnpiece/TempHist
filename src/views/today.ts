/**
 * Today view - Main application logic for the Today temperature view
 */

import type { AsyncJobResponse } from '../types/index';
import { DEFAULT_LOCATION, INITIAL_LOADING_TEXT, LOADING_TIMEOUTS, API_CONFIG, DATE_RANGE_CONFIG } from '../constants/index';
import { setLocationCookie, getDisplayCity, getOrdinal } from '../utils/location';
import { updateDataNotice } from '../utils/dataNotice';
import { LoadingManager } from '../utils/LoadingManager';
import { DataCache } from '../utils/DataCache';
import { FeatureFlags } from '../utils/FeatureFlags';
import { PerformanceMonitor } from '../utils/PerformanceMonitor';
import { Logger } from '../utils/Logger';
import { Debouncer } from '../utils/Debouncer';
import { checkApiHealth, fetchTemperatureDataAsync, transformToChartData, calculateTemperatureRange, validateTemperatureDataResponse } from '../api/temperature';
import { createTemperatureChart, updateChartTrendLine, calculateTrendLine } from '../chart/chart';
import { updateSummaryTextElements, buildLocationDisplay, checkDataCompleteness, showChartElements, generateErrorMessage, isAbortError } from '../utils/uiHelpers';
import { handleLocationChangeInternal, startPeriodDataPrefetch, setupMobileNavigation, checkAndHandleDateChange } from '../splash/splash';
import { sendAnalytics } from '../analytics/analytics';

declare const Chart: any;
declare const debugLog: (...args: any[]) => void;
declare const debugTime: (label: string) => void;
declare const debugTimeEnd: (label: string) => void;

/**
 * Setup change location button click handler
 * @param periodKey - Optional period key for period-specific views (e.g., 'week', 'month', 'year')
 */
export function setupChangeLocationButton(periodKey: string = ''): void {
  const buttonId = periodKey ? `changeLocationBtn-${periodKey}` : 'changeLocationBtn';
  const changeLocationBtn = document.getElementById(buttonId);
  
  if (changeLocationBtn) {
    changeLocationBtn.addEventListener('click', (e) => {
      e.preventDefault();
      handleChangeLocation();
    });
  }
}

/**
 * Handle change location - navigate to splash screen
 */
function handleChangeLocation(): void {
  Logger.logUserInteraction('change_location_clicked');
  debugLog('Change location clicked, debouncing...');
  debouncedLocationChange();
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

/**
 * Show initial loading state (only after date and location are known)
 */
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

/**
 * Show error message
 */
function showError(message: string): void {
  const errorContainer = document.getElementById('errorContainer');
  const errorMessage = document.getElementById('errorMessage');
  const loadingEl = document.getElementById('loading');
  const canvasEl = document.getElementById('tempChart');
  
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

/**
 * Hide error message
 */
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

/**
 * Show chart after minimum loading time
 */
function showChart(): void {
  // Ensure minimum loading time has elapsed (3 seconds) to show cycling messages
  const minLoadingTime = LOADING_TIMEOUTS.MIN_LOADING_TIME * 1000; // Convert to milliseconds
  const elapsedTime = LoadingManager.getElapsedTime(); // Get actual elapsed time from LoadingManager
  const remainingTime = Math.max(0, minLoadingTime - elapsedTime);
  
  if (remainingTime > 0) {
    setTimeout(() => {
      actuallyShowChart();
    }, remainingTime);
  } else {
    actuallyShowChart();
  }
}

/**
 * Actually show the chart (called after minimum loading time)
 */
function actuallyShowChart(): void {
  LoadingManager.stopGlobalLoading();

  const loadingEl = document.getElementById('loading');
  const canvasEl = document.getElementById('tempChart');

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
          if (window.TempHist) {
            window.TempHist.mainChart = null;
          }
        }
      } else {
        debugLog('No chart instance found on canvas element, skipping update');
        // Reset chart references if no chart is registered
        if (window.TempHist) {
          window.TempHist.mainChart = null;
        }
      }
    } else {
      debugLog('Canvas element no longer in DOM, skipping chart update');
    }
  }
}

/**
 * Hide chart
 */
function hideChart(): void {
  // This function is now only called when we're about to fetch data
  // The loading state should already be shown by showInitialLoadingState()
  // Just ensure the chart is hidden
  const canvasEl = document.getElementById('tempChart');
  if (canvasEl) {
    canvasEl.classList.remove('visible');
    canvasEl.classList.add('hidden');
  }
}

/**
 * Main async data fetching function for Today view
 */
async function fetchHistoricalData(): Promise<void> {
  Logger.startPerformance('fetchHistoricalData');
  debugTime('Total fetch time');
  
  const canvasEl = document.getElementById('tempChart') as HTMLCanvasElement;
  
  // Destroy any existing chart before starting
  if (canvasEl) {
    const existingChart = Chart.getChart(canvasEl);
    if (existingChart) {
      debugLog('Destroying existing chart before fetching new data');
      existingChart.destroy();
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
    
    const day = String(dateToUse.getDate()).padStart(2, '0');
    const month = String(dateToUse.getMonth() + 1).padStart(2, '0');
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
    const averageData = { temp: jobResultData.data.average?.mean };
    const trendData = jobResultData.data.trend;
    const summaryData = jobResultData.data.summary;
    const metadata = jobResultData.data.metadata;
    
    // Validate temperature data array structure and ranges
    if (!Array.isArray(temperatureData)) {
      throw new Error('Temperature data is not an array.');
    }

    // Comprehensive validation of temperature data
    try {
      validateTemperatureDataResponse(jobResultData.data);
    } catch (validationError) {
      throw new Error(`Invalid temperature data format: ${validationError instanceof Error ? validationError.message : 'Unknown validation error'}`);
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
        const loadingEl = document.getElementById('loading');
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
    
    // Get date info for chart
    const dayNum = Number(day);
    const friendlyDate = `${getOrdinal(dayNum)} ${new Date().toLocaleString('en-GB', { month: 'long' })}`;
    const currentYear = dateToUse.getFullYear();
    
    // Validate and calculate start year
    const maxAllowedYear = new Date().getFullYear() + DATE_RANGE_CONFIG.LATEST_YEAR_OFFSET;
    const validatedCurrentYear = Math.min(Math.max(currentYear, DATE_RANGE_CONFIG.EARLIEST_YEAR), maxAllowedYear);
    const calculatedStartYear = validatedCurrentYear - DATE_RANGE_CONFIG.DEFAULT_YEAR_SPAN;
    const startYear = Math.max(calculatedStartYear, DATE_RANGE_CONFIG.EARLIEST_YEAR);
    
    if (currentYear !== validatedCurrentYear) {
      debugLog(`Year ${currentYear} adjusted to valid range: ${validatedCurrentYear}`);
    }
    
    // Create or update chart
    if (!canvasEl) {
      throw new Error('Canvas element not found');
    }
    
    // Double-check that no chart exists on this canvas
    const existingChart = Chart.getChart(canvasEl);
    if (existingChart) {
      debugLog('Found existing chart during creation, destroying it first');
      existingChart.destroy();
    }
    
    // Ensure canvas element is still in the DOM
    if (!canvasEl.parentNode || !document.contains(canvasEl)) {
      throw new Error('Canvas element is not in the DOM');
    }
    
    const ctx = canvasEl.getContext('2d');
    if (!ctx) {
      throw new Error('Could not get canvas context');
    }
    
    // Calculate available height for bars with validation
    if (startYear > currentYear) {
      throw new Error(`Invalid year range: startYear (${startYear}) is greater than currentYear (${currentYear})`);
    }
    const numBars = currentYear - startYear + 1;
    if (numBars <= 0 || numBars > 100) {
      throw new Error(`Invalid number of bars: ${numBars} (expected 1-100)`);
    }
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

    debugTime('Chart initialisation');
    const chart = createTemperatureChart(
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

    // Update trend line if enabled
    const showTrend = true;
    if (showTrend) {
      updateChartTrendLine(chart, chartData, startYear, currentYear);
    }

    // Update text elements with new API data
    updateSummaryTextElements(summaryData, averageData, trendData);

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
    if (isAbortError(error)) {
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

/**
 * Display location and fetch data for Today view
 */
function displayLocationAndFetchData(): void {
  debugLog('displayLocationAndFetchData called with window.tempLocation:', window.tempLocation);
  
  // Check if using the hardcoded default fallback location
  // Only show "(default location)" when the source is explicitly 'default'
  // Manual selection of London should not show this, even if it matches DEFAULT_LOCATION
  const isDefaultLocation = window.tempLocationSource === 'default';
  const cityName = getDisplayCity(window.tempLocation!);
  const locationDisplay = isDefaultLocation ? 
    `${cityName} (default location)` : 
    cityName;
  
  // Create location display with edit icon
  const locationTextElement = document.getElementById('locationText');
  if (locationTextElement) {
    // Add classes based on location source
    locationTextElement.className = `location-text location-${window.tempLocationSource || 'unknown'}`;

    // Show location with edit icon without using innerHTML
    buildLocationDisplay(locationTextElement, locationDisplay);

    // Setup change location button click handler
    setupChangeLocationButton();
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

/**
 * Main app logic - initializes the Today view
 */
export function mainAppLogic(): void {
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

  // Validate and calculate start year
  const maxAllowedYear = new Date().getFullYear() + DATE_RANGE_CONFIG.LATEST_YEAR_OFFSET;
  const validatedCurrentYear = Math.min(Math.max(currentYear, DATE_RANGE_CONFIG.EARLIEST_YEAR), maxAllowedYear);
  const calculatedStartYear = validatedCurrentYear - DATE_RANGE_CONFIG.DEFAULT_YEAR_SPAN;
  const startYear = Math.max(calculatedStartYear, DATE_RANGE_CONFIG.EARLIEST_YEAR);

  if (currentYear !== validatedCurrentYear) {
    debugLog(`Year ${currentYear} adjusted to valid range: ${validatedCurrentYear}`);
  }
  
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
    window.tempLocationSource = 'default';
    window.tempLocationIsDetected = false;
  }

  // If we already have a location (from splash screen), proceed with data fetching
  if (window.tempLocation) {
    displayLocationAndFetchData();
  }
}

// Make calculateTrendLine globally available for period views
window.calculateTrendLine = calculateTrendLine;

// Make fetchHistoricalData globally available for retry functionality
window.fetchHistoricalData = fetchHistoricalData;

