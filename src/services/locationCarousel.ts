// src/services/locationCarousel.ts
import type { PreapprovedLocation } from '../types/index';
import { getApiUrl, apiFetch } from '../api/temperature';

/**
 * Wait for Firebase authentication to be ready
 */
async function waitForAuthentication(maxAttempts: number = 50, delayMs: number = 100): Promise<boolean> {
  for (let i = 0; i < maxAttempts; i++) {
    if ((window as any).currentUser) {
      return true;
    }
    await new Promise(resolve => setTimeout(resolve, delayMs));
  }
  return false;
}

/**
 * Validate if a location object has required fields
 */
function isPreapprovedLocation(value: unknown): value is PreapprovedLocation {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return typeof candidate.id === 'string'
    && typeof candidate.slug === 'string'
    && typeof candidate.name === 'string'
    && typeof candidate.country_name === 'string'
    && typeof candidate.country_code === 'string';
}

/**
 * Parse and validate preapproved locations from API response
 */
function parsePreapprovedLocations(payload: unknown): PreapprovedLocation[] | null {
  if (!payload) {
    return null;
  }
  
  // Handle response wrapped in data property
  let data: unknown = payload;
  if (typeof payload === 'object' && payload !== null) {
    const payloadObj = payload as Record<string, unknown>;
    if ('data' in payloadObj) {
      data = payloadObj.data;
    } else if ('locations' in payloadObj) {
      data = payloadObj.locations;
    }
  }
  
  if (!Array.isArray(data)) {
    console.warn('API response is not an array:', typeof data, data);
    return null;
  }

  const validLocations = (data as unknown[]).filter(isPreapprovedLocation) as PreapprovedLocation[];

  if (!validLocations.length) {
    console.warn('No valid locations found in API response. Total items:', data.length);
    return null;
  }

  return validLocations.map(location => ({ ...location }));
}

/**
 * Load preapproved locations from API
 */
async function loadPreapprovedLocations(): Promise<PreapprovedLocation[]> {
  try {
    // Wait for authentication to be ready
    const isAuthenticated = await waitForAuthentication();
    if (!isAuthenticated) {
      console.warn('No authenticated user available for API request');
      return [];
    }
    
    // Load from API
    const apiResponse = await apiFetch(getApiUrl('/v1/locations/preapproved'));
    if (apiResponse.ok) {
      const data = await apiResponse.json();
      if ((window as any).debugLog) {
        (window as any).debugLog('API response received:', typeof data, Array.isArray(data) ? `Array with ${data.length} items` : 'Not an array', data);
      }
      
      // Parse and validate locations
      const locations = parsePreapprovedLocations(data);
      if (locations) {
        if ((window as any).debugLog) {
          (window as any).debugLog('Successfully parsed locations:', locations.length);
        }
        return locations;
      }
      
      console.warn('Failed to parse locations from API response');
      return [];
    } else {
      console.warn('API request failed with status:', apiResponse.status);
      return [];
    }
  } catch (error) {
    console.warn('Error loading preapproved locations:', error);
    return [];
  }
}

/**
 * Create a location card element with image support
 * @param location - The location data
 * @param isPriorityImage - If true, image loads eagerly with high priority (for first visible images)
 */
function createLocationCard(location: PreapprovedLocation, isPriorityImage: boolean = false): HTMLButtonElement {
  const button = document.createElement('button');
  button.className = 'location-card';
  button.type = 'button';
  button.setAttribute('role', 'option');
  button.dataset.locationId = location.id;

  // Image wrapper (always present for spacing)
  const imageWrapper = document.createElement('div');
  imageWrapper.className = 'location-card__image-wrapper';

  let imgElement: HTMLImageElement | null = null;

  if (location.imageUrl) {
    if (typeof location.imageUrl === 'object' && location.imageUrl.webp && location.imageUrl.jpeg) {
      // Use picture element for WebP with JPEG fallback
      const picture = document.createElement('picture');
      picture.className = 'location-card__picture';

      const source = document.createElement('source');
      source.srcset = location.imageUrl.webp;
      source.type = 'image/webp';
      picture.appendChild(source);

      const img = document.createElement('img');
      img.className = 'location-card__image';
      img.src = location.imageUrl.jpeg;
      img.alt = location.imageAlt || location.name;
      // First few visible images should load eagerly with high priority for better LCP
      if (isPriorityImage) {
        img.loading = 'eager';
        img.setAttribute('fetchpriority', 'high');
      } else {
        img.loading = 'lazy';
      }
      picture.appendChild(img);

      imageWrapper.appendChild(picture);
      imgElement = img;
    } else if (typeof location.imageUrl === 'string') {
      // Fallback for simple string URL
      const img = document.createElement('img');
      img.className = 'location-card__image';
      img.src = location.imageUrl;
      img.alt = location.imageAlt || location.name;
      // First few visible images should load eagerly with high priority for better LCP
      if (isPriorityImage) {
        img.loading = 'eager';
        img.setAttribute('fetchpriority', 'high');
      } else {
        img.loading = 'lazy';
      }
      imageWrapper.appendChild(img);
      imgElement = img;
    }
  }

  // If no valid image URL, add placeholder
  if (!imgElement) {
    const placeholder = document.createElement('div');
    placeholder.className = 'location-card__image-placeholder';
    imageWrapper.appendChild(placeholder);
  }

  button.appendChild(imageWrapper);

  const nameSpan = document.createElement('span');
  nameSpan.className = 'location-card__name';
  nameSpan.textContent = location.name || 'Unknown';
  button.appendChild(nameSpan);

  // Add error handler for images after they're in the DOM
  if (imgElement) {
    imgElement.addEventListener('error', () => {
      const wrapper = button.querySelector('.location-card__image-wrapper');
      if (wrapper) {
        wrapper.classList.add('image-error');
        imgElement!.style.display = 'none';
        // Also hide picture element if it exists
        const picture = button.querySelector('picture');
        if (picture) {
          (picture as HTMLElement).style.display = 'none';
        }
      }
    });
  }

  button.addEventListener('click', async () => {
    // Construct the full location string (same format as dropdown)
    // Format: "City, Admin1, Country" (e.g., "Manchester, England, United Kingdom")
    const valueParts = [location.name];
    if (location.admin1 && location.admin1.trim()) {
      valueParts.push(location.admin1.trim());
    }
    valueParts.push(location.country_name);
    const fullLocationString = valueParts.join(', ');
    
    // Call handleManualLocationSelection from main.ts (available globally)
    if (typeof window.handleManualLocationSelection === 'function') {
      await window.handleManualLocationSelection(fullLocationString);
    } else {
      // Fallback: trigger location change directly
      console.warn('handleManualLocationSelection not available, using fallback');
      window.tempLocation = fullLocationString;
      window.tempLocationSource = 'manual';
      window.location.hash = '#/today';
    }
  });

  return button;
}

/**
 * Initialise carousel scroll functionality
 */
function initCarouselScroll(carousel: HTMLElement, track: HTMLElement): (() => void) {
  // Prevent page scroll when touching/swiping the carousel track
  // Use CSS touch-action for native iOS scrolling, only prevent at boundaries
  let touchStartX = 0;
  let touchStartY = 0;
  let isHorizontalScroll = false;
  let hasMoved = false;

  track.addEventListener('touchstart', (e) => {
    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;
    isHorizontalScroll = false;
    hasMoved = false;
  }, { passive: true });

  track.addEventListener('touchmove', (e) => {
    if (!touchStartX || !touchStartY) return;
    
    const touchX = e.touches[0].clientX;
    const touchY = e.touches[0].clientY;
    const diffX = touchX - touchStartX;
    const diffY = touchY - touchStartY;
    const absDiffX = Math.abs(diffX);
    const absDiffY = Math.abs(diffY);
    
    // Determine scroll direction early
    if (!hasMoved && (absDiffX > 5 || absDiffY > 5)) {
      hasMoved = true;
      isHorizontalScroll = absDiffX > absDiffY;
    }
    
    // Only prevent default if:
    // 1. This is a horizontal scroll AND
    // 2. We're at a boundary trying to scroll beyond it (to prevent page scroll)
    if (hasMoved && isHorizontalScroll && e.cancelable) {
      const scrollLeft = track.scrollLeft;
      const scrollWidth = track.scrollWidth;
      const clientWidth = track.clientWidth;
      const maxScroll = scrollWidth - clientWidth;
      
      // At the start (scrollLeft = 0) and trying to scroll left
      if (scrollLeft <= 0 && diffX > 0) {
        e.preventDefault();
        return;
      }
      
      // At the end (scrollLeft >= maxScroll) and trying to scroll right
      if (scrollLeft >= maxScroll && diffX < 0) {
        e.preventDefault();
        return;
      }
      
      // For middle positions, let native scrolling work
      // CSS touch-action: pan-x will handle preventing vertical page scroll
    }
  }, { passive: false });

  track.addEventListener('touchend', () => {
    touchStartX = 0;
    touchStartY = 0;
    isHorizontalScroll = false;
    hasMoved = false;
  }, { passive: true });

  track.addEventListener('touchcancel', () => {
    touchStartX = 0;
    touchStartY = 0;
    isHorizontalScroll = false;
    hasMoved = false;
  }, { passive: true });

  // Prevent wheel events from scrolling the page when over the carousel
  track.addEventListener('wheel', (e) => {
    // Only prevent vertical scrolling, allow horizontal
    if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
      // Allow vertical scroll to pass through
      return;
    }
    // Horizontal scroll - prevent page scroll
    if (track.scrollLeft === 0 && e.deltaX < 0) {
      // At start, trying to scroll left - allow it
      return;
    }
    const maxScroll = track.scrollWidth - track.clientWidth;
    if (track.scrollLeft >= maxScroll && e.deltaX > 0) {
      // At end, trying to scroll right - prevent page scroll
      if (e.cancelable) {
        e.stopPropagation();
      }
    }
  }, { passive: true });

  const arrows = carousel.querySelectorAll<HTMLButtonElement>('.location-carousel__arrow');

  arrows.forEach((arrow) => {
    const direction = arrow.dataset.direction === 'left' ? -1 : 1;

    arrow.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      
      const amount = carousel.clientWidth * 0.8; // scroll ~80% of visible width
      let targetScroll = track.scrollLeft + (amount * direction);
      
      // Clamp target scroll to valid range
      const maxScroll = Math.max(0, track.scrollWidth - track.clientWidth);
      targetScroll = Math.max(0, Math.min(maxScroll, targetScroll));
      
      if (direction === -1) {
        // Scrolling left
        if (track.scrollLeft > 0) {
          // If we're very close to the start, scroll directly to 0
          if (track.scrollLeft < 50) {
            track.scrollTo({ left: 0, behavior: 'smooth' });
          } else {
            track.scrollTo({ left: targetScroll, behavior: 'smooth' });
          }
        }
      } else if (direction === 1 && track.scrollLeft < maxScroll) {
        // Scrolling right
        track.scrollTo({ left: targetScroll, behavior: 'smooth' });
      }
    });
  });
  
  // Update arrow visibility based on scroll position
  const updateArrowVisibility = () => {
    const leftArrow = carousel.querySelector('.location-carousel__arrow--left') as HTMLButtonElement;
    const rightArrow = carousel.querySelector('.location-carousel__arrow--right') as HTMLButtonElement;
    
    // Account for padding when checking scroll position
    const scrollThreshold = 5; // Threshold to handle rounding and padding
    
    const currentScroll = track.scrollLeft;
    const maxScroll = Math.max(0, track.scrollWidth - track.clientWidth);
    
    if (leftArrow) {
      // Allow scrolling left if we're not at position 0 (accounting for padding threshold)
      const canScrollLeft = currentScroll > scrollThreshold;
      // Don't disable completely, just dim it - still allow clicks to ensure we reach 0
      leftArrow.style.opacity = canScrollLeft ? '1' : '0.6';
      leftArrow.disabled = currentScroll <= 0; // Only disable at exactly 0
      leftArrow.style.pointerEvents = currentScroll <= 0 ? 'none' : 'auto';
      leftArrow.setAttribute('aria-disabled', String(currentScroll <= 0));
    }
    
    if (rightArrow) {
      // Check if we're at or near the end (accounting for rounding)
      const atEnd = currentScroll >= (maxScroll - scrollThreshold);
      const canScrollRight = !atEnd && currentScroll < maxScroll;
      
      rightArrow.style.opacity = canScrollRight ? '1' : '0.4';
      rightArrow.disabled = atEnd;
      rightArrow.style.pointerEvents = atEnd ? 'none' : 'auto';
      rightArrow.setAttribute('aria-disabled', String(atEnd));
    }
  };
  
  // Update on scroll
  track.addEventListener('scroll', updateArrowVisibility);
  
  // Don't update immediately - wait for layout to complete
  // Initial update will be called from initLocationCarousel after cards are added
  return updateArrowVisibility; // Return function for external call
}

/**
 * Hide the entire location selection section
 */
function hideLocationSelectionSection(): void {
  const heading = document.getElementById('location-picker-heading');
  const carousel = document.getElementById('location-carousel');
  
  if (heading) {
    heading.style.display = 'none';
    heading.classList.remove('visible');
  }
  
  if (carousel) {
    carousel.style.display = 'none';
    const arrows = carousel.querySelector('.location-carousel__arrows');
    if (arrows) {
      arrows.classList.remove('visible');
    }
  }
}

// Store the updateArrowVisibility function globally so we can call it when splash screen is shown again
let carouselUpdateArrowVisibility: (() => void) | null = null;

/**
 * Reset carousel scroll position and update arrow visibility
 * Called when splash screen is shown again after being hidden
 */
export function resetCarouselState(): void {
  const carousel = document.getElementById('location-carousel');
  const track = document.getElementById('location-carousel-track');
  
  if (!carousel || !track) {
    return;
  }

  // Check if carousel is visible (splash screen must be shown)
  const splashScreen = document.getElementById('splashScreen');
  if (!splashScreen || splashScreen.style.display === 'none') {
    // Splash screen not visible, don't reset yet
    return;
  }

  // Reset scroll position to start
  track.scrollLeft = 0;

  // Update arrow visibility after a brief delay to ensure layout is stable
  // Use multiple delays to account for layout recalculation
  requestAnimationFrame(() => {
    setTimeout(() => {
      // Reset scroll position again in case it changed
      track.scrollLeft = 0;
      
      if (carouselUpdateArrowVisibility) {
        carouselUpdateArrowVisibility();
      } else {
        // If update function isn't available, re-initialise the scroll handler
        carouselUpdateArrowVisibility = initCarouselScroll(carousel as HTMLElement, track as HTMLElement);
        if (carouselUpdateArrowVisibility) {
          carouselUpdateArrowVisibility();
        }
      }
      
      // Double-check after another delay to ensure layout is fully stable
      setTimeout(() => {
        track.scrollLeft = 0;
        if (carouselUpdateArrowVisibility) {
          carouselUpdateArrowVisibility();
        }
      }, 150);
    }, 100);
  });
}

/**
 * Initialise the location carousel
 */
export async function initLocationCarousel(): Promise<void> {
  const carousel = document.getElementById('location-carousel');
  const track = document.getElementById('location-carousel-track');

  if (!carousel || !track) {
    console.warn('Location carousel elements not found');
    return;
  }

  try {
    // Load locations from API
    const locations = await loadPreapprovedLocations();
    
    if (locations.length === 0) {
      // Hide the entire location selection section if no locations are available
      console.warn('No locations available, hiding location selection section');
      hideLocationSelectionSection();
      return;
    }

    // Clear track content without using innerHTML (Trusted Types safe)
    while (track.firstChild) {
      track.removeChild(track.firstChild);
    }

    // Build cards for each location
    // First 3 cards are priority images (likely visible initially) - load eagerly with high priority
    const PRIORITY_IMAGE_COUNT = 3;
    if ((window as any).debugLog) {
      (window as any).debugLog('Creating cards for', locations.length, 'locations');
    }
    locations.forEach((location, index) => {
      const isPriorityImage = index < PRIORITY_IMAGE_COUNT;
      const card = createLocationCard(location, isPriorityImage);
      track.appendChild(card);
      if ((window as any).debugLog) {
        (window as any).debugLog(`Created card ${index + 1}: ${location.name} (${location.id})${isPriorityImage ? ' [priority]' : ''}`);
      }
    });

    // Initialise scroll functionality first
    const updateArrowVisibility = initCarouselScroll(carousel as HTMLElement, track as HTMLElement);
    
    // Store the update function globally for later use
    carouselUpdateArrowVisibility = updateArrowVisibility;
    
    // Show the heading and arrows now that locations are loaded
    const heading = document.getElementById('location-picker-heading');
    const arrows = carousel.querySelector('.location-carousel__arrows');
    if (heading) {
      heading.classList.add('visible');
    }
    if (arrows) {
      arrows.classList.add('visible');
    }
    
    // Force a layout recalculation after cards are added
    // This ensures proper scroll width calculation and arrow states
    requestAnimationFrame(() => {
      // Wait for layout to complete, then set scroll position
      setTimeout(() => {
        // Immediately set to start position (London first)
        track.scrollLeft = 0;
        
        // Update arrow visibility now that layout is complete
        if (updateArrowVisibility) {
          updateArrowVisibility();
        }
        
        // Double-check and enforce scroll position after layout is stable
        setTimeout(() => {
          // Force scroll to 0 if it somehow moved
          if (track.scrollLeft !== 0) {
            track.scrollLeft = 0;
          }
          
          // Update arrows again after final scroll position is set
          if (updateArrowVisibility) {
            updateArrowVisibility();
          }
        }, 150);
      }, 100);
    });
  } catch (error) {
    console.error('Error initialising location carousel:', error);
    // Hide the entire location selection section on error
    hideLocationSelectionSection();
  }
}

/**
 * Render image attributions section for the About page
 * @param container - The container element to append the attribution section to
 */
export async function renderImageAttributions(container: HTMLElement): Promise<void> {
  try {
    // Load locations from API
    const locations = await loadPreapprovedLocations();
    
    // Filter locations that have imageAttribution
    const locationsWithAttribution = locations.filter(
      location => location.imageAttribution && location.imageAttribution !== null
    );
    
    if (locationsWithAttribution.length === 0) {
      // No attributions to show, don't add the section
      return;
    }
    
    // Create attribution section
    const attributionTitle = document.createElement('h3');
    attributionTitle.textContent = 'Image attributions';

    const attributionText = document.createElement('p');
    attributionText.textContent = 'The images used on this site were provided by the following:';
    
    const attributionList = document.createElement('ul');
    attributionList.className = 'image-attributions';
    
    // Create list items for each location with attribution
    locationsWithAttribution.forEach(location => {
      const attribution = location.imageAttribution!;
      
      const listItem = document.createElement('li');
      listItem.className = 'image-attribution-item';
      
      // Thumbnail image (first) - wrapped in link to sourceUrl
      if (location.imageUrl) {
        const thumbnailLink = document.createElement('a');
        thumbnailLink.href = attribution.sourceUrl;
        thumbnailLink.rel = 'noopener noreferrer';
        thumbnailLink.className = 'image-attribution-thumbnail';
        
        const thumbnail = document.createElement('img');
        if (typeof location.imageUrl === 'object' && location.imageUrl.webp) {
          // Use picture element for WebP with JPEG fallback
          const picture = document.createElement('picture');
          const source = document.createElement('source');
          source.srcset = location.imageUrl.webp;
          source.type = 'image/webp';
          picture.appendChild(source);
          
          thumbnail.src = location.imageUrl.jpeg;
          thumbnail.alt = location.imageAlt || location.name;
          thumbnail.loading = 'lazy';
          picture.appendChild(thumbnail);
          thumbnailLink.appendChild(picture);
        } else if (typeof location.imageUrl === 'string') {
          thumbnail.src = location.imageUrl;
          thumbnail.alt = location.imageAlt || location.name;
          thumbnail.loading = 'lazy';
          thumbnailLink.appendChild(thumbnail);
        }
        
        listItem.appendChild(thumbnailLink);
      }
      
      // Attribution text container (single block of text)
      const textContainer = document.createElement('span');
      textContainer.className = 'image-attribution-text';
      
      // Attribution text: "[title]" by [photographerName] via [sourceName link] ([licenseName link])
      const titleText = document.createTextNode(`"${attribution.title}"`);
      textContainer.appendChild(titleText);
      textContainer.appendChild(document.createTextNode(' by '));
      textContainer.appendChild(document.createTextNode(attribution.photographerName));
      textContainer.appendChild(document.createTextNode(' via '));
      
      const sourceLink = document.createElement('a');
      sourceLink.href = attribution.sourceUrl;
      sourceLink.textContent = attribution.sourceName;
      sourceLink.rel = 'noopener noreferrer';
      textContainer.appendChild(sourceLink);
      
      // Only show license if attributionRequired is true AND licenseName exists
      if (attribution.attributionRequired && attribution.licenseName && attribution.licenseName.trim() && attribution.licenseUrl) {
        textContainer.appendChild(document.createTextNode(' ('));
        const licenseLink = document.createElement('a');
        licenseLink.href = attribution.licenseUrl;
        licenseLink.textContent = attribution.licenseName;
        licenseLink.rel = 'noopener noreferrer';
        textContainer.appendChild(licenseLink);
        textContainer.appendChild(document.createTextNode(')'));
      }
      
      listItem.appendChild(textContainer);
      attributionList.appendChild(listItem);
    });
    
    // Append to container
    container.appendChild(attributionTitle);
    container.appendChild(attributionList);
  } catch (error) {
    console.warn('Error rendering image attributions:', error);
    // Silently fail - don't show attribution section if there's an error
  }
}
