import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest'

vi.mock('../src/firebase', () => ({ app: {}, auth: {}, appCheck: null }))
vi.mock('firebase/app-check', () => ({
  getToken: vi.fn().mockResolvedValue({ token: 'mock-app-check-token' }),
  initializeAppCheck: vi.fn().mockReturnValue({}),
  ReCaptchaV3Provider: vi.fn(),
}))
vi.mock('firebase/auth', () => ({ signInAnonymously: vi.fn(), onAuthStateChanged: vi.fn() }))
vi.mock('../src/utils/uiHelpers', () => ({
  resetTrendBackground: vi.fn(),
  buildLocationDisplay: vi.fn(),
  createDataAttribution: () => {
    const p = document.createElement('p')
    p.className = 'data-attribution'
    p.textContent = 'Data attribution'
    return p
  },
}))
vi.mock('../src/share', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/share')>()
  return { ...actual, openShareModal: vi.fn() }
})

function mountPage(viewId: string) {
  document.body.className = ''
  document.body.replaceChildren()
  const outlet = document.createElement('main')
  outlet.id = 'viewOutlet'
  const section = document.createElement('section')
  section.id = viewId
  outlet.appendChild(section)
  document.body.appendChild(outlet)
}

function okJson(body: unknown): Response {
  return { ok: true, json: vi.fn().mockResolvedValue(body) } as unknown as Response
}

function signIn() {
  ;(globalThis as any).currentUser = {
    uid: 'test-uid',
    getIdToken: vi.fn().mockResolvedValue('mock-id-token'),
  }
}

async function flush() {
  for (let i = 0; i < 10; i++) await Promise.resolve()
  await new Promise((r) => setTimeout(r, 0))
}

// The first import of these modules transforms a large dependency graph. Warm it
// once with a generous timeout so a cold cache can't time a test out mid-flight
// and leak its pending fetches into the tests that follow.
beforeAll(async () => {
  await import('../src/views/feed')
  await import('../src/locations/locations')
}, 60_000)

beforeEach(() => {
  vi.resetModules()
  delete (globalThis as any).currentUser
  globalThis.fetch = vi.fn() as any
})

afterEach(() => {
  delete (globalThis as any).currentUser
})

describe('signedIn gate', () => {
  it('stays pending until markSignedIn, then resolves', async () => {
    const { whenSignedIn, markSignedIn, isSignedIn } = await import('../src/auth/signedIn')
    let resolved = false
    void whenSignedIn().then(() => { resolved = true })
    await flush()
    expect(isSignedIn()).toBe(false)
    expect(resolved).toBe(false)

    markSignedIn()
    await flush()
    expect(isSignedIn()).toBe(true)
    expect(resolved).toBe(true)
  })

  it('resolves immediately when a user already exists', async () => {
    signIn()
    const { whenSignedIn, isSignedIn } = await import('../src/auth/signedIn')
    expect(isSignedIn()).toBe(true)
    await expect(whenSignedIn()).resolves.toBeUndefined()
  })
})

describe('Snapshots page before sign-in', () => {
  beforeEach(() => mountPage('feedView'))

  it('renders the static header, intro, attribution and filters without calling the API', async () => {
    const { renderFeedPage } = await import('../src/views/feed')
    renderFeedPage()
    await flush()

    expect(document.querySelector('.feed-header h2')!.textContent).toBe('Snapshots')
    expect(document.querySelector('.feed-desc')).not.toBeNull()
    expect(document.querySelector('.data-attribution')).not.toBeNull()
    expect(document.querySelectorAll('.feed-filter-bar__btn')).toHaveLength(5)
    expect(fetch).not.toHaveBeenCalled()
    // No spurious "No authenticated user" error in the grid
    expect(document.querySelector('.feed-error')).toBeNull()
  })

  it('loads shares once sign-in completes, using any filter chosen meanwhile', async () => {
    const { renderFeedPage } = await import('../src/views/feed')
    const { markSignedIn } = await import('../src/auth/signedIn')
    renderFeedPage()

    // Pick "Weekly" while signed out: no request, but the choice is kept
    ;(document.querySelectorAll('.feed-filter-bar__btn')[2] as HTMLButtonElement).click()
    await flush()
    expect(fetch).not.toHaveBeenCalled()

    vi.mocked(fetch).mockResolvedValueOnce(okJson({ shares: [], limit: 20, offset: 0 }))
    signIn()
    markSignedIn()
    await flush()

    expect(fetch).toHaveBeenCalledTimes(1)
    const url = vi.mocked(fetch).mock.calls[0][0] as string
    expect(url).toContain('/v1/shares')
    expect(url).toContain('period=weekly')
  })

  it('shows the connection notice in the grid, keeping the static content, and clears it on Retry', async () => {
    const { renderFeedPage } = await import('../src/views/feed')
    const { showAuthErrorBanner, hideAuthErrorBanner } = await import('../src/auth/authErrorBanner')
    renderFeedPage()

    const onRetry = vi.fn()
    showAuthErrorBanner('network', onRetry)

    const grid = document.querySelector('.feed-grid') as HTMLElement
    expect(grid.querySelector('#authError')).not.toBeNull()
    expect(grid.classList.contains('auth-error-region--failed')).toBe(true)
    expect(grid.textContent).toContain("couldn't connect")
    // Static content is still there
    expect(document.querySelector('.feed-desc')).not.toBeNull()
    expect(document.querySelectorAll('.feed-filter-bar__btn')).toHaveLength(5)

    ;(grid.querySelector('.btn-retry') as HTMLButtonElement).click()
    expect(onRetry).toHaveBeenCalledTimes(1)
    expect(grid.classList.contains('auth-error-region--failed')).toBe(false)
    hideAuthErrorBanner()
  })
})

describe('Locations page before sign-in', () => {
  beforeEach(() => mountPage('locationsView'))

  it('renders the heading and holds the API calls until sign-in', async () => {
    const { renderLocationsPage } = await import('../src/locations/locations')
    void renderLocationsPage()
    await flush()

    expect(document.querySelector('#locationsView h2')!.textContent).toBe('Locations')
    expect(fetch).not.toHaveBeenCalled()
    expect(document.querySelector('.locations-status--error')).toBeNull()
  })

  it('puts the connection notice where the list would be, replacing the loading text', async () => {
    const { renderLocationsPage } = await import('../src/locations/locations')
    const { showAuthErrorBanner } = await import('../src/auth/authErrorBanner')
    void renderLocationsPage()
    await flush()
    expect(document.querySelector('.locations-status')!.textContent).toBe('Loading locations…')

    showAuthErrorBanner('verification', vi.fn())
    const content = document.querySelector('.locations-content') as HTMLElement
    expect(content.querySelector('#authError')).not.toBeNull()
    expect(content.textContent).not.toContain('Loading locations')
    expect(content.classList.contains('auth-error-region--failed')).toBe(true)
    expect(document.querySelector('#locationsView h2')!.textContent).toBe('Locations')
  })
})
