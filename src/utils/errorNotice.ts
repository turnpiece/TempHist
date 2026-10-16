/**
 * The standard "couldn't load this" block with a Retry button, for pages whose
 * API request failed (Locations, Snapshots). Matches the sign-in notice in
 * auth/authErrorBanner.ts, so it picks up the shared .error-container and
 * .btn-retry--block styling.
 */
export function buildErrorNotice(message: string, onRetry: () => void): HTMLElement {
  const messageEl = document.createElement('div');
  messageEl.className = 'error-message';
  messageEl.setAttribute('role', 'alert');
  messageEl.textContent = message;

  const retry = document.createElement('button');
  retry.type = 'button';
  retry.className = 'btn-retry btn-retry--block';
  retry.textContent = 'Retry';
  retry.addEventListener('click', onRetry);

  const content = document.createElement('div');
  content.className = 'error-content';
  content.append(messageEl, retry);

  const wrapper = document.createElement('div');
  wrapper.className = 'error-container';
  wrapper.appendChild(content);
  return wrapper;
}
