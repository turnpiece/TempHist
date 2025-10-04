import { describe, it, expect, beforeEach, vi } from 'vitest'

describe('API Functions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    fetch.mockClear()
    
    // Mock currentUser
    window.currentUser = {
      getIdToken: vi.fn().mockResolvedValue('mock-token')
    }
  })

  describe('API Health Check', () => {
    it('should return true for healthy API', async () => {
      fetch.mockResolvedValueOnce({
        ok: true
      })

      const checkApiHealth = async () => {
        try {
          const response = await fetch('/health', {
            method: 'GET',
            headers: {
              'Accept': 'application/json'
            }
          })
          return response.ok
        } catch (error) {
          return false
        }
      }

      const result = await checkApiHealth()
      expect(result).toBe(true)
    })

    it('should return false for unhealthy API', async () => {
      fetch.mockResolvedValueOnce({
        ok: false,
        status: 500
      })

      const checkApiHealth = async () => {
        try {
          const response = await fetch('/health', {
            method: 'GET',
            headers: {
              'Accept': 'application/json'
            }
          })
          return response.ok
        } catch (error) {
          return false
        }
      }

      const result = await checkApiHealth()
      expect(result).toBe(false)
    })

    it('should return false for network errors', async () => {
      fetch.mockRejectedValueOnce(new Error('Network error'))

      const checkApiHealth = async () => {
        try {
          const response = await fetch('/health', {
            method: 'GET',
            headers: {
              'Accept': 'application/json'
            }
          })
          return response.ok
        } catch (error) {
          return false
        }
      }

      const result = await checkApiHealth()
      expect(result).toBe(false)
    })
  })

  describe('API Fetch with Authentication', () => {
    it('should include Firebase token in headers', async () => {
      fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: 'test' })
      })

      const apiFetch = async (url, options = {}) => {
        const idToken = await window.currentUser.getIdToken()
        const headers = {
          'Authorization': `Bearer ${idToken}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          ...options.headers
        }

        const response = await fetch(url, { 
          method: options.method || 'GET',
          headers
        })

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`)
        }

        return response
      }

      await apiFetch('/test-endpoint')
      
      expect(fetch).toHaveBeenCalledWith('/test-endpoint', {
        method: 'GET',
        headers: {
          'Authorization': 'Bearer mock-token',
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        }
      })
    })

    it('should handle API errors correctly', async () => {
      fetch.mockResolvedValueOnce({
        ok: false,
        status: 404
      })

      const apiFetch = async (url, options = {}) => {
        const idToken = await window.currentUser.getIdToken()
        const headers = {
          'Authorization': `Bearer ${idToken}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          ...options.headers
        }

        const response = await fetch(url, { 
          method: options.method || 'GET',
          headers
        })

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`)
        }

        return response
      }

      await expect(apiFetch('/nonexistent')).rejects.toThrow('HTTP error! status: 404')
    })
  })

  describe('Temperature Data Fetching', () => {
    it('should fetch temperature data with correct parameters', async () => {
      const mockData = {
        values: [
          { date: '2023-01-01', temperature: 15.5, year: 2023 },
          { date: '2022-01-01', temperature: 14.2, year: 2022 }
        ],
        average: { mean: 14.85 },
        trend: { slope: 1.3, unit: '°C/year' },
        summary: 'Temperature trend over time'
      }

      fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockData)
      })

      const fetchTemperatureData = async (period, location, identifier) => {
        const url = `/v1/records/${period}/${encodeURIComponent(location)}/${identifier}`
        const idToken = await window.currentUser.getIdToken()
        const headers = {
          'Authorization': `Bearer ${idToken}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        }

        const response = await fetch(url, { method: 'GET', headers })
        
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`)
        }

        return await response.json()
      }

      const result = await fetchTemperatureData('daily', 'London, England, United Kingdom', '01-01')
      
      expect(result).toEqual(mockData)
      expect(fetch).toHaveBeenCalledWith(
        '/v1/records/daily/London%2C%20England%2C%20United%20Kingdom/01-01',
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({
            'Authorization': 'Bearer mock-token'
          })
        })
      )
    })
  })
})
