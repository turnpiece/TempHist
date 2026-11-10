import { describe, it, expect } from 'vitest';
import { renderStatsToElements } from '../src/utils/uiHelpers';

function els() {
  return {
    avg: document.createElement('div'),
    sd: document.createElement('div'),
    trend: document.createElement('div'),
  };
}

describe('renderStatsToElements labels', () => {
  it('labels the trend ± as a standard error', () => {
    const { avg, sd, trend } = els();
    renderStatsToElements(
      avg, sd, trend,
      { temp: 44.6, stdDev: 8.6 },
      { slope: 0.5, slopeError: 0.83, unit: '°F/decade' },
      '°F', 1
    );
    expect(trend.textContent).toBe('Trend: rising at 0.5 ± 0.8°F/decade (standard error)');
  });

  it('labels the spread as the year-to-year standard deviation', () => {
    const { avg, sd, trend } = els();
    renderStatsToElements(
      avg, sd, trend,
      { temp: 44.6, stdDev: 8.6 },
      { slope: 0.5, slopeError: 0.83, unit: '°F/decade' },
      '°F', 1
    );
    expect(sd.textContent).toBe('Year-to-year spread (standard deviation): ± 8.6°F');
  });

  it('omits the standard-error label when there is no slope error', () => {
    const { avg, sd, trend } = els();
    renderStatsToElements(
      avg, sd, trend,
      { temp: 10, stdDev: 2 },
      { slope: -0.3, unit: '°C/decade' },
      '°C', 1
    );
    expect(trend.textContent).toBe('Trend: falling at 0.3°C/decade');
  });
});
