/**
 * UI helper functions for temperature views
 */

import type { TemperatureDataMetadata } from '../types/index';
import { LoadingManager } from './LoadingManager';
import { updateDataNotice } from './dataNotice';
import { countryCodeToFlag } from './location';

declare const debugLog: (...args: any[]) => void;

/**
 * Clear all loading intervals (delegates to LoadingManager)
 */
export function clearAllLoadingIntervals(): void {
  LoadingManager.clearAllIntervals();
}

/**
 * Create a spinner element for use in loading states.
 */
export function createSpinner(): HTMLElement {
  const el = document.createElement('div');
  el.className = 'spinner';
  return el;
}

/**
 * Build location display with icon, optional country flag, and edit button.
 * Flag is shown for pre-approved locations; fallback icons for detected/manual.
 */
export function buildLocationDisplay(
  container: HTMLElement,
  displayText: string,
  periodKey: string = '',
  countryCode?: string | null
): void {
  const buttonId = periodKey ? `changeLocationBtn-${periodKey}` : 'changeLocationBtn';

  // Clear existing contents
  while (container.firstChild) {
    container.removeChild(container.firstChild);
  }

  // Choose prefix: flag for known location, 📍 for any other case
  const prefix = countryCode
    ? `${countryCodeToFlag(countryCode)} `
    : '📍 ';

  // Single button wrapping flag + name + pencil — whole heading is the tap target
  const button = document.createElement('button');
  button.id = buttonId;
  button.className = 'location-edit-btn';
  button.title = 'Change location';
  button.setAttribute('aria-label', `Change location: ${displayText}`);

  button.appendChild(document.createTextNode(`${prefix}${displayText}`));

  // Pencil icon — decorative, signals editability
  const svgNS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(svgNS, 'svg');
  svg.setAttribute('width', '18');
  svg.setAttribute('height', '18');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('xmlns', svgNS);

  const path = document.createElementNS(svgNS, 'path');
  path.setAttribute(
    'd',
    'M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z'
  );
  path.setAttribute('fill', 'currentColor');

  svg.appendChild(path);
  button.appendChild(svg);

  container.appendChild(button);
}

/**
 * Generate context-specific error messages
 */
export function generateErrorMessage(error: unknown): string {
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
      errorMessage = 'Unable to connect to the temperature data server. Please wait a moment and try again.';
    }
  }
  
  return errorMessage;
}

/**
 * Check if an error is an abort error (user navigated away or request cancelled)
 */
export function isAbortError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  
  return error.name === 'AbortError' || 
         error.message.includes('aborted') ||
         error.message.includes('AbortError') ||
         error.message.includes('Request aborted');
}

/**
 * Populate avg, stddev, and trend elements from stats data.
 * Unit-aware — pass '°F' and decimals=0 for Fahrenheit views.
 */
export function renderStatsToElements(
  avgTextEl: HTMLElement | null,
  stddevTextEl: HTMLElement | null,
  trendTextEl: HTMLElement | null,
  averageData: { temp: number; stdDev?: number | null },
  trendData: { slope: number; slopeError?: number | null; unit?: string },
  unitLabel: string = '°C',
  decimals: number = 1
): void {
  if (avgTextEl) {
    avgTextEl.textContent = `Average: ${averageData.temp.toFixed(decimals)}${unitLabel}`;
  }

  if (stddevTextEl) {
    if (averageData.stdDev != null) {
      stddevTextEl.textContent = `Standard deviation: ± ${averageData.stdDev.toFixed(decimals)}${unitLabel}`;
      stddevTextEl.style.display = '';
    } else {
      stddevTextEl.style.display = 'none';
    }
  }

  if (trendTextEl) {
    const direction = Math.abs(trendData.slope) < 0.05 ? 'stable' :
    trendData.slope > 0 ? 'rising' : 'falling';
    const unit = trendData.unit || `${unitLabel}/decade`;
    const slopeAbs = Math.abs(trendData.slope).toFixed(decimals);
    const errorPart = trendData.slopeError != null
      ? ` ± ${Math.abs(trendData.slopeError).toFixed(decimals)}`
      : '';
    trendTextEl.textContent = `Trend: ${direction} at ${slopeAbs}${errorPart}${unit}`;
  }
}

/**
 * Update summary, average, and trend text elements (ID-based lookup for normal views)
 */
export function updateSummaryTextElements(
  summaryText: string | null,
  averageData: { temp: number; stdDev?: number },
  trendData: { slope: number; slopeError?: number; unit?: string },
  periodKey: string = ''
): void {
  const summaryElId = periodKey ? `${periodKey}SummaryText` : 'summaryText';
  const avgElId = periodKey ? `${periodKey}AvgText` : 'avgText';
  const trendElId = periodKey ? `${periodKey}TrendText` : 'trendText';
  const stddevElId = periodKey ? `${periodKey}StddevText` : 'stddevText';

  const summaryTextEl = document.getElementById(summaryElId);
  const avgTextEl = document.getElementById(avgElId);
  const trendTextEl = document.getElementById(trendElId);
  const stddevTextEl = document.getElementById(stddevElId);

  if (summaryTextEl) {
    summaryTextEl.textContent = summaryText || 'No summary available.';
    summaryTextEl.classList.add('summary-text');
    summaryTextEl.classList.add('visible');
  }

  renderStatsToElements(avgTextEl, stddevTextEl, trendTextEl, averageData, trendData, '°C', 2);

  // Show stats bubble — use period-specific ID for period views, 'todayStatsBubble' for Today view
  const bubbleId = periodKey ? `${periodKey}StatsBubble` : 'todayStatsBubble';
  const statsBubble = document.getElementById(bubbleId);
  if (statsBubble) statsBubble.classList.add('visible');
}

/** Hide the overlay without clearing the stored gradient (used by non-data pages so Today can restore it on return). */
export function resetTrendBackground(): void {
  const el = document.getElementById('trend-bg') as HTMLDivElement | null;
  if (el) el.style.opacity = '0';
}

/** Hide the overlay AND clear the stored gradient (used on location change so the stale gradient isn't restored). */
export function clearTrendBackground(): void {
  const el = document.getElementById('trend-bg') as HTMLDivElement | null;
  if (!el) return;
  el.style.opacity = '0';
  el.dataset.gradient = '';
  el.dataset.todayGradient = '';
}

const BG_TOP:    [number,number,number] = [0x24, 0x24, 0x56];
const BG_BOTTOM: [number,number,number] = [0x34, 0x34, 0x99];
const DARK_WARM: [number,number,number] = [0xB3, 0x1A, 0x0D];
const DARK_COOL: [number,number,number] = [0x10, 0x50, 0xB0];

function lerpBg(a: [number,number,number], b: [number,number,number], t: number): string {
  const r = Math.round(a[0] + (b[0] - a[0]) * t);
  const g = Math.round(a[1] + (b[1] - a[1]) * t);
  const bl = Math.round(a[2] + (b[2] - a[2]) * t);
  return `rgb(${r},${g},${bl})`;
}

export function trendBackground(slopeCelsius: number): { top: string; bottom: string } | null {
  if (Math.abs(slopeCelsius) < 0.05) return null;
  const t = Math.sqrt(Math.min(Math.abs(slopeCelsius) / 0.65, 1.0));
  if (slopeCelsius > 0) {
    return { top: lerpBg(BG_TOP, DARK_WARM, t), bottom: lerpBg(BG_BOTTOM, DARK_COOL, t) };
  } else {
    return { top: lerpBg(BG_TOP, DARK_COOL, t), bottom: lerpBg(BG_BOTTOM, DARK_WARM, t) };
  }
}

export function applyTrendBackgroundFromFactor(factor: number, storeKey: string = 'gradient'): void {
  const el = document.getElementById('trend-bg') as HTMLDivElement | null;
  if (!el) return;
  const t = Math.abs(factor);
  if (t < 0.01) {
    el.dataset[storeKey] = '';
    el.style.opacity = '0';
    return;
  }
  const grad = factor > 0
    ? { top: lerpBg(BG_TOP, DARK_WARM, t), bottom: lerpBg(BG_BOTTOM, DARK_COOL, t) }
    : { top: lerpBg(BG_TOP, DARK_COOL, t), bottom: lerpBg(BG_BOTTOM, DARK_WARM, t) };
  const bg = `linear-gradient(${grad.top}, ${grad.bottom})`;
  el.style.backgroundImage = bg;
  el.dataset[storeKey] = bg;
  el.style.opacity = '1';
}

export function applyTrendBackground(slopeRaw: number | null, unitGroup: string, storeKey: string = 'gradient', gradientFactor?: number | null): void {
  if (gradientFactor != null && isFinite(gradientFactor)) {
    applyTrendBackgroundFromFactor(gradientFactor, storeKey);
    return;
  }
  const el = document.getElementById('trend-bg') as HTMLDivElement | null;
  if (!el) return;
  const slopeCelsius = slopeRaw != null ? (unitGroup === 'fahrenheit' ? slopeRaw * 5 / 9 : slopeRaw) : null;
  const grad = slopeCelsius != null ? trendBackground(slopeCelsius) : null;
  if (grad) {
    const bg = `linear-gradient(${grad.top}, ${grad.bottom})`;
    el.style.backgroundImage = bg;
    el.dataset[storeKey] = bg;
    el.style.opacity = '1';
  } else {
    el.dataset[storeKey] = '';
    el.style.opacity = '0';
  }
}

export function reapplyTrendBackground(): void {
  const el = document.getElementById('trend-bg') as HTMLDivElement | null;
  if (!el) return;
  const stored = el.dataset.todayGradient;
  if (stored) {
    el.style.backgroundImage = stored;
    el.style.opacity = '1';
  } else {
    el.style.opacity = '0';
  }
}

/**
 * Check if data is incomplete and show appropriate UI
 */
export function checkDataCompleteness(metadata: TemperatureDataMetadata | undefined, periodKey?: string): boolean {
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
export function showFatalError(periodKey?: string): void {
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

  // Hide chart elements
  hideChartElements(periodKey);

  // Show error message at the top using dataNotice
  const errorMessage = 'Unable to load temperature data. The server may be temporarily unavailable — please wait a moment and try again.';
  updateDataNotice(errorMessage, {
    type: 'error',
    title: '❌ No Data Available',
    subtitle: errorMessage
  });
}

/**
 * Hide chart elements
 */
export function hideChartElements(periodKey?: string): void {
  const isTodayView = !periodKey || periodKey === 'today' || periodKey === 'daily';
  
  if (isTodayView) {
    const chartElements = [
      document.getElementById('tempChart'),
      document.getElementById('summaryText'),
      document.getElementById('avgText'),
      document.getElementById('trendText')
    ];
    
    chartElements.forEach(el => {
      if (el) {
        el.classList.add('hidden');
        el.classList.remove('visible');
      }
    });
    
    // Also hide all elements with the data-field class
    const dataFields = document.querySelectorAll('.data-field');
    dataFields.forEach(el => {
      el.classList.add('hidden');
      el.classList.remove('visible');
    });
  } else {
    // For period-specific views
    const chartElements = [
      document.getElementById(`${periodKey}Chart`),
      document.getElementById(`${periodKey}SummaryText`),
      document.getElementById(`${periodKey}AvgText`),
      document.getElementById(`${periodKey}TrendText`)
    ];
    
    chartElements.forEach(el => {
      if (el) {
        el.classList.add('hidden');
        el.classList.remove('visible');
      }
    });
    
    // Also hide all elements with the data-field class
    const dataFields = document.querySelectorAll('.data-field');
    dataFields.forEach(el => {
      el.classList.add('hidden');
      el.classList.remove('visible');
    });
  }
}

/**
 * Show chart elements
 */
export function showChartElements(periodKey?: string): void {
  const isTodayView = !periodKey || periodKey === 'today' || periodKey === 'daily';

  // Only show the chart canvas — summary/stats visibility is controlled by
  // updateSummaryTextElements once data is populated, to avoid empty bubbles.
  if (isTodayView) {
    const chart = document.getElementById('tempChart');
    if (chart) { chart.classList.add('visible'); chart.classList.remove('hidden'); }
  } else {
    const chart = document.getElementById(`${periodKey}Chart`);
    if (chart) { chart.classList.add('visible'); chart.classList.remove('hidden'); }
  }
}

/**
 * Show incomplete data notice
 */
function buildMissingYearsText(metadata: TemperatureDataMetadata): string {
  const years = metadata.missing_years.map(y => y.year).sort();
  if (years.length === 0) return '';
  if (years.length === 1) return `Data for ${years[0]} could not be loaded.`;
  if (years.length === 2) return `Data for ${years[0]} and ${years[1]} could not be loaded.`;
  return `Data for ${years.slice(0, -1).join(', ')} and ${years[years.length - 1]} could not be loaded.`;
}

function buildIncompleteNoticeContent(metadata: TemperatureDataMetadata): HTMLDivElement {
  const missingYearsText = buildMissingYearsText(metadata);

  const contentEl = document.createElement('div');
  contentEl.className = 'notice-content warning inline';

  const retryButton = document.createElement('button');
  retryButton.className = 'notice-retry-btn';
  retryButton.textContent = 'Retry';
  retryButton.onclick = () => {
    if (window.retryDataFetch && typeof window.retryDataFetch === 'function') {
      window.retryDataFetch();
    }
  };
  contentEl.appendChild(retryButton);

  const titleEl = document.createElement('p');
  titleEl.className = 'notice-title large';
  titleEl.textContent = '⚠ Failed to load some chart data.';
  contentEl.appendChild(titleEl);

  if (missingYearsText) {
    const subtitleEl = document.createElement('p');
    subtitleEl.className = 'notice-subtitle secondary';
    subtitleEl.textContent = missingYearsText;
    contentEl.appendChild(subtitleEl);
  }

  return contentEl;
}

function showIncompleteDataNotice(metadata: TemperatureDataMetadata, periodKey?: string): void {
  debugLog('showIncompleteDataNotice called with metadata:', metadata, 'periodKey:', periodKey);
  debugLog('Missing years count:', metadata.missing_years.length);

  const isTodayView = !periodKey || periodKey === 'today' || periodKey === 'daily';

  if (isTodayView) {
    const dataNotice = document.getElementById('dataNotice');
    if (!dataNotice) return;

    while (dataNotice.firstChild) dataNotice.removeChild(dataNotice.firstChild);
    dataNotice.className = 'notice status-warning';
    dataNotice.appendChild(buildIncompleteNoticeContent(metadata));

    debugLog('Incomplete data warning displayed for Today view');
    return;
  }

  // For period-specific views, use the period-specific notice element
  const noticeEl = document.getElementById(`${periodKey}IncompleteDataNotice`);
  debugLog(`${periodKey}IncompleteDataNotice element found:`, noticeEl);

  if (noticeEl) {
    while (noticeEl.firstChild) noticeEl.removeChild(noticeEl.firstChild);
    noticeEl.appendChild(buildIncompleteNoticeContent(metadata));
    noticeEl.style.display = 'block';
    noticeEl.className = 'notice status-warning';
    debugLog('Incomplete data warning displayed in dedicated notice element');
  } else {
    debugLog('Incomplete data notice element not found, cannot show warning');
  }
}

/**
 * Hide incomplete data notice
 */
export function hideIncompleteDataNotice(periodKey?: string): void {
  // Check if this is the Today view (no periodKey, 'today', or 'daily')
  const isTodayView = !periodKey || periodKey === 'today' || periodKey === 'daily';
  
  if (isTodayView) {
    // For Today view, clear the dataNotice
    updateDataNotice(null);
  } else {
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
}

