/**
 * Performance monitoring system
 * Tracks Core Web Vitals, custom metrics, and performance bottlenecks
 */

interface PerformanceMetric {
  name: string;
  value: number;
  timestamp: number;
  metadata?: Record<string, any>;
}

interface CoreWebVitals {
  lcp?: number; // Largest Contentful Paint
  fid?: number; // First Input Delay
  cls?: number; // Cumulative Layout Shift
  fcp?: number; // First Contentful Paint
  ttfb?: number; // Time to First Byte
}

interface PerformanceReport {
  timestamp: string;
  url: string;
  userAgent: string;
  coreWebVitals: CoreWebVitals;
  customMetrics: PerformanceMetric[];
  navigationTiming: PerformanceNavigationTiming | null;
  resourceTiming: PerformanceResourceTiming[];
  memoryInfo?: any;
}

class PerformanceMonitor {
  private static metrics: PerformanceMetric[] = [];
  private static observers: PerformanceObserver[] = [];
  private static isEnabled: boolean = true;
  private static maxMetrics: number = 1000;

  /**
   * Initialize performance monitoring
   */
  static initialize(): void {
    if (!this.isEnabled) return;

    this.setupCoreWebVitals();
    this.setupCustomMetrics();
    this.setupResourceTiming();
    this.setupNavigationTiming();
    this.setupMemoryMonitoring();
  }

  /**
   * Setup Core Web Vitals monitoring
   */
  private static setupCoreWebVitals(): void {
    // Largest Contentful Paint (LCP)
    if ('PerformanceObserver' in window) {
      try {
        const lcpObserver = new PerformanceObserver((list) => {
          const entries = list.getEntries();
          const lastEntry = entries[entries.length - 1] as any;
          this.recordMetric('lcp', lastEntry.startTime, {
            element: lastEntry.element?.tagName,
            url: lastEntry.url
          });
        });
        lcpObserver.observe({ entryTypes: ['largest-contentful-paint'] });
        this.observers.push(lcpObserver);
      } catch (error) {
        console.warn('LCP monitoring not supported:', error);
      }

      // First Input Delay (FID)
      try {
        const fidObserver = new PerformanceObserver((list) => {
          const entries = list.getEntries();
          entries.forEach((entry: any) => {
            this.recordMetric('fid', entry.processingStart - entry.startTime, {
              eventType: entry.name,
              target: entry.target?.tagName
            });
          });
        });
        fidObserver.observe({ entryTypes: ['first-input'] });
        this.observers.push(fidObserver);
      } catch (error) {
        console.warn('FID monitoring not supported:', error);
      }

      // Cumulative Layout Shift (CLS)
      try {
        let clsValue = 0;
        const clsObserver = new PerformanceObserver((list) => {
          const entries = list.getEntries();
          entries.forEach((entry: any) => {
            if (!entry.hadRecentInput) {
              clsValue += entry.value;
            }
          });
          this.recordMetric('cls', clsValue, {
            sources: entries.map((e: any) => e.sources).flat()
          });
        });
        clsObserver.observe({ entryTypes: ['layout-shift'] });
        this.observers.push(clsObserver);
      } catch (error) {
        console.warn('CLS monitoring not supported:', error);
      }
    }
  }

  /**
   * Setup custom performance metrics
   */
  private static setupCustomMetrics(): void {
    // Page load time
    window.addEventListener('load', () => {
      const loadTime = performance.now();
      this.recordMetric('page_load_time', loadTime);
    });

    // DOM content loaded
    document.addEventListener('DOMContentLoaded', () => {
      const domContentLoaded = performance.now();
      this.recordMetric('dom_content_loaded', domContentLoaded);
    });

    // First paint
    if ('PerformanceObserver' in window) {
      try {
        const paintObserver = new PerformanceObserver((list) => {
          const entries = list.getEntries();
          entries.forEach((entry) => {
            if (entry.name === 'first-contentful-paint') {
              this.recordMetric('fcp', entry.startTime);
            }
          });
        });
        paintObserver.observe({ entryTypes: ['paint'] });
        this.observers.push(paintObserver);
      } catch (error) {
        console.warn('Paint timing not supported:', error);
      }
    }
  }

  /**
   * Setup resource timing monitoring
   */
  private static setupResourceTiming(): void {
    if ('PerformanceObserver' in window) {
      try {
        const resourceObserver = new PerformanceObserver((list) => {
          const entries = list.getEntries();
          entries.forEach((entry: any) => {
            this.recordMetric('resource_load_time', entry.duration, {
              name: entry.name,
              initiatorType: entry.initiatorType,
              transferSize: entry.transferSize,
              encodedBodySize: entry.encodedBodySize
            });
          });
        });
        resourceObserver.observe({ entryTypes: ['resource'] });
        this.observers.push(resourceObserver);
      } catch (error) {
        console.warn('Resource timing not supported:', error);
      }
    }
  }

  /**
   * Setup navigation timing
   */
  private static setupNavigationTiming(): void {
    if (performance.navigation) {
      const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
      if (navigation) {
        this.recordMetric('dns_lookup', navigation.domainLookupEnd - navigation.domainLookupStart);
        this.recordMetric('tcp_connection', navigation.connectEnd - navigation.connectStart);
        this.recordMetric('request_time', navigation.responseStart - navigation.requestStart);
        this.recordMetric('response_time', navigation.responseEnd - navigation.responseStart);
        this.recordMetric('dom_processing', navigation.domContentLoadedEventEnd - navigation.domContentLoadedEventStart);
        this.recordMetric('load_complete', navigation.loadEventEnd - navigation.loadEventStart);
      }
    }
  }

  /**
   * Setup memory monitoring
   */
  private static setupMemoryMonitoring(): void {
    if ('memory' in performance) {
      const memory = (performance as any).memory;
      this.recordMetric('memory_used', memory.usedJSHeapSize, {
        total: memory.totalJSHeapSize,
        limit: memory.jsHeapSizeLimit
      });
    }
  }

  /**
   * Record a custom metric
   */
  static recordMetric(name: string, value: number, metadata?: Record<string, any>): void {
    if (!this.isEnabled) return;

    const metric: PerformanceMetric = {
      name,
      value,
      timestamp: performance.now(),
      metadata
    };

    this.metrics.push(metric);

    // Limit metrics array size
    if (this.metrics.length > this.maxMetrics) {
      this.metrics = this.metrics.slice(-this.maxMetrics);
    }

    // Log in development
    if (import.meta.env.DEV) {
      console.log(`Performance: ${name} = ${value.toFixed(2)}ms`, metadata);
    }
  }

  /**
   * Start a performance measurement
   */
  static startMeasurement(name: string): () => void {
    const startTime = performance.now();
    return () => {
      const duration = performance.now() - startTime;
      this.recordMetric(name, duration);
    };
  }

  /**
   * Get performance report
   */
  static getReport(): PerformanceReport {
    const coreWebVitals: CoreWebVitals = {};
    const customMetrics: PerformanceMetric[] = [];

    // Extract Core Web Vitals
    this.metrics.forEach(metric => {
      if (['lcp', 'fid', 'cls', 'fcp', 'ttfb'].includes(metric.name)) {
        (coreWebVitals as any)[metric.name] = metric.value;
      } else {
        customMetrics.push(metric);
      }
    });

    // Get navigation timing
    const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming || null;

    // Get resource timing
    const resources = performance.getEntriesByType('resource') as PerformanceResourceTiming[];

    // Get memory info
    const memoryInfo = 'memory' in performance ? (performance as any).memory : undefined;

    return {
      timestamp: new Date().toISOString(),
      url: window.location.href,
      userAgent: navigator.userAgent,
      coreWebVitals,
      customMetrics,
      navigationTiming: navigation,
      resourceTiming: resources,
      memoryInfo
    };
  }

  /**
   * Get Core Web Vitals
   */
  static getCoreWebVitals(): CoreWebVitals {
    const vitals: CoreWebVitals = {};
    this.metrics.forEach(metric => {
      if (['lcp', 'fid', 'cls', 'fcp', 'ttfb'].includes(metric.name)) {
        (vitals as any)[metric.name] = metric.value;
      }
    });
    return vitals;
  }

  /**
   * Get performance summary
   */
  static getSummary(): {
    totalMetrics: number;
    averageLoadTime: number;
    slowestResource: PerformanceMetric | null;
    coreWebVitals: CoreWebVitals;
  } {
    const loadTimeMetrics = this.metrics.filter(m => m.name === 'page_load_time');
    const averageLoadTime = loadTimeMetrics.length > 0 
      ? loadTimeMetrics.reduce((sum, m) => sum + m.value, 0) / loadTimeMetrics.length 
      : 0;

    const slowestResource = this.metrics
      .filter(m => m.name === 'resource_load_time')
      .reduce((slowest, current) => current.value > slowest.value ? current : slowest, 
        this.metrics.find(m => m.name === 'resource_load_time') || { value: 0 } as PerformanceMetric);

    return {
      totalMetrics: this.metrics.length,
      averageLoadTime,
      slowestResource: slowestResource.value > 0 ? slowestResource : null,
      coreWebVitals: this.getCoreWebVitals()
    };
  }

  /**
   * Clear all metrics
   */
  static clear(): void {
    this.metrics = [];
  }

  /**
   * Disconnect all observers
   */
  static disconnect(): void {
    this.observers.forEach(observer => observer.disconnect());
    this.observers = [];
  }

  /**
   * Enable/disable monitoring
   */
  static setEnabled(enabled: boolean): void {
    this.isEnabled = enabled;
    if (!enabled) {
      this.disconnect();
    } else {
      this.initialize();
    }
  }

  /**
   * Export performance data
   */
  static export(): string {
    return JSON.stringify({
      report: this.getReport(),
      summary: this.getSummary(),
      metrics: this.metrics
    }, null, 2);
  }
}

// Auto-initialize if feature flag is enabled
if (typeof window !== 'undefined') {
  // Check feature flag after a short delay to ensure it's loaded
  setTimeout(() => {
    if ((window as any).FeatureFlags?.isEnabled('performance_monitoring')) {
      PerformanceMonitor.initialize();
    }
  }, 100);
}

export { PerformanceMonitor };
