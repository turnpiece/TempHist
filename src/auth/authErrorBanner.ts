/**
 * Splash-screen banner for a failed anonymous sign-in on the SPA (index.html).
 * Share pages have their own state in share.ts. No-ops on pages without the
 * #authError container (about/privacy/feed), which need no authentication.
 */
import { AUTH_ERROR_TEXT } from '../constants/index';
import type { SignInFailureKind } from './signIn';

export function showAuthErrorBanner(kind: SignInFailureKind, onRetry: () => void): void {
  const container = document.getElementById('authError');
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
}

export function hideAuthErrorBanner(): void {
  const container = document.getElementById('authError');
  if (!container) return;
  container.hidden = true;
  container.replaceChildren();
}
