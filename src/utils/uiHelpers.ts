/**
 * UI helper functions for temperature views
 */

import type { TemperatureDataMetadata } from '../types/index';
import { LoadingManager } from './LoadingManager';
import { updateDataNotice } from './dataNotice';
import { getDisplayCity } from './location';

declare const debugLog: (...args: any[]) => void;

/**
 * Build location display with edit button
 */
export function buildLocationDisplay(
  container: HTMLElement,
  displayText: string,
  periodKey: string = ''
): void {
  const buttonId = periodKey ? `changeLocationBtn-${periodKey}` : 'changeLocationBtn';

  // Clear existing contents
  while (container.firstChild) {
    container.removeChild(container.firstChild);
  }

  // Text node for the location name
  container.appendChild(document.createTextNode(displayText + ' '));

  // Edit button
  const button = document.createElement('button');
  button.id = buttonId;
  button.className = 'location-edit-icon';
  button.title = 'Change location';
  button.setAttribute('aria-label', 'Change location');

  // SVG icon
  const svgNS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(svgNS, 'svg');
  svg.setAttribute('width', '14');
  svg.setAttribute('height', '14');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
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
      errorMessage = 'Unable to start data processing. Please check your connection and try again.';
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
 * Update summary, average, and trend text elements
 */
export function updateSummaryTextElements(
  summaryText: string | null,
  averageData: { temp: number },
  trendData: { slope: number; unit?: string },
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
    avgTextEl.textContent = `Average: ${averageData.temp.toFixed(1)}°C`;
    if (periodKey) {
      avgTextEl.classList.add('avg-text');
    }
  }
  
  if (trendTextEl && trendData) {
    // Use actual slope value for direction determination, not rounded display value
    const direction = Math.abs(trendData.slope) < 0.05 ? 'stable' : 
                     trendData.slope > 0 ? 'rising' : 'falling';
    const unit = trendData.unit || '°C/decade';
    const formatted = `Trend: ${direction} at ${Math.abs(trendData.slope).toFixed(1)}${unit}`;
    trendTextEl.textContent = formatted;
    if (periodKey) {
      trendTextEl.classList.add('trend-text');
    }
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

  // Hide chart elements
  hideChartElements(periodKey);

  // Show error message at the top using dataNotice
  const errorMessage = 'Unable to load temperature data. Please check your connection and try again.';
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
  
  if (isTodayView) {
    const chartElements = [
      document.getElementById('tempChart'),
      document.getElementById('summaryText'),
      document.getElementById('avgText'),
      document.getElementById('trendText')
    ];
    
    chartElements.forEach(el => {
      if (el) {
        el.classList.add('visible');
        el.classList.remove('hidden');
      }
    });
    
    // Also show all elements with the data-field class
    const dataFields = document.querySelectorAll('.data-field');
    dataFields.forEach(el => {
      el.classList.add('visible');
      el.classList.remove('hidden');
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
        el.classList.add('visible');
        el.classList.remove('hidden');
      }
    });
    
    // Also show all elements with the data-field class
    const dataFields = document.querySelectorAll('.data-field');
    dataFields.forEach(el => {
      el.classList.add('visible');
      el.classList.remove('hidden');
    });
  }
}

/**
 * Show incomplete data notice
 */
function showIncompleteDataNotice(metadata: TemperatureDataMetadata, periodKey?: string): void {
  // Check if this is the Today view (no periodKey, 'today', or 'daily')
  const isTodayView = !periodKey || periodKey === 'today' || periodKey === 'daily';
  
  if (isTodayView) {
    const noticeEl = document.getElementById('incompleteDataWarning');
    if (!noticeEl) {
      debugLog('incompleteDataWarning element not found');
      return;
    }
    
    const missingCount = metadata.missing_years.length;
    const completeness = Math.round(metadata.completeness);
    
    let message = `⚠️ Data is ${completeness}% complete`;
    if (missingCount > 0) {
      message += ` (${missingCount} year${missingCount > 1 ? 's' : ''} missing)`;
    }
    
    noticeEl.textContent = message;
    noticeEl.style.display = 'block';
    debugLog('Showing incomplete data notice for Today view:', message);
  } else {
    // For period-specific views, use the period-specific notice element
    const noticeEl = document.getElementById(`${periodKey}IncompleteDataNotice`);
    if (!noticeEl) {
      debugLog(`${periodKey}IncompleteDataNotice element not found`);
      return;
    }
    
    const missingCount = metadata.missing_years.length;
    const completeness = Math.round(metadata.completeness);
    
    let message = `⚠️ Data is ${completeness}% complete`;
    if (missingCount > 0) {
      message += ` (${missingCount} year${missingCount > 1 ? 's' : ''} missing)`;
    }
    
    noticeEl.textContent = message;
    noticeEl.style.display = 'block';
    debugLog(`Showing incomplete data notice for ${periodKey} view:`, message);
  }
}

/**
 * Hide incomplete data notice
 */
function hideIncompleteDataNotice(periodKey?: string): void {
  // Check if this is the Today view (no periodKey, 'today', or 'daily')
  const isTodayView = !periodKey || periodKey === 'today' || periodKey === 'daily';
  
  if (isTodayView) {
    const noticeEl = document.getElementById('incompleteDataWarning');
    if (noticeEl) {
      noticeEl.style.display = 'none';
      noticeEl.textContent = '';
    }
  } else {
    // For period-specific views, hide the period-specific notice element
    const noticeEl = document.getElementById(`${periodKey}IncompleteDataNotice`);
    if (noticeEl) {
      noticeEl.style.display = 'none';
      noticeEl.textContent = '';
    }
  }
}

