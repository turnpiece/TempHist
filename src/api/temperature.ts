export {
  validateLocation,
  validateIdentifier,
  validateTemperatureDataArray,
  validateTemperatureDataResponse,
} from './temperature/validation';

export type { ApiHealthResult } from './temperature/client';
export {
  getApiUrl,
  apiFetch,
  checkApiHealth,
  createAsyncJob,
  pollJobStatus,
  fetchTemperatureDataAsync,
  transformToChartData,
  calculateTemperatureRange,
} from './temperature/client';
