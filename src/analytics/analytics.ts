/**
 * Analytics reporting functionality
 */

import { getApiUrl } from '../api/temperature';

declare const debugLog: (...args: any[]) => void;
declare const __APP_VERSION__: string;

/**
 * Report analytics data
 */
export function reportAnalytics() {
  const analytics = window.TempHist.analytics;
  const sessionDuration = Date.now() - analytics.startTime;
  
  // Determine the most common error type from recent errors
  const getErrorType = () => {
    if (analytics.errors.length === 0) return 'none';
    
    const errorTypes = analytics.errors.map(error => error.context?.type || 'unknown');
    const typeCounts = errorTypes.reduce((acc, type) => {
      acc[type] = (acc[type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    // Return the most common error type, or 'mixed' if multiple types
    const sortedTypes = Object.entries(typeCounts).sort((a, b) => (b[1] as number) - (a[1] as number));
    return sortedTypes.length > 1 && (sortedTypes[0][1] as number) === (sortedTypes[1][1] as number) ? 'mixed' : sortedTypes[0][0];
  };
  
  return {
    sessionDuration: Math.round(sessionDuration / 1000), // seconds
    apiCalls: analytics.apiCalls,
    apiFailureRate: analytics.apiCalls > 0 ? (analytics.apiFailures / analytics.apiCalls * 100).toFixed(1) + '%' : '0%',
    retryAttempts: analytics.retryAttempts,
    locationFailures: analytics.locationFailures,
    errorCount: analytics.errors.length,
    errorType: getErrorType(),
    recentErrors: analytics.errors.slice(-5) // Last 5 errors
  };
}

/**
 * Send analytics to server
 */
export async function sendAnalytics(): Promise<void> {
  try {
    // Check if API is ready and Firebase is authenticated
    if (!window.currentUser) {
      debugLog('Analytics: Skipping send - Firebase not authenticated yet');
      return;
    }

    // Check if we have any meaningful analytics data
    const analyticsData = reportAnalytics();
    if (analyticsData.apiCalls === 0 && analyticsData.errorCount === 0) {
      debugLog('Analytics: Skipping send - no meaningful data to report');
      return;
    }

    const payload = {
      session_duration: analyticsData.sessionDuration,
      api_calls: analyticsData.apiCalls,
      api_failure_rate: analyticsData.apiFailureRate, // Keep as string like "20.0%"
      retry_attempts: analyticsData.retryAttempts,
      location_failures: analyticsData.locationFailures,
      error_count: analyticsData.errorCount,
      error_type: analyticsData.errorType,
      recent_errors: analyticsData.recentErrors,
      app_version: __APP_VERSION__,
      platform: "web"
    };

    // Debug: Log the payload being sent
    debugLog('Analytics payload being sent:', payload);

    const response = await fetch(getApiUrl('/analytics'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.warn('Analytics reporting failed:', response.status, errorText);
      debugLog('Analytics error response:', errorText);
    } else {
      debugLog('Analytics sent successfully');
    }
  } catch (error) {
    // Silently fail analytics reporting to not impact user experience
    console.warn('Analytics reporting error:', error);
  }
}

/**
 * Setup analytics reporting
 */
export function setupAnalyticsReporting(): void {
  // Send analytics when page is about to unload
  window.addEventListener('beforeunload', () => {
    // Send analytics data on page unload (only if Firebase is authenticated)
    if (window.currentUser) {
      sendAnalytics();
    }
  });

  // Send analytics periodically (every 5 minutes) for long sessions
  setInterval(() => {
    // Only send analytics if Firebase is authenticated and we have meaningful data
    if (window.currentUser && (window.TempHist.analytics.apiCalls > 0 || window.TempHist.analytics.errors.length > 0)) {
      sendAnalytics();
    }
  }, 5 * 60 * 1000); // 5 minutes
}

