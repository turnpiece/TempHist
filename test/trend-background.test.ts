import { describe, it, expect, beforeEach } from 'vitest'
import { trendBackground, resetTrendBackground, clearTrendBackground, applyTrendBackground, reapplyTrendBackground, updateSummaryTextElements } from '../src/utils/uiHelpers'

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
  beforeEach(() => {
    document.body.innerHTML = '<div id="trend-bg" style="opacity: 1;"></div>'
  })

  it('sets opacity to 0 on #trend-bg', () => {
    const el = document.getElementById('trend-bg') as HTMLDivElement
    el.style.opacity = '1'
    resetTrendBackground()
    expect(el.style.opacity).toBe('0')
  })

  it('keeps dataset.gradient intact so reapply still works after About navigation', () => {
    applyTrendBackground(0.3, 'metric')
    const stored = document.getElementById('trend-bg')!.dataset.gradient
    resetTrendBackground()
    expect(document.getElementById('trend-bg')!.dataset.gradient).toBe(stored)
  })

  it('does not throw when #trend-bg is absent', () => {
    document.body.innerHTML = ''
    expect(() => resetTrendBackground()).not.toThrow()
  })
})

describe('clearTrendBackground', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="trend-bg"></div>'
  })

  it('sets opacity to 0 and clears both gradient store keys', () => {
    applyTrendBackground(0.3, 'metric')
    applyTrendBackground(0.3, 'metric', 'todayGradient')
    clearTrendBackground()
    const el = document.getElementById('trend-bg')!
    expect(el.style.opacity).toBe('0')
    expect(el.dataset.gradient).toBe('')
    expect(el.dataset.todayGradient).toBe('')
  })

  it('does not throw when #trend-bg is absent', () => {
    document.body.innerHTML = ''
    expect(() => clearTrendBackground()).not.toThrow()
  })
})

describe('applyTrendBackground', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="trend-bg"></div>'
  })

  it('sets gradient and opacity 1 for a significant warming slope', () => {
    applyTrendBackground(0.3, 'metric')
    const el = document.getElementById('trend-bg')!
    expect(el.style.opacity).toBe('1')
    expect(el.style.backgroundImage).toContain('linear-gradient')
  })

  it('sets opacity 0 for a flat slope (dead zone)', () => {
    applyTrendBackground(0.03, 'metric')
    expect(document.getElementById('trend-bg')!.style.opacity).toBe('0')
  })

  it('sets opacity 0 when slope is null', () => {
    applyTrendBackground(null, 'metric')
    expect(document.getElementById('trend-bg')!.style.opacity).toBe('0')
  })

  it('applies the same gradient for a Fahrenheit slope as for its Celsius equivalent', () => {
    const slopeC = 0.3
    const slopeF = slopeC * 9 / 5
    applyTrendBackground(slopeC, 'metric')
    const bgCelsius = document.getElementById('trend-bg')!.style.backgroundImage
    applyTrendBackground(slopeF, 'fahrenheit')
    const bgFahrenheit = document.getElementById('trend-bg')!.style.backgroundImage
    expect(bgFahrenheit).toBe(bgCelsius)
  })
})

describe('reapplyTrendBackground', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="trend-bg"></div>'
  })

  it('restores Today gradient after resetTrendBackground (About navigation)', () => {
    applyTrendBackground(0.3, 'metric', 'todayGradient')
    resetTrendBackground()
    reapplyTrendBackground()
    const el = document.getElementById('trend-bg')!
    expect(el.style.opacity).toBe('1')
    expect(el.style.backgroundImage).toContain('linear-gradient')
  })

  it('does not restore a period-page gradient (different store key)', () => {
    applyTrendBackground(0.3, 'metric') // default key — period page
    resetTrendBackground()
    reapplyTrendBackground()
    expect(document.getElementById('trend-bg')!.style.opacity).toBe('0')
  })

  it('does not restore after clearTrendBackground (location change)', () => {
    applyTrendBackground(0.3, 'metric', 'todayGradient')
    clearTrendBackground()
    reapplyTrendBackground()
    expect(document.getElementById('trend-bg')!.style.opacity).toBe('0')
  })

  it('does nothing when no gradient was previously stored', () => {
    reapplyTrendBackground()
    expect(document.getElementById('trend-bg')!.style.opacity).toBe('')
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
