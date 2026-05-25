import { describe, it, expect, beforeEach } from 'vitest'
import { trendBackground, resetTrendBackground, clearTrendBackground, applyTrendBackground, reapplyTrendBackground, updateSummaryTextElements } from '../src/utils/uiHelpers'

// Helpers for reading CSS custom properties and dataset set on documentElement
const root = () => document.documentElement
const bgOpacity = () => root().style.getPropertyValue('--trend-bg-opacity')
const bgImage = () => root().style.getPropertyValue('--trend-bg-image')
const bgBase = () => root().style.getPropertyValue('--static-bg-base')
const trendDir = () => root().dataset.trendDirection

function resetRoot() {
  root().style.removeProperty('--trend-bg-image')
  root().style.removeProperty('--trend-bg-opacity')
  root().style.removeProperty('--static-bg-base')
  delete root().dataset.gradient
  delete root().dataset.todayGradient
  delete root().dataset.trendDirection
  delete root().dataset.gradientDirection
  delete root().dataset.todayGradientDirection
  delete root().dataset.gradientBase
  delete root().dataset.todayGradientBase
}

describe('trendBackground', () => {
  it('returns null for slopes in the dead zone (< 0.05°C/decade)', () => {
    expect(trendBackground(0)).toBeNull()
    expect(trendBackground(0.04)).toBeNull()
    expect(trendBackground(-0.04)).toBeNull()
  })

  it('returns a gradient for a warming slope', () => {
    const result = trendBackground(0.25)
    expect(result).not.toBeNull()
    expect(result!.top).toMatch(/^rgb\(/)
    expect(result!.bottom).toMatch(/^rgb\(/)
  })

  it('returns a gradient for a cooling slope', () => {
    const result = trendBackground(-0.25)
    expect(result).not.toBeNull()
    expect(result!.top).toMatch(/^rgb\(/)
    expect(result!.bottom).toMatch(/^rgb\(/)
  })

  it('warming puts red tint at top, cooling puts blue tint at top', () => {
    const warm = trendBackground(0.3)!
    const cool = trendBackground(-0.3)!
    // Extract R and B channels from "rgb(r,g,b)"
    const channels = (s: string) => s.match(/\d+/g)!.map(Number)
    const [warmTopR,,warmTopB] = channels(warm.top)
    const [coolTopR,,coolTopB] = channels(cool.top)
    expect(warmTopR).toBeGreaterThan(warmTopB) // warm top: more red than blue
    expect(coolTopB).toBeGreaterThan(coolTopR) // cool top: more blue than red
  })

  it('clamps extreme slopes to t=1 (same result as 0.65°C/decade)', () => {
    expect(trendBackground(0.65)).toEqual(trendBackground(100))
    expect(trendBackground(-0.65)).toEqual(trendBackground(-100))
  })

  it('Fahrenheit slope divided by 9/5 matches equivalent Celsius slope', () => {
    const slopeCelsius = 0.3
    const slopeFahrenheit = slopeCelsius * 9 / 5
    expect(trendBackground(slopeFahrenheit * 5 / 9)).toEqual(trendBackground(slopeCelsius))
  })
})

describe('resetTrendBackground', () => {
  beforeEach(resetRoot)

  it('sets --trend-bg-opacity to 0', () => {
    root().style.setProperty('--trend-bg-opacity', '1')
    resetTrendBackground()
    expect(bgOpacity()).toBe('0')
  })

  it('keeps dataset.gradient intact so reapply still works after About navigation', () => {
    applyTrendBackground(0.3, 'metric')
    const stored = root().dataset.gradient
    resetTrendBackground()
    expect(root().dataset.gradient).toBe(stored)
  })

  it('clears --static-bg-base so the background reverts on non-data pages', () => {
    applyTrendBackground(0.3, 'metric')
    resetTrendBackground()
    expect(bgBase()).toBe('')
  })

  it('does not throw', () => {
    expect(() => resetTrendBackground()).not.toThrow()
  })
})

describe('clearTrendBackground', () => {
  beforeEach(resetRoot)

  it('sets --trend-bg-opacity to 0 and clears gradient, direction and base store keys', () => {
    applyTrendBackground(0.3, 'metric')
    applyTrendBackground(0.3, 'metric', 'todayGradient')
    clearTrendBackground()
    expect(bgOpacity()).toBe('0')
    expect(bgBase()).toBe('')
    expect(root().dataset.gradient).toBe('')
    expect(root().dataset.todayGradient).toBe('')
    expect(root().dataset.trendDirection).toBe('')
    expect(root().dataset.gradientDirection).toBe('')
    expect(root().dataset.todayGradientDirection).toBe('')
    expect(root().dataset.gradientBase).toBe('')
    expect(root().dataset.todayGradientBase).toBe('')
  })

  it('does not throw', () => {
    expect(() => clearTrendBackground()).not.toThrow()
  })
})

describe('applyTrendBackground', () => {
  beforeEach(resetRoot)

  it('sets --trend-bg-image and --trend-bg-opacity 1 for a significant warming slope', () => {
    applyTrendBackground(0.3, 'metric')
    expect(bgOpacity()).toBe('1')
    expect(bgImage()).toContain('linear-gradient')
  })

  it('sets --static-bg-base to grad.bottom so the static background merges with the overlay', () => {
    applyTrendBackground(0.3, 'metric')
    expect(bgBase()).toMatch(/^rgb\(/)
  })

  it('clears --static-bg-base for a flat slope', () => {
    applyTrendBackground(0.3, 'metric')
    applyTrendBackground(0.03, 'metric')
    expect(bgBase()).toBe('')
  })

  it('stores base colour per storeKey so reapply can restore it', () => {
    applyTrendBackground(-0.3, 'metric', 'todayGradient')
    expect(root().dataset.todayGradientBase).toMatch(/^rgb\(/)
  })

  it('sets --trend-bg-opacity to 0 for a flat slope (dead zone)', () => {
    applyTrendBackground(0.03, 'metric')
    expect(bgOpacity()).toBe('0')
  })

  it('sets --trend-bg-opacity to 0 when slope is null', () => {
    applyTrendBackground(null, 'metric')
    expect(bgOpacity()).toBe('0')
  })

  it('applies the same gradient for a Fahrenheit slope as for its Celsius equivalent', () => {
    const slopeC = 0.3
    const slopeF = slopeC * 9 / 5
    applyTrendBackground(slopeC, 'metric')
    const bgCelsius = bgImage()
    applyTrendBackground(slopeF, 'fahrenheit')
    const bgFahrenheit = bgImage()
    expect(bgFahrenheit).toBe(bgCelsius)
  })

  it('sets data-trend-direction to "warming" for positive slope', () => {
    applyTrendBackground(0.3, 'metric')
    expect(trendDir()).toBe('warming')
  })

  it('sets data-trend-direction to "cooling" for negative slope', () => {
    applyTrendBackground(-0.3, 'metric')
    expect(trendDir()).toBe('cooling')
  })

  it('clears data-trend-direction for a flat slope', () => {
    applyTrendBackground(0.3, 'metric')
    applyTrendBackground(0.03, 'metric')
    expect(trendDir()).toBe('')
  })

  it('stores direction per storeKey so reapply can restore it', () => {
    applyTrendBackground(-0.3, 'metric', 'todayGradient')
    expect(root().dataset.todayGradientDirection).toBe('cooling')
  })
})

describe('reapplyTrendBackground', () => {
  beforeEach(resetRoot)

  it('restores Today gradient after resetTrendBackground (About navigation)', () => {
    applyTrendBackground(0.3, 'metric', 'todayGradient')
    resetTrendBackground()
    reapplyTrendBackground()
    expect(bgOpacity()).toBe('1')
    expect(bgImage()).toContain('linear-gradient')
  })

  it('restores data-trend-direction from todayGradientDirection on reapply', () => {
    applyTrendBackground(-0.3, 'metric', 'todayGradient')
    resetTrendBackground()
    reapplyTrendBackground()
    expect(trendDir()).toBe('cooling')
  })

  it('restores --static-bg-base from todayGradientBase on reapply', () => {
    applyTrendBackground(-0.3, 'metric', 'todayGradient')
    resetTrendBackground()
    reapplyTrendBackground()
    expect(bgBase()).toMatch(/^rgb\(/)
  })

  it('does not restore a period-page gradient (different store key)', () => {
    applyTrendBackground(0.3, 'metric') // default key — period page
    resetTrendBackground()
    reapplyTrendBackground()
    expect(bgOpacity()).toBe('0')
  })

  it('does not restore after clearTrendBackground (location change)', () => {
    applyTrendBackground(0.3, 'metric', 'todayGradient')
    clearTrendBackground()
    reapplyTrendBackground()
    expect(bgOpacity()).toBe('0')
  })

  it('does nothing when no gradient was previously stored', () => {
    reapplyTrendBackground()
    expect(bgOpacity()).toBe('')
  })
})

describe('stats bubble visibility', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <div id="yearStatsBubble" class="stats-bubble"></div>
      <div id="yearAvgText"></div>
      <div id="yearTrendText"></div>
      <div id="yearStddevText"></div>
      <div id="yearSummaryText"></div>
    `
  })

  it('adds visible class to the stats bubble after updateSummaryTextElements', () => {
    updateSummaryTextElements(
      'A warm year.',
      { temp: 15.2, stdDev: 1.1 },
      { slope: 0.3, slopeError: 0.05, unit: '°C/decade' },
      'year'
    )
    expect(document.getElementById('yearStatsBubble')!.classList.contains('visible')).toBe(true)
  })

  it('populates avg and trend text elements', () => {
    updateSummaryTextElements(
      'Summary',
      { temp: 12.5, stdDev: 0.8 },
      { slope: -0.2, slopeError: 0.03, unit: '°C/decade' },
      'year'
    )
    expect(document.getElementById('yearAvgText')!.textContent).toContain('12.50')
    expect(document.getElementById('yearTrendText')!.textContent).toContain('falling')
  })
})
