import { describe, it, expect } from 'vitest'
import { buildDashboard } from '../src/utils/dashboardBuilder'

describe('buildDashboard meta bubble', () => {
  it('places the Open-Meteo attribution in a meta bubble after the stats bubble', () => {
    const { dashboard, statsBubbleEl } = buildDashboard({})

    const meta = dashboard.querySelector('.dashboard__stats > .meta-bubble')
    expect(meta).not.toBeNull()
    expect(meta!.previousElementSibling).toBe(statsBubbleEl)

    // Both bubbles share the .bubble base class for common geometry.
    expect(statsBubbleEl.classList.contains('bubble')).toBe(true)
    expect(meta!.classList.contains('bubble')).toBe(true)

    const link = meta!.querySelector('.data-attribution a') as HTMLAnchorElement
    expect(link.href).toBe('https://open-meteo.com/')
  })

  it('adds extraMetaContent inside the meta bubble, below the attribution', () => {
    const generatedAt = document.createElement('div')
    generatedAt.className = 'share-generated-at'

    const { dashboard } = buildDashboard({ extraMetaContent: [generatedAt] })

    const meta = dashboard.querySelector('.meta-bubble')!
    expect(Array.from(meta.children).map(el => el.className)).toEqual([
      'data-attribution',
      'share-generated-at',
    ])
  })

  it('keeps extraStatsContent outside the meta bubble', () => {
    const cta = document.createElement('div')
    cta.className = 'share-page-cta'

    const { dashboard } = buildDashboard({ extraStatsContent: [cta] })

    expect(dashboard.querySelector('.meta-bubble .share-page-cta')).toBeNull()
    expect(dashboard.querySelector('.dashboard__stats > .share-page-cta')).toBe(cta)
  })
})
