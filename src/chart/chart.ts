/**
 * Chart rendering utilities for temperature charts
 */

import type { ChartDataPoint } from '../types/index';
import { CHART_COLORS, CHART_AXIS_COLOR, CHART_FONT_SIZE_SMALL, CHART_FONT_SIZE_MEDIUM } from '../constants/index';
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
 * @param chart - The Chart.js chart instance
 * @param chartData - The chart data points (format: {x: temperature, y: year})
 * @param startYear - The starting year for trend calculation
 * @param endYear - The ending year for trend calculation
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
  
  // Use global calculateTrendLine function (available via window.calculateTrendLine)
  const calculateTrendLineFn = (window as any).calculateTrendLine;
  if (!calculateTrendLineFn) {
    console.warn('calculateTrendLine not available');
    return;
  }
  
  // chartData is {x: temperature, y: year}, but calculateTrendLine expects {x: year, y: temperature}
  const calculatedTrendData = calculateTrendLineFn(
    chartData.map((d: ChartDataPoint) => ({ x: d.y, y: d.x })), 
    startYear - 0.5, 
    endYear + 0.5
  );
  chart.data.datasets[0].data = calculatedTrendData.points.map((p: { x: number; y: number }) => ({ x: p.y, y: p.x }));
  chart.update();
}

/**
 * Create a temperature chart
 */
export function createTemperatureChart(
  ctx: CanvasRenderingContext2D,
  chartData: ChartDataPoint[],
  averageData: { temp: number },
  periodTitle: string,
  friendlyDate: string,
  minTemp: number,
  maxTemp: number,
  startYear: number,
  currentYear: number
): any {
  // Safety check: ensure context is valid
  if (!ctx || !ctx.canvas) {
    throw new Error('Invalid canvas context provided to createTemperatureChart');
  }
  
  const barColour = CHART_COLORS.BAR;
  const thisYearColour = CHART_COLORS.THIS_YEAR;
  const trendColour = CHART_COLORS.TREND;
  const avgColour = CHART_COLORS.AVERAGE;
  const showTrend = true;

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
          hidden: !showTrend
        },
        {
          label: `Temperature in ${getDisplayCity(window.tempLocation!)} ${periodTitle === 'Today' ? `on ${friendlyDate}` : `for ${periodTitle}`}`,
          type: 'bar',
          data: chartData,
          backgroundColor: chartData.map(point => 
            point.y === currentYear ? thisYearColour : barColour
          ),
          borderWidth: 0,
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
          top: 15,
          bottom: 15
        }
      },
      plugins: {
        legend: { display: false },
        annotation: {
          annotations: {
            averageLine: {
              type: 'line',
              yMin: startYear - 1,
              yMax: currentYear + 1,
              xMin: averageData.temp,
              xMax: averageData.temp,
              borderColor: avgColour,
              borderWidth: 2,
              label: {
                display: true,
                content: `Average: ${averageData.temp.toFixed(1)}°C`,
                position: 'start',
                font: {
                  size: 12
                }
              }
            }
          }
        },
        tooltip: {
          callbacks: {
            title: function(context: any) {
              return `${context[0].parsed.y.toString()}: ${context[0].parsed.x}°C`
            },
            label: function() {
              return ''
            }
          }
        }
      },
      scales: {
        x: {
          type: 'linear',
          title: {
            display: true,
            text: 'Temperature (°C)',
            font: {
              size: CHART_FONT_SIZE_MEDIUM
            },
            color: CHART_AXIS_COLOR
          },
          min: minTemp,
          max: maxTemp,
          ticks: {
            font: {
              size: CHART_FONT_SIZE_SMALL
            },
            color: CHART_AXIS_COLOR,
            stepSize: 2,
            callback: function(value: any) {
              return value;
            }
          }
        },
        y: {
          type: 'linear',
          min: startYear,
          max: currentYear,
          ticks: {
            maxTicksLimit: 20,
            callback: (val: any) => val.toString(),
            font: {
              size: CHART_FONT_SIZE_SMALL
            },
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

