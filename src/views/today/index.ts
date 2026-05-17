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
import { hideError } from './chartDisplay';

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

  const now = new Date();
  const useYesterday = now.getHours() < 1;
  const dateToUse = new Date(now);

  debugLog('Date calculations complete:', { now, useYesterday, dateToUse });

  if (useYesterday) {
    dateToUse.setDate(dateToUse.getDate() - 1);
    debugLog("Using yesterday's date");
  }

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
    const spinner = document.querySelector('.spinner');

    if (summaryText) summaryText.classList.add('summary-text');
    if (avgText) avgText.classList.add('avg-text');
    if (trendText) trendText.classList.add('trend-text');

    if (header) (header as HTMLElement).style.color = barColour;

    if (spinner) {
      (spinner as HTMLElement).style.borderColor = `${barColour}33`;
      (spinner as HTMLElement).style.borderTopColor = barColour;
    }
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

  const reloadButton = document.getElementById('reloadButton');
  if (reloadButton) {
    reloadButton.addEventListener('click', () => {
      hideError();
      fetchHistoricalData();
    });
  }

  if (window.tempLocation) {
    displayLocationAndFetchData();
  }
}

window.calculateTrendLine = calculateTrendLine;
window.fetchHistoricalData = fetchHistoricalData;
