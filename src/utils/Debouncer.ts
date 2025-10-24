/**
 * Debouncing utility to prevent excessive API calls
 * Useful for location changes, search inputs, and other rapid user interactions
 */

type DebouncedFunction<T extends any[]> = (...args: T) => void;

class Debouncer {
  private static timers = new Map<string, NodeJS.Timeout>();
  private static callbacks = new Map<string, DebouncedFunction<any>[]>();

  /**
   * Debounce a function call
   * @param key Unique identifier for the debounced function
   * @param callback Function to debounce
   * @param delay Delay in milliseconds
   * @param immediate Whether to call immediately on first invocation
   */
  static debounce<T extends any[]>(
    key: string,
    callback: DebouncedFunction<T>,
    delay: number = 300,
    immediate: boolean = false
  ): DebouncedFunction<T> {
    return (...args: T) => {
      // Clear existing timer
      if (this.timers.has(key)) {
        clearTimeout(this.timers.get(key)!);
      }

      // Store callback for potential immediate execution
      if (!this.callbacks.has(key)) {
        this.callbacks.set(key, []);
      }
      this.callbacks.get(key)!.push(callback);

      const execute = () => {
        const callbacks = this.callbacks.get(key) || [];
        callbacks.forEach(cb => cb(...args));
        this.timers.delete(key);
        this.callbacks.delete(key);
      };

      if (immediate && !this.timers.has(key)) {
        execute();
      } else {
        const timer = setTimeout(execute, delay);
        this.timers.set(key, timer);
      }
    };
  }

  /**
   * Cancel a debounced function
   * @param key Unique identifier for the debounced function
   */
  static cancel(key: string): void {
    if (this.timers.has(key)) {
      clearTimeout(this.timers.get(key)!);
      this.timers.delete(key);
      this.callbacks.delete(key);
    }
  }

  /**
   * Check if a debounced function is pending
   * @param key Unique identifier for the debounced function
   */
  static isPending(key: string): boolean {
    return this.timers.has(key);
  }

  /**
   * Clear all debounced functions
   */
  static clearAll(): void {
    this.timers.forEach(timer => clearTimeout(timer));
    this.timers.clear();
    this.callbacks.clear();
  }
}

export { Debouncer };
