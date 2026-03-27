import {
  getApiUrl,
  apiFetch,
  pollJobStatus,
  transformToChartData,
  calculateTemperatureRange
} from './api/temperature';
import {
  CHART_COLORS,
  CHART_AXIS_COLOR,
  CHART_FONT_SIZE_SMALL,
  CHART_FONT_SIZE_MEDIUM,
  INITIAL_LOADING_TEXT
} from './constants/index';
import type { ChartDataPoint, JobResultResponse } from './types/index';
import { getOrdinal } from './utils/location';

// Chart.js global (loaded via CDN defer in index.html)
declare const Chart: any;

interface ShareMetadata {
  location: string;
  period: 'daily' | 'weekly' | 'monthly' | 'yearly';
  identifier: string;
  ref_year: number;
  unit: 'celsius' | 'fahrenheit';
  created_at: string;
}

interface ShareUIRefs {
  section: HTMLElement;
  titleEl: HTMLElement;
  subtitleEl: HTMLElement;
  loadingEl: HTMLElement;
  loadingTextEl: HTMLElement;
  errorContainerEl: HTMLElement;
  errorMessageEl: HTMLElement;
  canvas: HTMLCanvasElement;
  avgTextEl: HTMLElement;
  trendTextEl: HTMLElement;
}

export function isSharePagePath(): boolean {
  return /^\/s\/[^/]+/.test(window.location.pathname);
}

function extractShareId(): string | null {
  const match = window.location.pathname.match(/^\/s\/([^/]+)/);
  return match ? match[1] : null;
}

export function initSharePage(): void {
  const shareId = extractShareId();
  if (!shareId) {
    showRootError('Invalid share link.');
    return;
  }

  hideAppChrome();

  const viewOutlet = document.getElementById('viewOutlet');
  if (!viewOutlet) {
    showRootError('Page failed to load.');
    return;
  }

  const refs = buildShareUI(viewOutlet);

  (async () => {
    try {
      const meta = await fetchShareMetadata(shareId);
      updatePageMeta(meta);
      const result = await fetchShareTemperatureData(meta);
      await renderShareChart(refs, meta, result);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Something went wrong.';
      showShareError(refs, message);
    }
  })();
}

function hideAppChrome(): void {
  const splashScreen = document.getElementById('splashScreen');
  if (splashScreen) splashScreen.style.display = 'none';

  const appShell = document.getElementById('appShell');
  if (appShell) appShell.classList.remove('hidden');

  // Hide navigation — share page is standalone
  const nav = document.querySelector('nav');
  if (nav) (nav as HTMLElement).style.display = 'none';

  // Hide any existing view sections (today, week, etc.)
  const viewOutlet = document.getElementById('viewOutlet');
  if (viewOutlet) {
    Array.from(viewOutlet.children).forEach(child => {
      (child as HTMLElement).hidden = true;
    });
  }
}

function buildShareUI(viewOutlet: HTMLElement): ShareUIRefs {
  const section = document.createElement('section');
  section.className = 'share-page';

  const container = document.createElement('div');
  container.className = 'container';

  const titleEl = document.createElement('h2');
  titleEl.className = 'date-heading';
  container.appendChild(titleEl);

  const subtitleEl = document.createElement('p');
  subtitleEl.className = 'standard-text';
  container.appendChild(subtitleEl);

  // Chart container
  const chartContainer = document.createElement('div');
  chartContainer.className = 'chart-container';

  const loadingEl = document.createElement('div');
  loadingEl.className = 'loading visible';

  const spinnerEl = document.createElement('div');
  spinnerEl.className = 'spinner';
  loadingEl.appendChild(spinnerEl);

  const loadingTextEl = document.createElement('p');
  loadingTextEl.className = 'loading-text';
  loadingTextEl.textContent = INITIAL_LOADING_TEXT;
  loadingEl.appendChild(loadingTextEl);

  chartContainer.appendChild(loadingEl);

  const errorContainerEl = document.createElement('div');
  errorContainerEl.className = 'error-container';
  errorContainerEl.style.display = 'none';

  const errorContent = document.createElement('div');
  errorContent.className = 'error-content';

  const errorMessageEl = document.createElement('div');
  errorMessageEl.className = 'error-message';
  errorContent.appendChild(errorMessageEl);

  const reloadButton = document.createElement('button');
  reloadButton.className = 'reload-button';
  reloadButton.textContent = 'Reload';
  reloadButton.addEventListener('click', () => window.location.reload());
  errorContent.appendChild(reloadButton);

  errorContainerEl.appendChild(errorContent);
  chartContainer.appendChild(errorContainerEl);

  const canvas = document.createElement('canvas');
  canvas.id = 'shareChart';
  chartContainer.appendChild(canvas);

  container.appendChild(chartContainer);

  const avgTextEl = document.createElement('div');
  avgTextEl.className = 'standard-text avg-text';
  container.appendChild(avgTextEl);

  const trendTextEl = document.createElement('div');
  trendTextEl.className = 'standard-text trend-text';
  container.appendChild(trendTextEl);

  const ctaDiv = document.createElement('div');
  ctaDiv.className = 'share-page-cta';
  const ctaLink = document.createElement('a');
  ctaLink.href = '/';
  ctaLink.textContent = 'Explore your own temperature history →';
  ctaDiv.appendChild(ctaLink);
  container.appendChild(ctaDiv);

  section.appendChild(container);
  viewOutlet.appendChild(section);

  return {
    section,
    titleEl,
    subtitleEl,
    loadingEl,
    loadingTextEl,
    errorContainerEl,
    errorMessageEl,
    canvas,
    avgTextEl,
    trendTextEl
  };
}

async function fetchShareMetadata(shareId: string): Promise<ShareMetadata> {
  const url = getApiUrl(`/v1/shares/${encodeURIComponent(shareId)}`);
  // apiFetch attaches the Firebase anonymous auth token — the API requires this
  // even though the share endpoint is conceptually public
  const res = await apiFetch(url);
  if (res.status === 404) {
    throw new Error("This share link has expired or doesn't exist.");
  }
  if (!res.ok) {
    throw new Error(`Failed to load share (${res.status}).`);
  }
  return res.json();
}

async function fetchShareTemperatureData(meta: ShareMetadata): Promise<JobResultResponse> {
  const identifierSegment = meta.identifier ? `/${meta.identifier}` : '';
  const url = getApiUrl(
    `/v1/records/${meta.period}/${encodeURIComponent(meta.location)}${identifierSegment}/async`
  );

  const body: Record<string, string> = {};
  if (meta.unit === 'fahrenheit') {
    body.unit_group = 'fahrenheit';
  }

  const res = await apiFetch(url, {
    method: 'POST',
    body: JSON.stringify(body)
  });

  const job = await res.json();
  if (!job.job_id) {
    throw new Error('Failed to start data fetch.');
  }

  return pollJobStatus(job.job_id);
}

async function waitForChartJs(timeoutMs = 10000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (typeof Chart === 'undefined') {
    if (Date.now() > deadline) {
      throw new Error('Charts could not load. Please refresh the page.');
    }
    await new Promise(r => setTimeout(r, 50));
  }
  // Register annotation plugin if available
  const annotationPlugin = (window as any)['chartjs-plugin-annotation'];
  if (annotationPlugin) {
    Chart.register(annotationPlugin);
  }
}

async function renderShareChart(
  refs: ShareUIRefs,
  meta: ShareMetadata,
  result: JobResultResponse
): Promise<void> {
  await waitForChartJs();

  const data = result.data;
  const chartData = transformToChartData(data.values);
  const { min: minTemp, max: maxTemp } = calculateTemperatureRange(chartData);

  const years = chartData.map(d => d.y);
  const minYear = Math.min(...years);
  const maxYear = Math.max(...years);

  const unitLabel = meta.unit === 'fahrenheit' ? '°F' : '°C';
  const cityName = meta.location.split(',')[0].trim();
  const friendlyDate = formatFriendlyDate(meta);
  const periodLabel = formatPeriodLabel(meta);

  // Update title/subtitle now that we have data
  refs.titleEl.textContent = `${cityName} · ${friendlyDate}`;
  refs.subtitleEl.textContent = `${periodLabel} temperature history`;

  // Update summary text
  refs.avgTextEl.textContent = `Average: ${data.average.mean.toFixed(1)}${unitLabel}`;

  const slope = data.trend.slope;
  const direction = Math.abs(slope) < 0.05 ? 'stable' : slope > 0 ? 'rising' : 'falling';
  refs.trendTextEl.textContent =
    `Trend: ${direction} at ${Math.abs(slope).toFixed(1)}${data.trend.unit || `${unitLabel}/decade`}`;

  // Hide spinner, show canvas
  refs.loadingEl.classList.remove('visible');
  refs.loadingEl.classList.add('hidden');
  refs.canvas.classList.add('visible');

  const ctx = refs.canvas.getContext('2d');
  if (!ctx) throw new Error('No canvas context');

  const chart = new Chart(ctx, {
    type: 'bar',
    data: {
      datasets: [
        {
          label: 'Trend',
          type: 'line',
          data: [],
          backgroundColor: CHART_COLORS.TREND,
          borderColor: CHART_COLORS.TREND,
          fill: false,
          pointRadius: 0,
          borderWidth: 2
        },
        {
          label: `Temperature in ${cityName} for ${periodLabel}`,
          type: 'bar',
          data: chartData,
          backgroundColor: chartData.map(p =>
            p.y === meta.ref_year ? CHART_COLORS.THIS_YEAR : CHART_COLORS.BAR
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
        padding: { left: 0, right: 20, top: 15, bottom: 15 }
      },
      plugins: {
        legend: { display: false },
        annotation: {
          annotations: {
            averageLine: {
              type: 'line',
              yMin: minYear - 1,
              yMax: maxYear + 1,
              xMin: data.average.mean,
              xMax: data.average.mean,
              borderColor: CHART_COLORS.AVERAGE,
              borderWidth: 2,
              label: {
                display: true,
                content: `Average: ${data.average.mean.toFixed(1)}${unitLabel}`,
                position: 'start',
                font: { size: CHART_FONT_SIZE_MEDIUM }
              }
            }
          }
        },
        tooltip: {
          callbacks: {
            title: function(context: any) {
              return `${context[0].parsed.y}: ${context[0].parsed.x}${unitLabel}`;
            },
            label: function() { return ''; }
          }
        }
      },
      scales: {
        x: {
          type: 'linear',
          title: {
            display: true,
            text: `Temperature (${unitLabel})`,
            font: { size: CHART_FONT_SIZE_MEDIUM },
            color: CHART_AXIS_COLOR
          },
          min: minTemp,
          max: maxTemp,
          ticks: {
            font: { size: CHART_FONT_SIZE_SMALL },
            color: CHART_AXIS_COLOR,
            stepSize: 2,
            callback: function(value: any) { return value; }
          }
        },
        y: {
          type: 'linear',
          min: minYear,
          max: maxYear,
          ticks: {
            maxTicksLimit: 20,
            callback: (val: any) => val.toString(),
            font: { size: CHART_FONT_SIZE_SMALL },
            color: CHART_AXIS_COLOR
          },
          title: { display: false },
          grid: { display: false },
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

  // Add trend line
  const trendResult = calculateTrendLine(
    chartData.map(d => ({ x: d.y, y: d.x })),
    minYear - 0.5,
    maxYear + 0.5
  );
  chart.data.datasets[0].data = trendResult.points.map((p: ChartDataPoint) => ({ x: p.y, y: p.x }));
  chart.update();
}

// Pure linear regression — duplicated from mainAppLogic (no external dependencies)
function calculateTrendLine(
  points: ChartDataPoint[],
  startX: number,
  endX: number
): { points: ChartDataPoint[]; slope: number } {
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

function formatFriendlyDate(meta: ShareMetadata): string {
  const { period, identifier, ref_year } = meta;

  if (period === 'daily' || period === 'weekly') {
    const [monthStr, dayStr] = identifier.split('-');
    const month = parseInt(monthStr, 10);
    const day = parseInt(dayStr, 10);
    const monthName = new Date(ref_year, month - 1, 1).toLocaleString('en-GB', { month: 'long' });
    return `${getOrdinal(day)} ${monthName} ${ref_year}`;
  }

  if (period === 'monthly') {
    const month = parseInt(identifier, 10);
    return new Date(ref_year, month - 1, 1).toLocaleString('en-GB', { month: 'long', year: 'numeric' });
  }

  return String(ref_year);
}

function formatPeriodLabel(meta: ShareMetadata): string {
  switch (meta.period) {
    case 'daily':   return 'Daily';
    case 'weekly':  return 'Weekly';
    case 'monthly': return 'Monthly';
    case 'yearly':  return 'Yearly';
    default:        return meta.period;
  }
}

function updatePageMeta(meta: ShareMetadata): void {
  const cityName = meta.location.split(',')[0].trim();
  const friendlyDate = formatFriendlyDate(meta);
  const periodLabel = formatPeriodLabel(meta);

  const title = `${cityName} · ${periodLabel} ${friendlyDate} | TempHist`;
  const description = `Historical temperature data for ${cityName}: ${periodLabel.toLowerCase()} temperatures around ${friendlyDate}.`;

  document.title = title;

  setMetaTag('property', 'og:title', title);
  setMetaTag('property', 'og:description', description);
  setMetaTag('property', 'og:url', window.location.href);
  setMetaTag('name', 'twitter:card', 'summary');
  setMetaTag('name', 'twitter:title', title);
  setMetaTag('name', 'twitter:description', description);
}

function setMetaTag(attrName: 'property' | 'name', attrValue: string, content: string): void {
  let el = document.querySelector(`meta[${attrName}="${attrValue}"]`) as HTMLMetaElement | null;
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attrName, attrValue);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

function showShareError(refs: ShareUIRefs, message: string): void {
  refs.loadingEl.classList.remove('visible');
  refs.loadingEl.classList.add('hidden');
  refs.errorContainerEl.style.display = 'block';
  refs.errorMessageEl.textContent = message;
}

function showRootError(message: string): void {
  const splashScreen = document.getElementById('splashScreen');
  if (splashScreen) splashScreen.style.display = 'none';

  const appShell = document.getElementById('appShell');
  if (appShell) appShell.classList.remove('hidden');

  const viewOutlet = document.getElementById('viewOutlet');
  if (!viewOutlet) return;

  const errDiv = document.createElement('div');
  errDiv.className = 'error-container';
  errDiv.style.display = 'block';

  const errContent = document.createElement('div');
  errContent.className = 'error-content';

  const errMsg = document.createElement('div');
  errMsg.className = 'error-message';
  errMsg.textContent = message;
  errContent.appendChild(errMsg);

  errDiv.appendChild(errContent);
  viewOutlet.appendChild(errDiv);
}
