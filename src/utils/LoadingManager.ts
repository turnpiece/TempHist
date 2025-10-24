import { LOADING_TIMEOUTS } from '../constants/index';
import { getDisplayCity } from './location';

/**
 * Consolidated loading message manager
 */
export class LoadingManager {
  private static activeIntervals = new Set<NodeJS.Timeout>();
  private static globalStartTime: number | null = null;
  private static globalInterval: NodeJS.Timeout | null = null;

  /**
   * Clear all active loading intervals
   */
  static clearAllIntervals(): void {
    this.activeIntervals.forEach(interval => clearInterval(interval));
    this.activeIntervals.clear();
    if (this.globalInterval) {
      clearInterval(this.globalInterval);
      this.globalInterval = null;
    }
  }

  /**
   * Start global loading system
   */
  static startGlobalLoading(): void {
    this.clearAllIntervals();
    this.globalStartTime = Date.now();
    this.globalInterval = setInterval(() => this.updateGlobalLoadingMessage(), 1000);
    this.activeIntervals.add(this.globalInterval);
  }

  /**
   * Stop global loading system
   */
  static stopGlobalLoading(): void {
    if (this.globalInterval) {
      clearInterval(this.globalInterval);
      this.activeIntervals.delete(this.globalInterval);
      this.globalInterval = null;
    }
    this.globalStartTime = null;
  }

  /**
   * Start period-specific loading system
   */
  static startPeriodLoading(periodKey: 'week' | 'month' | 'year'): NodeJS.Timeout {
    const startTime = Date.now();
    const interval = setInterval(() => this.updatePeriodLoadingMessage(periodKey, startTime), 1000);
    this.activeIntervals.add(interval);
    return interval;
  }

  /**
   * Stop specific loading interval
   */
  static stopPeriodLoading(interval: NodeJS.Timeout): void {
    clearInterval(interval);
    this.activeIntervals.delete(interval);
  }

  /**
   * Update global loading message
   */
  private static updateGlobalLoadingMessage(): void {
    if (!this.globalStartTime) return;
    
    const elapsedSeconds = Math.floor((Date.now() - this.globalStartTime) / 1000);
    const loadingText = document.getElementById('loadingText');
    if (!loadingText) return;

    // Get current page/period
    const currentHash = window.location.hash;
    const isTodayPage = currentHash === '' || currentHash === '#today' || currentHash === '#/today';
    const isWeekPage = currentHash === '#week' || currentHash === '#/week';
    const isMonthPage = currentHash === '#month' || currentHash === '#/month';
    const isYearPage = currentHash === '#year' || currentHash === '#/year';
    
    const displayCity = window.tempLocation ? getDisplayCity(window.tempLocation) : 'your location';
    
    if (elapsedSeconds < LOADING_TIMEOUTS.MESSAGE_CYCLES.CONNECTING) {
      loadingText.textContent = 'Connecting to the temperature data server...';
    } else if (elapsedSeconds < LOADING_TIMEOUTS.MESSAGE_CYCLES.ANALYZING) {
      if (isTodayPage) {
        loadingText.textContent = `Is today warmer or cooler than average in ${displayCity}?`;
      } else if (isWeekPage) {
        loadingText.textContent = `Has this past week been warmer or cooler than average in ${displayCity}?`;
      } else if (isMonthPage) {
        loadingText.textContent = `Has this past month been warmer or cooler than average in ${displayCity}?`;
      } else if (isYearPage) {
        loadingText.textContent = `Has this past year been warmer or cooler than average in ${displayCity}?`;
      } else {
        loadingText.textContent = 'Getting temperature data for today over the past 50 years...';
      }
    } else if (elapsedSeconds < LOADING_TIMEOUTS.MESSAGE_CYCLES.GENERATING) {
      if (isTodayPage) {
        loadingText.textContent = `Analysing today's temperature in ${displayCity}...`;
      } else if (isWeekPage) {
        loadingText.textContent = `Analysing this week's temperatures in ${displayCity}...`;
      } else if (isMonthPage) {
        loadingText.textContent = `Analysing this month's temperatures in ${displayCity}...`;
      } else if (isYearPage) {
        loadingText.textContent = `Analysing this year's temperatures in ${displayCity}...`;
      } else {
        loadingText.textContent = 'Analysing historical data for ' + displayCity + '...';
      }
    } else if (elapsedSeconds < LOADING_TIMEOUTS.MESSAGE_CYCLES.PATIENCE) {
      if (isTodayPage) {
        loadingText.textContent = 'Generating today\'s temperature comparison...';
      } else if (isWeekPage) {
        loadingText.textContent = 'Generating weekly temperature comparison...';
      } else if (isMonthPage) {
        loadingText.textContent = 'Generating monthly temperature comparison...';
      } else if (isYearPage) {
        loadingText.textContent = 'Generating yearly temperature comparison...';
      } else {
        loadingText.textContent = 'Generating temperature comparison chart...';
      }
    } else if (elapsedSeconds < LOADING_TIMEOUTS.MESSAGE_CYCLES.LONG_WAIT) {
      loadingText.textContent = 'You should be seeing a bar chart soon...';
    } else if (elapsedSeconds < LOADING_TIMEOUTS.MESSAGE_CYCLES.VERY_LONG_WAIT) {
      loadingText.textContent = 'This is taking longer than usual. Please wait...';
    } else {
      loadingText.textContent = 'This really is taking a while, maybe due to a slow internet connection, high server load or something may have gone wrong.';
    }
  }

  /**
   * Update period-specific loading message
   */
  private static updatePeriodLoadingMessage(periodKey: 'week' | 'month' | 'year', startTime: number): void {
    const elapsedSeconds = Math.floor((Date.now() - startTime) / 1000);
    const loadingText = document.getElementById(`${periodKey}LoadingText`);
    
    if (!loadingText) return;
    
    const displayCity = window.tempLocation ? getDisplayCity(window.tempLocation) : 'your location';
    
    if (elapsedSeconds < LOADING_TIMEOUTS.MESSAGE_CYCLES.CONNECTING) {
      loadingText.textContent = 'Connecting to the temperature data server...';
    } else if (elapsedSeconds < LOADING_TIMEOUTS.MESSAGE_CYCLES.ANALYZING) {
      if (periodKey === 'week') {
        loadingText.textContent = `Has this past week been warmer or cooler than average in ${displayCity}?`;
      } else if (periodKey === 'month') {
        loadingText.textContent = `Has this past month been warmer or cooler than average in ${displayCity}?`;
      } else if (periodKey === 'year') {
        loadingText.textContent = `Has this past year been warmer or cooler than average in ${displayCity}?`;
      }
    } else if (elapsedSeconds < LOADING_TIMEOUTS.MESSAGE_CYCLES.GENERATING) {
      if (periodKey === 'week') {
        loadingText.textContent = `Analysing this week's temperatures in ${displayCity}...`;
      } else if (periodKey === 'month') {
        loadingText.textContent = `Analysing this month's temperatures in ${displayCity}...`;
      } else if (periodKey === 'year') {
        loadingText.textContent = `Analysing this year's temperatures in ${displayCity}...`;
      }
    } else if (elapsedSeconds < LOADING_TIMEOUTS.MESSAGE_CYCLES.PATIENCE) {
      if (periodKey === 'week') {
        loadingText.textContent = 'Generating weekly temperature comparison...';
      } else if (periodKey === 'month') {
        loadingText.textContent = 'Generating monthly temperature comparison...';
      } else if (periodKey === 'year') {
        loadingText.textContent = 'Generating yearly temperature comparison...';
      }
    } else if (elapsedSeconds < LOADING_TIMEOUTS.MESSAGE_CYCLES.LONG_WAIT) {
      loadingText.textContent = 'You should be seeing a bar chart soon...';
    } else if (elapsedSeconds < LOADING_TIMEOUTS.MESSAGE_CYCLES.VERY_LONG_WAIT) {
      loadingText.textContent = 'This is taking longer than usual. Please wait...';
    } else {
      loadingText.textContent = 'The data processing is taking a while. This may be due to high server load.';
    }
  }
}
