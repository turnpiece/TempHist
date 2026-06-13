/**
 * Today view - Main application logic for the Today temperature view
 */

import { DEFAULT_LOCATION, DATE_RANGE_CONFIG } from '../../constants/index';
import { getOrdinal } from '../../utils/location';
import { updateDataNotice } from '../../utils/dataNotice';
import { calculateTrendLine } from '../../chart/chart';
import { setupMobileNavigation, checkAndHandleDateChange } from '../../splash/splash';
import { displayLocationAndFetchData } from './locationHandlers';
import { fetchHistoricalData } from './fetchHistoricalData';
import { getEffectiveDateForLocation } from '../../utils/dateUtils';
import { clearTrendBackground } from '../../utils/uiHelpers';

declare const Chart: any;
declare const debugLog: (...args: any[]) => void;

export { setupChangeLocationButton } from './locationHandlers';
export { fetchHistoricalData } from './fetchHistoricalData';

export function mainAppLogic(): void {
  const isStandalonePage = !document.querySelector('#todayView');
  if (isStandalonePage) {
    debugLog('Standalone page detected, skipping main app logic');
    setupMobileNavigation();
    return;
  }

  clearTrendBackground();
  window.scrollTo({ top: 0, behavior: 'instant' });
  document.documentElement.scrollTop = 0;
  document.body.scrollTop = 0;

  debugLog('mainAppLogic called with window.tempLocation:', window.tempLocation);

  checkAndHandleDateChange();

  if (typeof Chart === 'undefined') {
    console.error('Chart.js not loaded');
    return;
  }

  if (window['chartjs-plugin-annotation']) {
    Chart.register(window['chartjs-plugin-annotation']);
  }

  debugLog('Constants initialized');

  const { day, month, year: currentYear } = getEffectiveDateForLocation(window.tempLocationTimezone);

  debugLog('Date components prepared:', { day, month, currentYear });

  const maxAllowedYear = new Date().getFullYear() + DATE_RANGE_CONFIG.LATEST_YEAR_OFFSET;
  const validatedCurrentYear = Math.min(
    Math.max(currentYear, DATE_RANGE_CONFIG.EARLIEST_YEAR),
    maxAllowedYear
  );
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

  const existingChart = Chart.getChart(canvasEl);
  if (existingChart) {
    debugLog('Destroying existing chart before creating new one');
    existingChart.destroy();
  }

  window.TempHist = window.TempHist || {};
  window.TempHist.mainChart = null;

  const barColour = '#ff6b6b';

  const friendlyDate = `${getOrdinal(Number(day))} ${new Date().toLocaleString('en-GB', { month: 'long' })}`;

  const dateTextEl = document.getElementById('dateText');
  if (dateTextEl) {
    dateTextEl.textContent = friendlyDate;
  }

  updateDataNotice('Determining your location...', { type: 'neutral' });

  function applyTextColors(): void {
    const summaryText = document.getElementById('summaryText');
    const avgText = document.getElementById('avgText');
    const trendText = document.getElementById('trendText');
    const header = document.getElementById('header');

    if (summaryText) summaryText.classList.add('summary-text');
    if (avgText) avgText.classList.add('avg-text');
    if (trendText) trendText.classList.add('trend-text');

    if (header) (header as HTMLElement).style.color = barColour;
  }

  applyTextColors();

  if (loadingEl) {
    loadingEl.classList.add('hidden');
    loadingEl.classList.remove('visible');
  }

  debugLog('DOM elements and variables initialized');

  if (!window.tempLocation) {
    window.tempLocation = DEFAULT_LOCATION;
    window.tempLocationSource = 'default';
    window.tempLocationIsDetected = false;
  }

  if (window.tempLocation) {
    displayLocationAndFetchData();
  }
}

window.calculateTrendLine = calculateTrendLine;
window.fetchHistoricalData = fetchHistoricalData;
