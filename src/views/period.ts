/**
 * Period views - Logic for rendering Week, Month, and Year temperature views
 */

import type { AsyncJobResponse } from '../types/index';
import { DEFAULT_LOCATION, INITIAL_LOADING_TEXT, LOADING_TIMEOUTS, DATE_RANGE_CONFIG } from '../constants/index';
import { getDisplayCity, getOrdinal } from '../utils/location';
import { LoadingManager } from '../utils/LoadingManager';
import { DataCache } from '../utils/DataCache';
import { FeatureFlags } from '../utils/FeatureFlags';
import { fetchTemperatureDataAsync, transformToChartData, calculateTemperatureRange, validateTemperatureDataResponse } from '../api/temperature';
import { createTemperatureChart, updateChartTrendLine } from '../chart/chart';
import { updateSummaryTextElements, buildLocationDisplay, checkDataCompleteness, showChartElements, generateErrorMessage, isAbortError, clearAllLoadingIntervals } from '../utils/uiHelpers';
import { setupChangeLocationButton } from './today';

declare const debugLog: (...args: any[]) => void;

/**
 * Render function for period pages (week, month, year)
 */
export async function renderPeriod(sectionId: string, periodKey: 'week' | 'month' | 'year', title: string): Promise<void> {
  const sec = document.getElementById(sectionId);
  if (!sec) return;

  // Check if the app is properly initialised
  if (!window.tempLocation) {
    // Wait a bit for the app to initialise
    await new Promise(resolve => setTimeout(resolve, 100));
    if (!window.tempLocation) {
      debugLog('renderPeriod: No location found, using default');
      window.tempLocation = DEFAULT_LOCATION;
      window.tempLocationSource = 'default';
      window.tempLocationIsDetected = false;
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
  
  // Match Today page layout exactly without using innerHTML (Trusted Types safe)
  while (sec.firstChild) {
    sec.removeChild(sec.firstChild);
  }

  const container = document.createElement('div');
  container.className = 'container';

  const dateHeading = document.createElement('h2');
  dateHeading.id = `${periodKey}DateText`;
  dateHeading.className = 'date-heading';
  container.appendChild(dateHeading);

  const locationText = document.createElement('div');
  locationText.id = `${periodKey}LocationText`;
  locationText.className = 'standard-text';
  container.appendChild(locationText);

  const dataNotice = document.createElement('div');
  dataNotice.id = `${periodKey}DataNotice`;
  dataNotice.className = 'notice';
  container.appendChild(dataNotice);

  const summaryText = document.createElement('div');
  summaryText.id = `${periodKey}SummaryText`;
  summaryText.className = 'standard-text summary-text';
  container.appendChild(summaryText);

  const chartContainer = document.createElement('div');
  chartContainer.className = 'chart-container';

  const loadingDiv = document.createElement('div');
  loadingDiv.id = `${periodKey}Loading`;
  loadingDiv.className = 'loading';

  const spinnerDiv = document.createElement('div');
  spinnerDiv.className = 'spinner';
  loadingDiv.appendChild(spinnerDiv);

  const loadingText = document.createElement('p');
  loadingText.id = `${periodKey}LoadingText`;
  loadingText.className = 'loading-text';
  loadingText.textContent = INITIAL_LOADING_TEXT;
  loadingDiv.appendChild(loadingText);

  chartContainer.appendChild(loadingDiv);

  const errorContainer = document.createElement('div');
  errorContainer.id = `${periodKey}ErrorContainer`;
  errorContainer.className = 'error-container';
  errorContainer.style.display = 'none';

  const errorContent = document.createElement('div');
  errorContent.className = 'error-content';

  const errorMessage = document.createElement('div');
  errorMessage.id = `${periodKey}ErrorMessage`;
  errorMessage.className = 'error-message';
  errorContent.appendChild(errorMessage);

  const reloadButton = document.createElement('button');
  reloadButton.id = `${periodKey}ReloadButton`;
  reloadButton.className = 'reload-button';
  reloadButton.textContent = 'Reload';
  errorContent.appendChild(reloadButton);

  errorContainer.appendChild(errorContent);
  chartContainer.appendChild(errorContainer);

  const canvasEl = document.createElement('canvas');
  canvasEl.id = `${periodKey}Chart`;
  chartContainer.appendChild(canvasEl);

  container.appendChild(chartContainer);

  const avgText = document.createElement('div');
  avgText.id = `${periodKey}AvgText`;
  avgText.className = 'standard-text avg-text';
  container.appendChild(avgText);

  const trendText = document.createElement('div');
  trendText.id = `${periodKey}TrendText`;
  trendText.className = 'standard-text trend-text';
  container.appendChild(trendText);

  const incompleteNotice = document.createElement('div');
  incompleteNotice.id = `${periodKey}IncompleteDataNotice`;
  incompleteNotice.className = 'notice';
  incompleteNotice.style.display = 'none';
  container.appendChild(incompleteNotice);

  sec.appendChild(container);

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

    // Show location with edit icon without using innerHTML
    buildLocationDisplay(locationTextElement, displayLocation, periodKey);

    // Setup change location button click handler
    setupChangeLocationButton(periodKey);
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
    // First, determine which format we have and validate the structure
    let validationData: any;
    let temperatureData: any[], averageData: any, trendData: any, summaryData: any, metadata: any;
    
    if (weatherData.data && weatherData.data.values) {
      // Fresh API data (job result format)
      validationData = weatherData.data;
      temperatureData = weatherData.data.values;
    } else if (weatherData.values) {
      // Prefetched data (direct format)
      validationData = weatherData;
      temperatureData = weatherData.values;
    } else {
      throw new Error('Invalid data format received. Expected values array.');
    }
    
    // Comprehensive validation of temperature data structure and ranges (before accessing nested properties)
    try {
      validateTemperatureDataResponse(validationData);
    } catch (validationError) {
      throw new Error(`Invalid temperature data format for ${periodKey}: ${validationError instanceof Error ? validationError.message : 'Unknown validation error'}`);
    }
    
    // Now safely extract the data (validation ensures structure is correct)
    if (weatherData.data && weatherData.data.values) {
      // Fresh API data (job result format)
      averageData = { temp: weatherData.data.average.mean };
      trendData = weatherData.data.trend;
      summaryData = weatherData.data.summary;
      metadata = weatherData.data.metadata;
    } else if (weatherData.values) {
      // Prefetched data (direct format)
      averageData = { temp: weatherData.average.mean };
      trendData = weatherData.trend;
      summaryData = weatherData.summary;
      metadata = weatherData.metadata;
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
    
    // Get year range with validation
    const years = chartData.map(d => d.y);
    if (years.length === 0) {
      throw new Error('Chart data contains no years');
    }
    
    const rawMinYear = Math.min(...years);
    const rawMaxYear = Math.max(...years);
    
    // Validate year range against acceptable bounds
    const earliestYear = DATE_RANGE_CONFIG.EARLIEST_YEAR;
    const latestYear = new Date().getFullYear() + DATE_RANGE_CONFIG.LATEST_YEAR_OFFSET;
    
    const minYear = Math.max(rawMinYear, earliestYear);
    const maxYear = Math.min(rawMaxYear, latestYear);
    
    if (rawMinYear < earliestYear || rawMaxYear > latestYear) {
      debugLog(`Year range adjusted: [${rawMinYear}, ${rawMaxYear}] -> [${minYear}, ${maxYear}]`);
    }
    
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
      updateChartTrendLine(chart, chartData, minYear, maxYear);
      
      // Show chart elements since data loaded successfully
      showChartElements(periodKey);

      // Location text is already set at the beginning (like Today page)
      
      // Update summary, average, and trend text
      updateSummaryTextElements(summaryData, averageData, trendData, periodKey);

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
    if (isAbortError(error)) {
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

