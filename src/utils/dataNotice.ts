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
    
    // Clear existing content
    dataNotice.textContent = '';
    
    // Create content container
    const contentEl = document.createElement('div');
    contentEl.className = `notice-content ${typeClass}`;
    
    // Add title if provided
    if (title) {
      const titleEl = document.createElement('p');
      titleEl.className = `notice-title${options.largeTitle ? ' large' : ''}`;
      titleEl.textContent = title;
      contentEl.appendChild(titleEl);
    }
    
    // Add subtitle if provided
    if (subtitle) {
      const subtitleEl = document.createElement('p');
      subtitleEl.className = `notice-subtitle${options.secondarySubtitle ? ' secondary' : ''}`;
      subtitleEl.textContent = subtitle;
      contentEl.appendChild(subtitleEl);
    }
    
    // Add extra info if provided
    if (options.extraInfo) {
      const extraInfoEl = document.createElement('p');
      extraInfoEl.className = 'notice-extra-info';
      extraInfoEl.textContent = options.extraInfo;
      contentEl.appendChild(extraInfoEl);
    }
    
    dataNotice.appendChild(contentEl);
  } else {
    // Simple text format
    dataNotice.textContent = message;
    
    // Add status class if type is specified
    if (options.type) {
      dataNotice.classList.add(`status-${options.type}`);
    }
  }
}
