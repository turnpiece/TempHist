import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setLocationCookie, getLocationCookie, getDisplayCity, getOrdinal } from '../src/utils/location'

// Test utility functions from TypeScript modules
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
      // Test setting and getting cookies using imported functions
      setLocationCookie('London, UK', 'manual')
      const result = getLocationCookie()
      
      expect(result.location).toBe('London, UK')
      expect(result.source).toBe('manual')
    })

    it('should handle special characters in location names', () => {
      const specialLocation = 'São Paulo, São Paulo, Brazil'
      setLocationCookie(specialLocation, 'manual')
      const result = getLocationCookie()
      
      expect(result.location).toBe(specialLocation)
      expect(result.source).toBe('manual')
    })

    it('should prevent storing objects in cookies', () => {
      // This should not throw and should not store the object
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      
      setLocationCookie({ city: 'London' } as any, 'manual')
      
      // Should log an error
      expect(consoleSpy).toHaveBeenCalledWith('setLocationCookie received an object instead of string:', { city: 'London' })
      
      // Should not store anything
      const result = getLocationCookie()
      expect(result.location).toBeNull()
      
      consoleSpy.mockRestore()
    })
  })

  describe('Display Functions', () => {
    it('should extract city name from full location string', () => {
      expect(getDisplayCity('London, England, United Kingdom')).toBe('London')
      expect(getDisplayCity('New York, New York, United States')).toBe('New York')
      expect(getDisplayCity('São Paulo, São Paulo, Brazil')).toBe('São Paulo')
      expect(getDisplayCity('Tokyo')).toBe('Tokyo')
      expect(getDisplayCity('')).toBe('')
      expect(getDisplayCity(null)).toBe(null)
    })

    it('should format ordinal numbers correctly', () => {
      expect(getOrdinal(1)).toBe('1st')
      expect(getOrdinal(2)).toBe('2nd')
      expect(getOrdinal(3)).toBe('3rd')
      expect(getOrdinal(4)).toBe('4th')
      expect(getOrdinal(11)).toBe('11th')
      expect(getOrdinal(12)).toBe('12th')
      expect(getOrdinal(13)).toBe('13th')
      expect(getOrdinal(21)).toBe('21st')
      expect(getOrdinal(22)).toBe('22nd')
      expect(getOrdinal(23)).toBe('23rd')
      expect(getOrdinal(101)).toBe('101st')
      expect(getOrdinal(102)).toBe('102nd')
      expect(getOrdinal(103)).toBe('103rd')
    })
  })
})