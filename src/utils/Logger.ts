/**
 * Comprehensive logging system with different levels and structured logging
 * Provides performance monitoring, user interaction tracking, and error logging
 */

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
  FATAL = 4
}

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  context?: Record<string, any>;
  stack?: string;
  userId?: string;
  sessionId?: string;
  url?: string;
  userAgent?: string;
}

interface PerformanceEntry {
  name: string;
  startTime: number;
  endTime?: number;
  duration?: number;
  metadata?: Record<string, any>;
}

class Logger {
  private static logLevel: LogLevel = LogLevel.INFO;
  private static logs: LogEntry[] = [];
  private static performanceEntries: PerformanceEntry[] = [];
  private static maxLogs = 1000;
  private static sessionId = this.generateSessionId();

  /**
   * Configure logging
   */
  static configure(options: {
    level?: LogLevel;
    maxLogs?: number;
    enablePerformance?: boolean;
  }): void {
    this.logLevel = options.level ?? LogLevel.INFO;
    this.maxLogs = options.maxLogs ?? 1000;
  }

  /**
   * Log a debug message
   */
  static debug(message: string, context?: Record<string, any>): void {
    this.log(LogLevel.DEBUG, message, context);
  }

  /**
   * Log an info message
   */
  static info(message: string, context?: Record<string, any>): void {
    this.log(LogLevel.INFO, message, context);
  }

  /**
   * Log a warning message
   */
  static warn(message: string, context?: Record<string, any>): void {
    this.log(LogLevel.WARN, message, context);
  }

  /**
   * Log an error message
   */
  static error(message: string, error?: Error, context?: Record<string, any>): void {
    this.log(LogLevel.ERROR, message, {
      ...context,
      error: error?.message,
      stack: error?.stack
    });
  }

  /**
   * Log a fatal error
   */
  static fatal(message: string, error?: Error, context?: Record<string, any>): void {
    this.log(LogLevel.FATAL, message, {
      ...context,
      error: error?.message,
      stack: error?.stack
    });
  }

  /**
   * Start a performance measurement
   */
  static startPerformance(name: string, metadata?: Record<string, any>): void {
    this.performanceEntries.push({
      name,
      startTime: performance.now(),
      metadata
    });
  }

  /**
   * End a performance measurement
   */
  static endPerformance(name: string): number | null {
    const entry = this.performanceEntries.find(e => e.name === name && !e.endTime);
    if (!entry) {
      this.warn(`Performance entry '${name}' not found or already ended`);
      return null;
    }

    entry.endTime = performance.now();
    entry.duration = entry.endTime - entry.startTime;
    
    this.info(`Performance: ${name} took ${entry.duration.toFixed(2)}ms`, {
      performance: entry
    });

    return entry.duration;
  }

  /**
   * Log user interaction
   */
  static logUserInteraction(action: string, element?: string, context?: Record<string, any>): void {
    this.info(`User interaction: ${action}`, {
      type: 'user_interaction',
      action,
      element,
      ...context
    });
  }

  /**
   * Log API call
   */
  static logApiCall(method: string, url: string, status?: number, duration?: number, context?: Record<string, any>): void {
    this.info(`API call: ${method} ${url}`, {
      type: 'api_call',
      method,
      url,
      status,
      duration,
      ...context
    });
  }

  /**
   * Log navigation
   */
  static logNavigation(from: string, to: string, context?: Record<string, any>): void {
    this.info(`Navigation: ${from} → ${to}`, {
      type: 'navigation',
      from,
      to,
      ...context
    });
  }

  /**
   * Get all logs
   */
  static getLogs(): LogEntry[] {
    return [...this.logs];
  }

  /**
   * Get logs by level
   */
  static getLogsByLevel(level: LogLevel): LogEntry[] {
    return this.logs.filter(log => log.level === level);
  }

  /**
   * Get performance entries
   */
  static getPerformanceEntries(): PerformanceEntry[] {
    return [...this.performanceEntries];
  }

  /**
   * Get performance summary
   */
  static getPerformanceSummary(): {
    totalEntries: number;
    averageDuration: number;
    slowestEntry: PerformanceEntry | null;
    fastestEntry: PerformanceEntry | null;
  } {
    const completedEntries = this.performanceEntries.filter(e => e.duration !== undefined);
    
    if (completedEntries.length === 0) {
      return {
        totalEntries: 0,
        averageDuration: 0,
        slowestEntry: null,
        fastestEntry: null
      };
    }

    const durations = completedEntries.map(e => e.duration!);
    const averageDuration = durations.reduce((sum, duration) => sum + duration, 0) / durations.length;
    
    const slowestEntry = completedEntries.reduce((slowest, current) => 
      current.duration! > slowest.duration! ? current : slowest
    );
    
    const fastestEntry = completedEntries.reduce((fastest, current) => 
      current.duration! < fastest.duration! ? current : fastest
    );

    return {
      totalEntries: completedEntries.length,
      averageDuration,
      slowestEntry,
      fastestEntry
    };
  }

  /**
   * Clear all logs
   */
  static clearLogs(): void {
    this.logs = [];
    this.performanceEntries = [];
  }

  /**
   * Export logs as JSON
   */
  static exportLogs(): string {
    return JSON.stringify({
      sessionId: this.sessionId,
      timestamp: new Date().toISOString(),
      logs: this.logs,
      performance: this.performanceEntries,
      summary: {
        totalLogs: this.logs.length,
        performanceSummary: this.getPerformanceSummary()
      }
    }, null, 2);
  }

  /**
   * Internal log method
   */
  private static log(level: LogLevel, message: string, context?: Record<string, any>): void {
    if (level < this.logLevel) {
      return;
    }

    const logEntry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      context,
      sessionId: this.sessionId,
      url: window.location.href,
      userAgent: navigator.userAgent
    };

    this.logs.push(logEntry);

    // Limit log size
    if (this.logs.length > this.maxLogs) {
      this.logs = this.logs.slice(-this.maxLogs);
    }

    // Console output
    const levelName = LogLevel[level];
    const contextStr = context ? ` ${JSON.stringify(context)}` : '';
    
    switch (level) {
      case LogLevel.DEBUG:
        console.debug(`[${levelName}] ${message}${contextStr}`);
        break;
      case LogLevel.INFO:
        console.info(`[${levelName}] ${message}${contextStr}`);
        break;
      case LogLevel.WARN:
        console.warn(`[${levelName}] ${message}${contextStr}`);
        break;
      case LogLevel.ERROR:
      case LogLevel.FATAL:
        console.error(`[${levelName}] ${message}${contextStr}`);
        break;
    }
  }

  /**
   * Generate a unique session ID
   */
  private static generateSessionId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

// Auto-configure based on environment
if (import.meta.env.DEV) {
  Logger.configure({
    level: LogLevel.DEBUG,
    maxLogs: 2000,
    enablePerformance: true
  });
} else {
  Logger.configure({
    level: LogLevel.INFO,
    maxLogs: 500,
    enablePerformance: true
  });
}

export { Logger };
