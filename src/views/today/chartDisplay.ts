import { INITIAL_LOADING_TEXT, LOADING_TIMEOUTS } from '../../constants/index';
import { getDisplayCity } from '../../utils/location';
import { updateDataNotice } from '../../utils/dataNotice';
import { LoadingManager } from '../../utils/LoadingManager';
import { PerformanceMonitor } from '../../utils/PerformanceMonitor';
import { Logger } from '../../utils/Logger';

declare const Chart: any;
declare const debugLog: (...args: any[]) => void;

export function showInitialLoadingState(): void {
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

  const summaryTextEl = document.getElementById('summaryText');
  if (summaryTextEl) {
    summaryTextEl.classList.remove('visible');
    summaryTextEl.textContent = '';
  }
  const statsBubble = document.getElementById('todayStatsBubble');
  if (statsBubble) {
    statsBubble.classList.remove('visible');
  }

  LoadingManager.startGlobalLoading();

  const loadingText = document.getElementById('loadingText');
  if (loadingText) {
    loadingText.textContent = INITIAL_LOADING_TEXT;
  }
}

export function showError(message: string): void {
  const loadingEl = document.getElementById('loading');
  const canvasEl = document.getElementById('tempChart');

  LoadingManager.stopGlobalLoading();

  if (loadingEl) {
    loadingEl.classList.add('hidden');
    loadingEl.classList.remove('visible');
  }

  if (canvasEl) {
    canvasEl.classList.remove('visible');
    canvasEl.classList.add('hidden');
  }

  const dataNotice = document.getElementById('dataNotice');
  if (dataNotice) {
    const contentEl = document.createElement('div');
    contentEl.className = 'notice-content error';

    const retryBtn = document.createElement('button');
    retryBtn.className = 'btn-retry';
    retryBtn.type = 'button';
    retryBtn.textContent = 'Retry';
    retryBtn.addEventListener('click', () => {
      hideError();
      globalThis.retryDataFetch?.();
    });

    const titleEl = document.createElement('p');
    titleEl.className = 'notice-title large';
    const icon = document.createElement('span');
    icon.className = 'notice-icon';
    icon.textContent = '✕';
    titleEl.appendChild(icon);
    titleEl.appendChild(document.createTextNode(' Unable to load data'));

    const subtitleEl = document.createElement('p');
    subtitleEl.className = 'notice-subtitle secondary';
    subtitleEl.textContent = message;

    contentEl.appendChild(retryBtn);
    contentEl.appendChild(titleEl);
    contentEl.appendChild(subtitleEl);

    while (dataNotice.firstChild) dataNotice.removeChild(dataNotice.firstChild);
    dataNotice.appendChild(contentEl);
  }
}

export function hideError(): void {
  updateDataNotice(null);
}

export function showChart(): void {
  const minLoadingTime = LOADING_TIMEOUTS.MIN_LOADING_TIME * 1000;
  const elapsedTime = LoadingManager.getElapsedTime();
  const remainingTime = Math.max(0, minLoadingTime - elapsedTime);

  if (remainingTime > 0) {
    setTimeout(() => {
      actuallyShowChart();
    }, remainingTime);
  } else {
    actuallyShowChart();
  }
}

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

  const duration = Logger.endPerformance('fetchHistoricalData');
  PerformanceMonitor.recordMetric('data_fetch_complete', performance.now());
  Logger.info('Historical data fetch completed', {
    duration,
    location: globalThis.tempLocation,
    dataPoints: 0,
  });

  const incompleteDataNotice = document.getElementById('incompleteDataNotice');

  if (!incompleteDataNotice || incompleteDataNotice.style.display === 'none') {
    updateDataNotice('', {
      debugOnly: true,
      useStructuredHtml: true,
      type: 'success',
      title: '✅ Temperature data loaded successfully!',
      subtitle: `Showing data for ${getDisplayCity(globalThis.tempLocation!)}`,
    });
  } else {
    debugLog('Skipping success message because incomplete data notice is present');
  }

  if (canvasEl) {
    if (canvasEl.parentNode && document.contains(canvasEl)) {
      const registeredChart = Chart.getChart(canvasEl);
      if (registeredChart) {
        try {
          registeredChart.update();
          if (globalThis.TempHist) {
            globalThis.TempHist.mainChart = registeredChart;
          }
        } catch (error) {
          console.error('Error updating chart:', error);
          try {
            registeredChart.destroy();
          } catch (destroyError) {
            console.error('Error destroying chart:', destroyError);
          }
          if (globalThis.TempHist) {
            globalThis.TempHist.mainChart = null;
          }
        }
      } else {
        debugLog('No chart instance found on canvas element, skipping update');
        if (globalThis.TempHist) {
          globalThis.TempHist.mainChart = null;
        }
      }
    } else {
      debugLog('Canvas element no longer in DOM, skipping chart update');
    }
  }
}

export function hideChart(): void {
  const canvasEl = document.getElementById('tempChart');
  if (canvasEl) {
    canvasEl.classList.remove('visible');
    canvasEl.classList.add('hidden');
  }
}
