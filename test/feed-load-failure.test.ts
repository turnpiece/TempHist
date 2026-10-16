import { describe, it, expect, beforeEach, vi } from 'vitest'

const apiFetch = vi.fn()
vi.mock('../src/api/temperature', () => ({
  apiFetch: (...args: unknown[]) => apiFetch(...args),
  getApiUrl: (path: string) => path,
}))
vi.mock('../src/utils/uiHelpers', () => ({
  resetTrendBackground: vi.fn(),
  createDataAttribution: () => document.createElement('p'),
}))
vi.mock('../src/share', () => ({
  openShareModal: vi.fn(),
  formatPeriodHeading: () => 'Today',
}))
vi.mock('../src/locations/locations', () => ({
  flagImg: () => document.createElement('img'),
}))

const ERROR_TEXT = "Couldn't connect to the temperature data server. Please try again."

const share = {
  id: 's1',
  location: 'London, England, United Kingdom',
  period: 'daily',
  identifier: '10-16',
  ref_year: 2026,
  unit: 'celsius',
  created_at: new Date().toISOString(),
  og_image_url: '/og/s1.png',
  share_url: 'https://temphist.com/s/s1',
}

function okShares(shares: unknown[]): Response {
  return { ok: true, json: vi.fn().mockResolvedValue({ shares, limit: 20, offset: 0 }) } as unknown as Response
}

async function flush() {
  for (let i = 0; i < 10; i++) await Promise.resolve()
  await new Promise((r) => setTimeout(r, 0))
}

async function renderFeed() {
  const { renderFeedPage } = await import('../src/views/feed')
  const { markSignedIn } = await import('../src/auth/signedIn')
  markSignedIn()
  renderFeedPage()
  await flush()
}

const grid = () => document.querySelector('.feed-grid') as HTMLElement

beforeEach(() => {
  vi.resetModules()
  apiFetch.mockReset()
  document.body.replaceChildren()
  const section = document.createElement('section')
  section.id = 'feedView'
  document.body.appendChild(section)
})

describe('Snapshots page when the API fails', () => {
  it('shows a friendly error with Retry in the shared error container, not the raw HTTP error', async () => {
    apiFetch.mockRejectedValue(new Error('HTTP error! status: 502'))
    await renderFeed()

    const container = grid().querySelector('.error-container')
    expect(container).not.toBeNull()
    expect(container!.textContent).toContain(ERROR_TEXT)
    expect(grid().textContent).not.toContain('HTTP error')
    expect(grid().querySelector('.btn-retry')).not.toBeNull()
    expect(document.querySelector('.feed-load-more')!.hasAttribute('hidden')).toBe(true)
  })

  it('Retry reloads the feed and removes the error', async () => {
    apiFetch.mockRejectedValueOnce(new Error('HTTP error! status: 502'))
    await renderFeed()
    expect(grid().querySelector('.error-container')).not.toBeNull()

    apiFetch.mockResolvedValue(okShares([share]))
    ;(grid().querySelector('.btn-retry') as HTMLButtonElement).click()
    await flush()

    expect(grid().querySelector('.error-container')).toBeNull()
    expect(grid().querySelectorAll('.feed-card')).toHaveLength(1)
  })

  it('shows the error again if Retry fails again', async () => {
    apiFetch.mockRejectedValue(new Error('HTTP error! status: 502'))
    await renderFeed()

    ;(grid().querySelector('.btn-retry') as HTMLButtonElement).click()
    await flush()

    expect(apiFetch).toHaveBeenCalledTimes(2)
    expect(grid().querySelectorAll('.error-container')).toHaveLength(1)
  })

  it('retries the filter the visitor chose, not the default', async () => {
    apiFetch.mockResolvedValueOnce(okShares([share]))
    await renderFeed()

    apiFetch.mockRejectedValueOnce(new Error('HTTP error! status: 502'))
    ;(document.querySelector('[data-period="weekly"]') as HTMLButtonElement).click()
    await flush()
    expect(grid().querySelector('.error-container')).not.toBeNull()

    apiFetch.mockResolvedValue(okShares([]))
    ;(grid().querySelector('.btn-retry') as HTMLButtonElement).click()
    await flush()

    expect(String(apiFetch.mock.calls.at(-1)![0])).toContain('period=weekly')
    expect(grid().textContent).toContain('No weekly snapshots have been shared.')
  })

  it('still shows "No snapshots" (not an error) when the request succeeded with nothing', async () => {
    apiFetch.mockResolvedValue(okShares([]))
    await renderFeed()

    expect(grid().textContent).toContain('No snapshots have been shared yet.')
    expect(grid().querySelector('.error-container')).toBeNull()
  })
})
