import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// apiFetch is mocked so its real 1/2/4s retry delays don't run; what matters
// here is how the Locations page reacts to the outcome.
const apiFetch = vi.fn()
vi.mock('../src/api/temperature', () => ({
  apiFetch: (...args: unknown[]) => apiFetch(...args),
  getApiUrl: (path: string) => path,
}))
vi.mock('../src/utils/uiHelpers', () => ({ resetTrendBackground: vi.fn() }))

const ERROR_TEXT = "We couldn't load the locations. Try again."
const EMPTY_TEXT = 'No locations available.'

const curated = [
  { id: 'a', slug: 'london', name: 'London', country_name: 'United Kingdom', country_code: 'GB' },
  { id: 'b', slug: 'paris', name: 'Paris', country_name: 'France', country_code: 'FR' },
]
const popular = [
  { id: 'c', slug: 'leeds', name: 'Leeds', country_name: 'United Kingdom', country_code: 'GB' },
]

function okJson(body: unknown): Response {
  return { ok: true, json: vi.fn().mockResolvedValue(body) } as unknown as Response
}
function notOk(): Response {
  return { ok: false, status: 503, json: vi.fn() } as unknown as Response
}

/** Route apiFetch by URL; each handler returns a Response or throws/rejects. */
function routeApi(handlers: { preapproved: () => Promise<Response>; popular: () => Promise<Response> }) {
  apiFetch.mockImplementation((url: string) =>
    url.includes('/preapproved') ? handlers.preapproved() : handlers.popular(),
  )
}

async function flush() {
  for (let i = 0; i < 10; i++) await Promise.resolve()
  await new Promise((r) => setTimeout(r, 0))
}

async function renderPage() {
  const { renderLocationsPage } = await import('../src/locations/locations')
  const { markSignedIn } = await import('../src/auth/signedIn')
  markSignedIn()
  const done = renderLocationsPage()
  await done
  await flush()
}

const content = () => document.querySelector('.locations-content') as HTMLElement

beforeEach(() => {
  vi.resetModules()
  apiFetch.mockReset()
  document.body.replaceChildren()
  const section = document.createElement('section')
  section.id = 'locationsView'
  document.body.appendChild(section)
})

afterEach(() => {
  vi.useRealTimers()
})

describe('Locations page when the API fails', () => {
  it('shows an error with Retry, not "No locations available.", when both requests fail', async () => {
    routeApi({
      preapproved: () => Promise.reject(new Error('Failed to fetch')),
      popular: () => Promise.resolve(notOk()),
    })
    await renderPage()

    expect(content().textContent).toContain(ERROR_TEXT)
    expect(content().textContent).not.toContain(EMPTY_TEXT)
    expect(content().querySelector('.error-container')).not.toBeNull()
    expect(content().querySelector('.btn-retry')).not.toBeNull()
  })

  it('Retry reloads the list once the API is back and removes the error', async () => {
    routeApi({
      preapproved: () => Promise.resolve(notOk()),
      popular: () => Promise.resolve(notOk()),
    })
    await renderPage()
    expect(content().querySelector('.error-container')).not.toBeNull()

    routeApi({
      preapproved: () => Promise.resolve(okJson(curated)),
      popular: () => Promise.resolve(okJson(popular)),
    })
    ;(content().querySelector('.btn-retry') as HTMLButtonElement).click()
    // The loading state shows straight away
    expect(content().textContent).toContain('Loading locations')
    await flush()

    expect(content().querySelector('.error-container')).toBeNull()
    expect(content().textContent).toContain('London')
    expect(content().textContent).toContain('Leeds')
  })

  it('still renders the curated regions when only Popular fails', async () => {
    routeApi({
      preapproved: () => Promise.resolve(okJson(curated)),
      popular: () => Promise.resolve(notOk()),
    })
    await renderPage()

    expect(content().textContent).toContain('London')
    expect(content().textContent).toContain('Paris')
    expect(content().querySelector('.locations-region--popular')).toBeNull()
    expect(content().querySelector('.error-container')).toBeNull()
    expect(content().textContent).toContain("We couldn't load the popular locations.")
    expect(content().textContent).not.toContain(EMPTY_TEXT)
  })

  it('still renders Popular when only the curated list fails', async () => {
    routeApi({
      preapproved: () => Promise.reject(new Error('boom')),
      popular: () => Promise.resolve(okJson(popular)),
    })
    await renderPage()

    expect(content().querySelector('.locations-region--popular')).not.toBeNull()
    expect(content().textContent).toContain('Leeds')
    expect(content().textContent).toContain("We couldn't load the featured locations.")
  })

  it('shows the error rather than "No locations available." when one list failed and the other was empty', async () => {
    routeApi({
      preapproved: () => Promise.resolve(okJson([])),
      popular: () => Promise.resolve(notOk()),
    })
    await renderPage()

    expect(content().textContent).toContain(ERROR_TEXT)
    expect(content().textContent).not.toContain(EMPTY_TEXT)
  })

  it('shows "No locations available." only when the requests succeeded and returned nothing', async () => {
    routeApi({
      preapproved: () => Promise.resolve(okJson([])),
      popular: () => Promise.resolve(okJson([])),
    })
    await renderPage()

    expect(content().textContent).toContain(EMPTY_TEXT)
    expect(content().querySelector('.error-container')).toBeNull()
    expect(content().querySelector('.btn-retry')).toBeNull()
  })

  it('ends the loading state with the error if the requests outlast the timeout', async () => {
    vi.useFakeTimers()
    // Hangs until aborted, like apiFetch sleeping between retries.
    apiFetch.mockImplementation((_url: string, opts: { signal: AbortSignal }) =>
      new Promise((_resolve, reject) => {
        opts.signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
      }),
    )

    const { renderLocationsPage } = await import('../src/locations/locations')
    const { markSignedIn } = await import('../src/auth/signedIn')
    markSignedIn()
    const done = renderLocationsPage()
    await vi.advanceTimersByTimeAsync(0)
    expect(content().textContent).toContain('Loading locations')

    await vi.advanceTimersByTimeAsync(12_000)
    await done

    expect(content().textContent).toContain(ERROR_TEXT)
    expect(content().textContent).not.toContain(EMPTY_TEXT)
  })

  it('does not write into a view that was re-rendered while a request was in flight', async () => {
    let resolveFirst!: (r: Response) => void
    apiFetch.mockImplementationOnce(() => new Promise<Response>((r) => { resolveFirst = r }))
    apiFetch.mockImplementationOnce(() => new Promise<Response>(() => {}))

    const { renderLocationsPage } = await import('../src/locations/locations')
    const { markSignedIn } = await import('../src/auth/signedIn')
    markSignedIn()
    const first = renderLocationsPage()
    await flush()
    const staleContent = content()

    // A second render replaces the DOM the first one is holding.
    routeApi({
      preapproved: () => Promise.resolve(okJson(curated)),
      popular: () => Promise.resolve(okJson(popular)),
    })
    await renderLocationsPage()
    await flush()
    expect(content().textContent).toContain('London')

    resolveFirst(notOk())
    await flush()
    expect(staleContent.isConnected).toBe(false)
    expect(content().textContent).toContain('London')
    expect(content().querySelector('.error-container')).toBeNull()
    void first
  })
})
