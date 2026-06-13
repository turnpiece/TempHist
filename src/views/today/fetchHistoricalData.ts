import type { AsyncJobResponse } from '../../types/index';
import { API_CONFIG, DATE_RANGE_CONFIG } from '../../constants/index';
import { getOrdinal } from '../../utils/location';
import { getEffectiveDateForLocation, localTodayIn, msUntilNextLocalMidnight } from '../../utils/dateUtils';
import { DataCache } from '../../utils/DataCache';
import { FeatureFlags } from '../../utils/FeatureFlags';
import { PerformanceMonitor } from '../../utils/PerformanceMonitor';
import { Logger } from '../../utils/Logger';
import {
  checkApiHealth,
  fetchTemperatureDataAsync,
  transformToChartData,
  calculateTemperatureRange,
  validateTemperatureDataResponse,
} from '../../api/temperature';
import { getLastXCache } from '../../api/temperature/client';
import type { SelectionMethod } from '../../types/index';
import { createTemperatureChart, updateChartTrendLine } from '../../chart/chart';
import {
  updateSummaryTextElements,
  checkDataCompleteness,
  showChartElements,
  generateErrorMessage,
  isAbortError,
  applyTrendBackground,
} from '../../utils/uiHelpers';
import { setupShareButton } from '../../share';
import { startPeriodDataPrefetch } from '../../splash/splash';
import { sendAnalytics } from '../../analytics/analytics';
import { LoadingManager } from '../../utils/LoadingManager';
import {
  showInitialLoadingState,
  showError,
  hideError,
  showChart,
  hideChart,
} from './chartDisplay';

declare const Chart: any;
declare const debugLog: (...args: any[]) => void;
declare const debugTime: (label: string) => void;
declare const debugTimeEnd: (label: string) => void;

function toSelectionMethod(source: string | null): SelectionMethod | null {
  switch (source) {
    case 'detected': return 'own_location';
    case 'manual':   return 'carousel';
    case 'default':  return 'popular';
    default:         return null;
  }
}

export async function fetchHistoricalData(): Promise<void> {
  Logger.startPerformance('fetchHistoricalData');
  debugTime('Total fetch time');

  const canvasEl = document.getElementById('tempChart') as HTMLCanvasElement;

  if (canvasEl) {
    const existingChart = Chart.getChart(canvasEl);
    if (existingChart) {
      debugLog('Destroying existing chart before fetching new data');
      existingChart.destroy();
    }
  }

  const appShell = document.getElementById('appShell');
  if (appShell && appShell.classList.contains('fading-in')) {
    appShell.classList.remove('fading-in');
    appShell.classList.add('fade-in');
  }

  showInitialLoadingState();
  hideError();

  try {
    const apiHealth = await Promise.race([
      checkApiHealth(),
      new Promise<'healthy'>((_, reject) =>
        setTimeout(() => reject(new Error('Health check timeout')), API_CONFIG.HEALTH_CHECK_TIMEOUT)
      ),
    ]).catch(() => {
      console.warn('Health check failed or timed out, proceeding anyway...');
      return 'healthy' as const;
    });

    if (apiHealth !== 'healthy') {
      console.warn(`API health check returned '${apiHealth}', but proceeding with data fetch...`);
    }

    const { day, month, year: rawYear } = getEffectiveDateForLocation(window.tempLocationTimezone);
    const identifier = `${month}-${day}`;
    debugLog('About to fetch data - tempLocation:', window.tempLocation, 'identifier:', identifier);

    const localToday = window.tempLocationTimezone ? localTodayIn(window.tempLocationTimezone) : undefined;
    const ttl = window.tempLocationTimezone
      ? Math.min(10 * 60 * 1000, msUntilNextLocalMidnight(window.tempLocationTimezone))
      : 10 * 60 * 1000;

    let jobResult;
    if (FeatureFlags.isEnabled('data_caching')) {
      const cacheKey = DataCache.generateTemperatureKey('daily', window.tempLocation!, identifier, localToday);
      debugLog('Checking cache for key:', cacheKey);
      jobResult = DataCache.get(cacheKey);

      if (jobResult) {
        debugLog('Daily: Using cached data');
      } else {
        debugLog('No cached data found');
      }
    }

    let responseTimeMs: number | null = null;
    if (!jobResult) {
      debugLog('About to call fetchTemperatureDataAsync - no cached data');
      const onProgress = (status: AsyncJobResponse) => {
        debugLog('Daily job progress:', status);
      };

      debugLog('Starting async daily data fetch...');
      const t0 = Date.now();
      jobResult = await fetchTemperatureDataAsync('daily', window.tempLocation!, identifier, onProgress, localToday);
      responseTimeMs = Date.now() - t0;

      if (FeatureFlags.isEnabled('data_caching')) {
        const cacheKey = DataCache.generateTemperatureKey('daily', window.tempLocation!, identifier, localToday);
        DataCache.set(cacheKey, jobResult, ttl);
        debugLog('Daily: Data cached for future use');
      }
    }

    const jobResultData = jobResult as any;
    debugLog('Job result structure:', jobResult);
    debugLog('Extracted weather data:', jobResultData);

    if (!jobResultData) {
      throw new Error('No data received from API. The server may be unavailable or returned an empty response.');
    }

    if (!jobResultData.data || !jobResultData.data.values || !Array.isArray(jobResultData.data.values)) {
      throw new TypeError('Invalid data format received. Expected data.values array.');
    }

    const temperatureData = jobResultData.data.values;
    const averageData = {
      temp: jobResultData.data.average?.mean,
      stdDev: jobResultData.data.average?.standard_deviation,
    };
    const trendData = {
      slope: jobResultData.data.trend?.slope,
      slopeError: jobResultData.data.trend?.slope_error,
      unit: jobResultData.data.trend?.unit,
      gradientFactor: jobResultData.data.trend?.gradient_factor ?? null,
    };
    const summaryData = jobResultData.data.summary;
    const metadata = jobResultData.data.metadata;

    if (!Array.isArray(temperatureData)) {
      throw new Error('Temperature data is not an array.');
    }

    try {
      validateTemperatureDataResponse(jobResultData.data);
    } catch (validationError) {
      throw new Error(
        `Invalid temperature data format: ${validationError instanceof Error ? validationError.message : 'Unknown validation error'}`
      );
    }

    debugLog('Checking data completeness for daily data, metadata:', metadata);
    const isDataComplete = checkDataCompleteness(metadata, 'daily');
    if (!isDataComplete) {
      debugLog('Daily data is incomplete or unavailable');
      if (metadata && metadata.completeness === 0) {
        debugLog('No data available (0% completeness), stopping data processing');
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

    const chartData = transformToChartData(temperatureData);

    debugLog('Raw weather data:', temperatureData);
    debugLog('Chart data:', chartData);

    const dayNum = Number(day);
    const friendlyDate = `${getOrdinal(dayNum)} ${new Date().toLocaleString('en-GB', { month: 'long' })}`;
    const currentYear = rawYear;

    const maxAllowedYear = new Date().getFullYear() + DATE_RANGE_CONFIG.LATEST_YEAR_OFFSET;
    const validatedCurrentYear = Math.min(
      Math.max(currentYear, DATE_RANGE_CONFIG.EARLIEST_YEAR),
      maxAllowedYear
    );
    const calculatedStartYear = validatedCurrentYear - DATE_RANGE_CONFIG.DEFAULT_YEAR_SPAN;
    const startYear = Math.max(calculatedStartYear, DATE_RANGE_CONFIG.EARLIEST_YEAR);

    if (currentYear !== validatedCurrentYear) {
      debugLog(`Year ${currentYear} adjusted to valid range: ${validatedCurrentYear}`);
    }

    if (!canvasEl) {
      throw new Error('Canvas element not found');
    }

    const existingChart = Chart.getChart(canvasEl);
    if (existingChart) {
      debugLog('Found existing chart during creation, destroying it first');
      existingChart.destroy();
    }

    if (!canvasEl.parentNode || !document.contains(canvasEl)) {
      throw new Error('Canvas element is not in the DOM');
    }

    const ctx = canvasEl.getContext('2d');
    if (!ctx) {
      throw new Error('Could not get canvas context');
    }

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
      maxTemp: tempRange.max,
    });

    debugTime('Chart initialisation');
    const chart = createTemperatureChart(
      ctx,
      chartData,
      { temp: averageData.temp, stdDev: averageData.stdDev },
      'Today',
      friendlyDate,
      tempRange.min,
      tempRange.max,
      startYear,
      currentYear,
      'daily'
    );

    window.TempHist = window.TempHist || {};
    window.TempHist.mainChart = chart;

    showChartElements();

    debugTimeEnd('Chart initialisation');

    const showTrend = true;
    if (showTrend) {
      updateChartTrendLine(chart, chartData, startYear, currentYear);
    }

    updateSummaryTextElements(summaryData, averageData, trendData);
    applyTrendBackground(trendData?.slope ?? null, jobResultData.data?.unit_group || '', 'todayGradient', trendData?.gradientFactor ?? null);

    showChart();
    chart.update();

    setupShareButton('', { period: 'daily', identifier, ref_year: currentYear });

    if (window.currentUser) {
      if (responseTimeMs !== null) {
        const xCache = getLastXCache();
        window.TempHist.analytics.lastRequestMetadata = {
          response_time_ms: responseTimeMs,
          cache_hit: xCache !== null ? xCache.toUpperCase() === 'HIT' : null,
          canonical_location: jobResultData.data.location,
          requested_location: window.tempLocation!,
          selection_method: toSelectionMethod(window.tempLocationSource),
        };
      }
      sendAnalytics();
    }

    startPeriodDataPrefetch();
  } catch (error) {
    console.error('Error fetching historical data:', error);

    if (isAbortError(error)) {
      debugLog('Daily data fetch aborted (likely due to navigation)');
      return;
    }

    hideChart();

    const errorMessage = generateErrorMessage(error);
    showError(errorMessage);
  } finally {
    debugTimeEnd('Total fetch time');
    PerformanceMonitor.recordMetric('chart_creation_complete', performance.now());
  }
}
