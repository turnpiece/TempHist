import type { 
  TemperatureDataResponse, 
  AsyncJobResponse, 
  FirebaseUser,
  ChartDataPoint 
} from '../types/index.js';

/**
 * Get API base URL based on environment
 */
export function getApiUrl(path: string): string {
  const apiBase = (() => {
    // Check for environment-specific API URL first
    if (import.meta.env.VITE_API_BASE) {
      return import.meta.env.VITE_API_BASE;
    }
    
    // Development (local)
    if (import.meta.env.DEV) {
      return 'http://localhost:3000';
    }
    
    // Dev site also uses production API
    if (window.location.hostname === 'dev.temphist.com') {
      return 'https://api.temphist.com';
    }
    
    // Production
    return 'https://api.temphist.com';
  })();
  
  return `${apiBase}${path}`;
}

/**
 * Wrapper function for API fetches with Firebase authentication
 */
export async function apiFetch(url: string, options: RequestInit = {}): Promise<Response> {
  if (!window.currentUser) {
    throw new Error('No authenticated user available');
  }

  const idToken = await window.currentUser.getIdToken();

  const headers: HeadersInit = {
    'Authorization': `Bearer ${idToken}`,
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    ...options.headers
  };

  try {
    const response = await fetch(url, { 
      method: options.method || 'GET',
      headers,
      ...options
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
  period: 'daily' | 'weekly' | 'monthly' | 'yearly',
  location: string,
  identifier: string
): Promise<string> {
  const apiPeriod = period === 'week' ? 'weekly' : 
                   period === 'month' ? 'monthly' : 
                   period === 'year' ? 'yearly' : 
                   period;
  
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
): Promise<TemperatureDataResponse> {
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
 * Fetch temperature data using async jobs
 */
export async function fetchTemperatureDataAsync(
  period: 'daily' | 'weekly' | 'monthly' | 'yearly',
  location: string,
  identifier: string,
  onProgress?: (status: AsyncJobResponse) => void
): Promise<TemperatureDataResponse> {
  try {
    // Create the async job
    const jobId = await createAsyncJob(period, location, identifier);
    
    // Poll for completion with progress updates
    const result = await pollJobStatus(jobId, onProgress);
    
    return result;
  } catch (error) {
    throw new Error(`Temperature data fetch failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Transform temperature data to chart format
 */
export function transformToChartData(data: TemperatureDataPoint[]): ChartDataPoint[] {
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
