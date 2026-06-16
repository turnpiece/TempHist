import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// ── Module mocks ─────────────────────────────────────────────────────────────
// splash.ts has many dependencies; mock them all so we can test just
// initSnapshotsCarousel in isolation.

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

vi.mock('../src/utils/location', () => ({
  setLocationCookie: vi.fn(),
  getLocationCookie: vi.fn().mockReturnValue(null),
  getOrdinal: vi.fn((n: number) => `${n}th`),
  getCountryCodeForLocation: vi.fn().mockReturnValue('gb'),
  getDisplayCity: vi.fn((loc: string) => loc.split(',')[0].trim()),
}))

vi.mock('../src/services/locationDetection', () => ({
  detectUserLocationWithGeolocation: vi.fn(),
  getLocationFromIP: vi.fn().mockResolvedValue(null),
}))

vi.mock('../src/utils/dateUtils', () => ({
  getEffectiveDateForLocation: vi.fn().mockReturnValue('01-01'),
  localTodayIn: vi.fn().mockReturnValue(new Date()),
  msUntilNextLocalMidnight: vi.fn().mockReturnValue(0),
}))

vi.mock('../src/services/locationCarousel', () => ({
  resetCarouselState: vi.fn(),
}))

vi.mock('../src/utils/uiHelpers', () => ({
  resetTrendBackground: vi.fn(),
  buildLocationDisplay: vi.fn().mockReturnValue('London'),
}))

vi.mock('../src/utils/DataCache', () => ({
  DataCache: vi.fn().mockImplementation(() => ({
    get: vi.fn().mockReturnValue(null),
    set: vi.fn(),
    clear: vi.fn(),
  })),
}))

vi.mock('../src/utils/LoadingManager', () => ({
  LoadingManager: vi.fn().mockImplementation(() => ({
    show: vi.fn(),
    hide: vi.fn(),
    setMessage: vi.fn(),
  })),
}))

vi.mock('../src/utils/LazyLoader', () => ({
  LazyLoader: vi.fn().mockImplementation(() => ({
    observe: vi.fn(),
    unobserve: vi.fn(),
  })),
}))

vi.mock('../src/views/about', () => ({
  renderAboutPage: vi.fn(),
  renderPrivacyPage: vi.fn(),
}))

vi.mock('../src/views/feed', () => ({
  renderFeedPage: vi.fn(),
  buildCard: vi.fn((share: any) => {
    // Minimal card stub — returns a real DOM node so carousel population is testable
    const a = document.createElement('a')
    a.className = 'feed-card'
    a.href = share.share_url
    a.dataset['shareId'] = share.id
    const city = document.createElement('div')
    city.className = 'feed-card__city'
    city.textContent = share.location.split(',')[0].trim()
    a.appendChild(city)
    return a
  }),
}))

vi.mock('../src/views/today', () => ({
  setupChangeLocationButton: vi.fn(),
}))

vi.mock('../src/share', () => ({
  buildShareUI: vi.fn(),
  fetchShareMetadata: vi.fn(),
  fetchShareTemperatureData: vi.fn(),
  renderShareChart: vi.fn(),
  loadShareLocations: vi.fn(),
  showShareError: vi.fn(),
  openShareModal: vi.fn(),
  formatPeriodHeading: vi.fn((share: any) => share.period ?? 'Today'),
}))

// ── Test helpers ──────────────────────────────────────────────────────────────

function makeShare(id: string, city = 'London') {
  return {
    id,
    location: `${city}, UK`,
    period: 'daily',
    identifier: '3-27',
    ref_year: 2024,
    unit: 'celsius',
    created_at: new Date(Date.now() - 10 * 60_000).toISOString(),
    og_image_url: `/og/${id}.png`,
    share_url: `/s/${id}`,
  }
}

function setupDOM() {
  document.body.innerHTML = '<div id="snapshotsSection"></div>'
}

function mockFetchShares(shares: any[]) {
  vi.mocked(fetch).mockResolvedValueOnce({
    ok: true,
    json: vi.fn().mockResolvedValue({ shares, limit: 5, offset: 0 }),
  } as unknown as Response)
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('initSnapshotsCarousel', () => {
  let initSnapshotsCarousel: () => Promise<void>

  beforeEach(async () => {
    vi.resetAllMocks()
    globalThis.fetch = vi.fn() as any
    setupDOM()
    // apiFetch() requires globalThis.currentUser to be set, otherwise it throws
    // before ever reaching the mocked global fetch above
    ;(globalThis as any).currentUser = {
      uid: 'test-uid',
      getIdToken: vi.fn().mockResolvedValue('mock-id-token'),
    }
    // Import after mocks are set up
    const mod = await import('../src/splash/splash')
    initSnapshotsCarousel = mod.initSnapshotsCarousel
  })

  afterEach(() => {
    delete (globalThis as any).currentUser
  })

  it('populates the section with 2-column layout, heading, description, CTA and card grid when shares are returned', async () => {
    mockFetchShares([makeShare('s1', 'London'), makeShare('s2', 'Paris'), makeShare('s3', 'Tokyo')])

    await initSnapshotsCarousel()

    const section = document.getElementById('snapshotsSection')!
    expect(section.querySelector('.snapshots-inner')).not.toBeNull()
    expect(section.querySelector('.snap-left')).not.toBeNull()
    expect(section.querySelector('.snap-grid')).not.toBeNull()
    expect(section.querySelector('.snap-link')).not.toBeNull()
  })

  it('section title reads "Snapshots"', async () => {
    mockFetchShares([makeShare('s1')])

    await initSnapshotsCarousel()

    const heading = document.querySelector('.snap-left .section-title') as HTMLElement
    expect(heading?.textContent).toBe('Snapshots')
  })

  it('CTA snap-link links to /feed', async () => {
    mockFetchShares([makeShare('s1')])

    await initSnapshotsCarousel()

    const link = document.querySelector('a.snap-link') as HTMLAnchorElement
    expect(link?.getAttribute('href')).toBe('/feed')
  })

  it('renders one card per share', async () => {
    mockFetchShares([makeShare('s1', 'London'), makeShare('s2', 'Paris'), makeShare('s3', 'Tokyo')])

    await initSnapshotsCarousel()

    const cards = document.querySelectorAll('.snap-card')
    expect(cards).toHaveLength(3)
  })

  it('fetches from the /v1/shares endpoint with limit=6', async () => {
    mockFetchShares([makeShare('s1')])

    await initSnapshotsCarousel()

    const calledUrl = vi.mocked(fetch).mock.calls[0][0] as string
    expect(calledUrl).toContain('/v1/shares')
    expect(calledUrl).toContain('limit=6')
  })

  it('does nothing when the section element is not in the DOM', async () => {
    document.body.innerHTML = '' // no #snapshotsSection

    await initSnapshotsCarousel()

    expect(fetch).not.toHaveBeenCalled()
  })

  it('does nothing when the API returns an empty shares array', async () => {
    mockFetchShares([])

    await initSnapshotsCarousel()

    const section = document.getElementById('snapshotsSection')!
    expect(section.children).toHaveLength(0)
  })

  it('silently does nothing when the fetch fails (non-ok response)', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({ ok: false, status: 500 } as unknown as Response)

    await expect(initSnapshotsCarousel()).resolves.toBeUndefined()

    const section = document.getElementById('snapshotsSection')!
    expect(section.children).toHaveLength(0)
  })

  it('silently does nothing when the fetch throws a network error', async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error('Network error'))

    await expect(initSnapshotsCarousel()).resolves.toBeUndefined()

    const section = document.getElementById('snapshotsSection')!
    expect(section.children).toHaveLength(0)
  })

  it('clears previous content when called a second time', async () => {
    // First call
    mockFetchShares([makeShare('s1')])
    await initSnapshotsCarousel()
    expect(document.querySelectorAll('.snap-card')).toHaveLength(1)

    // Second call with different shares
    mockFetchShares([makeShare('s2', 'Paris'), makeShare('s3', 'Tokyo')])
    await initSnapshotsCarousel()

    // Should show only the new cards, not the old ones
    expect(document.querySelectorAll('.snap-card')).toHaveLength(2)
  })
})
