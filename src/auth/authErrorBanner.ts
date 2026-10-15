/**
 * Banner for a failed anonymous sign-in on the SPA. The homepage has a
 * dedicated #authError container on its splash screen; the standalone pages
 * that need the API (Locations, Snapshots) have none, so one is created at the
 * top of #viewOutlet. Share pages have their own state in share.ts, and
 * About/Privacy never call this (they need no authentication).
 */
import { AUTH_ERROR_TEXT } from '../constants/index';
import type { SignInFailureKind } from './signIn';

function getOrCreateContainer(): HTMLElement | null {
  const existing = document.getElementById('authError');
  if (existing) return existing;

  const outlet = document.getElementById('viewOutlet');
  if (!outlet) return null;

  const container = document.createElement('div');
  container.id = 'authError';
  container.className = 'auth-error auth-error--page';
  container.hidden = true;
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
  // (see splash.ts); with nothing to render, show it so the page isn't blank.
  document.body.classList.add('content-ready');
}

export function hideAuthErrorBanner(): void {
  const container = document.getElementById('authError');
  if (!container) return;
  container.hidden = true;
  container.replaceChildren();
}
