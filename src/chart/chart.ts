/**
 * Chart rendering utilities for temperature charts
 */

import type { ChartDataPoint } from '../types/index';
import {
  CHART_COLORS,
  CHART_AXIS_COLOR,
  CHART_AXIS_FONT_FAMILY,
  CHART_FONT_SIZE_SMALL,
  CHART_FONT_SIZE_MEDIUM,
  BAR_COLOR_NEUTRAL_Z,
  BAR_COLOR_SATURATION_Z,
} from '../constants/index';
import { getDisplayCity } from '../utils/location';

declare const Chart: any;
declare const debugLog: (...args: any[]) => void;

/**
 * Calculate trend line for chart data
 */
export function calculateTrendLine(points: ChartDataPoint[], startX: number, endX: number) {
  const n = points.length;
  const sumX = points.reduce((sum, p) => sum + p.x, 0);
  const sumY = points.reduce((sum, p) => sum + p.y, 0);
  const sumXY = points.reduce((sum, p) => sum + p.x * p.y, 0);
  const sumXX = points.reduce((sum, p) => sum + p.x * p.x, 0);

  const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
  const intercept = (sumY - slope * sumX) / n;

  return {
    points: [
      { x: startX, y: slope * startX + intercept },
      { x: endX, y: slope * endX + intercept }
    ],
    slope
  };
}

/**
 * Update trend line on chart with calculated trend data
 */
export function updateChartTrendLine(
  chart: any,
  chartData: ChartDataPoint[],
  startYear: number,
  endYear: number
): void {
  if (!chart || !chart.data || !chart.data.datasets) {
    return;
  }

  const calculateTrendLineFn = (window as any).calculateTrendLine;
  if (!calculateTrendLineFn) {
    console.warn('calculateTrendLine not available');
    return;
  }

  // chartData is {x: temperature, y: year}; calculateTrendLine expects {x: year, y: temperature}
  const calculatedTrendData = calculateTrendLineFn(
    chartData.map((d: ChartDataPoint) => ({ x: d.y, y: d.x })),
    startYear - 1.5,
    endYear + 1.5
  );
  chart.data.datasets[0].data = calculatedTrendData.points.map((p: { x: number; y: number }) => ({ x: p.y, y: p.x }));
  chart.update();
}

/** Convert an rgb(...) string to a lighter HSL string (lightness clamped to min 0.80). */
function lighterColor(color: string): string {
  const match = color.match(/rgb\((\d+),(\d+),(\d+)\)/);
  if (!match) return '#ffffff';
  const r = parseInt(match[1]) / 255;
  const g = parseInt(match[2]) / 255;
  const b = parseInt(match[3]) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0, l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }
  l = Math.max(l, 0.80);
  return `hsl(${Math.round(h * 360)}, ${Math.round(s * 100)}%, ${Math.round(l * 100)}%)`;
}

function getOrCreateTooltipEl(chart: any): HTMLElement {
  let el = chart.canvas.parentNode.querySelector('.chart-tooltip');
  if (!el) {
    el = document.createElement('div');
    el.classList.add('chart-tooltip');
    Object.assign(el.style, {
      background: 'rgba(20, 20, 50, 0.92)',
      borderRadius: '8px',
      color: 'white',
      fontFamily: 'Arial, sans-serif',
      fontSize: '13px',
      padding: '8px 12px',
      pointerEvents: 'none',
      position: 'absolute',
      transition: 'opacity 0.15s ease',
      whiteSpace: 'nowrap',
      zIndex: '100',
      lineHeight: '1.65',
    });
    chart.canvas.parentNode.appendChild(el);
  }
  return el;
}

/**
 * Build a Chart.js external tooltip handler for the temperature bar chart.
 * Used by both the main chart views and the share page chart.
 *
 * @param averageTemp  The historical average temperature (for anomaly calculation)
 * @param barColors    Per-bar colour array (indexed by dataIndex)
 * @param decimals     Number of decimal places for temperatures (default 1)
 * @param unitLabel    Temperature unit string, e.g. '°C' (default '°C')
 */
export function buildExternalTooltipHandler(
  averageTemp: number,
  barColors: string[],
  decimals: number = 1,
  unitLabel: string = '°C'
): (context: any) => void {
  return function(context: any) {
    const { chart, tooltip } = context;
    const tooltipEl = getOrCreateTooltipEl(chart);
    if (tooltip.opacity === 0) {
      tooltipEl.style.opacity = '0';
      return;
    }
    if (tooltip.dataPoints && tooltip.dataPoints.length) {
      const dp = tooltip.dataPoints[0];
      const dataIndex = dp.dataIndex;
      const year = dp.parsed.y;
      const temp = dp.parsed.x;
      const anomaly = temp - averageTemp;
      const barColor = (barColors[dataIndex] as string) || '#8E8E93';
      const anomalyColor = lighterColor(barColor);
      let anomalyText: string;
      if (Math.abs(anomaly) < 0.05) {
        anomalyText = 'at the average';
      } else {
        const sign = anomaly > 0 ? '+' : '−';
        const dir = anomaly > 0 ? 'above average' : 'below average';
        anomalyText = `${sign}${Math.abs(anomaly).toFixed(decimals)}${unitLabel} ${dir}`;
      }
      tooltipEl.innerHTML =
        `<div style="font-weight:600">${year}</div>` +
        `<div>${temp.toFixed(decimals)}${unitLabel}</div>` +
        `<div style="color:${anomalyColor}">${anomalyText}</div>`;
    }
    const posX = chart.canvas.offsetLeft;
    const posY = chart.canvas.offsetTop;
    tooltipEl.style.opacity = '1';
    const maxLeft = posX + chart.canvas.offsetWidth - tooltipEl.offsetWidth - 4;
    const desiredLeft = posX + tooltip.caretX + 14;
    tooltipEl.style.left = Math.min(desiredLeft, maxLeft) + 'px';
    // Clamp tooltip so it doesn't overflow the bottom of the chart container
    const containerHeight = (chart.canvas.parentNode as HTMLElement).offsetHeight;
    const tooltipHeight = tooltipEl.offsetHeight || 72;
    const desiredTop = posY + tooltip.caretY - 24;
    const maxTop = containerHeight - tooltipHeight - 4;
    tooltipEl.style.top = Math.min(desiredTop, maxTop) + 'px';
  };
}

/** Linearly interpolate between two hex colours, returning an rgba string. */
function lerpColor(a: [number, number, number], b: [number, number, number], t: number): string {
  const r = Math.round(a[0] + (b[0] - a[0]) * t);
  const g = Math.round(a[1] + (b[1] - a[1]) * t);
  const bl = Math.round(a[2] + (b[2] - a[2]) * t);
  return `rgb(${r},${g},${bl})`;
}

const NEUTRAL_RGB: [number, number, number] = [0x8E, 0x8E, 0x93]; // #8E8E93
const WARM_RGB:    [number, number, number] = [0xFF, 0x3B, 0x30]; // #FF3B30
const COOL_RGB:    [number, number, number] = [0x3B, 0x82, 0xF6]; // #3B82F6

/**
 * Map a Z-score to a colour on the cool → neutral → warm spectrum.
 * Matches the app's _barColorForZScore logic.
 */
function barColorForZScore(z: number): string {
  const magnitude = Math.abs(z);
  if (magnitude <= BAR_COLOR_NEUTRAL_Z) {
    return CHART_COLORS.BAR_NEUTRAL;
  }
  const blend = Math.min(
    1,
    (magnitude - BAR_COLOR_NEUTRAL_Z) / (BAR_COLOR_SATURATION_Z - BAR_COLOR_NEUTRAL_Z)
  );
  return lerpColor(NEUTRAL_RGB, z >= 0 ? WARM_RGB : COOL_RGB, blend);
}

/**
 * Compute per-bar colours. Uses Z-score when stdDev is available,
 * otherwise normalises anomalies against the largest observed value.
 */
export function computeBarColors(
  chartData: ChartDataPoint[],
  averageTemp: number,
  currentYear: number,
  stdDev?: number
): string[] {
  const anomalies = chartData.map(p => p.x - averageTemp);

  if (stdDev && stdDev > 0) {
    return chartData.map((p, i) =>
      p.y === currentYear
        ? CHART_COLORS.THIS_YEAR
        : barColorForZScore(anomalies[i] / stdDev)
    );
  }

  // Fallback: normalise against the largest observed anomaly
  const maxWarm = Math.max(0, ...anomalies);
  const maxCool = Math.max(0, ...anomalies.map(a => -a));

  return chartData.map((p, i) => {
    if (p.y === currentYear) return CHART_COLORS.THIS_YEAR;
    const a = anomalies[i];
    if (Math.abs(a) < 0.01) return CHART_COLORS.BAR_NEUTRAL;
    const ref = a >= 0 ? maxWarm : maxCool;
    const blend = ref > 0 ? Math.min(1, Math.abs(a) / ref) : 0;
    return lerpColor(NEUTRAL_RGB, a >= 0 ? WARM_RGB : COOL_RGB, blend);
  });
}

/**
 * Create a temperature chart
 */
export function createTemperatureChart(
  ctx: CanvasRenderingContext2D,
  chartData: ChartDataPoint[],
  averageData: { temp: number; stdDev?: number },
  periodTitle: string,
  friendlyDate: string,
  minTemp: number,
  maxTemp: number,
  startYear: number,
  currentYear: number
): any {
  if (!ctx || !ctx.canvas) {
    throw new Error('Invalid canvas context provided to createTemperatureChart');
  }

  const barColors = computeBarColors(chartData, averageData.temp, currentYear, averageData.stdDev);
  const trendColour = CHART_COLORS.TREND;
  const avgColour = CHART_COLORS.AVERAGE;
  const showTrend = true;

  // Extend annotation lines 1.5 years beyond the data range
  const annotationYMin = startYear - 1.5;
  const annotationYMax = currentYear + 1.5;

  const axisFont = { size: CHART_FONT_SIZE_SMALL, family: CHART_AXIS_FONT_FAMILY };

  return new Chart(ctx, {
    type: 'bar',
    data: {
      datasets: [
        {
          label: 'Trend',
          type: 'line',
          data: [],
          backgroundColor: trendColour,
          borderColor: trendColour,
          fill: false,
          pointRadius: 0,
          borderWidth: 2,
          opacity: 1,
          clip: false,
          hidden: !showTrend
        },
        {
          label: `Temperature in ${getDisplayCity(window.tempLocation!)} ${periodTitle === 'Today' ? `on ${friendlyDate}` : `for ${periodTitle}`}`,
          type: 'bar',
          data: chartData,
          backgroundColor: barColors,
          borderWidth: 0,
          borderRadius: 3,
          base: minTemp
        }
      ]
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      parsing: false,
      animation: { duration: 0 },
      normalized: true,
      layout: {
        padding: {
          left: 0,
          right: 20,
          top: 5,
          bottom: 15
        }
      },
      plugins: {
        legend: { display: false },
        annotation: {
          annotations: {
            averageLine: {
              type: 'line',
              yMin: annotationYMin,
              yMax: annotationYMax,
              xMin: averageData.temp,
              xMax: averageData.temp,
              borderColor: avgColour,
              borderWidth: 2,
              label: {
                display: true,
                content: `Average: ${averageData.temp.toFixed(1)}°C`,
                position: 'start',
                font: {
                  size: CHART_FONT_SIZE_MEDIUM,
                  family: CHART_AXIS_FONT_FAMILY
                }
              }
            }
          }
        },
        tooltip: {
          enabled: false,
          external: buildExternalTooltipHandler(averageData.temp, barColors as string[])
        }
      },
      scales: {
        x: {
          type: 'linear',
          border: { color: 'rgba(236, 236, 236, 0.35)' },
          position: 'top',
          title: {
            display: true,
            text: 'Temperature (°C)',
            font: {
              size: CHART_FONT_SIZE_MEDIUM,
              family: CHART_AXIS_FONT_FAMILY
            },
            color: CHART_AXIS_COLOR
          },
          min: minTemp,
          max: maxTemp,
          ticks: {
            font: axisFont,
            color: CHART_AXIS_COLOR,
            stepSize: 1,
            maxTicksLimit: 10,
            callback: function(value: any) {
              return value;
            }
          }
        },
        y: {
          type: 'linear',
          border: { color: 'rgba(236, 236, 236, 0.35)' },
          min: startYear,
          max: currentYear,
          ticks: {
            maxTicksLimit: 20,
            callback: (val: any) => val.toString(),
            font: axisFont,
            color: CHART_AXIS_COLOR
          },
          title: {
            display: false,
            text: 'Year'
          },
          grid: {
            display: false
          },
          offset: true
        }
      },
      elements: {
        bar: {
          minBarLength: 30,
          maxBarThickness: 30,
          categoryPercentage: 0.1,
          barPercentage: 1.0
        }
      }
    }
  });
}
