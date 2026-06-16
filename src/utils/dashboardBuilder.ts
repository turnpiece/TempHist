import { INITIAL_LOADING_TEXT } from '../constants/index';
import { createSpinner } from './uiHelpers';

export interface DashboardConfig {
  idPrefix?: string;
  tabsEl?: HTMLElement;
  showDataNotice?: boolean;
  showIncompleteNotice?: boolean;
  showErrorContainer?: boolean;
  extraStatsContent?: HTMLElement[];
}

export interface DashboardRefs {
  dashboard: HTMLElement;
  locationEl: HTMLElement;
  titleEl: HTMLElement;
  dataNoticeEl: HTMLElement | null;
  summaryTextEl: HTMLElement;
  loadingEl: HTMLElement;
  loadingTextEl: HTMLElement;
  errorContainerEl: HTMLElement | null;
  errorMessageEl: HTMLElement | null;
  canvas: HTMLCanvasElement;
  statsBubbleEl: HTMLElement;
  avgTextEl: HTMLElement;
  trendTextEl: HTMLElement;
  stddevTextEl: HTMLElement;
  incompleteNoticeEl: HTMLElement | null;
}

function maybeId(el: HTMLElement, idPrefix: string | undefined, suffix: string): void {
  if (idPrefix) el.id = `${idPrefix}${suffix}`;
}

export function buildDashboard(config: DashboardConfig): DashboardRefs {
  const { idPrefix, tabsEl, showDataNotice, showIncompleteNotice, showErrorContainer, extraStatsContent } = config;

  const dashboard = document.createElement('div');
  dashboard.className = 'dashboard';

  // ── Left column ────────────────────────────────────────────────────────────

  const left = document.createElement('div');
  left.className = 'dashboard__left';

  const locationEl = document.createElement('h2');
  locationEl.className = 'location-heading';
  maybeId(locationEl, idPrefix, 'LocationText');
  left.appendChild(locationEl);

  const titleEl = document.createElement('div');
  titleEl.className = 'period-subheading';
  maybeId(titleEl, idPrefix, 'DateText');
  left.appendChild(titleEl);

  if (tabsEl) {
    left.appendChild(tabsEl);
  }

  let dataNoticeEl: HTMLElement | null = null;
  if (showDataNotice) {
    dataNoticeEl = document.createElement('div');
    maybeId(dataNoticeEl, idPrefix, 'DataNotice');
    dataNoticeEl.className = 'notice';
    left.appendChild(dataNoticeEl);
  }

  const summaryTextEl = document.createElement('div');
  summaryTextEl.className = 'standard-text summary-text';
  maybeId(summaryTextEl, idPrefix, 'SummaryText');
  left.appendChild(summaryTextEl);

  // ── Right column (chart) ───────────────────────────────────────────────────

  const right = document.createElement('div');
  right.className = 'dashboard__right';

  const chartContainer = document.createElement('div');
  chartContainer.className = 'chart-container';

  const loadingEl = document.createElement('div');
  loadingEl.className = 'loading';
  maybeId(loadingEl, idPrefix, 'Loading');
  loadingEl.appendChild(createSpinner());

  const loadingTextEl = document.createElement('p');
  loadingTextEl.className = 'loading-text';
  loadingTextEl.textContent = INITIAL_LOADING_TEXT;
  maybeId(loadingTextEl, idPrefix, 'LoadingText');
  loadingEl.appendChild(loadingTextEl);

  chartContainer.appendChild(loadingEl);

  let errorContainerEl: HTMLElement | null = null;
  let errorMessageEl: HTMLElement | null = null;
  if (showErrorContainer) {
    errorContainerEl = document.createElement('div');
    errorContainerEl.className = 'error-container';
    errorContainerEl.style.display = 'none';

    const errorContent = document.createElement('div');
    errorContent.className = 'error-content';

    errorMessageEl = document.createElement('div');
    errorMessageEl.className = 'error-message';
    errorContent.appendChild(errorMessageEl);
    errorContainerEl.appendChild(errorContent);
    chartContainer.appendChild(errorContainerEl);
  }

  const canvas = document.createElement('canvas');
  canvas.id = idPrefix ? `${idPrefix}Chart` : 'shareChart';
  chartContainer.appendChild(canvas);

  right.appendChild(chartContainer);

  // ── Stats column ───────────────────────────────────────────────────────────

  const statsCol = document.createElement('div');
  statsCol.className = 'dashboard__stats';

  const statsBubbleEl = document.createElement('div');
  statsBubbleEl.className = 'stats-bubble';
  maybeId(statsBubbleEl, idPrefix, 'StatsBubble');

  const avgTextEl = document.createElement('div');
  avgTextEl.className = 'avg-text';
  maybeId(avgTextEl, idPrefix, 'AvgText');
  statsBubbleEl.appendChild(avgTextEl);

  const trendTextEl = document.createElement('div');
  trendTextEl.className = 'trend-text';
  maybeId(trendTextEl, idPrefix, 'TrendText');
  statsBubbleEl.appendChild(trendTextEl);

  const stddevTextEl = document.createElement('div');
  stddevTextEl.className = 'stddev-text';
  maybeId(stddevTextEl, idPrefix, 'StddevText');
  statsBubbleEl.appendChild(stddevTextEl);

  statsCol.appendChild(statsBubbleEl);

  let incompleteNoticeEl: HTMLElement | null = null;
  if (showIncompleteNotice) {
    incompleteNoticeEl = document.createElement('div');
    maybeId(incompleteNoticeEl, idPrefix, 'IncompleteDataNotice');
    incompleteNoticeEl.className = 'notice';
    incompleteNoticeEl.style.display = 'none';
    statsCol.appendChild(incompleteNoticeEl);
  }

  if (extraStatsContent) {
    for (const el of extraStatsContent) {
      statsCol.appendChild(el);
    }
  }

  dashboard.appendChild(left);
  dashboard.appendChild(right);
  dashboard.appendChild(statsCol);

  return {
    dashboard,
    locationEl,
    titleEl,
    dataNoticeEl,
    summaryTextEl,
    loadingEl,
    loadingTextEl,
    errorContainerEl,
    errorMessageEl,
    canvas,
    statsBubbleEl,
    avgTextEl,
    trendTextEl,
    stddevTextEl,
    incompleteNoticeEl,
  };
}
