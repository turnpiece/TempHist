import {
  checkDataCompleteness,
  showFatalError,
  hideChartElements,
  showChartElements,
} from '../utils/uiHelpers';

/**
 * Dev-only window helpers for manual QA in the browser console.
 */
export function installDevTestHooks(debugLog: (...args: unknown[]) => void): void {
  window.testIncompleteData = function () {
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

  window.testFatalError = function () {
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

  window.testBasicFunctions = function () {
    debugLog('Testing basic functions...');
    showFatalError();
    hideChartElements();
    showChartElements();
    showFatalError('today');
    debugLog('Basic function tests complete');
  };

  window.testRetryButton = function () {
    debugLog('Testing retry button functionality...');
    showFatalError();
    setTimeout(() => {
      debugLog('Simulating retry button click...');
      window.retryDataFetch?.();
    }, 2000);
    debugLog('Retry button test complete');
  };
}
