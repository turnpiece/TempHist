import {
  checkDataCompleteness,
  showFatalError,
  hideChartElements,
  showChartElements,
  applyTrendBackground,
} from '../utils/uiHelpers';

/**
 * Dev-only window helpers for manual QA in the browser console.
 */
export function installDevTestHooks(debugLog: (...args: unknown[]) => void): void {
  globalThis.testIncompleteData = function () {
    debugLog('Testing incomplete data scenario...');
    const testMetadata = {
      total_years: 50,
      available_years: 35,
      missing_years: [
        { year: 1975, reason: 'Data unavailable' },
        { year: 1980, reason: 'Data unavailable' },
        { year: 1985, reason: 'Data unavailable' },
      ],
      completeness: 70,
      period_days: 1,
      end_date: '2024-01-01',
    };

    debugLog('Test metadata:', testMetadata);
    checkDataCompleteness(testMetadata, 'today');
  };

  globalThis.testFatalError = function () {
    debugLog('Testing fatal error scenario...');
    const testMetadata = {
      total_years: 51,
      available_years: 0,
      missing_years: [],
      completeness: 0,
      period_days: 1,
      end_date: '2024-01-01',
    };

    debugLog('Test metadata:', testMetadata);
    const result = checkDataCompleteness(testMetadata, 'today');
    debugLog('checkDataCompleteness returned:', result);
    showFatalError('today');
  };

  globalThis.testBasicFunctions = function () {
    debugLog('Testing basic functions...');
    showFatalError();
    hideChartElements();
    showChartElements();
    showFatalError('today');
    debugLog('Basic function tests complete');
  };

  globalThis.testRetryButton = function () {
    debugLog('Testing retry button functionality...');
    showFatalError();
    setTimeout(() => {
      debugLog('Simulating retry button click...');
      globalThis.retryDataFetch?.();
    }, 2000);
    debugLog('Retry button test complete');
  };

  // mockTrend(slope) — apply a trend background without real data.
  // slope is °C/decade; use a negative value for cooling, positive for warming.
  // Presets: mockTrend('cooling') → -0.5, mockTrend('warming') → 0.5
  globalThis.mockTrend = function (slope: number | 'cooling' | 'warming' = 'cooling') {
    const s = slope === 'cooling' ? -0.5 : slope === 'warming' ? 0.5 : slope;
    applyTrendBackground(s, 'metric');
    debugLog(`mockTrend: applied slope ${s}°C/decade (direction: ${s < 0 ? 'cooling' : 'warming'})`);
  };

  // Auto-apply if ?mockTrend=cooling|warming|<number> is in the URL.
  const mockParam = new URLSearchParams(globalThis.location.search).get('mockTrend');
  if (mockParam !== null) {
    const parsed = Number.parseFloat(mockParam);
    const slope = !Number.isNaN(parsed) ? parsed : (mockParam as 'cooling' | 'warming');
    // Defer so the page has had a chance to hide the overlay via its own load logic.
    setTimeout(() => globalThis.mockTrend!(slope), 500);
    debugLog(`mockTrend: auto-applying from URL param "${mockParam}"`);
  }

}
