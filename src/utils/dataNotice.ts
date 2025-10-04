import type { DataNoticeOptions } from '../types/index';

/**
 * Utility function to update the data notice element
 */
export function updateDataNotice(message: string | null, options: DataNoticeOptions = {}): void {
  const dataNotice = document.getElementById('dataNotice');
  if (!dataNotice) return;

  // Handle debug-only messages
  if (options.debugOnly && !window.DEBUGGING) {
    dataNotice.textContent = '';
    dataNotice.className = 'notice'; // Keep the notice class for CSS :empty selector
    return;
  }

  // Clear the notice
  if (message === null || message === '') {
    dataNotice.textContent = '';
    dataNotice.className = 'notice'; // Keep the notice class for CSS :empty selector
    return;
  }

  // Ensure notice class is present for CSS :empty selector
  dataNotice.classList.add('notice');
  
  // Remove old status classes
  dataNotice.classList.remove('status-neutral', 'status-error', 'status-success', 'status-warning');

  // Use structured HTML format
  if (options.useStructuredHtml || options.title) {
    const typeClass = options.type || 'info';
    const title = options.title || '';
    const subtitle = options.subtitle || message || '';
    const extraInfo = options.extraInfo ? `<p class="notice-extra-info">${options.extraInfo}</p>` : '';
    
    dataNotice.innerHTML = `
      <div class="notice-content ${typeClass}">
        ${title ? `<p class="notice-title${options.largeTitle ? ' large' : ''}">${title}</p>` : ''}
        ${subtitle ? `<p class="notice-subtitle${options.secondarySubtitle ? ' secondary' : ''}">${subtitle}</p>` : ''}
        ${extraInfo}
      </div>
    `.trim();
  } else {
    // Simple text format
    dataNotice.textContent = message;
    
    // Add status class if type is specified
    if (options.type) {
      dataNotice.classList.add(`status-${options.type}`);
    }
  }
}
