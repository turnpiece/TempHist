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
  const analytics = globalThis.TempHist.analytics;
  const sessionDuration = Date.now() - analytics.startTime;
  
  // Determine the most common error type from recent errors
  const getErrorType = () => {
    if (analytics.errors.length === 0) return 'none';
    
    const errorTypes = analytics.errors.map(error => error.context?.type || error.error_type || 'unknown');
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
export async function sendAnalytics(options: { allowUnauthenticated?: boolean } = {}): Promise<void> {
  try {
    // Check if API is ready and Firebase is authenticated. /analytics itself is
    // a public endpoint (no token is sent), so auth-failure reports opt out.
    if (!globalThis.currentUser && !options.allowUnauthenticated) {
      debugLog('Analytics: Skipping send - Firebase not authenticated yet');
      return;
    }

    // Check if we have any meaningful analytics data
    const analyticsData = reportAnalytics();
    if (analyticsData.apiCalls === 0 && analyticsData.errorCount === 0) {
      debugLog('Analytics: Skipping send - no meaningful data to report');
      return;
    }

    const meta = globalThis.TempHist.analytics.lastRequestMetadata;
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
      platform: "web",
      user_agent: navigator.userAgent,
      ...(meta && {
        response_time_ms: meta.response_time_ms,
        ...(meta.cache_hit !== null && { cache_hit: meta.cache_hit }),
        canonical_location: meta.canonical_location,
        requested_location: meta.requested_location,
        ...(meta.selection_method && { selection_method: meta.selection_method }),
      }),
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

export type AuthFailureType = 'auth_signin' | 'app_check_token';
export type AuthFailureSurface = 'share' | 'spa';

const reportedAuthFailures = new Set<string>();

/**
 * Record an authentication failure (sign-in rejected, or App Check token
 * unavailable) with its Firebase error code, and send it straight away: the
 * unload/interval reporters are only registered after a successful sign-in, and
 * these failures are exactly the case where that never happens.
 *
 * Entries use the API's ErrorDetail shape (timestamp/error_type/message) — the
 * server discards recent_errors entries without those keys. One report per
 * (type, code) per page load.
 */
export function recordAuthFailure(type: AuthFailureType, code: string, surface: AuthFailureSurface): void {
  const key = `${type}:${code}`;
  if (reportedAuthFailures.has(key)) return;
  reportedAuthFailures.add(key);

  const analytics = globalThis.TempHist?.analytics;
  if (!analytics) return;

  const entry = {
    timestamp: new Date().toISOString(),
    error: code,
    error_type: type,
    message: code,
    endpoint: surface,
    context: { type },
    userAgent: navigator.userAgent,
    url: window.location.pathname,
  };
  analytics.errors.push(entry);

  // sendAnalytics builds its payload synchronously before awaiting, so the entry
  // can be removed straight after: otherwise a later successful sign-in's
  // unload/interval report would include (and double-count) it.
  void sendAnalytics({ allowUnauthenticated: true });
  const idx = analytics.errors.indexOf(entry);
  if (idx !== -1) analytics.errors.splice(idx, 1);
}

/**
 * Setup analytics reporting
 */
export function setupAnalyticsReporting(): void {
  // Send analytics when page is about to unload
  window.addEventListener('beforeunload', () => {
    // Send analytics data on page unload (only if Firebase is authenticated)
    if (globalThis.currentUser) {
      sendAnalytics();
    }
  });

  // Send analytics periodically (every 5 minutes) for long sessions
  setInterval(() => {
    // Only send analytics if Firebase is authenticated and we have meaningful data
    if (globalThis.currentUser && (globalThis.TempHist.analytics.apiCalls > 0 || globalThis.TempHist.analytics.errors.length > 0)) {
      sendAnalytics();
    }
  }, 5 * 60 * 1000); // 5 minutes
}

