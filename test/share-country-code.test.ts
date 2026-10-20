import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { getShareCountryCode } from '../src/utils/location'
import { createShare } from '../src/share'

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

const g = globalThis as any

afterEach(() => {
  delete g.TempHist
  g.tempLocation = null
  g.tempLocationCountryCode = null
})

describe('getShareCountryCode', () => {
  it("uses the share's own country_code first", () => {
    g.TempHist = { prefetchedLocations: [{ name: 'London', slug: 'london', country_code: 'XX' }] }
    expect(getShareCountryCode({ location: 'London', country_code: 'GB' })).toBe('GB')
  })

  it('falls back to a preapproved match on the first part of the location', () => {
    g.TempHist = { prefetchedLocations: [{ name: 'Dublin', slug: 'dublin', country_code: 'IE' }] }
    expect(getShareCountryCode({ location: 'Dublin, Ireland', country_code: null })).toBe('IE')
  })

  it("never falls back to the viewer's own country", () => {
    g.tempLocationCountryCode = 'GB'
    g.TempHist = { prefetchedLocations: [] }
    expect(getShareCountryCode({ location: 'Madrid', country_code: null })).toBeNull()
  })

  it('returns null before the preapproved list has loaded', () => {
    expect(getShareCountryCode({ location: 'Madrid' })).toBeNull()
  })
})

describe('createShare', () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn() as any
    // apiFetch() throws before reaching fetch unless a user is signed in
    g.currentUser = { uid: 'test-uid', getIdToken: vi.fn().mockResolvedValue('mock-id-token') }
  })

  afterEach(() => {
    delete g.currentUser
  })

  function stubCreate() {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: vi.fn().mockResolvedValue({ share_id: 'abc123' }),
    } as unknown as Response)
  }

  function postedBody(): Record<string, unknown> {
    const init = vi.mocked(fetch).mock.calls.at(-1)![1] as RequestInit
    return JSON.parse(init.body as string)
  }

  const params = { period: 'daily', identifier: '10-20', ref_year: 2026 } as const

  it("sends the current location's country_code", async () => {
    g.tempLocation = 'Kirkenes, Finnmark, Norway'
    g.tempLocationCountryCode = 'NO'
    stubCreate()

    await createShare(params)

    expect(postedBody().country_code).toBe('NO')
  })

  it('sends null when the country is unknown so the API can resolve it', async () => {
    g.tempLocation = 'Madrid'
    g.tempLocationCountryCode = null
    stubCreate()

    await createShare(params)

    expect(postedBody().country_code).toBeNull()
  })
})
