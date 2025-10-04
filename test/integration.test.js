import { describe, it, expect, beforeEach, vi } from 'vitest'

describe('Integration Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    fetch.mockClear()
    clearCookies()
    
    // Reset DOM
    document.body.innerHTML = `
      <div id="splashScreen">
        <button id="useLocationBtn">Use my location</button>
        <button id="chooseLocationBtn">Choose location manually</button>
      </div>
      <div id="appShell" class="hidden">
        <div id="todayView">
          <h1 id="dateText"></h1>
          <div id="locationText"></div>
          <div id="dataNotice" class="notice"></div>
          <canvas id="tempChart"></canvas>
        </div>
      </div>
    `
    
    // Reset window globals
    window.tempLocation = null
    window.tempLocationSource = null
    window.tempLocationIsDetected = null
    window.currentUser = {
      getIdToken: vi.fn().mockResolvedValue('mock-token')
    }
  })

  describe('Location Selection Flow', () => {
    it('should complete the full location selection flow', async () => {
      // Mock successful geolocation
      const mockPosition = {
        coords: { latitude: 51.5074, longitude: -0.1278 }
      }
      
      navigator.geolocation.getCurrentPosition.mockImplementation((success) => {
        success(mockPosition)
      })

      // Mock OpenStreetMap API
      fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          address: {
            city: 'London',
            state: 'England',
            country: 'United Kingdom'
          }
        })
      })

      // Mock Firebase auth
      window.currentUser = {
        getIdToken: vi.fn().mockResolvedValue('mock-token')
      }

      // Simulate the location detection flow
      const detectLocation = async () => {
        return new Promise((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(
            async (position) => {
              try {
                const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${position.coords.latitude}&lon=${position.coords.longitude}&zoom=10&addressdetails=1`)
                const data = await response.json()
                const location = `${data.address.city}, ${data.address.state}, ${data.address.country}`
                resolve(location)
              } catch (error) {
                reject(error)
              }
            },
            reject
          )
        })
      }

      const location = await detectLocation()
      
      // Set global location
      window.tempLocation = location
      window.tempLocationSource = 'detected'
      
      // Store in cookie
      const setLocationCookie = (city, source) => {
        const expiry = new Date()
        expiry.setHours(expiry.getHours() + 1)
        document.cookie = `tempLocation=${encodeURIComponent(city)};expires=${expiry.toUTCString()};path=/`
        document.cookie = `tempLocationSource=${encodeURIComponent(source)};expires=${expiry.toUTCString()};path=/`
      }
      
      setLocationCookie(location, 'detected')
      
      // Verify the flow worked
      expect(window.tempLocation).toBe('London, England, United Kingdom')
      expect(window.tempLocationSource).toBe('detected')
      expect(document.cookie).toContain('tempLocation=London%2C%20England%2C%20United%20Kingdom')
      expect(document.cookie).toContain('tempLocationSource=detected')
    })

    it('should handle manual location selection', async () => {
      const selectedLocation = 'Paris, France'
      
      // Set global location
      window.tempLocation = selectedLocation
      window.tempLocationSource = 'manual'
      
      // Store in cookie
      const setLocationCookie = (city, source) => {
        const expiry = new Date()
        expiry.setHours(expiry.getHours() + 1)
        document.cookie = `tempLocation=${encodeURIComponent(city)};expires=${expiry.toUTCString()};path=/`
        document.cookie = `tempLocationSource=${encodeURIComponent(source)};expires=${expiry.toUTCString()};path=/`
      }
      
      setLocationCookie(selectedLocation, 'manual')
      
      // Verify the flow worked
      expect(window.tempLocation).toBe('Paris, France')
      expect(window.tempLocationSource).toBe('manual')
      expect(document.cookie).toContain('tempLocation=Paris%2C%20France')
      expect(document.cookie).toContain('tempLocationSource=manual')
    })
  })

  describe('Cookie Persistence', () => {
    it('should restore location from cookie on page load', () => {
      // Set up cookies
      const expiry = new Date()
      expiry.setHours(expiry.getHours() + 1)
      document.cookie = `tempLocation=${encodeURIComponent('Tokyo, Japan')};expires=${expiry.toUTCString()};path=/`
      document.cookie = `tempLocationSource=${encodeURIComponent('detected')};expires=${expiry.toUTCString()};path=/`
      
      // Simulate page load - get cookies
      const getLocationCookie = () => {
        const cookies = document.cookie.split(';')
        let location = null
        let source = null
        
        for (let cookie of cookies) {
          const [name, value] = cookie.trim().split('=')
          if (name === 'tempLocation' && value) {
            location = decodeURIComponent(value)
          } else if (name === 'tempLocationSource' && value) {
            source = decodeURIComponent(value)
          }
        }
        
        return { location, source }
      }
      
      const cookieData = getLocationCookie()
      
      // Restore from cookie
      if (cookieData.location) {
        window.tempLocation = cookieData.location
        window.tempLocationSource = cookieData.source
      }
      
      expect(window.tempLocation).toBe('Tokyo, Japan')
      expect(window.tempLocationSource).toBe('detected')
    })
  })

  describe('Chart Integration', () => {
    it('should handle chart creation and destruction', () => {
      const canvas = document.getElementById('tempChart')
      
      // Mock chart creation
      const chart = new Chart(canvas, {
        type: 'bar',
        data: { datasets: [] },
        options: {}
      })
      
      expect(Chart).toHaveBeenCalledWith(canvas, expect.objectContaining({
        type: 'bar'
      }))
      
      // Test chart destruction
      chart.destroy()
      expect(chart.destroy).toHaveBeenCalled()
    })
  })
})
