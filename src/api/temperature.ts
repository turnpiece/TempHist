import type { 
  TemperatureDataResponse, 
  AsyncJobResponse, 
  ChartDataPoint,
  JobResultResponse
} from '../types/index';

// Import debug function
declare const debugLog: (...args: any[]) => void;

/**
 * Get API base URL based on environment
 */
export function getApiUrl(path: string): string {
  const apiBase = import.meta.env.VITE_API_BASE;
  
  if (!apiBase) {
    throw new Error('VITE_API_BASE environment variable is not set');
  }
  
  return `${apiBase}${path}`;
}

/**
 * Wrapper function for API fetches with Firebase authentication
 */
export async function apiFetch(url: string, options: RequestInit = {}): Promise<Response> {
  debugLog('apiFetch called with URL:', url);
  
  // Use Firebase token for authentication
  if (!window.currentUser) {
    debugLog('apiFetch: No currentUser, throwing error');
    throw new Error('No authenticated user available');
  }

  let authToken: string;
  try {
    authToken = await window.currentUser.getIdToken();
    //debugLog('apiFetch: Got token (length:', authToken.length, '), making request to:', url);
    
    // Decode token to see the project ID (first part is header, second is payload)
    try {
      const tokenParts = authToken.split('.');
      if (tokenParts.length === 3) {
        const payload = JSON.parse(atob(tokenParts[1]));
        //debugLog('Token payload project ID:', payload.aud, 'issuer:', payload.iss);
      }
    } catch (decodeError) {
      debugLog('Could not decode token payload:', decodeError);
    }
  } catch (tokenError) {
    debugLog('apiFetch: Error getting token:', tokenError);
    throw new Error(`Failed to get Firebase token: ${tokenError}`);
  }

  const headers: HeadersInit = {
    'Authorization': `Bearer ${authToken}`,
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    ...options.headers
  };

  try {
    const response = await fetch(url, { 
      ...options,
      method: options.method || 'GET',
      headers
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('API Error:', {
        status: response.status,
        statusText: response.statusText,
        url,
        body: errorText
      });
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return response;
  } catch (error) {
    console.error('Fetch error:', {
      url,
      error: error instanceof Error ? error.message : 'Unknown error',
      headers
    });
    throw error;
  }
}

/**
 * Check API health
 */
export async function checkApiHealth(): Promise<boolean> {
  try {
    const healthUrl = getApiUrl('/health');
    const response = await fetch(healthUrl, {
      method: 'GET',
      headers: {
        'Accept': 'application/json'
      }
    });
    return response.ok;
  } catch (error) {
    return false;
  }
}

/**
 * Create async job for temperature data
 */
export async function createAsyncJob(
  period: 'daily' | 'week' | 'month' | 'year',
  location: string,
  identifier: string
): Promise<string> {
  const apiPeriod = period === 'week' ? 'weekly' : 
                   period === 'month' ? 'monthly' : 
                   period === 'year' ? 'yearly' : 
                   'daily';
  
  const jobUrl = getApiUrl(`/v1/records/${apiPeriod}/${encodeURIComponent(location)}/${identifier}/async`);
  
  try {
    const response = await apiFetch(jobUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      }
    });

    const job: AsyncJobResponse = await response.json();
    
    if (!job.job_id) {
      throw new Error('Invalid job response: missing job_id');
    }

    return job.job_id;
  } catch (error) {
    throw new Error(`Failed to create job: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Poll job status until completion
 */
export async function pollJobStatus(
  jobId: string, 
  onProgress?: (status: AsyncJobResponse) => void
): Promise<JobResultResponse> {
  let pollCount = 0;
  const maxPolls = 100; // Maximum 5 minutes of polling
  const pollInterval = 3000; // 3 seconds between polls
  
  while (pollCount < maxPolls) {
    try {
      const statusUrl = getApiUrl(`/v1/jobs/${jobId}`);
      const response = await apiFetch(statusUrl);
      
      if (!response.ok) {
        throw new Error(`Failed to check job status: HTTP ${response.status}`);
      }

      const status: AsyncJobResponse = await response.json();
      
      if (status.status === 'ready' && status.result) {
        return status.result;
      } else if (status.status === 'error') {
        const errorMsg = status.error || 'Unknown job error';
        throw new Error(`Job failed: ${errorMsg}`);
      } else if (status.status === 'processing' || status.status === 'pending') {
        if (onProgress) {
          onProgress(status);
        }
        
        await new Promise(resolve => setTimeout(resolve, pollInterval));
        pollCount++;
      } else {
        await new Promise(resolve => setTimeout(resolve, pollInterval));
        pollCount++;
      }
    } catch (error) {
      if (pollCount > 10) {
        throw new Error(`Job polling failed after ${pollCount} attempts: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
      
      await new Promise(resolve => setTimeout(resolve, pollInterval));
      pollCount++;
    }
  }
  
  throw new Error(`Job polling timed out after ${maxPolls} attempts (5 minutes)`);
}

/**
 * Fetch temperature data using synchronous endpoint (fallback)
 */
export async function fetchTemperatureDataSync(
  period: 'daily' | 'week' | 'month' | 'year',
  location: string,
  identifier: string
): Promise<JobResultResponse> {
  const apiPeriod = period === 'week' ? 'weekly' : 
                   period === 'month' ? 'monthly' : 
                   period === 'year' ? 'yearly' : 
                   'daily';
  
  const syncUrl = getApiUrl(`/v1/records/${apiPeriod}/${encodeURIComponent(location)}/${identifier}`);
  
  try {
    debugLog(`Falling back to synchronous API for ${period} data...`);
    const response = await apiFetch(syncUrl, {
      method: 'GET',
      headers: {
        'Accept': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`Synchronous API failed: HTTP ${response.status}`);
    }

    const data: TemperatureDataResponse = await response.json();
    
    // Wrap the response in the same format as async job results
    return {
      cache_key: `sync_fallback_${Date.now()}`,
      etag: `"sync_${Date.now()}"`,
      data: data,
      computed_at: new Date().toISOString()
    };
  } catch (error) {
    throw new Error(`Synchronous fallback failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Fetch temperature data using async jobs with sync fallback
 */
export async function fetchTemperatureDataAsync(
  period: 'daily' | 'week' | 'month' | 'year',
  location: string,
  identifier: string,
  onProgress?: (status: AsyncJobResponse) => void
): Promise<JobResultResponse> {
  try {
    // Try async job first
    debugLog(`Attempting async fetch for ${period} data...`);
    
    // Create the async job
    const jobId = await createAsyncJob(period, location, identifier);
    
    // Poll for completion with progress updates
    const result = await pollJobStatus(jobId, onProgress);
    
    debugLog(`Async fetch successful for ${period} data`);
    return result;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    // Check if it's a timeout or job failure that we should fall back from
    if (errorMessage.includes('timed out') || errorMessage.includes('Job polling failed') || errorMessage.includes('Job failed')) {
      debugLog(`Async job failed (${errorMessage}), falling back to synchronous API...`);
      
      try {
        // Fall back to synchronous API
        const fallbackResult = await fetchTemperatureDataSync(period, location, identifier);
        debugLog(`Synchronous fallback successful for ${period} data`);
        return fallbackResult;
      } catch (fallbackError) {
        // If both async and sync fail, throw the original async error with fallback info
        throw new Error(`Temperature data fetch failed: ${errorMessage}. Sync fallback also failed: ${fallbackError instanceof Error ? fallbackError.message : 'Unknown error'}`);
      }
    } else {
      // For other errors (like network issues), don't fall back - just throw
      throw new Error(`Temperature data fetch failed: ${errorMessage}`);
    }
  }
}

/**
 * Transform temperature data to chart format
 */
export function transformToChartData(data: TemperatureDataResponse['values']): ChartDataPoint[] {
  return data.map(point => ({ 
    x: point.temperature, 
    y: point.year 
  }));
}

/**
 * Calculate temperature range for chart scaling
 */
export function calculateTemperatureRange(chartData: ChartDataPoint[]): { min: number; max: number } {
  const temps = chartData.map(p => p.x);
  const minTemp = Math.floor(Math.min(...temps) - 1);
  const maxTemp = Math.ceil(Math.max(...temps) + 1);
  
  return { min: minTemp, max: maxTemp };
}