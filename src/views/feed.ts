import { getApiUrl, apiFetch } from '../api/temperature';
import { resetTrendBackground } from '../utils/uiHelpers';
import {
  buildShareUI,
  fetchShareMetadata,
  fetchShareTemperatureData,
  renderShareChart,
  loadShareLocations,
  showShareError,
  openShareModal,
  formatPeriodHeading,
} from '../share';
import type { SharePrefill } from '../share';

const LIMIT = 20;

export type Period = 'daily' | 'weekly' | 'monthly' | 'yearly';

export interface ShareItem {
  id: string;
  location: string;
  period: Period;
  identifier: string;
  ref_year: number;
  unit: 'celsius' | 'fahrenheit';
  created_at: string;
  og_image_url: string;
  share_url: string;
}

interface SharesResponse {
  shares: ShareItem[];
  limit: number;
  offset: number;
}


const FILTER_OPTIONS: Array<{ label: string; period: Period | '' }> = [
  { label: 'All', period: '' },
  { label: 'Daily', period: 'daily' },
  { label: 'Weekly', period: 'weekly' },
  { label: 'Monthly', period: 'monthly' },
  { label: 'Yearly', period: 'yearly' },
];


export async function fetchShares(period: Period | '' = '', offset = 0): Promise<SharesResponse> {
  const base = getApiUrl('/v1/shares');
  const url = new URL(base, window.location.origin);
  if (period) url.searchParams.set('period', period);
  url.searchParams.set('limit', String(LIMIT));
  if (offset > 0) url.searchParams.set('offset', String(offset));

  // apiFetch throws on non-ok responses (after retrying 5xx), so it never
  // returns one here — no need to check res.ok.
  const res = await apiFetch(url.toString());
  return res.json();
}

function formatTimeAgo(isoString: string): string {
  const diff = Math.max(0, Date.now() - new Date(isoString).getTime());
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks}w ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
}


export function buildCard(share: ShareItem): HTMLElement {
  const city = share.location.split(',')[0].trim();
  const periodLabel = formatPeriodHeading(share);
  const timeAgo = formatTimeAgo(share.created_at);
  const imgSrc = getApiUrl(share.og_image_url);

  const shareUrl = share.share_url;
  const shareIdMatch = shareUrl.match(/\/s\/([^/?#]+)/);
  const shareId = shareIdMatch ? shareIdMatch[1] : null;

  const a = document.createElement('a');
  a.className = 'feed-card';
  a.href = shareUrl;
  a.title = `${city} · ${periodLabel}`;

  if (shareId) {
    a.addEventListener('click', (e) => {
      e.preventDefault();
      openShareModal(shareId, share as SharePrefill);
    });
  }

  const imgWrap = document.createElement('div');
  imgWrap.className = 'feed-card__img-wrap feed-card__img-wrap--loading';

  const img = document.createElement('img');
  img.className = 'feed-card__img';
  img.alt = `${city} temperature history — ${periodLabel}`;
  img.loading = 'lazy';
  img.onload = () => imgWrap.classList.remove('feed-card__img-wrap--loading');
  img.onerror = () => imgWrap.classList.remove('feed-card__img-wrap--loading');
  img.src = imgSrc;

  imgWrap.appendChild(img);

  const body = document.createElement('div');
  body.className = 'feed-card__body';

  const cityEl = document.createElement('div');
  cityEl.className = 'feed-card__city';
  cityEl.textContent = city;

  const meta = document.createElement('div');
  meta.className = 'feed-card__meta';

  const periodEl = document.createElement('span');
  periodEl.className = 'feed-card__period';
  periodEl.textContent = periodLabel;

  const timeEl = document.createElement('span');
  timeEl.className = 'feed-card__time';
  timeEl.textContent = timeAgo;

  meta.appendChild(periodEl);
  meta.appendChild(timeEl);

  body.appendChild(cityEl);
  body.appendChild(meta);

  a.appendChild(imgWrap);
  a.appendChild(body);
  return a;
}

function buildEmptyMessage(): HTMLElement {
  const el = document.createElement('p');
  el.className = 'feed-empty';
  el.textContent = 'No recent shares found.';
  return el;
}

function buildErrorMessage(msg: string): HTMLElement {
  const el = document.createElement('p');
  el.className = 'feed-error';
  el.textContent = msg;
  return el;
}

export function renderFeedPage(): void {
  resetTrendBackground();

  const feedView = document.getElementById('feedView');
  if (!feedView) return;

  feedView.textContent = '';

  const section = document.createElement('section');
  section.className = 'feed-page';

  const container = document.createElement('div');
  container.className = 'container';

  // ── Header ──────────────────────────────────────────────────────────────────
  const header = document.createElement('div');
  header.className = 'feed-header';

  const h2 = document.createElement('h2');
  h2.textContent = 'Snapshots';

  header.appendChild(h2);

  const desc = document.createElement('p');
  desc.className = 'feed-desc';
  desc.textContent =
    'See what TempHist users are discovering. Below are recent temperature history charts generated by people around the world.';

  container.appendChild(header);
  container.appendChild(desc);

  // ── Filter bar ──────────────────────────────────────────────────────────────
  const filterBar = document.createElement('div');
  filterBar.className = 'feed-filter-bar';
  filterBar.setAttribute('role', 'group');
  filterBar.setAttribute('aria-label', 'Filter by period');

  const filterBtns: HTMLButtonElement[] = [];
  FILTER_OPTIONS.forEach(({ label, period }) => {
    const btn = document.createElement('button');
    btn.className = 'feed-filter-bar__btn' + (period === '' ? ' active' : '');
    btn.textContent = label;
    btn.dataset['period'] = period;
    filterBar.appendChild(btn);
    filterBtns.push(btn);
  });

  container.appendChild(filterBar);

  // ── Grid ────────────────────────────────────────────────────────────────────
  const grid = document.createElement('div');
  grid.className = 'feed-grid';
  container.appendChild(grid);

  // ── Load more ───────────────────────────────────────────────────────────────
  const loadMoreBtn = document.createElement('button');
  loadMoreBtn.className = 'feed-load-more';
  loadMoreBtn.textContent = 'Load more';
  loadMoreBtn.hidden = true;
  container.appendChild(loadMoreBtn);

  section.appendChild(container);
  feedView.appendChild(section);

  // ── State ───────────────────────────────────────────────────────────────────
  let currentPeriod: Period | '' = '';
  let currentOffset = 0;

  // ── Fetch helpers ────────────────────────────────────────────────────────────
  function setLoading(isLoading: boolean): void {
    loadMoreBtn.disabled = isLoading;
    filterBtns.forEach(b => { b.disabled = isLoading; });
  }

  async function loadShares(period: Period | '', offset: number, append: boolean): Promise<void> {
    setLoading(true);
    try {
      const data = await fetchShares(period, offset);
      if (!append) {
        grid.textContent = '';
      }
      if (data.shares.length === 0 && !append) {
        grid.appendChild(buildEmptyMessage());
        loadMoreBtn.hidden = true;
      } else {
        data.shares.forEach(share => grid.appendChild(buildCard(share)));
        loadMoreBtn.hidden = data.shares.length < LIMIT;
        currentOffset = offset + data.shares.length;
      }
    } catch (err) {
      if (!append) {
        grid.textContent = '';
        grid.appendChild(buildErrorMessage(
          err instanceof Error ? err.message : 'Failed to load feed.'
        ));
      }
      loadMoreBtn.hidden = true;
    } finally {
      setLoading(false);
    }
  }

  // ── Filter clicks ────────────────────────────────────────────────────────────
  filterBtns.forEach(btn => {
    btn.addEventListener('click', async () => {
      const period = (btn.dataset['period'] ?? '') as Period | '';
      if (period === currentPeriod) return;
      currentPeriod = period;
      currentOffset = 0;
      filterBtns.forEach(b => b.classList.toggle('active', b === btn));
      await loadShares(period, 0, false);
    });
  });

  // ── Load more click ──────────────────────────────────────────────────────────
  loadMoreBtn.addEventListener('click', async () => {
    await loadShares(currentPeriod, currentOffset, true);
  });

  // ── Initial load ─────────────────────────────────────────────────────────────
  loadShares('', 0, false);
}
