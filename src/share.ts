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
import { getOrdinal, countryCodeToFlag } from './utils/location';
import type { PreapprovedLocation } from './types/index';
import {
  calculateTrendLine,
  computeBarColors,
  buildExternalTooltipHandler,
  getTemperatureLinearAxisExtents
} from './chart/chart';
import { renderStatsToElements, createLogoLoader } from './utils/uiHelpers';

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
  contentEl: HTMLElement;
  belowChartEl: HTMLElement;
  titleEl: HTMLElement;
  locationEl: HTMLElement;
  summaryTextEl: HTMLElement;
  loadingEl: HTMLElement;
  loadingTextEl: HTMLElement;
  errorContainerEl: HTMLElement;
  errorMessageEl: HTMLElement;
  canvas: HTMLCanvasElement;
  statsBubbleEl: HTMLElement;
  avgTextEl: HTMLElement;
  stddevTextEl: HTMLElement;
  trendTextEl: HTMLElement;
  generatedAtEl: HTMLElement;
}

export function isSharePagePath(): boolean {
  return /^\/s\/[^/]+/.test(window.location.pathname);
}

// ─── Share creation ───────────────────────────────────────────────────────────

export interface ShareParams {
  period: 'daily' | 'weekly' | 'monthly' | 'yearly';
  identifier: string;
  ref_year: number;
}

export async function createShare(params: ShareParams): Promise<string> {
  const url = getApiUrl('/v1/shares');
  const response = await apiFetch(url, {
    method: 'POST',
    body: JSON.stringify({
      location: window.tempLocation,
      period: params.period,
      identifier: params.identifier,
      ref_year: params.ref_year,
      unit: 'celsius',
    }),
  });
  if (!response.ok) {
    throw new Error(`Failed to create share (${response.status}).`);
  }
  const data = await response.json();
  const shareId = data.share_id || data.id;
  if (!shareId) {
    throw new Error('Share created but no ID returned.');
  }
  return `${window.location.origin}/s/${shareId}`;
}

function formatShareTitle(params: ShareParams): string {
  const cityName = (window.tempLocation || '').split(',')[0].trim();
  // Build a synthetic ShareMetadata so we can reuse the existing formatters
  const synthetic: ShareMetadata = {
    location: window.tempLocation || '',
    period: params.period,
    identifier: params.identifier,
    ref_year: params.ref_year,
    unit: 'celsius',
    created_at: '',
  };
  const heading = formatPeriodHeading(synthetic);
  return `${cityName} \u00b7 ${heading} | TempHist`;
}

const SHARE_ICON_PATH =
  'M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92 1.61 0 2.92-1.31 2.92-2.92s-1.31-2.92-2.92-2.92z';
const CHECKMARK_ICON_PATH =
  'M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z';

function setShareBtnIcon(btn: HTMLButtonElement, pathD: string): void {
  const path = btn.querySelector('path');
  if (path) path.setAttribute('d', pathD);
}

export function setupShareButton(periodKey: string, params: ShareParams): void {
  const headingId = periodKey ? `${periodKey}DateText` : 'dateText';
  const heading = document.getElementById(headingId);
  if (!heading) return;

  // Remove any existing share button to avoid duplicates on re-render
  heading.querySelector('.share-icon-btn')?.remove();

  // Build the button and append it to the heading
  const btn = document.createElement('button');
  btn.className = 'share-icon-btn';
  btn.title = 'Share';
  btn.setAttribute('aria-label', 'Share this chart');

  const svgNS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(svgNS, 'svg');
  svg.setAttribute('width', '18');
  svg.setAttribute('height', '18');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('xmlns', svgNS);

  const svgPath = document.createElementNS(svgNS, 'path');
  svgPath.setAttribute('d', SHARE_ICON_PATH);
  svgPath.setAttribute('fill', 'currentColor');

  svg.appendChild(svgPath);
  btn.appendChild(svg);
  heading.appendChild(btn);

  btn.addEventListener('click', async () => {
    if (btn.disabled) return;
    btn.disabled = true;
    btn.classList.add('share-icon-btn--loading');

    try {
      const shareUrl = await createShare(params);

      if (typeof navigator.share === 'function') {
        const shareTitle = formatShareTitle(params);
        const previousTitle = document.title;
        document.title = shareTitle; // iOS Safari reads document.title, not the title prop
        try {
          await navigator.share({ title: shareTitle, url: shareUrl });
        } catch (shareErr) {
          // Ignore AbortError — user dismissed the share sheet intentionally
          if (shareErr instanceof Error && shareErr.name !== 'AbortError') {
            throw shareErr;
          }
        } finally {
          document.title = previousTitle;
        }
        btn.disabled = false;
        btn.classList.remove('share-icon-btn--loading');
      } else {
        // Clipboard fallback — swap to checkmark for 2 s
        await navigator.clipboard.writeText(shareUrl);
        setShareBtnIcon(btn, CHECKMARK_ICON_PATH);
        btn.title = 'Link copied!';
        setTimeout(() => {
          setShareBtnIcon(btn, SHARE_ICON_PATH);
          btn.title = 'Share';
          btn.disabled = false;
          btn.classList.remove('share-icon-btn--loading');
        }, 2000);
      }
    } catch (err) {
      console.error('Share failed:', err);
      btn.title = 'Share failed — try again';
      btn.disabled = false;
      btn.classList.remove('share-icon-btn--loading');
      setTimeout(() => { btn.title = 'Share'; }, 3000);
    }
  });
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
      // Fetch share metadata and preapproved locations in parallel
      const [meta, locations] = await Promise.all([
        fetchShareMetadata(shareId),
        loadShareLocations(),
      ]);
      updatePageMeta(meta);
      const result = await fetchShareTemperatureData(meta);
      await renderShareChart(refs, meta, result, locations);
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

  // Hide period navigation links but keep About and Privacy visible.
  // Rewrite About and Privacy hrefs to absolute paths — on the share page
  // the template has baked these as hash-only fragments (#/about, #/privacy),
  // which would append to /s/:id rather than navigating to the root SPA.
  const nav = document.querySelector('nav');
  if (nav) {
    nav.querySelectorAll('a[data-route]').forEach(link => {
      const route = (link as HTMLAnchorElement).getAttribute('data-route');
      if (route === '/about') {
        (link as HTMLAnchorElement).href = '/about';
      } else if (route === '/privacy') {
        (link as HTMLAnchorElement).href = '/privacy';
      } else {
        const li = link.closest('li');
        if (li) (li as HTMLElement).style.display = 'none';
      }
    });
  }

  // Rewrite the site title link and sidebar brand to the root so they load
  // the splash/landing page rather than appending #/today to /s/:id.
  const siteLink = document.querySelector('header a') as HTMLAnchorElement | null;
  if (siteLink) siteLink.href = '/';
  const sidebarBrand = document.querySelector('.sidebar-brand') as HTMLAnchorElement | null;
  if (sidebarBrand) sidebarBrand.href = '/';

  // Hide any existing view sections (today, week, etc.)
  const viewOutlet = document.getElementById('viewOutlet');
  if (viewOutlet) {
    Array.from(viewOutlet.children).forEach(child => {
      (child as HTMLElement).hidden = true;
    });
  }
}

async function loadShareLocations(): Promise<PreapprovedLocation[]> {
  try {
    const res = await apiFetch(getApiUrl('/v1/locations/preapproved'));
    if (!res.ok) return [];
    const data = await res.json();
    // API returns either a plain array or { locations: [...] }
    const arr: unknown[] = Array.isArray(data) ? data : (Array.isArray(data?.locations) ? data.locations : []);
    return arr.filter(
      (l): l is PreapprovedLocation =>
        !!l && typeof (l as any).name === 'string' && typeof (l as any).country_code === 'string'
    );
  } catch {
    return [];
  }
}

function buildShareUI(viewOutlet: HTMLElement): ShareUIRefs {
  const section = document.createElement('section');
  section.className = 'share-page';

  const container = document.createElement('div');
  container.className = 'container';

  // Wrap all text content in a pending div so nothing is visible until data loads
  const contentEl = document.createElement('div');
  contentEl.className = 'share-page-pending';
  container.appendChild(contentEl);

  const locationEl = document.createElement('h2');
  locationEl.className = 'location-heading';
  contentEl.appendChild(locationEl);

  const titleEl = document.createElement('div');
  titleEl.className = 'period-subheading';
  contentEl.appendChild(titleEl);

  const summaryTextEl = document.createElement('div');
  summaryTextEl.className = 'summary-text';
  contentEl.appendChild(summaryTextEl);

  // Chart container
  const chartContainer = document.createElement('div');
  chartContainer.className = 'chart-container';

  const loadingEl = document.createElement('div');
  loadingEl.className = 'loading visible';

  loadingEl.appendChild(createLogoLoader());

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

  errorContainerEl.appendChild(errorContent);
  chartContainer.appendChild(errorContainerEl);

  const canvas = document.createElement('canvas');
  canvas.id = 'shareChart';
  chartContainer.appendChild(canvas);

  container.appendChild(chartContainer);

  // Elements below the chart, hidden until data loads
  const belowChartEl = document.createElement('div');
  belowChartEl.className = 'share-page-pending';
  container.appendChild(belowChartEl);

  const statsBubbleEl = document.createElement('div');
  statsBubbleEl.className = 'stats-bubble';
  belowChartEl.appendChild(statsBubbleEl);

  const avgTextEl = document.createElement('div');
  avgTextEl.className = 'avg-text';
  statsBubbleEl.appendChild(avgTextEl);

  const stddevTextEl = document.createElement('div');
  stddevTextEl.className = 'stddev-text';
  statsBubbleEl.appendChild(stddevTextEl);

  const trendTextEl = document.createElement('div');
  trendTextEl.className = 'trend-text';
  statsBubbleEl.appendChild(trendTextEl);

  const generatedAtEl = document.createElement('div');
  generatedAtEl.className = 'share-generated-at';
  belowChartEl.appendChild(generatedAtEl);

  const ctaDiv = document.createElement('div');
  ctaDiv.className = 'share-page-cta';
  const ctaLink = document.createElement('a');
  ctaLink.href = '/';
  ctaLink.textContent = 'Explore your own temperature history \u2192';
  ctaDiv.appendChild(ctaLink);
  belowChartEl.appendChild(ctaDiv);

  section.appendChild(container);
  viewOutlet.appendChild(section);

  return {
    section,
    contentEl,
    belowChartEl,
    titleEl,
    locationEl,
    summaryTextEl,
    loadingEl,
    loadingTextEl,
    errorContainerEl,
    errorMessageEl,
    canvas,
    statsBubbleEl,
    avgTextEl,
    stddevTextEl,
    trendTextEl,
    generatedAtEl
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
  const params = new URLSearchParams();
  if (meta.unit === 'fahrenheit') {
    params.set('unit_group', 'fahrenheit');
  }
  const queryString = params.toString() ? `?${params.toString()}` : '';
  const url = getApiUrl(
    `/v1/records/${meta.period}/${encodeURIComponent(meta.location)}${identifierSegment}/async${queryString}`
  );

  const res = await apiFetch(url, { method: 'POST' });

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
  result: JobResultResponse,
  locations: PreapprovedLocation[] = []
): Promise<void> {
  await waitForChartJs();

  const data = result.data;
  const chartData = transformToChartData(data.values);
  const rawRange = calculateTemperatureRange(chartData);
  const { min: xAxisMin, max: xAxisMax, stepSize: xStepSize } = getTemperatureLinearAxisExtents(
    rawRange.min,
    rawRange.max
  );

  const years = chartData.map(d => d.y);
  const minYear = Math.min(...years);
  const maxYear = Math.max(...years);

  const isFahrenheit = meta.unit === 'fahrenheit';
  const unitLabel = isFahrenheit ? '\u00b0F' : '\u00b0C';
  const tempDecimals = isFahrenheit ? 1 : 2;
  const cityName = meta.location.split(',')[0].trim();

  // Look up flag from preapproved locations by city name
  const cityLower = cityName.toLowerCase();
  const matchedLocation = locations.find(l => l.name.toLowerCase() === cityLower);
  const flag = matchedLocation ? countryCodeToFlag(matchedLocation.country_code) : null;
  const locationLabel = flag ? `${flag} ${cityName}` : `\ud83d\udccd ${cityName}`;

  // Update heading (location primary, period secondary)
  refs.locationEl.textContent = locationLabel;
  refs.titleEl.textContent = formatPeriodHeading(meta);

  // Display the API summary
  refs.summaryTextEl.textContent = data.summary || '';

  // Populate stats bubble
  renderStatsToElements(
    refs.avgTextEl,
    refs.stddevTextEl,
    refs.trendTextEl,
    { temp: data.average.mean, stdDev: data.average.standard_deviation },
    { slope: data.trend.slope, slopeError: data.trend.slope_error, unit: data.trend.unit },
    unitLabel,
    tempDecimals
  );

  // Show generation datetime
  refs.generatedAtEl.textContent = formatGeneratedAt(meta.created_at);

  // Hide spinner, show canvas, reveal all text content
  refs.loadingEl.classList.remove('visible');
  refs.loadingEl.classList.add('hidden');
  refs.canvas.classList.add('visible');
  refs.summaryTextEl.classList.add('visible');
  refs.statsBubbleEl.classList.add('visible');
  refs.contentEl.classList.replace('share-page-pending', 'share-page-ready');
  refs.belowChartEl.classList.replace('share-page-pending', 'share-page-ready');

  const ctx = refs.canvas.getContext('2d');
  if (!ctx) throw new Error('No canvas context');

  const periodLabel = formatPeriodLabel(meta);
  const barColors = computeBarColors(chartData, data.average.mean, data.average.standard_deviation);

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
          backgroundColor: barColors,
          borderWidth: 0,
          borderRadius: 3,
          base: xAxisMin
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
        padding: { left: 0, right: 20, top: 5, bottom: 15 }
      },
      plugins: {
        legend: { display: false },
        annotation: {
          annotations: {
            averageLine: {
              type: 'line',
              yMin: minYear - 1.5,
              yMax: maxYear + 1.5,
              xMin: data.average.mean,
              xMax: data.average.mean,
              borderColor: CHART_COLORS.AVERAGE,
              borderWidth: 2,
              label: {
                display: true,
                content: `Average: ${data.average.mean.toFixed(tempDecimals)}${unitLabel}`,
                position: 'start',
                font: { size: CHART_FONT_SIZE_MEDIUM, family: "ui-monospace, 'SF Mono', 'Courier New', monospace" }
              }
            }
          }
        },
        tooltip: {
          enabled: false,
          external: buildExternalTooltipHandler(data.average.mean, barColors, tempDecimals, unitLabel)
        }
      },
      scales: {
        x: {
          type: 'linear',
          position: 'top',
          border: { color: 'rgba(236, 236, 236, 0.35)' },
          title: {
            display: true,
            text: `Temperature (${unitLabel})`,
            font: { size: CHART_FONT_SIZE_MEDIUM, family: "ui-monospace, 'SF Mono', 'Courier New', monospace" },
            color: CHART_AXIS_COLOR
          },
          min: xAxisMin,
          max: xAxisMax,
          ticks: {
            font: { size: CHART_FONT_SIZE_SMALL, family: "ui-monospace, 'SF Mono', 'Courier New', monospace" },
            color: CHART_AXIS_COLOR,
            stepSize: xStepSize
          }
        },
        y: {
          type: 'linear',
          border: { color: 'rgba(236, 236, 236, 0.35)' },
          min: minYear,
          max: maxYear,
          ticks: {
            maxTicksLimit: 20,
            callback: (val: any) => val.toString(),
            font: { size: CHART_FONT_SIZE_SMALL, family: "ui-monospace, 'SF Mono', 'Courier New', monospace" },
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

/**
 * Format the date portion of the identifier (MM-dd) as "27th March" (no year).
 * Used for daily, weekly, and monthly periods which all use MM-dd identifiers.
 */
function formatFriendlyDate(meta: ShareMetadata): string {
  const { period, identifier, ref_year } = meta;

  if (period === 'daily' || period === 'weekly' || period === 'monthly') {
    const [monthStr, dayStr] = identifier.split('-');
    const month = parseInt(monthStr, 10);
    const day = parseInt(dayStr, 10);
    const monthName = new Date(ref_year, month - 1, 1).toLocaleString('en-GB', { month: 'long' });
    return `${getOrdinal(day)} ${monthName}`;
  }

  // yearly — identifier is MM-dd
  if (period === 'yearly' && identifier.includes('-')) {
    const [monthStr, dayStr] = identifier.split('-');
    const month = parseInt(monthStr, 10);
    const day = parseInt(dayStr, 10);
    const monthName = new Date(ref_year, month - 1, 1).toLocaleString('en-GB', { month: 'long' });
    return `${getOrdinal(day)} ${monthName}`;
  }

  return '';
}

/**
 * Format the period heading to match the website's existing pattern:
 * daily → "27th March", weekly → "Week ending 27th March",
 * monthly → "Month ending 27th March", yearly → "Year ending 27th March"
 */
function formatPeriodHeading(meta: ShareMetadata): string {
  const friendlyDate = formatFriendlyDate(meta);

  switch (meta.period) {
    case 'daily':   return friendlyDate;
    case 'weekly':  return `Week ending ${friendlyDate}`;
    case 'monthly': return `Month ending ${friendlyDate}`;
    case 'yearly':  return `Year ending ${friendlyDate}`;
    default:        return friendlyDate;
  }
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

function formatGeneratedAt(createdAt: string): string {
  const date = new Date(createdAt);
  const day = date.getUTCDate();
  const monthName = date.toLocaleString('en-GB', { month: 'long', timeZone: 'UTC' });
  const year = date.getUTCFullYear();
  const hours = date.getUTCHours().toString().padStart(2, '0');
  const minutes = date.getUTCMinutes().toString().padStart(2, '0');
  return `Generated on ${getOrdinal(day)} ${monthName} ${year} at ${hours}:${minutes} UTC`;
}

function updatePageMeta(meta: ShareMetadata): void {
  const cityName = meta.location.split(',')[0].trim();
  const heading = formatPeriodHeading(meta);

  const title = `${cityName} \u00b7 ${heading} | TempHist`;
  const description = `Historical temperature data for ${cityName}: ${heading.toLowerCase()}.`;

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
  refs.titleEl.textContent = 'Share not found';
  refs.locationEl.style.display = 'none';
  refs.errorContainerEl.style.display = 'block';
  refs.errorMessageEl.textContent = message;
  // Reveal content wrappers so the error message and CTA link are visible
  refs.contentEl.classList.replace('share-page-pending', 'share-page-ready');
  refs.belowChartEl.classList.replace('share-page-pending', 'share-page-ready');
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
