import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { checkApiHealth, createAsyncJob, pollJobStatus, fetchTemperatureDataAsync } from '../src/api/temperature'

// Prevent Firebase SDK from making background network requests during tests.
// apiFetch yields to the event loop for getIdToken(), during which Firebase's own
// timers can call fetch and consume the test mock before apiFetch gets to it.
vi.mock('../src/firebase', () => ({
  app: {},
  auth: {},
  appCheck: null,
}))

vi.mock('firebase/app-check', () => ({
  getToken: vi.fn().mockResolvedValue({ token: 'mock-app-check-token' }),
  initializeAppCheck: vi.fn().mockReturnValue({}),
  ReCaptchaV3Provider: vi.fn(),
}))

describe('API Functions', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.resetAllMocks()

    // Restore mocks cleared by resetAllMocks that setup.ts initialised
    global.fetch = vi.fn()

    // Mock currentUser
    window.currentUser = {
      uid: 'test-user-id',
      getIdToken: vi.fn().mockResolvedValue('mock-token')
    }
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('API Health Check', () => {
    it('should return healthy for a healthy API response', async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue({ status: 'healthy', timestamp: '2026-05-26T12:56:20.568721' })
      } as unknown as Response)

      const result = await checkApiHealth()
      expect(result).toBe('healthy')
    })

    it('should return unhealthy when the API responds but reports an unhealthy status', async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue({ status: 'unhealthy', timestamp: '2026-05-26T12:56:20.568721' })
      } as unknown as Response)

      const result = await checkApiHealth()
      expect(result).toBe('unhealthy')
    })

    it('should return unreachable when the API cannot be reached', async () => {
      vi.mocked(fetch).mockRejectedValueOnce(new Error('Network error'))

      const result = await checkApiHealth()
      expect(result).toBe('unreachable')
    })

    it('should return unreachable when the API returns a non-ok HTTP status', async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: false,
        status: 503
      } as unknown as Response)

      const result = await checkApiHealth()
      expect(result).toBe('unreachable')
    })
  })

  describe('Async Job Creation', () => {
    it('should create async job successfully', async () => {
      const mockJobResponse = {
        job_id: 'test-job-123'
      }

      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue(mockJobResponse)
      } as unknown as Response)

      const jobId = await createAsyncJob('daily', 'London, UK', '10-05')
      expect(jobId).toBe('test-job-123')
    })

    it('should handle job creation failure', async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: false,
        status: 400,
        text: vi.fn().mockResolvedValue('Bad Request')
      } as unknown as Response)

      await expect(createAsyncJob('daily', 'London, UK', '10-05'))
        .rejects.toThrow('Failed to create job')
    })
  })

  describe('Job Status Polling', () => {
    it('should poll job status until completion', async () => {
      const mockReadyResponse = {
        job_id: 'test-job-123',
        status: 'ready',
        result: {
          cache_key: 'test-cache-key',
          etag: 'test-etag',
          data: {
            period: 'daily',
            location: 'London, UK',
            values: [{ year: 2023, temperature: 15.5 }],
            average: { mean: 15.0 },
            trend: { slope: 0.1, unit: '°C/decade' },
            summary: 'Test summary'
          },
          computed_at: '2025-01-01T00:00:00Z'
        }
      }

      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue(mockReadyResponse)
      } as unknown as Response)

      const result = await pollJobStatus('test-job-123')
      expect(result).toEqual(mockReadyResponse.result)
    })
  })

  describe('Temperature Data Fetching', () => {
    it('should fetch temperature data using async jobs', async () => {
      const mockJobId = 'test-job-123'
      const mockResult = {
        cache_key: 'test-cache-key',
        etag: 'test-etag',
        data: {
          period: 'daily',
          location: 'London, UK',
          values: [{ year: 2023, temperature: 15.5 }],
          average: { mean: 15.0 },
          trend: { slope: 0.1, unit: '°C/decade' },
          summary: 'Test summary'
        },
        computed_at: '2025-01-01T00:00:00Z'
      }

      // Mock job creation
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue({ job_id: mockJobId })
      } as unknown as Response)

      // Mock job polling - return ready immediately
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue({
          job_id: mockJobId,
          status: 'ready',
          result: mockResult
        })
      } as unknown as Response)

      const result = await fetchTemperatureDataAsync('daily', 'London, UK', '10-05')
      expect(result).toEqual(mockResult)
    })
  })
})
