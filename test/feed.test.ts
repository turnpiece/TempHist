import { describe, it, expect, beforeEach, vi } from 'vitest'
import { fetchShares, buildCard } from '../src/views/feed'
import type { ShareItem } from '../src/views/feed'

// ── Module mocks ─────────────────────────────────────────────────────────────

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

// Use importOriginal so pure helpers like formatPeriodHeading keep their real
// implementations; only stub the async/DOM-touching functions.
vi.mock('../src/share', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/share')>();
  return {
    ...actual,
    buildShareUI: vi.fn(),
    fetchShareMetadata: vi.fn(),
    fetchShareTemperatureData: vi.fn(),
    renderShareChart: vi.fn(),
    loadShareLocations: vi.fn(),
    showShareError: vi.fn(),
    openShareModal: vi.fn(),
  };
})

vi.mock('../src/utils/uiHelpers', () => ({
  resetTrendBackground: vi.fn(),
  buildLocationDisplay: vi.fn(),
}))

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeShare(overrides: Partial<ShareItem> = {}): ShareItem {
  return {
    id: 'abc123',
    location: 'London, UK',
    period: 'daily',
    identifier: '3-27',      // March 27
    ref_year: 2024,
    unit: 'celsius',
    created_at: new Date(Date.now() - 5 * 60_000).toISOString(), // 5 min ago
    og_image_url: '/og/abc123.png',
    share_url: '/s/abc123',
    ...overrides,
  }
}

function mockOkResponse(body: unknown): Response {
  return {
    ok: true,
    json: vi.fn().mockResolvedValue(body),
  } as unknown as Response
}

function mockErrorResponse(status: number): Response {
  return { ok: false, status } as unknown as Response
}

// ── fetchShares ───────────────────────────────────────────────────────────────

describe('fetchShares', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    global.fetch = vi.fn()
  })

  it('fetches shares with default params', async () => {
    const payload = { shares: [makeShare()], limit: 20, offset: 0 }
    vi.mocked(fetch).mockResolvedValueOnce(mockOkResponse(payload))

    const result = await fetchShares()

    expect(result.shares).toHaveLength(1)
    expect(result.shares[0].id).toBe('abc123')

    // URL should contain limit=20 and no period / offset params
    const calledUrl = vi.mocked(fetch).mock.calls[0][0] as string
    expect(calledUrl).toContain('/v1/shares')
    expect(calledUrl).toContain('limit=20')
    expect(calledUrl).not.toContain('period=')
    expect(calledUrl).not.toContain('offset=')
  })

  it('includes period param when filter is set', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(mockOkResponse({ shares: [], limit: 20, offset: 0 }))

    await fetchShares('daily')

    const calledUrl = vi.mocked(fetch).mock.calls[0][0] as string
    expect(calledUrl).toContain('period=daily')
  })

  it('includes offset param when greater than zero', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(mockOkResponse({ shares: [], limit: 20, offset: 20 }))

    await fetchShares('', 20)

    const calledUrl = vi.mocked(fetch).mock.calls[0][0] as string
    expect(calledUrl).toContain('offset=20')
  })

  it('does not include offset param when offset is 0', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(mockOkResponse({ shares: [], limit: 20, offset: 0 }))

    await fetchShares('', 0)

    const calledUrl = vi.mocked(fetch).mock.calls[0][0] as string
    expect(calledUrl).not.toContain('offset=')
  })

  it('throws when the API returns a non-ok status', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(mockErrorResponse(500))

    await expect(fetchShares()).rejects.toThrow('Failed to load feed (500).')
  })

  it('propagates network errors', async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error('Network error'))

    await expect(fetchShares()).rejects.toThrow('Network error')
  })

  it('returns all share fields correctly', async () => {
    const share = makeShare({ period: 'weekly', identifier: '10-14' })
    vi.mocked(fetch).mockResolvedValueOnce(mockOkResponse({ shares: [share], limit: 20, offset: 0 }))

    const result = await fetchShares()

    expect(result.shares[0]).toMatchObject({
      id: 'abc123',
      location: 'London, UK',
      period: 'weekly',
      identifier: '10-14',
    })
  })
})

// ── buildCard ─────────────────────────────────────────────────────────────────

describe('buildCard', () => {
  it('returns an anchor element with feed-card class', () => {
    const card = buildCard(makeShare())
    expect(card.tagName).toBe('A')
    expect(card.classList.contains('feed-card')).toBe(true)
  })

  it('sets href to the share URL', () => {
    const card = buildCard(makeShare({ share_url: '/s/abc123' })) as HTMLAnchorElement
    expect(card.getAttribute('href')).toBe('/s/abc123')
  })

  it('displays the city name (first part of location)', () => {
    const card = buildCard(makeShare({ location: 'Paris, France' }))
    const cityEl = card.querySelector('.feed-card__city')
    expect(cityEl?.textContent).toBe('Paris')
  })

  it('renders the daily period label as "27th March"', () => {
    const card = buildCard(makeShare({ period: 'daily', identifier: '3-27', ref_year: 2024 }))
    const periodEl = card.querySelector('.feed-card__period')
    expect(periodEl?.textContent).toBe('27th March')
  })

  it('renders the weekly period label with "Week ending" prefix', () => {
    const card = buildCard(makeShare({ period: 'weekly', identifier: '3-27', ref_year: 2024 }))
    const periodEl = card.querySelector('.feed-card__period')
    expect(periodEl?.textContent).toBe('Week ending 27th March')
  })

  it('renders the monthly period label with "Month ending" prefix', () => {
    const card = buildCard(makeShare({ period: 'monthly', identifier: '3-27', ref_year: 2024 }))
    const periodEl = card.querySelector('.feed-card__period')
    expect(periodEl?.textContent).toBe('Month ending 27th March')
  })

  it('renders the yearly period label with "Year ending" prefix', () => {
    const card = buildCard(makeShare({ period: 'yearly', identifier: '3-27', ref_year: 2024 }))
    const periodEl = card.querySelector('.feed-card__period')
    expect(periodEl?.textContent).toBe('Year ending 27th March')
  })

  it('shows a time-ago value in the meta row', () => {
    // created 5 min ago
    const card = buildCard(makeShare({ created_at: new Date(Date.now() - 5 * 60_000).toISOString() }))
    const timeEl = card.querySelector('.feed-card__time')
    expect(timeEl?.textContent).toBe('5m ago')
  })

  it('shows "just now" for very recent shares', () => {
    const card = buildCard(makeShare({ created_at: new Date().toISOString() }))
    const timeEl = card.querySelector('.feed-card__time')
    expect(timeEl?.textContent).toBe('just now')
  })

  it('sets the image src via the API URL', () => {
    const card = buildCard(makeShare({ og_image_url: '/og/abc123.png' }))
    const img = card.querySelector('img') as HTMLImageElement
    // VITE_API_BASE is 'http://localhost:3000/api' in tests
    expect(img.src).toContain('/og/abc123.png')
  })

  it('sets a descriptive alt text on the image', () => {
    const card = buildCard(makeShare({ location: 'Tokyo, Japan', period: 'daily', identifier: '6-15', ref_year: 2024 }))
    const img = card.querySelector('img') as HTMLImageElement
    expect(img.alt).toContain('Tokyo')
  })

  it('attaches a click handler that calls openShareModal with id and prefill', async () => {
    const { openShareModal } = await import('../src/share')
    const share = makeShare({ share_url: '/s/abc123' })
    const card = buildCard(share)
    card.click()
    // Called with the share ID and the share object as prefill
    expect(openShareModal).toHaveBeenCalledWith('abc123', share)
  })
})
