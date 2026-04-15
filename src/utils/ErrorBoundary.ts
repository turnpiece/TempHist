/**
 * Error boundary system for graceful error handling
 * Provides fallback UI and error reporting for JavaScript errors
 */

interface ErrorInfo {
  componentStack: string;
  errorBoundary?: string;
  errorBoundaryStack?: string;
}

class ErrorBoundary {
  private static errorHandlers: Array<(error: Error, errorInfo: ErrorInfo) => void> = [];

  /**
   * Register an error handler
   */
  static onError(handler: (error: Error, errorInfo: ErrorInfo) => void): void {
    this.errorHandlers.push(handler);
  }

  /**
   * Handle errors globally
   */
  static handleError(error: Error | null | undefined, errorInfo?: ErrorInfo): void {
    // Normalise null/undefined errors to proper Error objects
    let normalisedError: Error;
    if (error === null) {
      normalisedError = new Error('Null error thrown');
      console.error('ErrorBoundary: Caught null error (something threw null instead of an Error)', errorInfo);
    } else if (error === undefined) {
      normalisedError = new Error('Undefined error thrown');
      console.error('ErrorBoundary: Caught undefined error', errorInfo);
    } else if (!(error instanceof Error)) {
      // Handle cases where a non-Error object was thrown
      normalisedError = new Error(String(error));
      console.error('ErrorBoundary: Caught non-Error object:', error, errorInfo);
    } else {
      normalisedError = error;
      console.error('ErrorBoundary: Caught error:', error);
    }

    // Call registered handlers
    this.errorHandlers.forEach(handler => {
      try {
        handler(normalisedError, errorInfo || { componentStack: '' });
      } catch (handlerError) {
        console.error('ErrorBoundary: Error in handler:', handlerError);
      }
    });

    // Report to analytics if available
    if (window.TempHist?.analytics) {
      window.TempHist.analytics.errors.push({
        timestamp: new Date().toISOString(),
        error: normalisedError.message,
        stack: normalisedError.stack,
        context: {
          type: 'javascript_error',
          component: errorInfo?.errorBoundary || 'unknown'
        },
        userAgent: navigator.userAgent,
        url: window.location.href
      });
    }
  }

}

// Global error handlers
window.addEventListener('error', (event) => {
  ErrorBoundary.handleError(event.error, {
    componentStack: 'global_error_handler'
  });
});

window.addEventListener('unhandledrejection', (event) => {
  ErrorBoundary.handleError(new Error(event.reason), {
    componentStack: 'unhandled_promise_rejection'
  });
});

export { ErrorBoundary };
