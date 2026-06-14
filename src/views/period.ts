/**
 * Period views - Logic for rendering Week, Month, and Year temperature views
 */

import type { AsyncJobResponse } from '../types/index';
import { DEFAULT_LOCATION, INITIAL_LOADING_TEXT, LOADING_TIMEOUTS, DATE_RANGE_CONFIG } from '../constants/index';
import { getDisplayCity, getOrdinal, getCountryCodeForLocation } from '../utils/location';
import { LoadingManager } from '../utils/LoadingManager';
import { DataCache } from '../utils/DataCache';
import { FeatureFlags } from '../utils/FeatureFlags';
import { fetchTemperatureDataAsync, transformToChartData, calculateTemperatureRange, validateTemperatureDataResponse } from '../api/temperature';
import { createTemperatureChart, updateChartTrendLine } from '../chart/chart';
import { updateSummaryTextElements, buildLocationDisplay, checkDataCompleteness, showChartElements, generateErrorMessage, isAbortError, clearAllLoadingIntervals, createSpinner, applyTrendBackground, resetTrendBackground } from '../utils/uiHelpers';
import { setupChangeLocationButton } from './today';
import { setupShareButton } from '../share';
import { getEffectiveDateForLocation, localTodayIn, msUntilNextLocalMidnight } from '../utils/dateUtils';

declare const debugLog: (...args: any[]) => void;

interface PeriodDOMRefs {
  loadingEl: HTMLElement;
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
}

/**
 * Build the period pill-tab strip (Today / Past week / Past month / Past year)
 * that sits above the chart on every period view. Identical markup to the static
 * version embedded in #todayView so the router can highlight whichever instance
 * is currently visible.
 */
function buildPeriodTabs(): HTMLElement {
  const tabs = document.createElement('nav');
  tabs.className = 'period-tabs';
  tabs.setAttribute('aria-label', 'Time range');

  const entries: Array<{ route: string; label: string }> = [
    { route: '/today', label: 'Today' },
    { route: '/week', label: 'Past week' },
    { route: '/month', label: 'Past month' },
    { route: '/year', label: 'Past year' },
  ];

  for (const { route, label } of entries) {
    const a = document.createElement('a');
    a.className = 'period-tab';
    a.href = `#${route}`;
    a.dataset.route = route;
    a.textContent = label;
    tabs.appendChild(a);
  }

  return tabs;
}

interface ParsedPeriodData {
  temperatureData: any[];
  averageData: { temp: number; stdDev: number };
  trendData: { slope: number; slopeError: number; unit: string; gradientFactor: number | null };
  summaryData: any;
  metadata: any;
  unitGroup: string;
}

function buildPeriodSection(sec: HTMLElement, periodKey: string): PeriodDOMRefs | null {
  sec.replaceChildren();

  const container = document.createElement('div');
  container.className = 'container';

  const locationText = document.createElement('h2');
  locationText.id = `${periodKey}LocationText`;
  locationText.className = 'location-heading';
  container.appendChild(locationText);

  const dateHeading = document.createElement('div');
  dateHeading.id = `${periodKey}DateText`;
  dateHeading.className = 'period-subheading';
  container.appendChild(dateHeading);

  container.appendChild(buildPeriodTabs());

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
  loadingDiv.appendChild(createSpinner());

  const loadingText = document.createElement('p');
  loadingText.id = `${periodKey}LoadingText`;
  loadingText.className = 'loading-text';
  loadingText.textContent = INITIAL_LOADING_TEXT;
  loadingDiv.appendChild(loadingText);

  chartContainer.appendChild(loadingDiv);

  const canvasEl = document.createElement('canvas');
  canvasEl.id = `${periodKey}Chart`;
  chartContainer.appendChild(canvasEl);

  container.appendChild(chartContainer);

  const statsBubble = document.createElement('div');
  statsBubble.id = `${periodKey}StatsBubble`;
  statsBubble.className = 'stats-bubble';

  const avgText = document.createElement('div');
  avgText.id = `${periodKey}AvgText`;
  avgText.className = 'avg-text';
  statsBubble.appendChild(avgText);

  const trendText = document.createElement('div');
  trendText.id = `${periodKey}TrendText`;
  trendText.className = 'trend-text';
  statsBubble.appendChild(trendText);

  const stddevText = document.createElement('div');
  stddevText.id = `${periodKey}StddevText`;
  stddevText.className = 'stddev-text';
  statsBubble.appendChild(stddevText);

  container.appendChild(statsBubble);

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
    return null;
  }

  if (!(periodCanvasNode instanceof HTMLCanvasElement)) {
    debugLog(`${periodKey}: Expected a <canvas> element but found`, periodCanvasNode?.nodeName);
    return null;
  }

  const canvas = periodCanvasNode;

  if (!canvas.parentNode || !document.contains(canvas)) {
    debugLog(`${periodKey}: Canvas element not in DOM`);
    return null;
  }

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    debugLog(`${periodKey}: Could not get canvas context`);
    return null;
  }

  debugLog(`${periodKey} canvas dimensions:`, {
    width: canvas.clientWidth,
    height: canvas.clientHeight,
    offsetWidth: canvas.offsetWidth,
    offsetHeight: canvas.offsetHeight
  });

  canvas.width = canvas.clientWidth || 800;
  canvas.height = canvas.clientHeight || 400;

  return { loadingEl, canvas, ctx };
}

function parsePeriodData(weatherData: any, periodKey: string): ParsedPeriodData {
  let validationData: any;
  let temperatureData: any[];

  if (weatherData.data?.values) {
    validationData = weatherData.data;
    temperatureData = weatherData.data.values;
  } else if (weatherData.values) {
    validationData = weatherData;
    temperatureData = weatherData.values;
  } else {
    throw new Error('Invalid data format received. Expected values array.');
  }

  try {
    validateTemperatureDataResponse(validationData);
  } catch (validationError) {
    throw new Error(`Invalid temperature data format for ${periodKey}: ${validationError instanceof Error ? validationError.message : 'Unknown validation error'}`);
  }

  if (weatherData.data?.values) {
    return {
      temperatureData,
      averageData: {
        temp: weatherData.data.average.mean,
        stdDev: weatherData.data.average.standard_deviation
      },
      trendData: {
        slope: weatherData.data.trend.slope,
        slopeError: weatherData.data.trend.slope_error,
        unit: weatherData.data.trend.unit,
        gradientFactor: weatherData.data.trend.gradient_factor ?? null,
      },
      summaryData: weatherData.data.summary,
      metadata: weatherData.data.metadata,
      unitGroup: weatherData.data.unit_group || '',
    };
  }

  return {
    temperatureData,
    averageData: {
      temp: weatherData.average.mean,
      stdDev: weatherData.average.standard_deviation
    },
    trendData: {
      slope: weatherData.trend.slope,
      slopeError: weatherData.trend.slope_error,
      unit: weatherData.trend.unit,
      gradientFactor: weatherData.trend.gradient_factor ?? null,
    },
    summaryData: weatherData.summary,
    metadata: weatherData.metadata,
    unitGroup: weatherData.unit_group || '',
  };
}

function showPeriodError(periodKey: string, error: unknown): void {
  const dataNoticeEl = document.getElementById(`${periodKey}DataNotice`);
  if (!dataNoticeEl) return;

  const errorMessage = generateErrorMessage(error);

  const contentEl = document.createElement('div');
  contentEl.className = 'notice-content error';

  const retryBtn = document.createElement('button');
  retryBtn.className = 'btn-retry';
  retryBtn.type = 'button';
  retryBtn.textContent = 'Retry';
  retryBtn.addEventListener('click', () => { globalThis.TempHistViews[periodKey]?.render?.(); });

  const titleEl = document.createElement('p');
  titleEl.className = 'notice-title large';
  const icon = document.createElement('span');
  icon.className = 'notice-icon';
  icon.textContent = '✕';
  titleEl.appendChild(icon);
  titleEl.appendChild(document.createTextNode(' Unable to load data'));

  const subtitleEl = document.createElement('p');
  subtitleEl.className = 'notice-subtitle secondary';
  subtitleEl.textContent = errorMessage;

  contentEl.appendChild(retryBtn);
  contentEl.appendChild(titleEl);
  contentEl.appendChild(subtitleEl);

  dataNoticeEl.replaceChildren(contentEl);
}

/**
 * Render function for period pages (week, month, year)
 */
export async function renderPeriod(sectionId: string, periodKey: 'week' | 'month' | 'year', title: string): Promise<void> {
  const sec = document.getElementById(sectionId);
  if (!sec) return;

  resetTrendBackground();

  // Ensure location is set
  if (!globalThis.tempLocation) {
    await new Promise(resolve => setTimeout(resolve, 100));
    if (!globalThis.tempLocation) {
      debugLog('renderPeriod: No location found, using default');
      globalThis.tempLocation = DEFAULT_LOCATION;
      globalThis.tempLocationSource = 'default';
      globalThis.tempLocationIsDetected = false;
    }
  } else {
    debugLog('renderPeriod: Using existing location:', globalThis.tempLocation);
  }

  if (!globalThis.currentUser) {
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  const { day: dayStr, month: monthStr, year: yearNum } = getEffectiveDateForLocation(globalThis.tempLocationTimezone);
  const day = Number(dayStr);
  const monthName = new Date(yearNum, Number(monthStr) - 1, 1).toLocaleString('en-GB', { month: 'long' });
  const friendlyDate = `${getOrdinal(day)} ${monthName}`;

  const refs = buildPeriodSection(sec, periodKey);
  if (!refs) return;
  const { loadingEl, canvas, ctx } = refs;

  const dateTextEl = document.getElementById(`${periodKey}DateText`);
  if (dateTextEl) {
    dateTextEl.textContent = `${title} ending ${friendlyDate}`;
  }

  const currentLocation = globalThis.tempLocation!;
  const displayLocation = getDisplayCity(currentLocation);
  const locationTextElement = document.getElementById(`${periodKey}LocationText`);
  if (locationTextElement) {
    locationTextElement.className = `location-heading location-${globalThis.tempLocationSource || 'unknown'}`;
    const countryCode = getCountryCodeForLocation(globalThis.tempLocation!);
    buildLocationDisplay(locationTextElement, displayLocation, periodKey, countryCode, !!globalThis.tempLocationIsDetected);
    setupChangeLocationButton(periodKey);
  }

  loadingEl.classList.add('visible');
  loadingEl.classList.remove('hidden');
  canvas.classList.add('hidden');
  canvas.classList.remove('visible');

  const loadingStartTime = Date.now();
  clearAllLoadingIntervals();
  const periodLoadingInterval = LoadingManager.startPeriodLoading(periodKey);

  try {
    const identifier = `${monthStr}-${dayStr}`;
    const localToday = globalThis.tempLocationTimezone ? localTodayIn(globalThis.tempLocationTimezone) : undefined;
    const ttl = globalThis.tempLocationTimezone
      ? Math.min(10 * 60 * 1000, msUntilNextLocalMidnight(globalThis.tempLocationTimezone))
      : 10 * 60 * 1000;

    let weatherData: any;
    let fromCache = false;

    if (FeatureFlags.isEnabled('data_caching')) {
      const cacheKey = DataCache.generateTemperatureKey(periodKey, globalThis.tempLocation!, identifier, localToday);
      debugLog(`${periodKey}: Checking cache with key:`, cacheKey);
      weatherData = DataCache.get(cacheKey);

      if (weatherData) {
        fromCache = true;
        debugLog(`${periodKey}: Using cached data`);
      } else {
        debugLog(`${periodKey}: No cached data found`);
      }
    } else {
      debugLog(`${periodKey}: Data caching disabled by feature flag`);
    }

    if (!weatherData) {
      const onProgress = (status: AsyncJobResponse) => { debugLog(`${periodKey} job progress:`, status); };
      debugLog(`Starting ${periodKey} data fetch...`);
      weatherData = await fetchTemperatureDataAsync(periodKey, globalThis.tempLocation!, identifier, onProgress, localToday);

      if (FeatureFlags.isEnabled('data_caching')) {
        const cacheKey = DataCache.generateTemperatureKey(periodKey, globalThis.tempLocation!, identifier, localToday);
        DataCache.set(cacheKey, weatherData, ttl);
        debugLog(`${periodKey}: Data cached for future use`);
      }
    }

    debugLog(`${periodKey} data structure:`, weatherData);

    const { temperatureData, averageData, trendData, summaryData, metadata, unitGroup } =
      parsePeriodData(weatherData, periodKey);

    debugLog(`Checking data completeness for ${periodKey} data, metadata:`, metadata);
    const isDataComplete = checkDataCompleteness(metadata, periodKey);
    if (!isDataComplete) {
      debugLog(`${periodKey}: Data is incomplete or unavailable`);
      if (metadata?.completeness === 0) {
        debugLog(`No data available for ${periodKey} (0% completeness), stopping data processing`);
        return;
      }
      debugLog(`${periodKey}: Data is incomplete but present, continuing with warning notice`);
    } else {
      debugLog(`${periodKey}: Data is complete, no warning needed`);
    }

    const chartData = transformToChartData(temperatureData);
    debugLog(`${periodKey} chart data:`, chartData);
    debugLog(`${periodKey} chart data length:`, chartData.length);
    debugLog(`${periodKey} sample chart data point:`, chartData[0]);

    const tempRange = calculateTemperatureRange(chartData);
    const minTemp = tempRange.min;
    const maxTemp = tempRange.max;

    const years = chartData.map(d => d.y);
    if (years.length === 0) {
      throw new Error('Chart data contains no years');
    }

    const rawMinYear = Math.min(...years);
    const rawMaxYear = Math.max(...years);

    const earliestYear = DATE_RANGE_CONFIG.EARLIEST_YEAR;
    const latestYear = new Date().getFullYear() + DATE_RANGE_CONFIG.LATEST_YEAR_OFFSET;

    const minYear = Math.max(rawMinYear, earliestYear);
    const maxYear = Math.min(rawMaxYear, latestYear);

    if (rawMinYear < earliestYear || rawMaxYear > latestYear) {
      debugLog(`Year range adjusted: [${rawMinYear}, ${rawMaxYear}] -> [${minYear}, ${maxYear}]`);
    }

    const actualCurrentYear = new Date().getFullYear();

    const periodApiMap: Record<string, 'daily' | 'weekly' | 'monthly' | 'yearly'> = {
      week: 'weekly', month: 'monthly', year: 'yearly',
    };
    const apiPeriod = periodApiMap[periodKey] ?? 'daily';

    function actuallyShowPeriodChart() {
      loadingEl.classList.add('hidden');
      loadingEl.classList.remove('visible');
      canvas.classList.add('visible');
      canvas.classList.remove('hidden');

      LoadingManager.stopPeriodLoading(periodLoadingInterval);

      const chart = createTemperatureChart(
        ctx,
        chartData,
        { temp: averageData.temp, stdDev: averageData.stdDev },
        title,
        friendlyDate,
        minTemp,
        maxTemp,
        minYear,
        actualCurrentYear,
        `${periodKey}ly` as 'weekly' | 'monthly' | 'yearly'
      );

      updateChartTrendLine(chart, chartData, minYear, maxYear);
      showChartElements(periodKey);
      updateSummaryTextElements(summaryData, averageData, trendData, periodKey);
      applyTrendBackground(trendData?.slope ?? null, unitGroup, undefined, trendData?.gradientFactor ?? null);
      setupShareButton(periodKey, { period: apiPeriod, identifier, ref_year: actualCurrentYear });
    }

    if (fromCache) {
      actuallyShowPeriodChart();
    } else {
      const minLoadingTime = LOADING_TIMEOUTS.MIN_LOADING_TIME * 1000;
      const elapsedTime = Date.now() - loadingStartTime;
      const remainingTime = Math.max(0, minLoadingTime - elapsedTime);

      if (remainingTime > 0) {
        setTimeout(actuallyShowPeriodChart, remainingTime);
      } else {
        actuallyShowPeriodChart();
      }
    }

  } catch (error) {
    debugLog(`Error fetching ${periodKey} data:`, error);

    if (isAbortError(error)) {
      debugLog(`${periodKey} data fetch aborted (likely due to navigation)`);
      return;
    }

    loadingEl.classList.add('hidden');
    loadingEl.classList.remove('visible');
    LoadingManager.stopPeriodLoading(periodLoadingInterval);
    showPeriodError(periodKey, error);
  }
}
