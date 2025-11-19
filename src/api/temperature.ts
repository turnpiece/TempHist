import type { 
  TemperatureDataResponse, 
  AsyncJobResponse, 
  ChartDataPoint,
  JobResultResponse,
  TemperatureDataPoint
} from '../types/index';
import { API_CONFIG, LOCATION_VALIDATION_CONFIG, DATE_RANGE_CONFIG } from '../constants/index';

// Import debug function
declare const debugLog: (...args: any[]) => void;

/**
 * Validate location string to prevent path traversal and invalid values
 * Location should be in format "City, State, Country" or "City, Country" or "City"
 * Examples: "London, England, United Kingdom", "New York, USA", "Paris"
 * 
 * @param location - The location string to validate
 * @throws Error if location is invalid
 */
function validateLocation(location: string): void {
  if (!location || typeof location !== 'string') {
    throw new Error('Location must be a non-empty string');
  }

  // Check length (reasonable bounds for location strings)
  if (location.length < LOCATION_VALIDATION_CONFIG.MIN_LENGTH) {
    throw new Error(`Location too short: expected at least ${LOCATION_VALIDATION_CONFIG.MIN_LENGTH} characters, got ${location.length}`);
  }

  if (location.length > LOCATION_VALIDATION_CONFIG.MAX_LENGTH) {
    throw new Error(`Location too long: expected at most ${LOCATION_VALIDATION_CONFIG.MAX_LENGTH} characters, got ${location.length}`);
  }

  // Prevent path traversal attempts
  if (location.includes('..') || location.includes('/') || location.includes('\\')) {
    throw new Error('Location contains invalid characters (path traversal attempt detected)');
  }

  // Check for null bytes and other control characters (except spaces, commas, hyphens, apostrophes)
  // Allow: letters, numbers, spaces, commas, hyphens, apostrophes, parentheses, periods
  const validLocationPattern = /^[\p{L}\p{N}\s,\-'.()]+$/u;
  if (!validLocationPattern.test(location.trim())) {
    throw new Error('Location contains invalid characters (control characters or special symbols detected)');
  }

  // Validate structure: should have at least one part (city name)
  const trimmedLocation = location.trim();
  if (trimmedLocation.length === 0) {
    throw new Error('Location cannot be empty or whitespace only');
  }

  const parts = trimmedLocation.split(',').map(part => part.trim()).filter(part => part.length > 0);
  if (parts.length < LOCATION_VALIDATION_CONFIG.MIN_PARTS) {
    throw new Error(`Location format invalid: expected at least ${LOCATION_VALIDATION_CONFIG.MIN_PARTS} comma-separated part(s), got empty location`);
  }

  // Check each part is not empty after trimming (defensive check)
  for (let i = 0; i < parts.length; i++) {
    if (parts[i].length === 0) {
      throw new Error(`Location format invalid: empty part found at position ${i + 1}`);
    }
  }

  // Warn about suspiciously long single parts (potential attack)
  if (parts.length === 1 && parts[0].length > 100) {
    throw new Error('Location format suspicious: single part exceeds reasonable length (potential attack)');
  }
}

/**
 * Validate identifier format to prevent path traversal and invalid values
 * Identifier should be in format MM-DD (e.g., "01-15" for January 15th)
 * 
 * @param identifier - The identifier to validate
 * @throws Error if identifier is invalid
 */
function validateIdentifier(identifier: string): void {
  if (!identifier || typeof identifier !== 'string') {
    throw new Error('Identifier must be a non-empty string');
  }

  // Check length (MM-DD format should be exactly 5 characters)
  if (identifier.length < 3 || identifier.length > 10) {
    throw new Error(`Identifier length invalid: expected 3-10 characters, got ${identifier.length}`);
  }

  // Prevent path traversal attempts
  if (identifier.includes('..') || identifier.includes('/') || identifier.includes('\\')) {
    throw new Error('Identifier contains invalid characters (path traversal attempt detected)');
  }

  // Validate format: should match MM-DD pattern (month-day)
  const identifierPattern = /^(\d{1,2})-(\d{1,2})$/;
  const match = identifier.match(identifierPattern);
  
  if (!match) {
    throw new Error(`Identifier format invalid: expected MM-DD format (e.g., "01-15"), got "${identifier}"`);
  }

  const month = parseInt(match[1], 10);
  const day = parseInt(match[2], 10);

  // Validate month range (01-12)
  if (month < 1 || month > 12) {
    throw new Error(`Identifier month invalid: expected 01-12, got ${month}`);
  }

  // Validate day range (01-31) - basic validation
  // Note: Doesn't validate exact days per month (e.g., Feb 30), but API will handle that
  if (day < 1 || day > 31) {
    throw new Error(`Identifier day invalid: expected 01-31, got ${day}`);
  }
}

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
      
      // Handle Cloudflare 524 timeout errors - these often appear as CORS errors
      // because Cloudflare doesn't include CORS headers in timeout responses
      if (response.status === 524) {
        console.error('API Timeout (524): Cloudflare timeout - this may appear as a CORS error:', {
          status: response.status,
          statusText: response.statusText,
          url,
          note: 'Cloudflare 524 errors don\'t include CORS headers, causing browsers to report CORS errors'
        });
        throw new Error(`API timeout (524): The request exceeded Cloudflare's timeout limit`);
      }
      
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
    // Network errors (including CORS failures from 524 responses) will be caught here
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    // Check if this might be a timeout-related CORS error
    if (errorMessage.includes('Failed to fetch') || 
        errorMessage.includes('NetworkError') ||
        errorMessage.includes('CORS')) {
      console.error('Network/CORS error (may be caused by Cloudflare 524 timeout):', {
        url,
        error: errorMessage,
        note: 'If you see CORS errors with status 524, this is a Cloudflare timeout issue. The API server needs to configure Cloudflare to include CORS headers in 524 error responses.'
      });
    } else {
      console.error('Fetch error:', {
        url,
        error: errorMessage,
        headers
      });
    }
    
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
 * @internal Only used internally by fetchTemperatureDataAsync
 * Exported for testing purposes
 */
export async function createAsyncJob(
  period: 'daily' | 'week' | 'month' | 'year',
  location: string,
  identifier: string
): Promise<string> {
  // Validate inputs to prevent path traversal and invalid values
  validateLocation(location);
  validateIdentifier(identifier);
  
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
 * @internal Only used internally by fetchTemperatureDataAsync
 * Exported for testing purposes
 */
export async function pollJobStatus(
  jobId: string, 
  onProgress?: (status: AsyncJobResponse) => void
): Promise<JobResultResponse> {
  let pollCount = 0;
  const maxPolls = API_CONFIG.MAX_POLLS; // Maximum 5 minutes of polling
  const pollInterval = API_CONFIG.POLL_INTERVAL; // 3 seconds between polls
  
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
 * @internal Only used internally by fetchTemperatureDataAsync
 */
async function fetchTemperatureDataSync(
  period: 'daily' | 'week' | 'month' | 'year',
  location: string,
  identifier: string
): Promise<JobResultResponse> {
  // Validate inputs to prevent path traversal and invalid values
  validateLocation(location);
  validateIdentifier(identifier);
  
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
  // Validate inputs at the public API entry point
  validateLocation(location);
  validateIdentifier(identifier);
  
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
 * Validate temperature data point structure and ranges
 * @param point - The temperature data point to validate
 * @param index - The index of the point in the array (for error messages)
 * @throws Error if the point is invalid
 */
function validateTemperatureDataPoint(point: unknown, index: number): void {
  if (!point || typeof point !== 'object') {
    throw new Error(`Temperature data point at index ${index} is not an object`);
  }

  const tempPoint = point as Record<string, unknown>;

  // Validate required fields exist
  if (!('year' in tempPoint)) {
    throw new Error(`Temperature data point at index ${index} is missing 'year' field`);
  }
  if (!('temperature' in tempPoint)) {
    throw new Error(`Temperature data point at index ${index} is missing 'temperature' field`);
  }

  // Validate year is a number and in valid range
  const year = tempPoint.year;
  if (typeof year !== 'number' || !Number.isInteger(year)) {
    throw new Error(`Temperature data point at index ${index} has invalid 'year': expected integer, got ${typeof year}`);
  }

  const earliestYear = DATE_RANGE_CONFIG.EARLIEST_YEAR;
  const latestYear = new Date().getFullYear() + DATE_RANGE_CONFIG.LATEST_YEAR_OFFSET;
  if (year < earliestYear || year > latestYear) {
    throw new Error(`Temperature data point at index ${index} has invalid 'year' range: ${year} (expected ${earliestYear}-${latestYear})`);
  }

  // Validate temperature is a number and in reasonable range
  const temperature = tempPoint.temperature;
  if (typeof temperature !== 'number' || !isFinite(temperature)) {
    throw new Error(`Temperature data point at index ${index} has invalid 'temperature': expected finite number, got ${typeof temperature}`);
  }

  // Reasonable temperature range for Earth: -100°C to 100°C
  // This covers extreme cases like Antarctica (-89°C record) and Death Valley (57°C record)
  const MIN_TEMP = -100;
  const MAX_TEMP = 100;
  if (temperature < MIN_TEMP || temperature > MAX_TEMP) {
    throw new Error(`Temperature data point at index ${index} has invalid 'temperature' range: ${temperature}°C (expected ${MIN_TEMP} to ${MAX_TEMP}°C)`);
  }
}

/**
 * Validate temperature data array structure and contents
 * @param data - The temperature data array to validate
 * @throws Error if the array is invalid
 */
function validateTemperatureDataArray(data: unknown): void {
  if (!Array.isArray(data)) {
    throw new Error('Temperature data must be an array');
  }

  if (data.length === 0) {
    throw new Error('Temperature data array is empty');
  }

  // Validate each point in the array
  data.forEach((point, index) => {
    validateTemperatureDataPoint(point, index);
  });

  // Validate years are unique (optional but helpful for detecting duplicates)
  const years = (data as TemperatureDataPoint[]).map(p => p.year);
  const uniqueYears = new Set(years);
  if (years.length !== uniqueYears.size) {
    console.warn(`Temperature data contains duplicate years: ${years.length} entries but only ${uniqueYears.size} unique years`);
  }
}

/**
 * Validate average temperature data
 * @param average - The average data object to validate
 * @throws Error if the average data is invalid
 */
function validateAverageData(average: unknown): void {
  if (!average || typeof average !== 'object') {
    throw new Error('Average data must be an object');
  }

  const avgObj = average as Record<string, unknown>;

  if (!('mean' in avgObj)) {
    throw new Error('Average data is missing "mean" field');
  }

  const mean = avgObj.mean;
  if (typeof mean !== 'number' || !isFinite(mean)) {
    throw new Error(`Average mean must be a finite number, got ${typeof mean}`);
  }

  // Reasonable range for average temperature
  const MIN_TEMP = -100;
  const MAX_TEMP = 100;
  if (mean < MIN_TEMP || mean > MAX_TEMP) {
    throw new Error(`Average mean temperature out of range: ${mean}°C (expected ${MIN_TEMP} to ${MAX_TEMP}°C)`);
  }
}

/**
 * Validate trend data
 * @param trend - The trend data object to validate
 * @throws Error if the trend data is invalid
 */
function validateTrendData(trend: unknown): void {
  if (!trend || typeof trend !== 'object') {
    throw new Error('Trend data must be an object');
  }

  const trendObj = trend as Record<string, unknown>;

  if (!('slope' in trendObj)) {
    throw new Error('Trend data is missing "slope" field');
  }

  const slope = trendObj.slope;
  if (typeof slope !== 'number' || !isFinite(slope)) {
    throw new Error(`Trend slope must be a finite number, got ${typeof slope}`);
  }

  // Reasonable slope range: -10 to +10°C/decade (covers extreme climate change scenarios)
  if (slope < -10 || slope > 10) {
    throw new Error(`Trend slope out of reasonable range: ${slope}°C/decade (expected -10 to +10°C/decade)`);
  }

  // Validate unit if present
  if ('unit' in trendObj && trendObj.unit !== undefined) {
    if (typeof trendObj.unit !== 'string') {
      throw new Error(`Trend unit must be a string, got ${typeof trendObj.unit}`);
    }
  }
}

/**
 * Validate temperature data response structure
 * @param response - The temperature data response to validate
 * @throws Error if the response is invalid
 */
export function validateTemperatureDataResponse(response: unknown): void {
  if (!response || typeof response !== 'object') {
    throw new Error('Temperature data response must be an object');
  }

  const data = response as Record<string, unknown>;

  // Validate values array
  if (!('values' in data) || !Array.isArray(data.values)) {
    throw new Error('Temperature data response is missing "values" array');
  }
  validateTemperatureDataArray(data.values);

  // Validate average if present
  if ('average' in data && data.average !== undefined) {
    validateAverageData(data.average);
  }

  // Validate trend if present
  if ('trend' in data && data.trend !== undefined) {
    validateTrendData(data.trend);
  }
}

/**
 * Transform temperature data to chart format
 * Validates data before transformation
 */
export function transformToChartData(data: TemperatureDataResponse['values']): ChartDataPoint[] {
  // Validate the data array before transformation
  validateTemperatureDataArray(data);

  return data.map(point => ({ 
    x: point.temperature, 
    y: point.year 
  }));
}

/**
 * Calculate temperature range for chart scaling
 */
export function calculateTemperatureRange(chartData: ChartDataPoint[]): { min: number; max: number } {
  // Handle empty array case to prevent Infinity values
  if (chartData.length === 0) {
    return { min: 0, max: 0 };
  }
  
  const temps = chartData.map(p => p.x);
  const minTemp = Math.floor(Math.min(...temps) - 1);
  const maxTemp = Math.ceil(Math.max(...temps) + 1);
  
  return { min: minTemp, max: maxTemp };
}