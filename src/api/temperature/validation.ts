import type { TemperatureDataPoint } from '../../types/index';
import { LOCATION_VALIDATION_CONFIG, DATE_RANGE_CONFIG } from '../../constants/index';

export function validateLocation(location: string): void {
  if (!location || typeof location !== 'string') {
    throw new Error('Location must be a non-empty string');
  }

  if (location.length < LOCATION_VALIDATION_CONFIG.MIN_LENGTH) {
    throw new Error(`Location too short: expected at least ${LOCATION_VALIDATION_CONFIG.MIN_LENGTH} characters, got ${location.length}`);
  }

  if (location.length > LOCATION_VALIDATION_CONFIG.MAX_LENGTH) {
    throw new Error(`Location too long: expected at most ${LOCATION_VALIDATION_CONFIG.MAX_LENGTH} characters, got ${location.length}`);
  }

  if (location.includes('..') || location.includes('/') || location.includes('\\')) {
    throw new Error('Location contains invalid characters (path traversal attempt detected)');
  }

  const validLocationPattern = /^[\p{L}\p{N}\s,\-'.()]+$/u;
  if (!validLocationPattern.test(location.trim())) {
    throw new Error('Location contains invalid characters (control characters or special symbols detected)');
  }

  const trimmedLocation = location.trim();
  if (trimmedLocation.length === 0) {
    throw new Error('Location cannot be empty or whitespace only');
  }

  const parts = trimmedLocation.split(',').map(part => part.trim()).filter(part => part.length > 0);
  if (parts.length < LOCATION_VALIDATION_CONFIG.MIN_PARTS) {
    throw new Error(`Location format invalid: expected at least ${LOCATION_VALIDATION_CONFIG.MIN_PARTS} comma-separated part(s), got empty location`);
  }

  for (let i = 0; i < parts.length; i++) {
    if (parts[i].length === 0) {
      throw new Error(`Location format invalid: empty part found at position ${i + 1}`);
    }
  }

  if (parts.length === 1 && parts[0].length > 100) {
    throw new Error('Location format suspicious: single part exceeds reasonable length (potential attack)');
  }
}

export function validateIdentifier(identifier: string): void {
  if (!identifier || typeof identifier !== 'string') {
    throw new Error('Identifier must be a non-empty string');
  }

  if (identifier.length < 3 || identifier.length > 10) {
    throw new Error(`Identifier length invalid: expected 3-10 characters, got ${identifier.length}`);
  }

  if (identifier.includes('..') || identifier.includes('/') || identifier.includes('\\')) {
    throw new Error('Identifier contains invalid characters (path traversal attempt detected)');
  }

  const identifierPattern = /^(\d{1,2})-(\d{1,2})$/;
  const match = identifier.match(identifierPattern);

  if (!match) {
    throw new Error(`Identifier format invalid: expected MM-DD format (e.g., "01-15"), got "${identifier}"`);
  }

  const month = parseInt(match[1], 10);
  const day = parseInt(match[2], 10);

  if (month < 1 || month > 12) {
    throw new Error(`Identifier month invalid: expected 01-12, got ${month}`);
  }

  if (day < 1 || day > 31) {
    throw new Error(`Identifier day invalid: expected 01-31, got ${day}`);
  }
}

function validateTemperatureDataPoint(point: unknown, index: number): void {
  if (!point || typeof point !== 'object') {
    throw new Error(`Temperature data point at index ${index} is not an object`);
  }

  const tempPoint = point as Record<string, unknown>;

  if (!('year' in tempPoint)) {
    throw new Error(`Temperature data point at index ${index} is missing 'year' field`);
  }
  if (!('temperature' in tempPoint)) {
    throw new Error(`Temperature data point at index ${index} is missing 'temperature' field`);
  }

  const year = tempPoint.year;
  if (typeof year !== 'number' || !Number.isInteger(year)) {
    throw new Error(`Temperature data point at index ${index} has invalid 'year': expected integer, got ${typeof year}`);
  }

  const earliestYear = DATE_RANGE_CONFIG.EARLIEST_YEAR;
  const latestYear = new Date().getFullYear() + DATE_RANGE_CONFIG.LATEST_YEAR_OFFSET;
  if (year < earliestYear || year > latestYear) {
    throw new Error(`Temperature data point at index ${index} has invalid 'year' range: ${year} (expected ${earliestYear}-${latestYear})`);
  }

  const temperature = tempPoint.temperature;
  if (typeof temperature !== 'number' || !isFinite(temperature)) {
    throw new Error(`Temperature data point at index ${index} has invalid 'temperature': expected finite number, got ${typeof temperature}`);
  }

  const MIN_TEMP = -100;
  const MAX_TEMP = 100;
  if (temperature < MIN_TEMP || temperature > MAX_TEMP) {
    throw new Error(`Temperature data point at index ${index} has invalid 'temperature' range: ${temperature}°C (expected ${MIN_TEMP} to ${MAX_TEMP}°C)`);
  }
}

export function validateTemperatureDataArray(data: unknown): void {
  if (!Array.isArray(data)) {
    throw new Error('Temperature data must be an array');
  }

  if (data.length === 0) {
    throw new Error('Temperature data array is empty');
  }

  data.forEach((point, index) => {
    validateTemperatureDataPoint(point, index);
  });

  const years = (data as TemperatureDataPoint[]).map(p => p.year);
  const uniqueYears = new Set(years);
  if (years.length !== uniqueYears.size) {
    console.warn(`Temperature data contains duplicate years: ${years.length} entries but only ${uniqueYears.size} unique years`);
  }
}

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

  const MIN_TEMP = -100;
  const MAX_TEMP = 100;
  if (mean < MIN_TEMP || mean > MAX_TEMP) {
    throw new Error(`Average mean temperature out of range: ${mean}°C (expected ${MIN_TEMP} to ${MAX_TEMP}°C)`);
  }
}

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

  if (slope < -10 || slope > 10) {
    throw new Error(`Trend slope out of reasonable range: ${slope}°C/decade (expected -10 to +10°C/decade)`);
  }

  if ('unit' in trendObj && trendObj.unit !== undefined) {
    if (typeof trendObj.unit !== 'string') {
      throw new Error(`Trend unit must be a string, got ${typeof trendObj.unit}`);
    }
  }
}

export function validateTemperatureDataResponse(response: unknown): void {
  if (!response || typeof response !== 'object') {
    throw new Error('Temperature data response must be an object');
  }

  const data = response as Record<string, unknown>;

  if (!('values' in data) || !Array.isArray(data.values)) {
    throw new Error('Temperature data response is missing "values" array');
  }
  validateTemperatureDataArray(data.values);

  if ('average' in data && data.average !== undefined) {
    validateAverageData(data.average);
  }

  if ('trend' in data && data.trend !== undefined) {
    validateTrendData(data.trend);
  }
}
