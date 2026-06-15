// src/services/locationCarousel.ts
import type { PreapprovedLocation } from '../types/index';
import { getApiUrl, apiFetch, checkApiHealth } from '../api/temperature';
import { flagImg } from '../locations/locations';

const REGION_MAP: Record<string, string> = {
  AU: 'oceania', NZ: 'oceania',
  US: 'americas', CA: 'americas', MX: 'americas', BR: 'americas', AR: 'americas', CL: 'americas',
  GB: 'europe', FR: 'europe', DE: 'europe', IT: 'europe', ES: 'europe', NL: 'europe',
  BE: 'europe', CH: 'europe', AT: 'europe', SE: 'europe', NO: 'europe', DK: 'europe',
  FI: 'europe', PT: 'europe', IE: 'europe', PL: 'europe', CZ: 'europe',
  JP: 'asia', CN: 'asia', IN: 'asia', SG: 'asia', HK: 'asia', KR: 'asia',
  TH: 'asia', VN: 'asia', ID: 'asia', MY: 'asia', PH: 'asia',
  AE: 'mideast', SA: 'mideast', IL: 'mideast', TR: 'mideast', EG: 'mideast',
  ZA: 'africa', NG: 'africa', KE: 'africa', GH: 'africa',
};

function geoSortLocations(locations: PreapprovedLocation[], countryCode: string): PreapprovedLocation[] {
  if (!countryCode) return locations;
  const userRegion = REGION_MAP[countryCode] || countryCode;
  return [...locations].sort((a, b) => {
    const aMatch = (REGION_MAP[a.country_code] || a.country_code) === userRegion ? 0 : 1;
    const bMatch = (REGION_MAP[b.country_code] || b.country_code) === userRegion ? 0 : 1;
    return aMatch - bMatch;
  });
}

/**
 * Wait for Firebase authentication to be ready
 */
async function waitForAuthentication(maxAttempts: number = 50, delayMs: number = 100): Promise<boolean> {
  for (let i = 0; i < maxAttempts; i++) {
    if (globalThis.currentUser) {
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
      if (globalThis.debugLog) {
        globalThis.debugLog('API response received:', typeof data, Array.isArray(data) ? `Array with ${data.length} items` : 'Not an array', data);
      }
      
      // Parse and validate locations
      const locations = parsePreapprovedLocations(data);
      if (locations) {
        if (globalThis.debugLog) {
          globalThis.debugLog('Successfully parsed locations:', locations.length);
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

const SKELETON_COUNT = 6;

function createSkeletonCard(): HTMLButtonElement {
  const button = document.createElement('button');
  button.className = 'location-card location-card--skeleton';
  button.type = 'button';
  button.disabled = true;
  button.setAttribute('aria-hidden', 'true');

  const imageWrapper = document.createElement('div');
  imageWrapper.className = 'location-card__image-wrapper';
  button.appendChild(imageWrapper);

  const nameBar = document.createElement('span');
  nameBar.className = 'location-card__name-skeleton';
  button.appendChild(nameBar);

  return button;
}

function showSkeletonCards(track: HTMLElement, heading: HTMLElement | null): void {
  for (let i = 0; i < SKELETON_COUNT; i++) {
    track.appendChild(createSkeletonCard());
  }
  if (heading) heading.classList.add('visible');
}

function showCarouselError(carousel: HTMLElement, track: HTMLElement): void {
  // Stop skeleton pulse and dim cards to ~10%
  track.querySelectorAll<HTMLElement>('.location-card--skeleton').forEach(card => {
    card.style.opacity = '0.1';
    card.style.animationName = 'none';
  });

  // Dim the heading to ~10% to match the ghost cards
  const heading = document.getElementById('location-picker-heading');
  if (heading) heading.style.opacity = '0.1';

  const errorEl = document.createElement('div');
  errorEl.className = 'location-carousel__error';
  errorEl.id = 'location-carousel-error';

  const msg = document.createElement('span');
  msg.className = 'location-carousel__error-text';
  msg.textContent = 'Failed to load locations';

  const retryBtn = document.createElement('button');
  retryBtn.className = 'location-carousel__error-retry';
  retryBtn.type = 'button';
  retryBtn.textContent = 'Retry';
  retryBtn.addEventListener('click', () => { initLocationCarousel(); });

  // Button must precede the text span in the DOM so float:right sits on the same line
  errorEl.appendChild(retryBtn);
  errorEl.appendChild(msg);

  const arrows = carousel.querySelector('.location-carousel__arrows');
  if (arrows) {
    arrows.before(errorEl);
  } else {
    carousel.appendChild(errorEl);
  }

  // Fire a background health check — add context if the API itself is the problem
  checkApiHealth().then(result => {
    if (result !== 'healthy' && document.getElementById('location-carousel-error') === errorEl) {
      const healthMsg = document.createElement('p');
      healthMsg.className = 'location-carousel__health-message';
      healthMsg.textContent = result === 'unhealthy'
        ? "The temperature data server is currently experiencing issues."
        : "Unable to reach the temperature data server — your connection may be down or the service may be unavailable.";
      errorEl.appendChild(healthMsg);
    }
  });
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
      // Intrinsic served size — CSS (object-fit: cover in a 4/3 wrapper) controls display
      img.width = 320;
      img.height = 200;
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
      img.width = 320;
      img.height = 200;
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
  nameSpan.appendChild(flagImg(location.country_code, 20));
  const nameText = document.createElement('span');
  nameText.className = 'location-card__name-text';
  nameText.textContent = location.name || 'Unknown';
  nameSpan.appendChild(nameText);
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

    // Submit selection signal (fire-and-forget — must not block navigation)
    apiFetch(getApiUrl('/v1/locations/selections'), {
      method: 'POST',
      body: JSON.stringify({ location_id: location.id }),
    }).catch(() => {});

    // Call handleManualLocationSelection from main.ts (available globally)
    if (typeof globalThis.handleManualLocationSelection === 'function') {
      await globalThis.handleManualLocationSelection(
        fullLocationString,
        location.timezone ?? null,
        location.latitude ?? null,
        location.longitude ?? null
      );
    } else {
      // Fallback: trigger location change directly
      console.warn('handleManualLocationSelection not available, using fallback');
      globalThis.tempLocation = fullLocationString;
      globalThis.tempLocationSource = 'manual';
      window.location.hash = '#/today';
    }
  });

  return button;
}

/**
 * Initialise carousel scroll functionality — progress bar only (arrows removed).
 *
 * The progress bar acts as a native-style scroll thumb: its width represents
 * the visible portion of the track and its position represents how far the user
 * has scrolled. This means the indicator is already visible at rest (at scrollLeft=0),
 * which is what tells the user "there's more content to the right" before they ever
 * interact.
 */
function initCarouselScroll(_carousel: HTMLElement, track: HTMLElement): (() => void) {
  const progressBar = document.getElementById('carousel-progress-bar') as HTMLElement | null;
  const progressTrack = document.getElementById('carousel-progress') as HTMLElement | null;

  const updateProgress = () => {
    if (!progressBar) return;
    const maxScroll = Math.max(0, track.scrollWidth - track.clientWidth);

    // No overflow → no scrolling possible, hide the indicator entirely.
    if (maxScroll === 0) {
      if (progressTrack) progressTrack.style.visibility = 'hidden';
      return;
    }
    if (progressTrack) progressTrack.style.visibility = '';

    const ratio = track.clientWidth / track.scrollWidth; // 0..1
    // Floor the thumb at 18% so it stays comfortably tappable/visible even
    // when the track is very long relative to the viewport.
    const thumbPct = Math.min(100, Math.max(18, ratio * 100));
    const position = track.scrollLeft / maxScroll;     // 0..1
    const leftPct = position * (100 - thumbPct);
    progressBar.style.width = `${thumbPct}%`;
    // Once there's actual scroll, take over from the CSS attention-nudge
    // animation: cancel it (otherwise its transform keyframes win over inline)
    // and pin the thumb to the real scroll position.
    if (position > 0) {
      progressBar.style.animation = 'none';
      progressBar.style.transform = `translateX(${leftPct / thumbPct * 100}%)`;
    }
  };

  track.addEventListener('scroll', updateProgress, { passive: true });
  return updateProgress;
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
  }
}

let carouselUpdateProgress: (() => void) | null = null;

/**
 * Reset carousel scroll position to start
 * Called when splash screen is shown again after being hidden
 */
export function resetCarouselState(): void {
  const carousel = document.getElementById('location-carousel');
  const track = document.getElementById('location-carousel-track');

  if (!carousel || !track) return;

  const splashScreen = document.getElementById('splashScreen');
  if (!splashScreen || splashScreen.style.display === 'none') return;

  track.scrollLeft = 0;

  requestAnimationFrame(() => {
    setTimeout(() => {
      track.scrollLeft = 0;
      if (carouselUpdateProgress) carouselUpdateProgress();
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

  // Clear any previous state (skeleton cards + error message) before (re-)initialising
  while (track.firstChild) track.removeChild(track.firstChild);
  const existingError = document.getElementById('location-carousel-error');
  if (existingError) existingError.remove();

  // Restore heading opacity in case it was dimmed by a previous error
  const heading = document.getElementById('location-picker-heading');
  if (heading) heading.style.opacity = '';

  // Show skeleton cards immediately so users see something while the API loads
  showSkeletonCards(track, heading);

  try {
    // Load locations from API
    const locations = await loadPreapprovedLocations();
    
    if (locations.length === 0) {
      console.warn('No locations available from API');
      showCarouselError(carousel as HTMLElement, track);
      return;
    }

    // Preload the first carousel image for better LCP
    const firstLocation = locations[0];
    if (firstLocation?.imageUrl) {
      const preloadLink = document.createElement('link');
      preloadLink.rel = 'preload';
      preloadLink.as = 'image';
      preloadLink.setAttribute('fetchpriority', 'high');
      
      if (typeof firstLocation.imageUrl === 'object' && firstLocation.imageUrl.webp) {
        // Prefer WebP for preload
        preloadLink.href = firstLocation.imageUrl.webp;
        preloadLink.type = 'image/webp';
      } else if (typeof firstLocation.imageUrl === 'string') {
        preloadLink.href = firstLocation.imageUrl;
      }
      
      if (preloadLink.href) {
        document.head.appendChild(preloadLink);
        if (globalThis.debugLog) {
          globalThis.debugLog('Preloaded first carousel image:', preloadLink.href);
        }
      }
    }

    // Clear track content without using innerHTML (Trusted Types safe)
    while (track.firstChild) {
      track.removeChild(track.firstChild);
    }

    // Geo-sort: put user's region first, then slice to 10
    const userCountry = ((window as any).__TH_COUNTRY || '').toUpperCase();
    const sortedLocations = geoSortLocations(locations, userCountry).slice(0, 10);

    if (globalThis.debugLog) {
      globalThis.debugLog('Creating cards for', sortedLocations.length, 'locations (country:', userCountry || 'unknown', ')');
    }

    sortedLocations.forEach((location, index) => {
      const card = createLocationCard(location, index < 3);
      track.appendChild(card);
    });

    // Show the heading now that locations are loaded
    if (heading) heading.classList.add('visible');

    // Inject "More locations" link once (below the carousel, inside .hero-cities)
    const heroCities = carousel.closest('.hero-cities') as HTMLElement | null;
    if (heroCities && !heroCities.querySelector('.see-all-link')) {
      const moreLink = document.createElement('a');
      moreLink.href = '/locations';
      moreLink.className = 'see-all-link';
      moreLink.textContent = 'More locations →';
      heroCities.appendChild(moreLink);
    }

    // Initialise scroll + progress bar
    const updateProgress = initCarouselScroll(carousel as HTMLElement, track as HTMLElement);
    carouselUpdateProgress = updateProgress;

    requestAnimationFrame(() => {
      setTimeout(() => {
        track.scrollLeft = 0;
        if (updateProgress) updateProgress();
      }, 100);
    });
  } catch (error) {
    console.error('Error initialising location carousel:', error);
    showCarouselError(carousel as HTMLElement, track);
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
