import { describe, it, expect, beforeEach, vi } from 'vitest'

// Mock the app.js module to test utility functions
describe('Utility Functions', () => {
  beforeEach(() => {
    // Reset DOM
    document.body.innerHTML = ''
    clearCookies()
    
    // Reset window globals
    window.tempLocation = null
    window.tempLocationSource = null
    window.tempLocationIsDetected = null
  })

  describe('Cookie Management', () => {
    it('should set and get location cookie correctly', () => {
      // Import the functions (we'll need to extract them from app.js)
      // For now, we'll test the logic directly
      
      const setLocationCookie = (city, source = null) => {
        const expiry = new Date()
        expiry.setHours(expiry.getHours() + 1)
        const cityString = String(city)
        const sourceString = source ? String(source) : null
        
        document.cookie = `tempLocation=${encodeURIComponent(cityString)};expires=${expiry.toUTCString()};path=/`
        if (sourceString) {
          document.cookie = `tempLocationSource=${encodeURIComponent(sourceString)};expires=${expiry.toUTCString()};path=/`
        }
      }

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

      // Test setting and getting location
      setLocationCookie('London, England, United Kingdom', 'detected')
      const result = getLocationCookie()
      
      expect(result.location).toBe('London, England, United Kingdom')
      expect(result.source).toBe('detected')
    })

    it('should handle special characters in location names', () => {
      const setLocationCookie = (city, source = null) => {
        const expiry = new Date()
        expiry.setHours(expiry.getHours() + 1)
        const cityString = String(city)
        const sourceString = source ? String(source) : null
        
        document.cookie = `tempLocation=${encodeURIComponent(cityString)};expires=${expiry.toUTCString()};path=/`
        if (sourceString) {
          document.cookie = `tempLocationSource=${encodeURIComponent(sourceString)};expires=${expiry.toUTCString()};path=/`
        }
      }

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

      const locationWithSpecialChars = "São Paulo, São Paulo, Brazil"
      setLocationCookie(locationWithSpecialChars, 'manual')
      const result = getLocationCookie()
      
      expect(result.location).toBe(locationWithSpecialChars)
      expect(result.source).toBe('manual')
    })

    it('should prevent storing objects in cookies', () => {
      const setLocationCookie = (city, source = null) => {
        // Safety check: if city is an object, don't store it
        if (typeof city === 'object' && city !== null) {
          return false
        }
        
        const expiry = new Date()
        expiry.setHours(expiry.getHours() + 1)
        const cityString = String(city)
        const sourceString = source ? String(source) : null
        
        document.cookie = `tempLocation=${encodeURIComponent(cityString)};expires=${expiry.toUTCString()};path=/`
        if (sourceString) {
          document.cookie = `tempLocationSource=${encodeURIComponent(sourceString)};expires=${expiry.toUTCString()};path=/`
        }
        return true
      }

      const result = setLocationCookie({ location: 'London' }, 'detected')
      expect(result).toBe(false)
      expect(document.cookie).toBe('')
    })
  })

  describe('Location Display', () => {
    it('should extract city name from full location string', () => {
      const getDisplayCity = (fullLocation) => {
        if (!fullLocation) return fullLocation
        
        const decodedLocation = decodeURIComponent(fullLocation)
        const parts = decodedLocation.split(',').map(part => part.trim())
        return parts[0]
      }

      expect(getDisplayCity('London, England, United Kingdom')).toBe('London')
      expect(getDisplayCity('New York, New York, United States')).toBe('New York')
      expect(getDisplayCity('São Paulo, São Paulo, Brazil')).toBe('São Paulo')
      expect(getDisplayCity('Tokyo')).toBe('Tokyo')
      expect(getDisplayCity(null)).toBe(null)
    })
  })

  describe('Ordinal Numbers', () => {
    it('should format ordinal numbers correctly', () => {
      const getOrdinal = (n) => {
        const s = ["th", "st", "nd", "rd"]
        const v = n % 100
        return n + (s[(v - 20) % 10] || s[v] || s[0])
      }

      expect(getOrdinal(1)).toBe('1st')
      expect(getOrdinal(2)).toBe('2nd')
      expect(getOrdinal(3)).toBe('3rd')
      expect(getOrdinal(4)).toBe('4th')
      expect(getOrdinal(11)).toBe('11th')
      expect(getOrdinal(21)).toBe('21st')
      expect(getOrdinal(22)).toBe('22nd')
      expect(getOrdinal(23)).toBe('23rd')
    })
  })
})
