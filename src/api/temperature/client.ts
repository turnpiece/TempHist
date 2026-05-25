import type {
  TemperatureDataResponse,
  AsyncJobResponse,
  ChartDataPoint,
  JobResultResponse,
} from '../../types/index';
import { getToken } from 'firebase/app-check';
import { appCheck } from '../../firebase';
import { API_CONFIG } from '../../constants/index';
import { LoadingManager } from '../../utils/LoadingManager';
import {
  validateLocation,
  validateIdentifier,
  validateTemperatureDataArray,
} from './validation';

declare const debugLog: (...args: any[]) => void;

export function getApiUrl(path: string): string {
  const apiBase = import.meta.env.VITE_API_BASE;

  if (!apiBase) {
    throw new Error('VITE_API_BASE environment variable is not set');
  }

  return `${apiBase}${path}`;
}

export async function apiFetch(url: string, options: RequestInit = {}): Promise<Response> {
  debugLog('apiFetch called with URL:', url);

  if (!window.currentUser) {
    debugLog('apiFetch: No currentUser, throwing error');
    throw new Error('No authenticated user available');
  }

  let authToken: string;
  try {
    authToken = await window.currentUser.getIdToken();
  } catch (tokenError) {
    debugLog('apiFetch: Error getting token:', tokenError);
    throw new Error(`Failed to get Firebase token: ${tokenError}`);
  }

  const headers: HeadersInit = {
    Authorization: `Bearer ${authToken}`,
    'Content-Type': 'application/json',
    Accept: 'application/json',
    ...options.headers,
  };

  if (appCheck) {
    try {
      const { token } = await getToken(appCheck, /* forceRefresh= */ false);
      (headers as Record<string, string>)['X-Firebase-AppCheck'] = token;
    } catch (acError) {
      debugLog('apiFetch: App Check token error (non-fatal):', acError);
    }
  }

  const MAX_RETRIES = 3;
  const RETRY_DELAYS_MS = [1000, 2000, 4000];
  let lastError: unknown;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      LoadingManager.showRetryMessage(`Connection issue — retrying… (${attempt} of ${MAX_RETRIES})`);

      await new Promise<void>(resolve => {
        if (options.signal?.aborted) {
          resolve();
          return;
        }
        const timer = setTimeout(resolve, RETRY_DELAYS_MS[attempt - 1]);
        options.signal?.addEventListener('abort', () => {
          clearTimeout(timer);
          resolve();
        }, { once: true });
      });

      LoadingManager.clearRetryMessage();

      if (options.signal?.aborted) {
        throw new DOMException('The operation was aborted', 'AbortError');
      }
    }

    let response: Response;
    try {
      response = await fetch(url, { ...options, method: options.method || 'GET', headers });
    } catch (fetchError) {
      const msg = fetchError instanceof Error ? fetchError.message : '';

      if (fetchError instanceof Error && (fetchError.name === 'AbortError' || msg.includes('aborted'))) {
        throw fetchError;
      }

      if (attempt < MAX_RETRIES) {
        console.warn(`apiFetch: Network error on attempt ${attempt + 1}, retrying:`, msg);
        lastError = fetchError;
        continue;
      }

      if (msg.includes('Failed to fetch') || msg.includes('NetworkError') || msg.includes('CORS')) {
        console.error('Network/CORS error (may be caused by Cloudflare 524 timeout):', {
          url,
          error: msg,
          note: 'If you see CORS errors with status 524, this is a Cloudflare timeout issue.',
        });
      } else {
        console.error('Fetch error:', { url, error: msg, headers });
      }
      throw fetchError;
    }

    if (!response.ok) {
      if (response.status >= 500 && attempt < MAX_RETRIES) {
        console.warn(`apiFetch: HTTP ${response.status} on attempt ${attempt + 1}, retrying...`);
        lastError = new Error(`HTTP error! status: ${response.status}`);
        continue;
      }

      const errorText = await response.text();
      if (response.status === 524) {
        console.error('API Timeout (524): Cloudflare timeout - this may appear as a CORS error:', {
          status: response.status,
          statusText: response.statusText,
          url,
          note: "Cloudflare 524 errors don't include CORS headers, causing browsers to report CORS errors even when CORS is properly configured",
        });
        throw new Error(`API timeout (524): The request exceeded Cloudflare's timeout limit`);
      }
      console.error('API Error:', { status: response.status, statusText: response.statusText, url, body: errorText });
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return response;
  }

  throw lastError || new Error('Request failed after retries');
}

export async function checkApiHealth(): Promise<boolean> {
  try {
    const healthUrl = getApiUrl('/health');
    const response = await fetch(healthUrl, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
    });
    return response.ok;
  } catch {
    return false;
  }
}

export async function createAsyncJob(
  period: 'daily' | 'week' | 'month' | 'year',
  location: string,
  identifier: string,
  localToday?: string
): Promise<string> {
  validateLocation(location);
  validateIdentifier(identifier);

  const apiPeriod =
    period === 'week' ? 'weekly' : period === 'month' ? 'monthly' : period === 'year' ? 'yearly' : 'daily';

  const basePath = `/v1/records/${apiPeriod}/${encodeURIComponent(location)}/${identifier}/async`;
  const jobUrl = getApiUrl(localToday ? `${basePath}?local_today=${localToday}` : basePath);

  try {
    const response = await apiFetch(jobUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
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

export async function pollJobStatus(
  jobId: string,
  onProgress?: (status: AsyncJobResponse) => void
): Promise<JobResultResponse> {
  let pollCount = 0;
  const maxPolls = API_CONFIG.MAX_POLLS;
  const pollInterval = API_CONFIG.POLL_INTERVAL;

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
        throw new Error(
          `Job polling failed after ${pollCount} attempts: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
      }

      await new Promise(resolve => setTimeout(resolve, pollInterval));
      pollCount++;
    }
  }

  throw new Error(`Job polling timed out after ${maxPolls} attempts (5 minutes)`);
}

async function fetchTemperatureDataSync(
  period: 'daily' | 'week' | 'month' | 'year',
  location: string,
  identifier: string,
  localToday?: string
): Promise<JobResultResponse> {
  validateLocation(location);
  validateIdentifier(identifier);

  const apiPeriod =
    period === 'week' ? 'weekly' : period === 'month' ? 'monthly' : period === 'year' ? 'yearly' : 'daily';

  const basePath = `/v1/records/${apiPeriod}/${encodeURIComponent(location)}/${identifier}`;
  const syncUrl = getApiUrl(localToday ? `${basePath}?local_today=${localToday}` : basePath);

  try {
    debugLog(`Falling back to synchronous API for ${period} data...`);
    const response = await apiFetch(syncUrl, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Synchronous API failed: HTTP ${response.status}`);
    }

    const data: TemperatureDataResponse = await response.json();

    return {
      cache_key: `sync_fallback_${Date.now()}`,
      etag: `"sync_${Date.now()}"`,
      data: data,
      computed_at: new Date().toISOString(),
    };
  } catch (error) {
    throw new Error(`Synchronous fallback failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

export async function fetchTemperatureDataAsync(
  period: 'daily' | 'week' | 'month' | 'year',
  location: string,
  identifier: string,
  onProgress?: (status: AsyncJobResponse) => void,
  localToday?: string
): Promise<JobResultResponse> {
  validateLocation(location);
  validateIdentifier(identifier);

  try {
    debugLog(`Attempting async fetch for ${period} data...`);

    const jobId = await createAsyncJob(period, location, identifier, localToday);
    const result = await pollJobStatus(jobId, onProgress);

    debugLog(`Async fetch successful for ${period} data`);
    return result;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    if (
      errorMessage.includes('timed out') ||
      errorMessage.includes('Job polling failed') ||
      errorMessage.includes('Job failed')
    ) {
      debugLog(`Async job failed (${errorMessage}), falling back to synchronous API...`);

      try {
        const fallbackResult = await fetchTemperatureDataSync(period, location, identifier, localToday);
        debugLog(`Synchronous fallback successful for ${period} data`);
        return fallbackResult;
      } catch (fallbackError) {
        throw new Error(
          `Temperature data fetch failed: ${errorMessage}. Sync fallback also failed: ${fallbackError instanceof Error ? fallbackError.message : 'Unknown error'}`
        );
      }
    } else {
      throw new Error(`Temperature data fetch failed: ${errorMessage}`);
    }
  }
}

export function transformToChartData(data: TemperatureDataResponse['values']): ChartDataPoint[] {
  validateTemperatureDataArray(data);

  return data.map(point => ({
    x: point.temperature,
    y: point.year,
  }));
}

export function calculateTemperatureRange(chartData: ChartDataPoint[]): { min: number; max: number } {
  if (chartData.length === 0) {
    return { min: 0, max: 0 };
  }

  const temps = chartData.map(p => p.x);
  const actualMin = Math.min(...temps);
  const actualMax = Math.max(...temps);
  const minTemp = Number.isInteger(actualMin) ? actualMin - 1 : Math.floor(actualMin);
  const maxTemp = Number.isInteger(actualMax) ? actualMax + 1 : Math.ceil(actualMax);

  return { min: minTemp, max: maxTemp };
}
