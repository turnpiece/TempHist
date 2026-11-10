import { describe, it, expect } from 'vitest';
import { attachStatsInfo, TREND_CERTAINTY_HREF } from '../src/utils/statsInfo';
import { buildDashboard } from '../src/utils/dashboardBuilder';
import { renderStatsToElements } from '../src/utils/uiHelpers';

function bubble(): HTMLElement {
  const el = document.createElement('div');
  el.className = 'bubble stats-bubble';
  return el;
}

describe('attachStatsInfo', () => {
  it('adds a collapsed info button and note', () => {
    const b = bubble();
    attachStatsInfo(b);

    const btn = b.querySelector('.stats-info-btn') as HTMLButtonElement;
    const note = b.querySelector('.stats-info-note') as HTMLElement;
    expect(btn).not.toBeNull();
    expect(btn.type).toBe('button');
    expect(btn.getAttribute('aria-expanded')).toBe('false');
    expect(btn.getAttribute('aria-controls')).toBe(note.id);
    expect(note.hidden).toBe(true);
  });

  it('toggles the note and aria-expanded on click', () => {
    const b = bubble();
    attachStatsInfo(b);
    const btn = b.querySelector('.stats-info-btn') as HTMLButtonElement;
    const note = b.querySelector('.stats-info-note') as HTMLElement;

    btn.click();
    expect(note.hidden).toBe(false);
    expect(btn.getAttribute('aria-expanded')).toBe('true');

    btn.click();
    expect(note.hidden).toBe(true);
    expect(btn.getAttribute('aria-expanded')).toBe('false');
  });

  it('links to the About page section on the trend', () => {
    const b = bubble();
    attachStatsInfo(b);
    const link = b.querySelector('.stats-info-note a') as HTMLAnchorElement;
    expect(link.getAttribute('href')).toBe(TREND_CERTAINTY_HREF);
    expect(TREND_CERTAINTY_HREF).toBe('/about#trend-certainty');
  });

  it('is idempotent and tolerates null', () => {
    const b = bubble();
    attachStatsInfo(b);
    attachStatsInfo(b);
    expect(b.querySelectorAll('.stats-info-btn')).toHaveLength(1);
    expect(() => attachStatsInfo(null)).not.toThrow();
  });

  it('gives each note a unique id', () => {
    const a = bubble();
    const b = bubble();
    attachStatsInfo(a);
    attachStatsInfo(b);
    expect(a.querySelector('.stats-info-note')!.id).not.toBe(b.querySelector('.stats-info-note')!.id);
  });
});

describe('stats bubble wiring', () => {
  it('buildDashboard puts the info button in the stats bubble', () => {
    const { statsBubbleEl } = buildDashboard({});
    expect(statsBubbleEl.querySelector('.stats-info-btn')).not.toBeNull();
  });

  it('keeps the stats lines short', () => {
    const avg = document.createElement('div');
    const sd = document.createElement('div');
    const trend = document.createElement('div');
    renderStatsToElements(
      avg, sd, trend,
      { temp: 11.6, stdDev: 2.0 },
      { slope: 0.1, slopeError: 0.2, unit: '°C/decade' },
      '°C', 1
    );
    expect(trend.textContent).toBe('Trend: rising at 0.1 ± 0.2°C/decade');
    expect(sd.textContent).toBe('Standard deviation: ± 2.0°C');
  });
});
