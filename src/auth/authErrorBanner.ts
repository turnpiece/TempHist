/**
 * Banner for a failed anonymous sign-in on the SPA. Where it goes:
 *  - the homepage has a dedicated #authError container on its splash screen;
 *  - standalone pages with static content plus API data (Snapshots, Locations)
 *    mark their data area with `data-auth-error-region`, and the notice takes
 *    its place there, under the page's static heading/intro;
 *  - anywhere else it is created at the top of #viewOutlet.
 * Share pages have their own state in share.ts, and About/Privacy never call
 * this (they need no authentication).
 */
import { AUTH_ERROR_TEXT } from '../constants/index';
import type { SignInFailureKind } from './signIn';

const REGION_SELECTOR = '[data-auth-error-region]';
const REGION_FAILED_CLASS = 'auth-error-region--failed';

function getOrCreateContainer(): HTMLElement | null {
  const region = document.querySelector<HTMLElement>(REGION_SELECTOR);
  // Marks the region as failed so CSS can reserve space where the content
  // would have been (keeps the footer from sitting right under the notice).
  region?.classList.add(REGION_FAILED_CLASS);

  const existing = document.getElementById('authError');
  if (existing) return existing;

  const container = document.createElement('div');
  container.id = 'authError';
  container.hidden = true;

  if (region) {
    container.className = 'auth-error auth-error--region';
    // Whatever the region held (a loading placeholder) is no longer true.
    region.replaceChildren(container);
    return container;
  }

  const outlet = document.getElementById('viewOutlet');
  if (!outlet) return null;
  container.className = 'auth-error auth-error--page';
  outlet.insertBefore(container, outlet.firstChild);
  return container;
}

export function showAuthErrorBanner(kind: SignInFailureKind, onRetry: () => void): void {
  const container = getOrCreateContainer();
  if (!container) return;

  const content = document.createElement('div');
  content.className = 'error-content';

  const message = document.createElement('div');
  message.className = 'error-message';
  message.setAttribute('role', 'alert');
  message.textContent = AUTH_ERROR_TEXT[kind];
  content.appendChild(message);

  const retry = document.createElement('button');
  retry.type = 'button';
  retry.className = 'btn-retry btn-retry--block';
  retry.textContent = 'Retry';
  retry.addEventListener('click', () => {
    hideAuthErrorBanner();
    onRetry();
  });
  content.appendChild(retry);

  const wrapper = document.createElement('div');
  wrapper.className = 'error-container';
  wrapper.appendChild(content);

  container.replaceChildren(wrapper);
  container.hidden = false;

  // Standalone pages keep the footer hidden until their content has rendered
  // (see splash.ts); make sure it shows even if nothing did.
  document.body.classList.add('content-ready');
}

export function hideAuthErrorBanner(): void {
  document.querySelector(REGION_SELECTOR)?.classList.remove(REGION_FAILED_CLASS);
  const container = document.getElementById('authError');
  if (!container) return;
  container.hidden = true;
  container.replaceChildren();
}
