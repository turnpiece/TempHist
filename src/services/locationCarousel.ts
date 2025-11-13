// src/services/locationCarousel.ts
import type { PreapprovedLocation } from '../types/index';

/**
 * Load preapproved locations from JSON file
 */
async function loadPreapprovedLocations(): Promise<PreapprovedLocation[]> {
  try {
    const response = await fetch('/data/preapproved-locations.json');
    if (response.ok) {
      const data = await response.json();
      // Validate and return locations
      if (Array.isArray(data)) {
        return data as PreapprovedLocation[];
      }
    }
    console.warn('Failed to load preapproved locations from JSON');
    return [];
  } catch (error) {
    console.warn('Error loading preapproved locations:', error);
    return [];
  }
}

/**
 * Create a location card element with image support
 */
function createLocationCard(location: PreapprovedLocation): HTMLButtonElement {
  const button = document.createElement('button');
  button.className = 'location-card';
  button.type = 'button';
  button.setAttribute('role', 'option');
  button.dataset.locationId = location.id;

  // Build image HTML with WebP and JPEG fallback support
  let imageHtml = '';
  if (location.imageUrl) {
    if (typeof location.imageUrl === 'object' && location.imageUrl.webp && location.imageUrl.jpeg) {
      // Use picture element for WebP with JPEG fallback
      imageHtml = `
        <picture class="location-card__picture">
          <source srcset="${location.imageUrl.webp}" type="image/webp">
          <img
            class="location-card__image"
            src="${location.imageUrl.jpeg}"
            alt="${location.imageAlt || location.name}"
            loading="lazy"
          />
        </picture>
      `;
    } else if (typeof location.imageUrl === 'string') {
      // Fallback for simple string URL
      imageHtml = `
        <img
          class="location-card__image"
          src="${location.imageUrl}"
          alt="${location.imageAlt || location.name}"
          loading="lazy"
        />
      `;
    }
  }

  // Always include the image wrapper, even if empty (for spacing)
  if (!imageHtml) {
    imageHtml = '<div class="location-card__image-placeholder"></div>';
  }

  button.innerHTML = `
    <div class="location-card__image-wrapper">
      ${imageHtml}
    </div>
    <span class="location-card__name">${location.name || 'Unknown'}</span>
  `;

  // Add error handler for images after they're in the DOM
  const img = button.querySelector('img');
  if (img) {
    img.addEventListener('error', () => {
      const wrapper = button.querySelector('.location-card__image-wrapper');
      if (wrapper) {
        wrapper.classList.add('image-error');
        img.style.display = 'none';
        // Also hide picture element if it exists
        const picture = button.querySelector('picture');
        if (picture) {
          picture.style.display = 'none';
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
 * Initialize carousel scroll functionality
 */
function initCarouselScroll(carousel: HTMLElement, track: HTMLElement): (() => void) {
  // Prevent page scroll when touching/swiping the carousel track
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
    if (!hasMoved && (absDiffX > 3 || absDiffY > 3)) {
      hasMoved = true;
      isHorizontalScroll = absDiffX > absDiffY;
      
      // If horizontal scroll, prevent default immediately to stop page scrolling
      if (isHorizontalScroll && e.cancelable) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }
    }
    
    // If we've determined this is horizontal scroll, always prevent default
    if (hasMoved && isHorizontalScroll && e.cancelable) {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation(); // Also stop other listeners
    }
  }, { passive: false });

  track.addEventListener('touchend', (e) => {
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

  // Also handle touch events on the carousel container to prevent propagation
  carousel.addEventListener('touchmove', (e) => {
    // If touch is on the track, let the track handler deal with it
    if ((e.target as HTMLElement).closest('.location-carousel__track')) {
      return;
    }
    // Otherwise prevent horizontal scrolling on the container
    if (e.cancelable) {
      e.stopPropagation();
    }
  }, { passive: false });

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
      
      console.log('Arrow clicked:', direction === -1 ? 'left' : 'right', 
        'current scroll:', track.scrollLeft, 
        'target scroll:', targetScroll,
        'maxScroll:', maxScroll);
      
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
      if (canScrollLeft || currentScroll > 0) {
        console.log('Left arrow state:', { canScrollLeft, currentScroll, scrollThreshold, scrollWidth: track.scrollWidth, clientWidth: track.clientWidth });
      }
    }
    
    if (rightArrow) {
      // Check if we're at or near the end (accounting for rounding)
      const atEnd = currentScroll >= (maxScroll - scrollThreshold);
      const canScrollRight = !atEnd && currentScroll < maxScroll;
      
      rightArrow.style.opacity = canScrollRight ? '1' : '0.4';
      rightArrow.disabled = atEnd;
      rightArrow.style.pointerEvents = atEnd ? 'none' : 'auto';
      rightArrow.setAttribute('aria-disabled', String(atEnd));
      
      // Log when we're at the end to debug
      if (atEnd) {
        console.log('Right arrow disabled - at end:', { currentScroll, maxScroll, scrollWidth: track.scrollWidth, clientWidth: track.clientWidth });
      }
    }
  };
  
  // Update on scroll
  track.addEventListener('scroll', updateArrowVisibility);
  
  // Don't update immediately - wait for layout to complete
  // Initial update will be called from initLocationCarousel after cards are added
  return updateArrowVisibility; // Return function for external call
}

/**
 * Initialize the location carousel
 */
export async function initLocationCarousel(): Promise<void> {
  const carousel = document.getElementById('location-carousel');
  const track = document.getElementById('location-carousel-track');

  if (!carousel || !track) {
    console.warn('Location carousel elements not found');
    return;
  }

  // Show loading state
  track.innerHTML = '<div class="location-carousel__loading">Loading locations...</div>';

  try {
    // Load locations from JSON
    const locations = await loadPreapprovedLocations();
    
    if (locations.length === 0) {
      track.innerHTML = '<div class="location-carousel__error">No locations available</div>';
      return;
    }

    // Clear loading state
    track.innerHTML = '';

    // Build cards for each location
    console.log('Creating cards for', locations.length, 'locations');
    locations.forEach((location, index) => {
      const card = createLocationCard(location);
      track.appendChild(card);
      console.log(`Created card ${index + 1}: ${location.name} (${location.id})`, card);
    });

    // Initialize scroll functionality first
    const updateArrowVisibility = initCarouselScroll(carousel as HTMLElement, track as HTMLElement);
    
    // Force a layout recalculation after cards are added
    // This ensures proper scroll width calculation and arrow states
    requestAnimationFrame(() => {
      // Wait for layout to complete, then set scroll position
      setTimeout(() => {
        // Immediately set to start position (London first)
        track.scrollLeft = 0;
        
        // Get accurate measurements
        const scrollWidth = track.scrollWidth;
        const clientWidth = track.clientWidth;
        const maxScroll = Math.max(0, scrollWidth - clientWidth);
        
        console.log('Track initialized:', {
          scrollLeft: track.scrollLeft,
          scrollWidth,
          clientWidth,
          maxScroll,
          canScrollLeft: track.scrollLeft > 0,
          canScrollRight: track.scrollLeft < maxScroll
        });
        
        // Update arrow visibility now that layout is complete
        if (updateArrowVisibility) {
          updateArrowVisibility();
        }
        
        // Double-check and enforce scroll position after layout is stable
        setTimeout(() => {
          // Force scroll to 0 if it somehow moved
          if (track.scrollLeft !== 0) {
            console.log('Correcting scroll position from', track.scrollLeft, 'to 0');
            track.scrollLeft = 0;
          }
          
          // Verify final state and update arrows
          const finalMaxScroll = Math.max(0, track.scrollWidth - track.clientWidth);
          console.log('Final scroll state:', {
            scrollLeft: track.scrollLeft,
            maxScroll: finalMaxScroll,
            atStart: track.scrollLeft <= 0,
            atEnd: track.scrollLeft >= finalMaxScroll - 1
          });
          
          // Update arrows again after final scroll position is set
          if (updateArrowVisibility) {
            updateArrowVisibility();
          }
        }, 150);
      }, 100);
    });
  } catch (error) {
    console.error('Error initializing location carousel:', error);
    track.innerHTML = '<div class="location-carousel__error">Failed to load locations</div>';
  }
}
