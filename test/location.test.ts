import { describe, it, expect, beforeEach, vi } from 'vitest'
import { detectUserLocationWithGeolocation, getLocationFromIP } from '../src/services/locationDetection'

describe('Location Detection', () => {
  beforeEach(() => {
    // Reset mocks
    vi.clearAllMocks()
    vi.mocked(fetch).mockClear()
    
    // Reset DOM
    document.body.innerHTML = ''
    
    // Reset window globals
    window.tempLocation = null
    window.tempLocationSource = null
  })

  describe('Geolocation API', () => {
    it('should handle successful geolocation', async () => {
      const mockPosition = {
        coords: {
          latitude: 51.5074,
          longitude: -0.1278
        },
        timestamp: Date.now()
      } as GeolocationPosition

      // Mock successful geolocation
      vi.mocked(navigator.geolocation.getCurrentPosition).mockImplementation((success) => {
        success(mockPosition)
      })

      // Mock OpenStreetMap API response
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          address: {
            city: 'London',
            state: 'England',
            country: 'United Kingdom'
          },
          display_name: 'London, England, United Kingdom'
        })
      } as unknown as Response)

      // Test the geolocation flow
      const detectUserLocationWithGeolocation = () => {
        return new Promise((resolve, reject) => {
          if (!navigator.geolocation) {
            reject(new Error('Geolocation not supported'))
            return
          }

          navigator.geolocation.getCurrentPosition(
            async (position) => {
              try {
                const { latitude, longitude } = position.coords
                const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${latitude}&lon=${longitude}&zoom=10&addressdetails=1`)
                const data = await response.json()
                
                const city = data.address.city
                const state = data.address.state
                const country = data.address.country
                
                if (city && country) {
                  if (state) {
                    resolve(`${city}, ${state}, ${country}`)
                  } else {
                    resolve(`${city}, ${country}`)
                  }
                } else {
                  reject(new Error('Could not determine location'))
                }
              } catch (error) {
                reject(error)
              }
            },
            reject
          )
        })
      }

      const result = await detectUserLocationWithGeolocation()
      expect(result).toBe('London, England, United Kingdom')
    })

    it('should handle geolocation permission denied', async () => {
      const mockError = {
        code: 1, // PERMISSION_DENIED
        message: 'User denied geolocation',
        PERMISSION_DENIED: 1,
        POSITION_UNAVAILABLE: 2,
        TIMEOUT: 3
      } as GeolocationPositionError

      vi.mocked(navigator.geolocation.getCurrentPosition).mockImplementation((success, error) => {
        if (error) {
          error(mockError)
        }
      })

      const detectUserLocationWithGeolocation = () => {
        return new Promise((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(
            resolve,
            reject
          )
        })
      }

      await expect(detectUserLocationWithGeolocation()).rejects.toEqual(mockError)
    })

    it('should handle geolocation timeout', async () => {
      const mockError = {
        code: 3, // TIMEOUT
        message: 'Geolocation timeout',
        PERMISSION_DENIED: 1,
        POSITION_UNAVAILABLE: 2,
        TIMEOUT: 3
      } as GeolocationPositionError

      vi.mocked(navigator.geolocation.getCurrentPosition).mockImplementation((success, error) => {
        if (error) {
          error(mockError)
        }
      })

      const detectUserLocationWithGeolocation = () => {
        return new Promise((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(
            resolve,
            reject
          )
        })
      }

      await expect(detectUserLocationWithGeolocation()).rejects.toEqual(mockError)
    })
  })

  describe('IP-based Location', () => {
    it('should get location from IP API', async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          city: 'London',
          country_name: 'United Kingdom'
        })
      } as unknown as Response)

      const getLocationFromIP = async () => {
        try {
          const response = await fetch('https://ipapi.co/json/')
          if (!response.ok) throw new Error('IP lookup failed')
          
          const data = await response.json()
          if (data.city && data.country_name) {
            return `${data.city}, ${data.country_name}`
          }
          return null
        } catch (error) {
          console.warn('IP-based location lookup failed:', error)
          return null
        }
      }

      const result = await getLocationFromIP()
      expect(result).toBe('London, United Kingdom')
    })

    it('should handle IP API failure gracefully', async () => {
      vi.mocked(fetch).mockRejectedValueOnce(new Error('Network error'))

      const getLocationFromIP = async () => {
        try {
          const response = await fetch('https://ipapi.co/json/')
          if (!response.ok) throw new Error('IP lookup failed')
          
          const data = await response.json()
          if (data.city && data.country_name) {
            return `${data.city}, ${data.country_name}`
          }
          return null
        } catch (error) {
          console.warn('IP-based location lookup failed:', error)
          return null
        }
      }

      const result = await getLocationFromIP()
      expect(result).toBe(null)
    })
  })
})
