/**
 * Lazy loading utility for period views
 * Only loads data when the user actually navigates to a period view
 */

import { fetchTemperatureDataAsync } from '../api/temperature';

// Import debugLog from main.ts (it's global)
declare const debugLog: (...args: any[]) => void;
import { LOADING_TIMEOUTS } from '../constants/index';

interface LazyLoadOptions {
  timeout?: number;
  retries?: number;
  onProgress?: (status: any) => void;
}

class LazyLoader {
  private static cache = new Map<string, Promise<any>>();
  private static loadingStates = new Map<string, boolean>();
  private static retryCounts = new Map<string, number>();

  /**
   * Load data for a specific period view
   */
  static async loadPeriodData(
    periodKey: 'week' | 'month' | 'year',
    location: string,
    identifier: string,
    options: LazyLoadOptions = {}
  ): Promise<any> {
    const cacheKey = `${periodKey}-${location}-${identifier}`;
    
    // Return cached promise if already loading
    if (this.cache.has(cacheKey)) {
      debugLog(`LazyLoader: Returning cached promise for ${cacheKey}`);
      return this.cache.get(cacheKey);
    }

    // Check if already loaded in global cache
    if (window.TempHist.cache.prefetch[periodKey]) {
      debugLog(`LazyLoader: Data already in global cache for ${periodKey}`);
      return Promise.resolve(window.TempHist.cache.prefetch[periodKey]);
    }

    // Set loading state
    this.loadingStates.set(cacheKey, true);
    
    // Create and cache the promise
    const loadPromise = this.performLoad(periodKey, location, identifier, options);
    this.cache.set(cacheKey, loadPromise);

    try {
      const result = await loadPromise;
      this.loadingStates.set(cacheKey, false);
      return result;
    } catch (error) {
      this.loadingStates.set(cacheKey, false);
      this.cache.delete(cacheKey);
      throw error;
    }
  }

  /**
   * Check if data is currently being loaded
   */
  static isLoading(periodKey: 'week' | 'month' | 'year', location: string, identifier: string): boolean {
    const cacheKey = `${periodKey}-${location}-${identifier}`;
    return this.loadingStates.get(cacheKey) || false;
  }

  /**
   * Clear cache for a specific period or all periods
   */
  static clearCache(periodKey?: 'week' | 'month' | 'year'): void {
    if (periodKey) {
      // Clear specific period
      const keysToDelete = Array.from(this.cache.keys()).filter(key => key.startsWith(periodKey));
      keysToDelete.forEach(key => {
        this.cache.delete(key);
        this.loadingStates.delete(key);
        this.retryCounts.delete(key);
      });
      debugLog(`LazyLoader: Cleared cache for ${periodKey}`);
    } else {
      // Clear all cache
      this.cache.clear();
      this.loadingStates.clear();
      this.retryCounts.clear();
      debugLog('LazyLoader: Cleared all cache');
    }
  }

  /**
   * Preload data in the background (low priority)
   */
  static preloadPeriodData(
    periodKey: 'week' | 'month' | 'year',
    location: string,
    identifier: string
  ): void {
    // Use requestIdleCallback for low-priority background loading
    const ric = window.requestIdleCallback || ((callback: () => void) => setTimeout(callback, 1000));
    
    ric(() => {
      debugLog(`LazyLoader: Preloading ${periodKey} data in background`);
      this.loadPeriodData(periodKey, location, identifier, { timeout: 30000 })
        .then(() => {
          debugLog(`LazyLoader: Successfully preloaded ${periodKey} data`);
        })
        .catch((error) => {
          debugLog(`LazyLoader: Failed to preload ${periodKey} data:`, error);
        });
    });
  }

  /**
   * Perform the actual data loading
   */
  private static async performLoad(
    periodKey: 'week' | 'month' | 'year',
    location: string,
    identifier: string,
    options: LazyLoadOptions
  ): Promise<any> {
    const cacheKey = `${periodKey}-${location}-${identifier}`;
    const retryCount = this.retryCounts.get(cacheKey) || 0;
    const maxRetries = options.retries || 3;

    try {
      debugLog(`LazyLoader: Loading ${periodKey} data for ${location} (attempt ${retryCount + 1})`);
      
      const result = await fetchTemperatureDataAsync(
        periodKey,
        location,
        identifier,
        options.onProgress
      );

      // Store in global cache for consistency
      window.TempHist.cache.prefetch[periodKey] = result.data;
      
      debugLog(`LazyLoader: Successfully loaded ${periodKey} data`);
      return result;
    } catch (error) {
      if (retryCount < maxRetries) {
        this.retryCounts.set(cacheKey, retryCount + 1);
        debugLog(`LazyLoader: Retrying ${periodKey} data load (attempt ${retryCount + 2})`);
        
        // Exponential backoff
        const delay = Math.pow(2, retryCount) * 1000;
        await new Promise(resolve => setTimeout(resolve, delay));
        
        return this.performLoad(periodKey, location, identifier, options);
      } else {
        debugLog(`LazyLoader: Failed to load ${periodKey} data after ${maxRetries} attempts`);
        throw error;
      }
    }
  }
}

export { LazyLoader };
