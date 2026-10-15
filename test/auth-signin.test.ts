import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// firebase/auth: signInAnonymously is controlled per test.
const signInAnonymously = vi.fn()
vi.mock('firebase/auth', () => ({
  signInAnonymously: (...args: unknown[]) => signInAnonymously(...args),
  onAuthStateChanged: vi.fn(),
}))

vi.mock('../src/firebase', () => ({ app: {}, auth: {}, appCheck: null }))
vi.mock('firebase/app-check', () => ({
  getToken: vi.fn(),
  initializeAppCheck: vi.fn().mockReturnValue({}),
  ReCaptchaV3Provider: vi.fn(),
}))

// analytics.ts keeps a per-page-load dedupe set, so load fresh modules per test.
async function load() {
  vi.resetModules()
  const signIn = await import('../src/auth/signIn')
  const analytics = await import('../src/analytics/analytics')
  return { ...signIn, ...analytics }
}

function firebaseError(code: string) {
  return Object.assign(new Error(code), { code })
}

describe('sign-in failure classification', () => {
  it('treats network errors and timeouts as "network"', async () => {
    const { classifySignInError } = await load()
    expect(classifySignInError(firebaseError('auth/network-request-failed'))).toBe('network')
    expect(classifySignInError(firebaseError('timeout'))).toBe('network')
  })

  it('treats every other error as "verification"', async () => {
    const { classifySignInError } = await load()
    expect(classifySignInError(firebaseError('auth/internal-error'))).toBe('verification')
    expect(classifySignInError(firebaseError('auth/too-many-requests'))).toBe('verification')
    expect(classifySignInError(new Error('boom'))).toBe('verification')
    expect(classifySignInError(undefined)).toBe('verification')
  })

  it('extracts an error code, defaulting to "unknown"', async () => {
    const { errorCode } = await load()
    expect(errorCode(firebaseError('auth/foo'))).toBe('auth/foo')
    expect(errorCode(new Error('x'))).toBe('unknown')
    expect(errorCode(null)).toBe('unknown')
  })
})

describe('signInWithTimeout / attemptSignIn', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    signInAnonymously.mockReset()
    // Injected by Vite's `define` in real builds; sendAnalytics would throw (and
    // swallow it) without it.
    vi.stubGlobal('__APP_VERSION__', 'test')
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, text: async () => '' }) as any
    ;(globalThis as any).currentUser = null
    ;(globalThis as any).TempHist = {
      analytics: { errors: [], apiCalls: 0, apiFailures: 0, retryAttempts: 0, locationFailures: 0, startTime: Date.now(), lastRequestMetadata: null },
    }
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('resolves when sign-in succeeds and does not report', async () => {
    signInAnonymously.mockResolvedValue({})
    const { attemptSignIn } = await load()
    const onFailure = vi.fn()
    await attemptSignIn({} as any, 'share', onFailure)
    expect(onFailure).not.toHaveBeenCalled()
    expect(fetch).not.toHaveBeenCalled()
  })

  it('rejects with code "timeout" when sign-in hangs, within the bound', async () => {
    signInAnonymously.mockReturnValue(new Promise(() => {}))
    const { attemptSignIn } = await load()
    const onFailure = vi.fn()
    const p = attemptSignIn({} as any, 'share', onFailure)
    await vi.advanceTimersByTimeAsync(11_999)
    expect(onFailure).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(2)
    await p
    expect(onFailure).toHaveBeenCalledWith('network')
  })

  it('reports a sign-in rejection once, unauthenticated, in the API error shape', async () => {
    signInAnonymously.mockRejectedValue(firebaseError('auth/network-request-failed'))
    const { attemptSignIn } = await load()
    const onFailure = vi.fn()
    await attemptSignIn({} as any, 'share', onFailure)
    await attemptSignIn({} as any, 'share', onFailure) // retry: same code, not re-reported

    expect(onFailure).toHaveBeenCalledTimes(2)
    expect(onFailure).toHaveBeenCalledWith('network')
    expect(fetch).toHaveBeenCalledTimes(1)

    const [, init] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit]
    expect((init.headers as Record<string, string>).Authorization).toBeUndefined()
    const body = JSON.parse(init.body as string)
    expect(body.platform).toBe('web')
    expect(body.error_count).toBe(1)
    expect(body.error_type).toBe('auth_signin')
    expect(body.recent_errors).toHaveLength(1)
    expect(body.recent_errors[0]).toMatchObject({
      error_type: 'auth_signin',
      message: 'auth/network-request-failed',
      endpoint: 'share',
    })
    expect(typeof body.recent_errors[0].timestamp).toBe('string')
  })

  it('does not leave the entry behind to be double-reported by the unload sender', async () => {
    signInAnonymously.mockRejectedValue(firebaseError('auth/internal-error'))
    const { attemptSignIn } = await load()
    await attemptSignIn({} as any, 'spa', vi.fn())
    expect((globalThis as any).TempHist.analytics.errors).toHaveLength(0)
  })

  it('reports distinct codes separately', async () => {
    const { recordAuthFailure } = await load()
    recordAuthFailure('app_check_token', 'appCheck/recaptcha-error', 'share')
    recordAuthFailure('app_check_token', 'appCheck/recaptcha-error', 'share')
    recordAuthFailure('app_check_token', 'appCheck/fetch-status-error', 'share')
    expect(fetch).toHaveBeenCalledTimes(2)
  })
})

describe('share page connection error state', () => {
  beforeEach(async () => {
    document.body.replaceChildren()
    const outlet = document.createElement('div')
    outlet.id = 'viewOutlet'
    document.body.appendChild(outlet)
    vi.resetModules()
    window.location.pathname = '/s/abcd1234'
  })

  async function mount() {
    const share = await import('../src/share')
    share.mountSharePageShell()
    return share
  }

  it('shows an accurate message with Retry and no loading text', async () => {
    const share = await mount()
    const onRetry = vi.fn()
    share.showShareConnectionError('verification', onRetry)

    const message = document.querySelector('.error-message') as HTMLElement
    expect(message.textContent).toContain('privacy settings')
    // The loading indicator (spinner + text) must be hidden, not just re-labelled
    const loadingText = Array.from(document.querySelectorAll('*')).find(
      el => el.children.length === 0 && el.textContent === 'Loading temperature data…'
    ) as HTMLElement
    const loadingEl = loadingText.parentElement as HTMLElement
    expect(loadingEl.classList.contains('visible')).toBe(false)
    expect(loadingEl.classList.contains('hidden')).toBe(true)

    // Gap under the header while the location heading is hidden; removed on Retry
    const sharePage = document.querySelector('.share-page') as HTMLElement
    expect(sharePage.classList.contains('share-page--connection-error')).toBe(true)

    const retry = document.querySelector('.btn-retry') as HTMLButtonElement
    expect(retry).not.toBeNull()
    retry.click()
    expect(onRetry).toHaveBeenCalledTimes(1)
    expect(sharePage.classList.contains('share-page--connection-error')).toBe(false)
    // Retry puts the connecting state back
    expect((document.querySelector('.error-container') as HTMLElement).style.display).toBe('none')
    expect(document.querySelector('.btn-retry')).toBeNull()
    expect(loadingEl.classList.contains('visible')).toBe(true)
    expect(loadingEl.classList.contains('hidden')).toBe(false)
  })

  it('uses the network copy for connection failures', async () => {
    const share = await mount()
    share.showShareConnectionError('network', vi.fn())
    expect(document.querySelector('.error-message')!.textContent).toContain("couldn't connect")
  })

  it('loads share data once even if auth state fires again, and clears a stale error', async () => {
    const apiFetch = vi.fn().mockResolvedValue({ ok: false, status: 404 })
    vi.doMock('../src/api/temperature', async () => ({
      ...(await vi.importActual<object>('../src/api/temperature')),
      apiFetch,
    }))
    const share = await mount()
    share.showShareConnectionError('network', vi.fn())

    // Late sign-in success arrives while the error is showing (and fires twice)
    share.loadSharePageData()
    share.loadSharePageData()
    await vi.waitFor(() => expect(apiFetch).toHaveBeenCalled())

    const metaCalls = apiFetch.mock.calls.filter(([url]) => String(url).includes('/v1/shares/abcd1234'))
    expect(metaCalls).toHaveLength(1)
    expect(document.querySelector('.btn-retry')).toBeNull()
    vi.doUnmock('../src/api/temperature')
  })
})

describe('sign-in failure banner on standalone pages', () => {
  beforeEach(() => {
    document.body.className = 'locations-page'
    document.body.replaceChildren()
    const outlet = document.createElement('main')
    outlet.id = 'viewOutlet'
    const section = document.createElement('section')
    section.id = 'locationsView'
    outlet.appendChild(section)
    document.body.appendChild(outlet)
    vi.resetModules()
  })

  it('creates the banner at the top of #viewOutlet when the page has no #authError', async () => {
    const { showAuthErrorBanner } = await import('../src/auth/authErrorBanner')
    showAuthErrorBanner('network', vi.fn())

    const outlet = document.getElementById('viewOutlet')!
    const banner = document.getElementById('authError')!
    expect(outlet.firstElementChild).toBe(banner)
    expect(banner.hidden).toBe(false)
    expect(banner.classList.contains('auth-error--page')).toBe(true)
    expect(banner.textContent).toContain("couldn't connect")
    // Footer is revealed even though no content rendered
    expect(document.body.classList.contains('content-ready')).toBe(true)
  })

  it('reuses an existing #authError container (homepage splash)', async () => {
    const existing = document.createElement('div')
    existing.id = 'authError'
    existing.hidden = true
    document.body.appendChild(existing)

    const { showAuthErrorBanner } = await import('../src/auth/authErrorBanner')
    showAuthErrorBanner('verification', vi.fn())

    expect(document.querySelectorAll('#authError')).toHaveLength(1)
    expect(existing.hidden).toBe(false)
    expect(existing.textContent).toContain('privacy settings')
  })

  it('Retry hides the banner and re-runs sign-in', async () => {
    const { showAuthErrorBanner } = await import('../src/auth/authErrorBanner')
    const onRetry = vi.fn()
    showAuthErrorBanner('network', onRetry)

    ;(document.querySelector('#authError .btn-retry') as HTMLButtonElement).click()
    expect(onRetry).toHaveBeenCalledTimes(1)
    expect(document.getElementById('authError')!.hidden).toBe(true)
    expect(document.querySelector('#authError .btn-retry')).toBeNull()
  })

  it('does nothing when there is no #viewOutlet to put it in', async () => {
    document.body.replaceChildren()
    const { showAuthErrorBanner } = await import('../src/auth/authErrorBanner')
    expect(() => showAuthErrorBanner('network', vi.fn())).not.toThrow()
    expect(document.getElementById('authError')).toBeNull()
  })
})
