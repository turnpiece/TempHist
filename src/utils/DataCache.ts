/**
 * Advanced data caching with TTL (Time To Live) support
 * Provides intelligent caching for chart data, API responses, and computed results
 */

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number;
  accessCount: number;
  lastAccessed: number;
}

interface CacheOptions {
  ttl?: number; // Time to live in milliseconds
  maxSize?: number; // Maximum number of entries
  maxAge?: number; // Maximum age in milliseconds
}

class DataCache {
  private static cache = new Map<string, CacheEntry<any>>();
  private static options: CacheOptions = {
    ttl: 5 * 60 * 1000, // 5 minutes default
    maxSize: 100,
    maxAge: 30 * 60 * 1000 // 30 minutes max age
  };

  /**
   * Set cache options
   */
  static configure(options: CacheOptions): void {
    this.options = { ...this.options, ...options };
  }

  /**
   * Get data from cache
   */
  static get<T>(key: string): T | null {
    const entry = this.cache.get(key);
    
    if (!entry) {
      return null;
    }

    const now = Date.now();
    
    // Check if entry has expired
    if (now - entry.timestamp > entry.ttl) {
      this.cache.delete(key);
      return null;
    }

    // Check if entry is too old
    if (this.options.maxAge && now - entry.timestamp > this.options.maxAge) {
      this.cache.delete(key);
      return null;
    }

    // Update access statistics
    entry.accessCount++;
    entry.lastAccessed = now;

    return entry.data;
  }

  /**
   * Set data in cache
   */
  static set<T>(key: string, data: T, ttl?: number): void {
    const now = Date.now();
    const entryTtl = ttl || this.options.ttl || 5 * 60 * 1000;

    // Check cache size limit
    if (this.cache.size >= (this.options.maxSize || 100)) {
      this.evictLeastUsed();
    }

    this.cache.set(key, {
      data,
      timestamp: now,
      ttl: entryTtl,
      accessCount: 1,
      lastAccessed: now
    });
  }

  /**
   * Check if key exists in cache and is not expired
   */
  static has(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;

    const now = Date.now();
    return (now - entry.timestamp) <= entry.ttl;
  }

  /**
   * Delete specific key from cache
   */
  static delete(key: string): boolean {
    return this.cache.delete(key);
  }

  /**
   * Clear all cache entries
   */
  static clear(): void {
    this.cache.clear();
  }

  /**
   * Get cache statistics
   */
  static getStats(): {
    size: number;
    hitRate: number;
    oldestEntry: number;
    newestEntry: number;
  } {
    const entries = Array.from(this.cache.values());
    const now = Date.now();
    
    return {
      size: this.cache.size,
      hitRate: entries.reduce((sum, entry) => sum + entry.accessCount, 0) / Math.max(entries.length, 1),
      oldestEntry: entries.length > 0 ? Math.min(...entries.map(e => e.timestamp)) : 0,
      newestEntry: entries.length > 0 ? Math.max(...entries.map(e => e.timestamp)) : 0
    };
  }

  /**
   * Clean up expired entries
   */
  static cleanup(): number {
    const now = Date.now();
    let cleanedCount = 0;

    for (const [key, entry] of this.cache.entries()) {
      const isExpired = (now - entry.timestamp) > entry.ttl;
      const isTooOld = this.options.maxAge && (now - entry.timestamp) > this.options.maxAge;
      
      if (isExpired || isTooOld) {
        this.cache.delete(key);
        cleanedCount++;
      }
    }

    return cleanedCount;
  }

  /**
   * Evict least used entries when cache is full
   */
  private static evictLeastUsed(): void {
    const entries = Array.from(this.cache.entries());
    
    // Sort by access count and last accessed time
    entries.sort((a, b) => {
      const scoreA = a[1].accessCount * 0.7 + (Date.now() - a[1].lastAccessed) * 0.3;
      const scoreB = b[1].accessCount * 0.7 + (Date.now() - b[1].lastAccessed) * 0.3;
      return scoreA - scoreB;
    });

    // Remove the least used 10% of entries
    const toRemove = Math.ceil(entries.length * 0.1);
    for (let i = 0; i < toRemove; i++) {
      this.cache.delete(entries[i][0]);
    }
  }

  /**
   * Generate cache key for temperature data
   */
  static generateTemperatureKey(
    period: 'daily' | 'week' | 'month' | 'year',
    location: string,
    identifier: string
  ): string {
    return `temp-${period}-${location}-${identifier}`;
  }

  /**
   * Generate cache key for location data
   */
  static generateLocationKey(location: string): string {
    return `location-${location}`;
  }

  /**
   * Generate cache key for chart data
   */
  static generateChartKey(
    period: 'daily' | 'week' | 'month' | 'year',
    location: string,
    identifier: string
  ): string {
    return `chart-${period}-${location}-${identifier}`;
  }
}

// Auto-cleanup every 5 minutes
setInterval(() => {
  const cleaned = DataCache.cleanup();
  if (cleaned > 0) {
    console.log(`DataCache: Cleaned up ${cleaned} expired entries`);
  }
}, 5 * 60 * 1000);

export { DataCache };
