import { describe, it, expect, beforeEach } from 'vitest'
import {
  SAME_PLACE_RADIUS_KM,
  haversineKm,
  isSamePlace,
  rememberDetectedCoords,
  getDetectedCoords,
  isOwnLocation,
} from '../src/utils/location'
import { getLocationHeadingClass } from '../src/utils/uiHelpers'

const LONDON = { latitude: 51.5074, longitude: -0.1278 }
const MANCHESTER = { latitude: 53.4808, longitude: -2.2426 }
// A GPS fix in Croydon, which the API names "Greater London"
const CROYDON = { latitude: 51.3762, longitude: -0.0982 }

const KM_PER_DEGREE_LAT = 111.195

function northOf(point: typeof LONDON, km: number) {
  return { latitude: point.latitude + km / KM_PER_DEGREE_LAT, longitude: point.longitude }
}

describe('location proximity', () => {
  beforeEach(() => {
    globalThis.tempDetectedLatitude = null
    globalThis.tempDetectedLongitude = null
    globalThis.tempLocationIsOwn = null
    globalThis.tempLocationSource = null
    sessionStorage.clear()
  })

  describe('haversineKm', () => {
    it('is zero for identical points', () => {
      expect(haversineKm(51.5, -0.1, 51.5, -0.1)).toBe(0)
    })

    it('measures London to Manchester at roughly 260 km', () => {
      const km = haversineKm(LONDON.latitude, LONDON.longitude, MANCHESTER.latitude, MANCHESTER.longitude)
      expect(km).toBeGreaterThan(255)
      expect(km).toBeLessThan(265)
    })
  })

  describe('isSamePlace', () => {
    it('treats outer Greater London as the same place as London', () => {
      expect(isSamePlace(CROYDON, LONDON)).toBe(true)
    })

    it('treats Manchester as a different place from London', () => {
      expect(isSamePlace(MANCHESTER, LONDON)).toBe(false)
    })

    it('accepts a point just inside the radius', () => {
      expect(isSamePlace(northOf(LONDON, SAME_PLACE_RADIUS_KM - 0.1), LONDON)).toBe(true)
    })

    it('rejects a point just outside the radius', () => {
      expect(isSamePlace(northOf(LONDON, SAME_PLACE_RADIUS_KM + 0.1), LONDON)).toBe(false)
    })

    it('honours an explicit radius', () => {
      expect(isSamePlace(CROYDON, LONDON, 2)).toBe(false)
    })

    it.each([
      ['null coords', { latitude: null, longitude: null }],
      ['undefined coords', { latitude: undefined, longitude: undefined }],
      ['NaN coords', { latitude: NaN, longitude: NaN }],
      ['half-missing coords', { latitude: 51.5, longitude: null }],
    ])('is false for %s', (_label, bad) => {
      expect(isSamePlace(bad, LONDON)).toBe(false)
      expect(isSamePlace(LONDON, bad)).toBe(false)
    })

    it('is false when a point is null', () => {
      expect(isSamePlace(null, LONDON)).toBe(false)
    })
  })

  describe('detected coordinates', () => {
    it('are remembered in memory and sessionStorage', () => {
      rememberDetectedCoords(CROYDON.latitude, CROYDON.longitude)
      expect(getDetectedCoords()).toEqual(CROYDON)
      expect(JSON.parse(sessionStorage.getItem('temphist_detected_coords')!)).toEqual(CROYDON)
    })

    it('are restored from sessionStorage after a full-page navigation', () => {
      rememberDetectedCoords(CROYDON.latitude, CROYDON.longitude)
      globalThis.tempDetectedLatitude = null
      globalThis.tempDetectedLongitude = null
      expect(getDetectedCoords()).toEqual(CROYDON)
    })

    it('are null when nothing was detected', () => {
      expect(getDetectedCoords()).toBeNull()
    })

    it('ignore malformed sessionStorage content', () => {
      sessionStorage.setItem('temphist_detected_coords', '{not json')
      expect(getDetectedCoords()).toBeNull()
    })
  })

  describe('isOwnLocation', () => {
    it('is true for a detected location', () => {
      expect(isOwnLocation({ isDetected: true, source: 'detected', ...CROYDON })).toBe(true)
    })

    it('is true for a manual pick near the detected position', () => {
      rememberDetectedCoords(CROYDON.latitude, CROYDON.longitude)
      expect(isOwnLocation({ isDetected: false, source: 'manual', ...LONDON })).toBe(true)
    })

    it('is false for a manual pick far from the detected position', () => {
      rememberDetectedCoords(CROYDON.latitude, CROYDON.longitude)
      expect(isOwnLocation({ isDetected: false, source: 'manual', ...MANCHESTER })).toBe(false)
    })

    it('is false for a manual pick when nothing was detected', () => {
      expect(isOwnLocation({ isDetected: false, source: 'manual', ...LONDON })).toBe(false)
    })

    it('is false for a manual pick without coordinates', () => {
      rememberDetectedCoords(CROYDON.latitude, CROYDON.longitude)
      expect(isOwnLocation({ isDetected: false, source: 'manual', latitude: null, longitude: null })).toBe(false)
    })

    it('is false for the default location even when near the detected position', () => {
      rememberDetectedCoords(CROYDON.latitude, CROYDON.longitude)
      expect(isOwnLocation({ isDetected: false, source: 'default', ...LONDON })).toBe(false)
    })
  })

  describe('getLocationHeadingClass', () => {
    it('uses the detected style for the user\'s own location', () => {
      globalThis.tempLocationSource = 'manual'
      globalThis.tempLocationIsOwn = true
      expect(getLocationHeadingClass()).toBe('location-heading location-detected')
    })

    it('falls back to the source for other locations', () => {
      globalThis.tempLocationSource = 'manual'
      globalThis.tempLocationIsOwn = false
      expect(getLocationHeadingClass()).toBe('location-heading location-manual')
      globalThis.tempLocationSource = 'default'
      expect(getLocationHeadingClass()).toBe('location-heading location-default')
    })

    it('uses unknown when no source is set', () => {
      expect(getLocationHeadingClass()).toBe('location-heading location-unknown')
    })
  })
})
