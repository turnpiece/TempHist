import { LOADING_TIMEOUTS } from '../constants/index';
import { getDisplayCity } from './location';

/**
 * Consolidated loading message manager
 */
export class LoadingManager {
  private static readonly activeIntervals = new Set<NodeJS.Timeout>();
  private static globalStartTime: number | null = null;
  private static globalInterval: NodeJS.Timeout | null = null;
  private static retryMessage: string | null = null;

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
   * Get elapsed time since global loading started (in milliseconds)
   */
  static getElapsedTime(): number {
    if (!this.globalStartTime) {
      return 0;
    }
    return Date.now() - this.globalStartTime;
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
   * Show a retry message on all active loading text elements, overriding the normal cycle.
   * Call clearRetryMessage() before the next attempt to resume normal messages.
   */
  static showRetryMessage(message: string): void {
    this.retryMessage = message;
    const ids = ['loadingText', 'weekLoadingText', 'monthLoadingText', 'yearLoadingText'];
    for (const id of ids) {
      const el = document.getElementById(id);
      if (el) el.textContent = message;
    }
  }

  /**
   * Clear the retry message override so normal loading messages resume.
   */
  static clearRetryMessage(): void {
    this.retryMessage = null;
  }

  /**
   * Stop specific loading interval
   */
  static stopPeriodLoading(interval: NodeJS.Timeout): void {
    clearInterval(interval);
    this.activeIntervals.delete(interval);
  }

  private static getPageType(): 'today' | 'week' | 'month' | 'year' | 'other' {
    const hash = window.location.hash;
    if (hash === '' || hash === '#today' || hash === '#/today') return 'today';
    if (hash === '#week' || hash === '#/week') return 'week';
    if (hash === '#month' || hash === '#/month') return 'month';
    if (hash === '#year' || hash === '#/year') return 'year';
    return 'other';
  }

  private static getLoadingMessage(elapsedSeconds: number, pageType: string, displayCity: string): string {
    const { MESSAGE_CYCLES } = LOADING_TIMEOUTS;
    if (elapsedSeconds < MESSAGE_CYCLES.CONNECTING) {
      return 'Connecting to the temperature data server...';
    }
    if (elapsedSeconds < MESSAGE_CYCLES.ANALYZING) {
      const msgs: Record<string, string> = {
        today: `Is today warmer or cooler than average in ${displayCity}?`,
        week: `Has this past week been warmer or cooler than average in ${displayCity}?`,
        month: `Has this past month been warmer or cooler than average in ${displayCity}?`,
        year: `Has this past year been warmer or cooler than average in ${displayCity}?`,
        other: 'Getting temperature data for today over the past 50 years...',
      };
      return msgs[pageType] ?? msgs.other;
    }
    if (elapsedSeconds < MESSAGE_CYCLES.GENERATING) {
      const msgs: Record<string, string> = {
        today: `Analysing today's temperature in ${displayCity}...`,
        week: `Analysing this week's temperatures in ${displayCity}...`,
        month: `Analysing this month's temperatures in ${displayCity}...`,
        year: `Analysing this year's temperatures in ${displayCity}...`,
        other: `Analysing historical data for ${displayCity}...`,
      };
      return msgs[pageType] ?? msgs.other;
    }
    if (elapsedSeconds < MESSAGE_CYCLES.PATIENCE) {
      const msgs: Record<string, string> = {
        today: "Generating today's temperature comparison...",
        week: 'Generating weekly temperature comparison...',
        month: 'Generating monthly temperature comparison...',
        year: 'Generating yearly temperature comparison...',
        other: 'Generating temperature comparison chart...',
      };
      return msgs[pageType] ?? msgs.other;
    }
    if (elapsedSeconds < MESSAGE_CYCLES.LONG_WAIT) return 'You should be seeing a bar chart soon...';
    if (elapsedSeconds < MESSAGE_CYCLES.VERY_LONG_WAIT) return 'This is taking longer than usual. Please wait...';
    return 'This really is taking a while, maybe due to a slow internet connection, high server load or something may have gone wrong.';
  }

  private static getPeriodLoadingMessage(elapsedSeconds: number, periodKey: string, displayCity: string): string {
    const { MESSAGE_CYCLES } = LOADING_TIMEOUTS;
    if (elapsedSeconds < MESSAGE_CYCLES.CONNECTING) {
      return 'Connecting to the temperature data server...';
    }
    if (elapsedSeconds < MESSAGE_CYCLES.ANALYZING) {
      const msgs: Record<string, string> = {
        week: `Has this past week been warmer or cooler than average in ${displayCity}?`,
        month: `Has this past month been warmer or cooler than average in ${displayCity}?`,
        year: `Has this past year been warmer or cooler than average in ${displayCity}?`,
      };
      return msgs[periodKey] ?? '';
    }
    if (elapsedSeconds < MESSAGE_CYCLES.GENERATING) {
      const msgs: Record<string, string> = {
        week: `Analysing this week's temperatures in ${displayCity}...`,
        month: `Analysing this month's temperatures in ${displayCity}...`,
        year: `Analysing this year's temperatures in ${displayCity}...`,
      };
      return msgs[periodKey] ?? '';
    }
    if (elapsedSeconds < MESSAGE_CYCLES.PATIENCE) {
      const msgs: Record<string, string> = {
        week: 'Generating weekly temperature comparison...',
        month: 'Generating monthly temperature comparison...',
        year: 'Generating yearly temperature comparison...',
      };
      return msgs[periodKey] ?? '';
    }
    if (elapsedSeconds < MESSAGE_CYCLES.LONG_WAIT) return 'You should be seeing a bar chart soon...';
    if (elapsedSeconds < MESSAGE_CYCLES.VERY_LONG_WAIT) return 'This is taking longer than usual. Please wait...';
    return 'The data processing is taking a while. This may be due to high server load.';
  }

  private static updateGlobalLoadingMessage(): void {
    if (!this.globalStartTime) return;
    const loadingText = document.getElementById('loadingText');
    if (!loadingText) return;
    if (this.retryMessage !== null) { loadingText.textContent = this.retryMessage; return; }
    const elapsedSeconds = Math.floor((Date.now() - this.globalStartTime) / 1000);
    const displayCity = globalThis.tempLocation ? getDisplayCity(globalThis.tempLocation) : 'your location';
    loadingText.textContent = this.getLoadingMessage(elapsedSeconds, this.getPageType(), displayCity);
  }

  private static updatePeriodLoadingMessage(periodKey: 'week' | 'month' | 'year', startTime: number): void {
    const loadingText = document.getElementById(`${periodKey}LoadingText`);
    if (!loadingText) return;
    if (this.retryMessage !== null) { loadingText.textContent = this.retryMessage; return; }
    const elapsedSeconds = Math.floor((Date.now() - startTime) / 1000);
    const displayCity = globalThis.tempLocation ? getDisplayCity(globalThis.tempLocation) : 'your location';
    loadingText.textContent = this.getPeriodLoadingMessage(elapsedSeconds, periodKey, displayCity);
  }
}
