/**
 * Error boundary system for graceful error handling
 * Provides fallback UI and error reporting for JavaScript errors
 */

interface ErrorInfo {
  componentStack: string;
  errorBoundary?: string;
  errorBoundaryStack?: string;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error?: Error;
  errorInfo?: ErrorInfo;
  retryCount: number;
}

class ErrorBoundary {
  private static errorHandlers: Array<(error: Error, errorInfo: ErrorInfo) => void> = [];
  private static retryAttempts = new Map<string, number>();
  private static maxRetries = 3;

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

  /**
   * Retry a failed operation
   */
  static async retry<T>(
    operation: () => Promise<T>,
    operationId: string,
    maxRetries: number = this.maxRetries
  ): Promise<T> {
    const currentAttempts = this.retryAttempts.get(operationId) || 0;
    
    if (currentAttempts >= maxRetries) {
      throw new Error(`Operation ${operationId} failed after ${maxRetries} attempts`);
    }

    try {
      const result = await operation();
      this.retryAttempts.delete(operationId);
      return result;
    } catch (error) {
      this.retryAttempts.set(operationId, currentAttempts + 1);
      
      // Exponential backoff
      const delay = Math.pow(2, currentAttempts) * 1000;
      await new Promise(resolve => setTimeout(resolve, delay));
      
      return this.retry(operation, operationId, maxRetries);
    }
  }

  /**
   * Create a fallback UI for errors
   */
  static createFallbackUI(error: Error, retryCallback?: () => void): HTMLElement {
    const container = document.createElement('div');
    container.className = 'error-boundary-fallback';
    container.style.cssText = `
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 2rem;
      text-align: center;
      background: #f8f9fa;
      border: 1px solid #dee2e6;
      border-radius: 8px;
      margin: 1rem;
    `;

    const title = document.createElement('h3');
    title.textContent = 'Something went wrong';
    title.style.cssText = 'color: #dc3545; margin-bottom: 1rem;';

    const message = document.createElement('p');
    message.textContent = 'We encountered an unexpected error. Please try refreshing the page.';
    message.style.cssText = 'color: #6c757d; margin-bottom: 1.5rem;';

    const retryButton = document.createElement('button');
    retryButton.textContent = 'Try Again';
    retryButton.className = 'btn btn-primary';
    retryButton.style.cssText = 'margin-right: 1rem;';
    retryButton.onclick = retryCallback || (() => window.location.reload());

    const refreshButton = document.createElement('button');
    refreshButton.textContent = 'Refresh Page';
    refreshButton.className = 'btn btn-secondary';
    refreshButton.onclick = () => window.location.reload();

    container.appendChild(title);
    container.appendChild(message);
    container.appendChild(retryButton);
    container.appendChild(refreshButton);

    return container;
  }

  /**
   * Wrap a function with error handling
   */
  static wrap<T extends any[], R>(
    fn: (...args: T) => R,
    context: string = 'unknown'
  ): (...args: T) => R {
    return (...args: T): R => {
      try {
        return fn(...args);
      } catch (error) {
        this.handleError(error as Error, {
          componentStack: context,
          errorBoundary: context
        });
        throw error;
      }
    };
  }

  /**
   * Wrap an async function with error handling
   */
  static wrapAsync<T extends any[], R>(
    fn: (...args: T) => Promise<R>,
    context: string = 'unknown'
  ): (...args: T) => Promise<R> {
    return async (...args: T): Promise<R> => {
      try {
        return await fn(...args);
      } catch (error) {
        this.handleError(error as Error, {
          componentStack: context,
          errorBoundary: context
        });
        throw error;
      }
    };
  }

  /**
   * Get error statistics
   */
  static getErrorStats(): {
    totalErrors: number;
    recentErrors: number;
    errorTypes: Record<string, number>;
  } {
    const errors = window.TempHist?.analytics?.errors || [];
    const now = Date.now();
    const oneHourAgo = now - (60 * 60 * 1000);

    const recentErrors = errors.filter(error => 
      new Date(error.timestamp).getTime() > oneHourAgo
    ).length;

    const errorTypes = errors.reduce((acc, error) => {
      const type = error.context?.type || 'unknown';
      acc[type] = (acc[type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    return {
      totalErrors: errors.length,
      recentErrors,
      errorTypes
    };
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
