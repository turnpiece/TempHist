import './styles.scss';
import { initializeApp } from "firebase/app";
import { getAuth, signInAnonymously, onAuthStateChanged } from "firebase/auth";

  // Global namespace and cache
  window.TempHist = window.TempHist || {};
  TempHist.cache = TempHist.cache || {
    prefetch: {
      // example shape expected:
      // week: { location: 'London', startISO: '2025-09-19', endISO: '2025-09-25', series: [...] }
      // month: { ... }, year: { ... }
    }
  };
  window.TempHistViews = window.TempHistViews || {};

  // Error monitoring and analytics
  TempHist.analytics = TempHist.analytics || {
    errors: [],
    apiCalls: 0,
    apiFailures: 0,
    retryAttempts: 0,
    locationFailures: 0,
    startTime: Date.now()
  };

  // Error logging function
  function logError(error, context = {}) {
    const errorData = {
      timestamp: new Date().toISOString(),
      error: error.message || error.toString(),
      stack: error.stack,
      context,
      userAgent: navigator.userAgent,
      url: window.location.href
    };
    
    TempHist.analytics.errors.push(errorData);
    
    // Keep only last 50 errors to prevent memory issues
    if (TempHist.analytics.errors.length > 50) {
      TempHist.analytics.errors = TempHist.analytics.errors.slice(-50);
    }
    
    // Log to console in development
    if (import.meta.env.DEV) {
      console.error('TempHist Error:', errorData);
    }
  }

  // Analytics reporting function
  function reportAnalytics() {
    const analytics = TempHist.analytics;
    const sessionDuration = Date.now() - analytics.startTime;
    
    return {
      sessionDuration: Math.round(sessionDuration / 1000), // seconds
      apiCalls: analytics.apiCalls,
      apiFailureRate: analytics.apiCalls > 0 ? (analytics.apiFailures / analytics.apiCalls * 100).toFixed(1) + '%' : '0%',
      retryAttempts: analytics.retryAttempts,
      locationFailures: analytics.locationFailures,
      errorCount: analytics.errors.length,
      recentErrors: analytics.errors.slice(-5) // Last 5 errors
    };
  }

  // Send analytics to server
  async function sendAnalytics() {
    try {
      const analyticsData = reportAnalytics();
      const payload = {
        session_duration: analyticsData.sessionDuration,
        api_calls: analyticsData.apiCalls,
        api_failure_rate: analyticsData.apiFailureRate, // Keep as string like "20.0%"
        retry_attempts: analyticsData.retryAttempts,
        location_failures: analyticsData.locationFailures,
        error_count: analyticsData.errorCount,
        recent_errors: analyticsData.recentErrors,
        app_version: "1.0.0",
        platform: "web"
      };

      // Debug: Log the payload being sent
      debugLog('Analytics payload being sent:', payload);

      const response = await fetch(getApiUrl('/analytics'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.warn('Analytics reporting failed:', response.status, errorText);
        debugLog('Analytics error response:', errorText);
      } else {
        debugLog('Analytics sent successfully');
      }
    } catch (error) {
      // Silently fail analytics reporting to not impact user experience
      console.warn('Analytics reporting error:', error);
    }
  }

  // Send analytics on page unload and periodically
  function setupAnalyticsReporting() {
    // Send analytics when page is about to unload
    window.addEventListener('beforeunload', () => {
      // Use sendBeacon for reliable delivery on page unload
      if (navigator.sendBeacon) {
        const analyticsData = reportAnalytics();
        const payload = {
          session_duration: analyticsData.sessionDuration,
          api_calls: analyticsData.apiCalls,
          api_failure_rate: analyticsData.apiFailureRate,
          retry_attempts: analyticsData.retryAttempts,
          location_failures: analyticsData.locationFailures,
          error_count: analyticsData.errorCount,
          recent_errors: analyticsData.recentErrors,
          app_version: "1.0.0",
          platform: "web"
        };
        
        navigator.sendBeacon(getApiUrl('/analytics'), JSON.stringify(payload));
      } else {
        // Fallback for browsers without sendBeacon
        sendAnalytics();
      }
    });

    // Send analytics periodically (every 5 minutes) for long sessions
    setInterval(() => {
      if (TempHist.analytics.apiCalls > 0 || TempHist.analytics.errors.length > 0) {
        sendAnalytics();
      }
    }, 5 * 60 * 1000); // 5 minutes
  }

  // Make analytics available globally for debugging
  window.TempHistAnalytics = reportAnalytics;
  window.TempHistSendAnalytics = sendAnalytics;

// Firebase config
const firebaseConfig = {
  apiKey: "AIzaSyC8CgPOwaXkGgCRgAtEn1VIGCxEHI-brjg",
  authDomain: "temphist-2c787.firebaseapp.com",
  projectId: "temphist-2c787",
  storageBucket: "temphist-2c787.firebasestorage.app",
  messagingSenderId: "355243461054",
  appId: "1:355243461054:web:d3471deb717abb569a51ef",
  measurementId: "G-117YTQEW98"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

// Sign in anonymously
signInAnonymously(auth)
  .catch((error) => {
    console.error("Firebase anonymous sign-in error:", error);
  });

// Wait for authentication before running the rest of your code
onAuthStateChanged(auth, (user) => {
  if (user) {
    // User is signed in, you can now use user.uid or user.getIdToken()
    // Place your main logic here, or call a function to start your app
    startAppWithFirebaseUser(user);
  } else {
    // User is signed out
  }
});

  // Helper function to render simple content pages
  function setSectionHTML(sectionId, html) {
    const sec = document.getElementById(sectionId);
    if (!sec) return;
    sec.innerHTML = html;
  }

  // Global helper functions for view renderers
  window.getApiUrl = function(path) {
    // Get API base URL
    const apiBase = (() => {
      // Check for environment-specific API URL first
      if (import.meta.env.VITE_API_BASE) {
        return import.meta.env.VITE_API_BASE;
      }
      
      // Development (local)
      if (import.meta.env.DEV) {
        return 'http://localhost:3000'; // Point to server.js
      }
      
      // Dev site also uses production API
      if (window.location.hostname === 'dev.temphist.com') {
        return 'https://api.temphist.com'; // Use production API for dev site
      }
      
      // Production
      return 'https://api.temphist.com';
    })();
    
    // Don't encode the path here - individual components should be encoded by their builders
    const fullUrl = `${apiBase}${path}`;
    
    return fullUrl;
  };

  window.getCurrentLocation = function() {
    // This will be set by the main app logic
    debugLog('getCurrentLocation called, window.tempLocation:', window.tempLocation);
    const result = window.tempLocation || 'London, England, United Kingdom';
    debugLog('getCurrentLocation returning:', result);
    return result;
  };

  window.getOrdinal = function(n) {
    const s = ["th", "st", "nd", "rd"];
    const v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
  };

  window.getDisplayCity = function(fullLocation) {
    if (!fullLocation) return fullLocation;
    
    // Decode URL-encoded location first
    const decodedLocation = decodeURIComponent(fullLocation);
    
    // Split by commas and get the first part (city)
    const parts = decodedLocation.split(',').map(part => part.trim());
    return parts[0];
  };

  // Global debug configuration
  const DEBUGGING = true;

  // Helper functions for debug logging (global scope)
  function debugLog(...args) {
    if (DEBUGGING) {
      console.log(...args);
    }
  }

  function debugTime(label) {
    if (DEBUGGING) {
      console.time(label);
    }
  }

  function debugTimeEnd(label) {
    if (DEBUGGING) {
      console.timeEnd(label);
    }
  }

  // Make debug functions and configuration globally available
  window.DEBUGGING = DEBUGGING;
  window.debugLog = debugLog;
  window.debugTime = debugTime;
  window.debugTimeEnd = debugTimeEnd;

  /**
   * Utility function to update the data notice element
   * @param {string|null} message - The message to display (null to clear)
   * @param {object} options - Configuration options
   * @param {string} options.type - Type of notice: 'success', 'error', 'warning', 'neutral', 'info'
   * @param {string} options.title - Optional title for structured notices
   * @param {string} options.subtitle - Optional subtitle for structured notices
   * @param {boolean} options.useStructuredHtml - Whether to use structured HTML format
   * @param {boolean} options.debugOnly - Only show this message when DEBUGGING is true
   * @param {string} options.extraInfo - Optional extra info text
   */
  function updateDataNotice(message, options = {}) {
    const dataNotice = document.getElementById('dataNotice');
    if (!dataNotice) return;

    // Handle debug-only messages
    if (options.debugOnly && !DEBUGGING) {
      dataNotice.textContent = '';
      dataNotice.className = '';
      return;
    }

    // Clear the notice
    if (message === null || message === '') {
      dataNotice.textContent = '';
      dataNotice.className = '';
      return;
    }

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

  // Make updateDataNotice globally available
  window.updateDataNotice = updateDataNotice;

  // Enhanced device and platform detection (moved to global scope)
    function detectDeviceAndPlatform() {
      const userAgent = navigator.userAgent;
      
      // OS Detection
      const isIOS = /iPad|iPhone|iPod/.test(userAgent);
      const isAndroid = /Android/.test(userAgent);
      const isWindows = /Windows/.test(userAgent);
      const isMac = /Mac/.test(userAgent);
      const isLinux = /Linux/.test(userAgent);
      
      // Browser Detection
      const isSafari = /Safari/.test(userAgent) && !/Chrome/.test(userAgent);
      const isChrome = /Chrome/.test(userAgent);
      const isFirefox = /Firefox/.test(userAgent);
      const isEdge = /Edg/.test(userAgent);
      
      // Device Type Detection
      const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(userAgent);
      const isTablet = /iPad|Android(?=.*\bMobile\b)(?=.*\bSafari\b)/.test(userAgent);
      const isDesktop = !isMobile && !isTablet;
      
      // Additional mobile indicators
      const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
      const isSmallScreen = window.innerWidth <= 768;
      const isPortrait = window.innerHeight > window.innerWidth;
      
      // Mobile-specific features
      const hasMobileFeatures = 'connection' in navigator || 
                               'deviceMemory' in navigator || 
                               'hardwareConcurrency' in navigator;
      
      // Enhanced mobile detection with scoring
      const mobileScore = (isMobile ? 3 : 0) + 
                         (isTouchDevice ? 2 : 0) + 
                         (isSmallScreen ? 1 : 0) + 
                         (hasMobileFeatures ? 1 : 0);
      
      const isMobileDevice = mobileScore >= 3;
      
      // Platform-specific details
      const platform = {
        os: isIOS ? 'iOS' : isAndroid ? 'Android' : isWindows ? 'Windows' : isMac ? 'macOS' : isLinux ? 'Linux' : 'Unknown',
        browser: isSafari ? 'Safari' : isChrome ? 'Chrome' : isFirefox ? 'Firefox' : isEdge ? 'Edge' : 'Unknown',
        deviceType: isTablet ? 'Tablet' : isMobile ? 'Mobile' : 'Desktop',
        isMobile: isMobileDevice,
        isIOS,
        isAndroid,
        isSafari,
        isChrome
      };
      
      if (DEBUGGING) {
        console.log('Device and platform detection:', {
          userAgent: userAgent,
          platform,
          mobileScore,
          isTouchDevice,
          isSmallScreen,
          isPortrait,
          hasMobileFeatures
        });
      }
      
      return platform;
    }

  // Enhanced mobile detection function (backward compatibility)
  function isMobileDevice() {
    return detectDeviceAndPlatform().isMobile;
  }

  // Cookie management functions
  function setLocationCookie(city) {
    const expiry = new Date();
    expiry.setHours(expiry.getHours() + 1); // Expire after 1 hour
    document.cookie = `tempLocation=${city};expires=${expiry.toUTCString()};path=/`;
  }

  function getLocationCookie() {
    const cookies = document.cookie.split(';');
    for (let cookie of cookies) {
      const [name, value] = cookie.trim().split('=');
      if (name === 'tempLocation') {
        return value;
      }
    }
    return null;
  }

  // Global AbortController to cancel in-flight requests
  let inFlightController = null;
  
  // Separate AbortController for prefetch operations
  let prefetchController = null;

  // Cleanup function to cancel any pending requests
  function cleanupRequests() {
    if (inFlightController) {
      inFlightController.abort();
      inFlightController = null;
    }
    // Don't abort prefetch operations - let them continue in background
  }

  // Clean up requests when page is unloaded
  window.addEventListener('beforeunload', cleanupRequests);

  // API health check function
  async function checkApiHealth() {
    try {
      const healthUrl = getApiUrl('/health');
      const response = await fetch(healthUrl, {
        method: 'GET',
        headers: {
          'Accept': 'application/json'
        }
      });
      return response.ok;
    } catch (error) {
      return false;
    }
  }

  // Wrapper function for API fetches that adds the Firebase ID token
  async function apiFetch(url, options = {}) {
    // Cancel any existing in-flight request
    if (inFlightController) {
      inFlightController.abort();
    }
    
    // Create new AbortController for this request
    inFlightController = new AbortController();
    
    // Get the Firebase ID token for the current user
    const idToken = await window.currentUser.getIdToken();

    const headers = {
      'Authorization': `Bearer ${idToken}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      ...options.headers
    };

    try {
      // First try a simple fetch without any special options
      const response = await fetch(url, { 
        method: options.method || 'GET',
        headers,
        signal: inFlightController.signal
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('API Error:', {
          status: response.status,
          statusText: response.statusText,
          url,
          headers: Object.fromEntries(response.headers.entries()),
          body: errorText
        });
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      return response;
    } catch (error) {
      // Don't log errors if the request was aborted
      if (error.name === 'AbortError') {
        throw error;
      }
      
      console.error('Fetch error:', {
        url,
        error: error.message,
        headers,
        stack: error.stack
      });
      throw error;
    } finally {
      // Clear the controller after request completes (success or failure)
      inFlightController = null;
    }
  }

  // Async job polling utility functions
  async function createAsyncJob(period, location, identifier) {
    debugLog(`Creating async job for ${period} data:`, { location, identifier });
    
    // Convert period names to the correct API format
    const apiPeriod = period === 'week' ? 'weekly' : 
                     period === 'month' ? 'monthly' : 
                     period === 'year' ? 'yearly' : 
                     period; // daily stays as 'daily'
    
    debugLog(`Converted period '${period}' to API period '${apiPeriod}'`);
    const jobUrl = getApiUrl(`/v1/records/${apiPeriod}/${encodeURIComponent(location)}/${identifier}/async`);
    
    try {
      const response = await apiFetch(jobUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`Failed to create job: HTTP ${response.status}`);
      }

      const job = await response.json();
      debugLog(`Async job created:`, job);
      
      if (!job.job_id) {
        throw new Error('Invalid job response: missing job_id');
      }

      return job.job_id;
    } catch (error) {
      logError(error, { 
        type: 'async_job_creation_failure',
        period,
        location,
        identifier
      });
      throw error;
    }
  }

  async function pollJobStatus(jobId, onProgress = null) {
    debugLog(`Polling job status for job_id: ${jobId}`);
    
    let pollCount = 0;
    const maxPolls = 100; // Maximum 5 minutes of polling (100 * 3 seconds)
    const pollInterval = 3000; // 3 seconds between polls
    
    while (pollCount < maxPolls) {
      try {
        // Check if request was aborted
        if (inFlightController && inFlightController.signal.aborted) {
          debugLog('Job polling aborted');
          throw new Error('Request aborted');
        }

        const statusUrl = getApiUrl(`/v1/jobs/${jobId}`);
        const response = await apiFetch(statusUrl);
        
        if (!response.ok) {
          throw new Error(`Failed to check job status: HTTP ${response.status}`);
        }

        const status = await response.json();
        debugLog(`Job status (poll ${pollCount + 1}):`, status);
        
        if (status.status === 'ready') {
          debugLog(`Job completed successfully:`, status);
          return status.result;
        } else if (status.status === 'error') {
          const errorMsg = status.error || 'Unknown job error';
          debugLog(`Job failed:`, errorMsg);
          throw new Error(`Job failed: ${errorMsg}`);
        } else if (status.status === 'processing' || status.status === 'pending') {
          // Job is processing or pending, call progress callback if provided
          if (onProgress) {
            onProgress(status);
          }
          
          // Wait before next poll
          await new Promise(resolve => setTimeout(resolve, pollInterval));
          pollCount++;
        } else {
          // Unknown status, wait and try again
          debugLog(`Unknown job status: ${status.status}, waiting...`);
          await new Promise(resolve => setTimeout(resolve, pollInterval));
          pollCount++;
        }
      } catch (error) {
        if (error.name === 'AbortError') {
          throw error;
        }
        
        // Log error but continue polling unless it's a critical error
        console.warn(`Job polling error (attempt ${pollCount + 1}):`, error.message);
        
        // If we've had too many consecutive errors, give up
        if (pollCount > 10) {
          throw new Error(`Job polling failed after ${pollCount} attempts: ${error.message}`);
        }
        
        // Wait before retrying
        await new Promise(resolve => setTimeout(resolve, pollInterval));
        pollCount++;
      }
    }
    
    throw new Error(`Job polling timed out after ${maxPolls} attempts (5 minutes)`);
  }

  // Main async data fetching function
  async function fetchTemperatureDataAsync(period, location, identifier, onProgress = null) {
    debugLog(`Starting async fetch for ${period} data:`, { location, identifier });
    
    try {
      // Create the async job
      const jobId = await createAsyncJob(period, location, identifier);
      
      // Poll for completion with progress updates
      const result = await pollJobStatus(jobId, onProgress);
      
      debugLog(`${period} data fetch completed successfully`);
      return result;
    } catch (error) {
      // Don't log errors for aborted requests (they're expected during navigation)
      if (error.name === 'AbortError' || error.message.includes('aborted')) {
        debugLog(`${period} data fetch aborted (likely due to navigation)`);
        throw error;
      }
      
      logError(error, { 
        type: 'async_data_fetch_failure',
        period,
        location,
        identifier
      });
      throw error;
    }
  }

  async function getCityFromCoords(lat, lon) {
    try {
      // Cancel any existing in-flight request
      if (inFlightController) {
        inFlightController.abort();
      }
      
      // Create new AbortController for this request
      inFlightController = new AbortController();
      
      // Add timeout to the OpenStreetMap API call - longer timeout for mobile
      const platform = detectDeviceAndPlatform();
      const timeoutMs = platform.isMobile ? 15000 : 10000; // 15 seconds for mobile, 10 for desktop
      
      const timeoutId = setTimeout(() => inFlightController.abort(), timeoutMs);
      
      debugLog(`Fetching location data with ${timeoutMs}ms timeout, mobile: ${platform.isMobile}`);
      
      const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}&zoom=10&addressdetails=1`, {
        signal: inFlightController.signal,
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'TempHist/1.0'
        }
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        throw new Error(`OpenStreetMap API error: ${response.status}`);
      }
      
      const data = await response.json();
      
      debugLog('OpenStreetMap address data:', data.address);
      
      // Get city name with multiple fallbacks
      const city = data.address.city || 
                  data.address.town || 
                  data.address.village || 
                  data.address.hamlet ||
                  data.address.suburb ||
                  data.address.neighbourhood;
      
      // Get state/province information with multiple fallbacks
      const state = data.address.state || 
                   data.address.province || 
                   data.address.county || 
                   data.address.region;
      
      // Get country name (prefer full name over code for better API compatibility)
      const country = data.address.country || data.address.country_code;
      
      debugLog('Location components:', { city, state, country, rawAddress: data.address });
      
      if (city && country) {
        // Build location string with state/province and country
        if (state) {
          return `${city}, ${state}, ${country}`;
        } else {
          return `${city}, ${country}`;
        }
      }
      
      // If we have city but no country, try to get country from display_name
      if (city && !country && data.display_name) {
        const displayParts = data.display_name.split(',').map(part => part.trim());
        const lastPart = displayParts[displayParts.length - 1];
        if (lastPart && lastPart !== city) {
          return `${city}, ${lastPart}`;
        }
      }
      
      // Fallback to just city name if no country info
      if (city) {
        return city;
      }
      
      // Last resort: use display_name if available
      if (data.display_name) {
        const displayParts = data.display_name.split(',').map(part => part.trim());
        if (displayParts.length >= 2) {
          return `${displayParts[0]}, ${displayParts[displayParts.length - 1]}`;
        }
        return displayParts[0];
      }
      
      // Ultimate fallback
      return 'London, England, United Kingdom';
    } catch (error) {
      if (error.name === 'AbortError') {
        debugLog('OpenStreetMap API aborted');
      } else {
        console.warn('OpenStreetMap API error:', error);
        debugLog('OpenStreetMap API error:', error.message);
      }
      throw error;
    } finally {
      // Clear the controller after request completes (success or failure)
      inFlightController = null;
    }
  }

  // Splash Screen Management - Updated to fix router issues
  function initializeSplashScreen() {
    // Check if this is a standalone page (privacy, about) - don't show splash screen
    const isStandalonePage = !document.querySelector('#todayView');
    if (isStandalonePage) {
      debugLog('Standalone page detected, skipping splash screen');
      return;
    }

    const splashScreen = document.getElementById('splashScreen');
    const appShell = document.getElementById('appShell');
    const useLocationBtn = document.getElementById('useLocationBtn');
    const chooseLocationBtn = document.getElementById('chooseLocationBtn');
    const manualLocationSection = document.getElementById('manualLocationSection');
    const locationSelect = document.getElementById('locationSelect');
    const confirmLocationBtn = document.getElementById('confirmLocationBtn');
    const backToSplashBtn = document.getElementById('backToSplashBtn');
    const locationLoading = document.getElementById('locationLoading');

    // Reset to Today page when splash screen is shown (in case user was on another page)
    debugLog('Splash screen shown, resetting to Today page');
    if (window.TempHistRouter && typeof window.TempHistRouter.navigate === 'function') {
      window.TempHistRouter.navigate('/today');
    } else {
      // Fallback: update URL
      window.location.hash = '#/today';
    }

    // Check if we already have a location (e.g., from cookie or previous session)
    // Temporarily disabled for development - uncomment the lines below to re-enable
    // const existingLocation = getLocationCookie();
    // if (existingLocation) {
    //   debugLog('Found existing location from cookie:', existingLocation);
    //   // Skip splash screen and go directly to app
    //   proceedWithLocation(existingLocation);
    //   return;
    // }

    // Show splash screen initially
    if (splashScreen) {
      splashScreen.style.display = 'flex';
    }
    if (appShell) {
      appShell.classList.add('hidden');
    }

    // Use my location button handler
    if (useLocationBtn) {
      useLocationBtn.addEventListener('click', async () => {
        await handleUseLocation();
      });
    }

    // Choose location manually button handler
    if (chooseLocationBtn) {
      chooseLocationBtn.addEventListener('click', () => {
        showManualLocationSelection();
      });
    }

    // Back to splash button handler
    if (backToSplashBtn) {
      backToSplashBtn.addEventListener('click', () => {
        hideManualLocationSelection();
      });
    }

    // Location select change handler
    if (locationSelect) {
      locationSelect.addEventListener('change', (e) => {
        const confirmBtn = document.getElementById('confirmLocationBtn');
        if (confirmBtn) {
          confirmBtn.disabled = !e.target.value;
        }
      });
    }

    // Confirm location button handler
    if (confirmLocationBtn) {
      confirmLocationBtn.addEventListener('click', async () => {
        const selectedLocation = locationSelect.value;
        if (selectedLocation) {
          await handleManualLocationSelection(selectedLocation);
        }
      });
    }
  }

  async function handleUseLocationFromMainApp() {
    // Get location text element - try different possible IDs
    let locationTextElement = document.getElementById('locationText') || 
                             document.getElementById('weekLocationText') || 
                             document.getElementById('monthLocationText') || 
                             document.getElementById('yearLocationText');
    
    // Show loading state inline next to the location
    if (locationTextElement) {
      const originalContent = locationTextElement.innerHTML;
      locationTextElement.innerHTML = `${originalContent.replace(/<a[^>]*>.*?<\/a>/, '')} <span class="location-detecting">Detecting your location...</span>`;
    }
    
    try {
      // Try geolocation first
      const location = await detectUserLocationWithGeolocation();
      if (location) {
        await proceedWithLocation(location, true, 'detected'); // Mark as detected location
        return;
      }
    } catch (error) {
      // Only log geolocation errors if IP fallback also fails
      debugLog('Geolocation failed:', error);
    }

    // If geolocation fails, try IP-based fallback
    try {
      const location = await getLocationFromIP();
      if (location) {
        await proceedWithLocation(location, true, 'detected'); // Mark as detected location
        return;
      }
    } catch (error) {
      console.warn('IP-based location failed:', error);
    }

    // If both fail, show error message inline
    if (locationTextElement) {
      const cityName = getDisplayCity(window.tempLocation);
      locationTextElement.innerHTML = `${cityName} <a href="#" id="useActualLocationLink" class="location-link">Use my actual location</a> <span class="location-error">Unable to detect location</span>`;
      // Add classes based on location source
      locationTextElement.className = `location-text location-${window.tempLocationSource || 'unknown'}`;
      
      // Re-add click handler
      const useActualLocationLink = document.getElementById('useActualLocationLink');
      if (useActualLocationLink) {
        useActualLocationLink.addEventListener('click', async (e) => {
          e.preventDefault();
          await handleUseLocationFromMainApp();
        });
      }
    }
  }

  async function handleUseLocation() {
    const splashScreen = document.getElementById('splashScreen');
    const locationLoading = document.getElementById('locationLoading');
    const splashActions = document.querySelector('.splash-actions');
    const manualLocationSection = document.getElementById('manualLocationSection');

    // Show loading state
    if (splashActions) splashActions.style.display = 'none';
    if (manualLocationSection) manualLocationSection.style.display = 'none';
    if (locationLoading) locationLoading.style.display = 'flex';

    try {
      // Try geolocation first
      const location = await detectUserLocationWithGeolocation();
      if (location) {
        await proceedWithLocation(location, true, 'detected'); // Mark as detected location
        return;
      }
    } catch (error) {
      console.warn('Geolocation failed:', error);
    }

    // If geolocation fails, try IP-based fallback
    try {
      const ipLocation = await getLocationFromIP();
      if (ipLocation) {
        // Auto-select the IP-based location and proceed
        await proceedWithLocation(ipLocation, true, 'detected'); // Mark as detected location
        return;
      }
    } catch (error) {
      console.warn('IP-based location failed:', error);
    }

    // If both fail, show manual selection
    showManualLocationSelection();
  }

  async function detectUserLocationWithGeolocation() {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error('Geolocation not supported'));
        return;
      }

      const platform = detectDeviceAndPlatform();
      const timeout = platform.isMobile ? 20000 : 25000;

      navigator.geolocation.getCurrentPosition(
        async (position) => {
          try {
            const { latitude, longitude } = position.coords;
            const location = await getCityFromCoords(latitude, longitude);
            resolve(location);
          } catch (error) {
            reject(error);
          }
        },
        (error) => {
          reject(error);
        },
        {
          enableHighAccuracy: false,
          timeout: timeout,
          maximumAge: 300000
        }
      );
    });
  }

  async function getLocationFromIP() {
    try {
      const response = await fetch('https://ipapi.co/json/');
      if (!response.ok) throw new Error('IP lookup failed');
      
      const data = await response.json();
      if (data.city && data.country_name) {
        return `${data.city}, ${data.country_name}`;
      }
      return null;
    } catch (error) {
      console.warn('IP-based location lookup failed:', error);
      return null;
    }
  }

  async function showManualLocationSelection() {
    debugLog('showManualLocationSelection called');
    const splashActions = document.querySelector('.splash-actions');
    const manualLocationSection = document.getElementById('manualLocationSection');
    const locationLoading = document.getElementById('locationLoading');
    const locationSelect = document.getElementById('locationSelect');

    debugLog('Elements found:', {
      splashActions: !!splashActions,
      manualLocationSection: !!manualLocationSection,
      locationLoading: !!locationLoading,
      locationSelect: !!locationSelect
    });

    // Hide loading and main actions
    if (locationLoading) locationLoading.style.display = 'none';
    if (splashActions) splashActions.style.display = 'none';

    debugLog('Hiding splash actions, showing manual section');

    // Load preapproved locations (with built-in fallback)
    try {
      const locations = await loadPreapprovedLocations();
      debugLog('Loaded locations:', locations);
      populateLocationDropdown(locations);
    } catch (error) {
      debugLog('Error loading locations:', error);
    }

    // Show manual selection
    if (manualLocationSection) {
      manualLocationSection.style.display = 'block';
      debugLog('Manual location section shown');
    }
  }

  function hideManualLocationSelection() {
    const splashActions = document.querySelector('.splash-actions');
    const manualLocationSection = document.getElementById('manualLocationSection');

    if (manualLocationSection) manualLocationSection.style.display = 'none';
    if (splashActions) splashActions.style.display = 'flex';
  }

  async function loadPreapprovedLocations() {
    try {
      const response = await apiFetch(getApiUrl('/v1/locations/preapproved'));
      if (!response.ok) throw new Error('Failed to fetch locations');
      
      const data = await response.json();
      return data.locations || [];
    } catch (error) {
      console.warn('Preapproved locations API failed:', error);
      // Return fallback locations instead of throwing
      return getFallbackLocations();
    }
  }

  function getFallbackLocations() {
    return [
      'London, England, United Kingdom',
      'New York, New York, United States',
      'Paris, France',
      'Tokyo, Japan',
      'Sydney, New South Wales, Australia',
      'Toronto, Ontario, Canada',
      'Berlin, Germany',
      'Madrid, Spain',
      'Rome, Italy',
      'Amsterdam, Netherlands',
      'Vancouver, British Columbia, Canada',
      'Melbourne, Victoria, Australia',
      'Dublin, Ireland',
      'Stockholm, Sweden',
      'Copenhagen, Denmark',
      'Zurich, Switzerland',
      'Vienna, Austria',
      'Brussels, Belgium',
      'Oslo, Norway',
      'Helsinki, Finland'
    ];
  }

  function populateLocationDropdown(locations) {
    const locationSelect = document.getElementById('locationSelect');
    if (!locationSelect) return;

    // Clear existing options
    locationSelect.innerHTML = '';

    // Add default option
    const defaultOption = document.createElement('option');
    defaultOption.value = '';
    defaultOption.textContent = 'Select a location...';
    locationSelect.appendChild(defaultOption);

    // Add location options
    locations.forEach(location => {
      const option = document.createElement('option');
      
      // Handle both API objects and fallback strings
      if (typeof location === 'object' && location.name) {
        // API location object - display just city name, but store full location for API
        const displayName = location.name;
        const apiString = `${location.name}${location.admin1 ? ', ' + location.admin1 : ''}, ${location.country_name}`;
        
        option.value = apiString;
        option.textContent = displayName;
      } else {
        // Fallback string location - extract city name for display
        const cityName = location.split(',')[0].trim();
        option.value = location;
        option.textContent = cityName;
      }
      
      locationSelect.appendChild(option);
    });
  }

  async function handleManualLocationSelection(selectedLocation) {
    debugLog('Manual location selected:', selectedLocation);
    await proceedWithLocation(selectedLocation, false, 'manual'); // Mark as manual selection
  }

  async function proceedWithLocation(location, isDetectedLocation = false, locationSource = 'unknown') {
    debugLog('Proceeding with location:', location, 'isDetectedLocation:', isDetectedLocation, 'source:', locationSource);
    
    // Set the global location
    window.tempLocation = location;
    window.tempLocationIsDetected = isDetectedLocation; // Track if this was actually detected
    window.tempLocationSource = locationSource; // Track the source: 'detected', 'manual', 'default'
    debugLog('Set window.tempLocation to:', window.tempLocation);

    // Store in cookie for future visits
    setLocationCookie(location);

    // Hide splash screen and show app
    const splashScreen = document.getElementById('splashScreen');
    const appShell = document.getElementById('appShell');

    if (splashScreen) {
      splashScreen.style.display = 'none';
    }

    if (appShell) {
      // Show the app shell (it should maintain its CSS grid layout)
      debugLog('Before showing app shell:', {
        classList: appShell.classList.toString(),
        style: appShell.style.cssText,
        computedDisplay: window.getComputedStyle(appShell).display
      });
      appShell.classList.remove('hidden');
      appShell.style.display = 'grid'; // Explicitly set to grid
      debugLog('After showing app shell:', {
        classList: appShell.classList.toString(),
        style: appShell.style.cssText,
        computedDisplay: window.getComputedStyle(appShell).display
      });
    }

    // Always navigate to Today page when location is selected
    debugLog('Navigating to Today page after location selection');
    if (window.TempHistRouter && typeof window.TempHistRouter.navigate === 'function') {
      window.TempHistRouter.navigate('/today');
    } else {
      // Fallback: update URL and trigger route handling
      window.location.hash = '#/today';
    }

    // Initialize the main app
    window.mainAppLogic();
  };

  // Move your main code into a function:
  function startAppWithFirebaseUser(user) {
    // Initialize analytics reporting
    setupAnalyticsReporting();
    
    // Initialize splash screen functionality
    initializeSplashScreen();
    
    // SECURITY NOTE: Manual location input is now controlled via splash screen.
    // Users can choose to use their location or select from preapproved locations.

    // Device detection functions moved to global scope

  debugLog('Script starting...');

  // Store the Firebase user for use in apiFetch
  let currentUser = user;
  window.currentUser = currentUser; // Make it globally available

  // Functions moved to global scope

  // Make mainAppLogic globally available
  window.mainAppLogic = function() {
    // Check if this is a standalone page (privacy, about) - don't run main app logic
    const isStandalonePage = !document.querySelector('#todayView');
    if (isStandalonePage) {
      debugLog('Standalone page detected, skipping main app logic');
      return;
    }
    
    debugLog('mainAppLogic called with window.tempLocation:', window.tempLocation);

    // Wait for Chart.js to be available
    if (typeof Chart === 'undefined') {
      console.error('Chart.js not loaded');
      return;
    }

    Chart.register(window['chartjs-plugin-annotation']);

    debugLog('Constants initialized');
    


    const now = new Date();
    const useYesterday = now.getHours() < 1;
    const dateToUse = new Date(now);

    debugLog('Date calculations complete:', { now, useYesterday, dateToUse });

    if (useYesterday) {
      dateToUse.setDate(dateToUse.getDate() - 1);
      debugLog('Using yesterday\'s date');
    }
    
    // Update loading message for date stage
    updateLoadingMessageByStage('date');

    // Handle 29 Feb fallback to 28 Feb if not a leap year in comparison range
    const isLeapDay = dateToUse.getDate() === 29 && dateToUse.getMonth() === 1;

    if (isLeapDay) {
      dateToUse.setDate(28);
      updateDataNotice('29th February detected — comparing 28th Feb instead for consistency.');
      debugLog('Leap day detected, using 28th Feb instead');
    }

    const day = String(dateToUse.getDate()).padStart(2, '0');
    const month = String(dateToUse.getMonth() + 1).padStart(2, '0');
    const currentYear = dateToUse.getFullYear();

    debugLog('Date components prepared:', { day, month, currentYear });

    const startYear = currentYear - 50;
    const loadingEl = document.getElementById('loading');
    const canvasEl = document.getElementById('tempChart');
    
    // Clean up any existing chart on the main canvas before starting
    if (canvasEl) {
      const existingChart = Chart.getChart(canvasEl);
      if (existingChart) {
        debugLog('Destroying existing chart before creating new one');
        existingChart.destroy();
      }
    }
    const barColour = '#ff6b6b';
    const thisYearColour = '#51cf66';
    const showTrend = true;
    const trendColour = '#aaaa00';
    const avgColour = '#4dabf7';

    // whether or not to show the chart
    let chart;

    const friendlyDate = `${getOrdinal(Number(day))} ${new Date().toLocaleString('en-GB', { month: 'long' })}`;

    // display the date
    document.getElementById('dateText').textContent = friendlyDate;
    
    // Show initial status message
    updateDataNotice('Determining your location...', { type: 'neutral' });
    
    // Add a simple progress indicator for location detection
    let locationProgressInterval;
    function startLocationProgress() {
      let dots = 0;
      locationProgressInterval = setInterval(() => {
        dots = (dots + 1) % 4;
        const progressText = 'Determining your location' + '.'.repeat(dots);
        updateDataNotice(progressText, { type: 'neutral' });
      }, 500);
    }
    
    // Function to update loading message based on current stage
    function updateLoadingMessage(stage) {
      const loadingText = document.getElementById('loadingText');
      if (!loadingText) return;
      
      switch(stage) {
        case 'date':
          loadingText.textContent = 'Determining date...';
          break;
        case 'location':
          loadingText.textContent = 'Determining your location...';
          break;
        case 'permission':
          loadingText.textContent = 'Requesting location permission...';
          break;
        case 'fetching':
          loadingText.textContent = 'Loading temperature data...';
          break;
        default:
          loadingText.textContent = '';
      }
    }
    
    function stopLocationProgress() {
      if (locationProgressInterval) {
        clearInterval(locationProgressInterval);
        locationProgressInterval = null;
      }
    }

    // Apply colors to text elements
    function applyTextColors() {
      // Text colors
      const summaryText = document.getElementById('summaryText');
      const avgText = document.getElementById('avgText');
      const trendText = document.getElementById('trendText');
      const header = document.getElementById('header');
      const spinner = document.querySelector('.spinner');
      
      // Apply colors only if elements exist
      if (summaryText) summaryText.classList.add('summary-text');
      if (avgText) avgText.classList.add('avg-text');
      if (trendText) trendText.classList.add('trend-text');
      
      // Header colors
      if (header) header.style.color = barColour;
      
      // Spinner colors
      if (spinner) {
        spinner.style.borderColor = `${barColour}33`; // 20% opacity
        spinner.style.borderTopColor = barColour;
      }
    }

    // Apply colors when the page loads
    applyTextColors();

    // Ensure loading state is hidden initially
    loadingEl.classList.add('hidden');
    loadingEl.classList.remove('visible');

    debugLog('DOM elements and variables initialized');

    // Add loading state management
    let loadingStartTime = null;
    let loadingCheckInterval = null;

    function updateLoadingMessage() {
      if (!loadingStartTime) return;
      
      const elapsedSeconds = Math.floor((Date.now() - loadingStartTime) / 1000);
      const loadingText = document.getElementById('loadingText');
      
      if (elapsedSeconds < 5) {
        loadingText.textContent = 'Connecting to the temperature data server...';
      } else if (elapsedSeconds < 15) {
        loadingText.textContent = 'Getting temperature data for '+friendlyDate+' over the past 50 years...';
      } else if (elapsedSeconds < 30) {
        const displayCity = window.tempLocation ? getDisplayCity(window.tempLocation) : 'your location';
        loadingText.textContent = 'Analysing historical data for '+displayCity+'...';
      } else if (elapsedSeconds < 45) {
        loadingText.textContent = 'Generating temperature comparison chart...';
      } else if (elapsedSeconds < 60) {
        loadingText.textContent = 'Almost done! Finalising the results...';
      } else if (elapsedSeconds < 90) {
        loadingText.textContent = 'This is taking longer than usual. Please wait...';
      } else {
        loadingText.textContent = 'The data processing is taking a while. This may be due to high server load.';
      }
    }
    
    // Function to update loading message based on current stage (for initial stages)
    function updateLoadingMessageByStage(stage) {
      const loadingText = document.getElementById('loadingText');
      if (!loadingText) return;
      
      switch(stage) {
        case 'date':
          loadingText.textContent = 'Determining the date...';
          break;
        case 'location':
          loadingText.textContent = 'Determining your location...';
          break;
        case 'permission':
          loadingText.textContent = 'Requesting location permission...';
          break;
        case 'fetching':
          loadingText.textContent = 'Loading temperature data...';
          break;
        default:
          loadingText.textContent = '';
      }
    }

    // Show initial loading state (only after date and location are known)
    function showInitialLoadingState() {
      loadingStartTime = Date.now();
      loadingCheckInterval = setInterval(updateLoadingMessage, 1000);

      loadingEl.classList.add('visible');
      loadingEl.classList.remove('hidden');

      canvasEl.classList.remove('visible');
      canvasEl.classList.add('hidden');
      
      // Update loading message for fetching stage
      updateLoadingMessageByStage('fetching');
      
      // Loading area is now visible - user can scroll naturally
    }

    // Use global tempLocation - it should be set by splash screen or cookie
    // If not set, use default (this should only happen in error cases)
    if (!window.tempLocation) {
      window.tempLocation = 'London, England, United Kingdom';
    }

    // Helper function to handle API URLs with proper encoding
    function getApiUrl(path) {
      // Use the global getApiUrl function for consistency
      return window.getApiUrl(path);
    }

    // Helper function to get just the city name (first location component)
    function getDisplayCity(fullLocation) {
      if (!fullLocation) return fullLocation;
      
      // Decode URL-encoded location first
      const decodedLocation = decodeURIComponent(fullLocation);
      
      // Split by commas and get the first part (city)
      const parts = decodedLocation.split(',').map(part => part.trim());
      return parts[0];
    }

    // Helper function to build record API paths
    function getRecordPath(period, location, identifier) {
      return `/v1/records/${period}/${encodeURIComponent(location)}/${identifier}`;
    }

    // Idle-callback (safe) for background work
    const ric = window.requestIdleCallback || function (cb) {
      return setTimeout(() => cb({ timeRemaining: () => 0, didTimeout: true }), 150);
    };

    // Build rolling-bundle path with query
    function getRollingBundlePath(location, anchorISO, qs = '', pathElement = '') {
      const encodedLocation = encodeURIComponent(location);
      const base = `/v1/records/rolling-bundle/${encodedLocation}/${anchorISO}`;
      const path = pathElement ? `${base}/${pathElement}` : base;
      return qs ? `${path}?${qs}` : path;
    }

    // Format MM-DD for "yesterday/previous" given a base Date
    function mmddFrom(anchorDate, offsetDays = 0) {
      const d = new Date(anchorDate);
      d.setDate(d.getDate() - offsetDays);
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${m}-${day}`;
    }

    // getCityFromCoords function moved to global scope

    // Cookie functions moved to top of file

    // Utility functions for error UI
    function showError(message) {
      const errorContainer = document.getElementById('errorContainer');
      const errorMessage = document.getElementById('errorMessage');
      if (!errorContainer || !errorMessage) {
        console.warn('Error UI elements not found in DOM when showError called');
        return;
      }
      
      const loadingEl = document.getElementById('loading');
      if (loadingEl) {
        loadingEl.classList.add('hidden');
        loadingEl.classList.remove('visible');
      }
      
      const tempChart = document.getElementById('tempChart');
      if (tempChart) {
        tempChart.classList.remove('visible');
        tempChart.classList.add('hidden');
      }
      
      errorMessage.textContent = message;
      errorContainer.style.display = 'block';
    }

    function hideError() {
      const errorContainer = document.getElementById('errorContainer');
      if (errorContainer) {
        errorContainer.style.display = 'none';
        const errorMessage = document.getElementById('errorMessage');
        if (errorMessage) {
          errorMessage.textContent = '';
        }
      }
    }

    // Prefetch scheduler for background data loading
    function schedulePrefetchAfterDaily(location, anchorDateISO, unitGroup = 'celsius', monthMode = 'rolling1m') {
      // Don't run prefetch on standalone pages
      if (window.location.pathname.includes('/about') || window.location.pathname.includes('/privacy')) {
        debugLog('Prefetch: Skipping on standalone page');
        return;
      }
      
      const prefetchStartTime = Date.now();
      debugLog('Prefetch: Starting background data loading for', location);

      // Prefetch using individual endpoints (more reliable than bundle)
      const bundlePrefetchPromise = (async () => {
        try {
          // Check if we have a valid user and location before making the request
          if (!currentUser || !location) {
            debugLog('Prefetch: Skipping - no user or location');
            return;
          }
          
          // Check API health before prefetching
          debugLog('Prefetch: Checking API health before prefetching period data');
          const isApiHealthy = await Promise.race([
            checkApiHealth(),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Health check timeout')), 5000))
          ]).catch(() => {
            debugLog('Prefetch: Health check failed or timed out, skipping prefetch');
            return false;
          });
          
          if (!isApiHealthy) {
            debugLog('Prefetch: API is not healthy, skipping period data prefetch');
            return;
          }
          
          debugLog('Prefetch: API is healthy, proceeding with period data prefetch');
          
          debugLog('Prefetch: Starting period data prefetch');
          const periodStartTime = Date.now();
          const idToken = await currentUser.getIdToken();
          const headers = {
            'Authorization': `Bearer ${idToken}`,
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          };
          
          // Format dates correctly for each endpoint type
          const anchorDate = new Date(anchorDateISO);
          const mmdd = mmddFrom(anchorDate, 0); // MM-DD format for weekly/monthly
          
          debugLog('Prefetch: Period data IDs prepared', { anchorDateISO, mmdd });
          
          // Create a separate AbortController for prefetch operations
          if (prefetchController) {
            prefetchController.abort();
          }
          prefetchController = new AbortController();
          
          // Fetch all three endpoints using async jobs in parallel for better performance
          debugLog('Prefetch: Fetching weekly, monthly, yearly data using async jobs in parallel');
          const fetchStartTime = Date.now();
          
          // Individual endpoint timing
          const weeklyStart = Date.now();
          const monthlyStart = Date.now();
          const yearlyStart = Date.now();
          
          // Progress callbacks for each period
          const weeklyProgress = (status) => {
            debugLog('Prefetch: Weekly job progress:', status);
          };
          const monthlyProgress = (status) => {
            debugLog('Prefetch: Monthly job progress:', status);
          };
          const yearlyProgress = (status) => {
            debugLog('Prefetch: Yearly job progress:', status);
          };
          
          const [weeklyData, monthlyData, yearlyData] = await Promise.allSettled([
            fetchTemperatureDataAsync('week', location, mmdd, weeklyProgress).then(jobResult => {
              debugLog('Prefetch: Weekly async job completed in', Date.now() - weeklyStart, 'ms');
              return jobResult.data; // Extract data from job result
            }),
            fetchTemperatureDataAsync('month', location, mmdd, monthlyProgress).then(jobResult => {
              debugLog('Prefetch: Monthly async job completed in', Date.now() - monthlyStart, 'ms');
              return jobResult.data; // Extract data from job result
            }),
            fetchTemperatureDataAsync('year', location, mmdd, yearlyProgress).then(jobResult => {
              debugLog('Prefetch: Yearly async job completed in', Date.now() - yearlyStart, 'ms');
              return jobResult.data; // Extract data from job result
            })
          ]);
          const fetchEndTime = Date.now();
          debugLog('Prefetch: Parallel async jobs completed in', fetchEndTime - fetchStartTime, 'ms');
          
          // Process weekly data
          if (weeklyData.status === 'fulfilled') {
            TempHist.cache.prefetch.week = weeklyData.value;
            debugLog('Prefetch: Weekly data cached successfully');
          } else {
            const isAborted = weeklyData.reason?.name === 'AbortError' || weeklyData.reason?.message?.includes('aborted');
            if (isAborted) {
              debugLog('Prefetch: Weekly data aborted (likely due to navigation)');
            } else {
              debugLog('Prefetch: Weekly data failed', weeklyData.status, weeklyData.reason?.message);
            }
          }
          
          // Process monthly data
          if (monthlyData.status === 'fulfilled') {
            TempHist.cache.prefetch.month = monthlyData.value;
            debugLog('Prefetch: Monthly data cached successfully');
          } else {
            const isAborted = monthlyData.reason?.name === 'AbortError' || monthlyData.reason?.message?.includes('aborted');
            if (isAborted) {
              debugLog('Prefetch: Monthly data aborted (likely due to navigation)');
            } else {
              debugLog('Prefetch: Monthly data failed', monthlyData.status, monthlyData.reason?.message);
            }
          }
          
          // Process yearly data
          if (yearlyData.status === 'fulfilled') {
            TempHist.cache.prefetch.year = yearlyData.value;
            debugLog('Prefetch: Yearly data cached successfully');
          } else {
            const isAborted = yearlyData.reason?.name === 'AbortError' || yearlyData.reason?.message?.includes('aborted');
            if (isAborted) {
              debugLog('Prefetch: Yearly data aborted (likely due to navigation)');
            } else {
              debugLog('Prefetch: Yearly data failed', yearlyData.status, yearlyData.reason?.message);
            }
          }
          
          const periodEndTime = Date.now();
          debugLog('Prefetch: Period data prefetch completed in', periodEndTime - periodStartTime, 'ms');
        } catch (e) {
          debugLog('Prefetch: Period data prefetch error', e.message);
        }
      })();
      
      // Store the promise so other parts can wait for it
      TempHist.cache.prefetchPromise = bundlePrefetchPromise;
      
      debugLog('Prefetch: Stored prefetch promise, scheduling execution');
      ric(() => {
        bundlePrefetchPromise.then(() => {
          const totalTime = Date.now() - prefetchStartTime;
          debugLog('Prefetch: Total prefetch operation completed in', totalTime, 'ms');
        }).catch(() => {
          const totalTime = Date.now() - prefetchStartTime;
          debugLog('Prefetch: Total prefetch operation failed after', totalTime, 'ms');
        });
        return bundlePrefetchPromise;
      });
    }

    // Retry mechanism for API calls
    async function fetchWithRetry(url, maxRetries = 3, delay = 1000) {
      TempHist.analytics.apiCalls++;
      
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          const response = await apiFetch(url);
          return response;
        } catch (error) {
          if (attempt === maxRetries) {
            TempHist.analytics.apiFailures++;
            logError(error, { 
              url, 
              attempt, 
              maxRetries, 
              type: 'api_final_failure' 
            });
            throw error; // Final attempt failed
          }
          
          TempHist.analytics.retryAttempts++;
          logError(error, { 
            url, 
            attempt, 
            maxRetries, 
            type: 'api_retry' 
          });
          
          // Wait before retrying (exponential backoff)
          const retryDelay = delay * Math.pow(2, attempt - 1);
          await new Promise(resolve => setTimeout(resolve, retryDelay));
          
          // Update loading message for retry
          const loadingText = document.getElementById('loadingText');
          if (loadingText) {
            loadingText.textContent = `Retrying... (attempt ${attempt + 1}/${maxRetries})`;
          }
        }
      }
    }

    // Modified fetchHistoricalData function to use async jobs
    const fetchHistoricalData = async () => {
      debugTime('Total fetch time');
      
      // Cancel any existing in-flight requests
      if (inFlightController) {
        inFlightController.abort();
        inFlightController = null;
      }
      
      showInitialLoadingState();
      hideError();

      try {
        // Check temperature data server health first (with timeout)
        const isApiHealthy = await Promise.race([
          checkApiHealth(),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Health check timeout')), 5000))
        ]).catch(() => {
          console.warn('Health check failed or timed out, proceeding anyway...');
          return true; // Proceed anyway if health check fails
        });
        
        if (!isApiHealthy) {
          console.warn('API health check failed, but proceeding with data fetch...');
        }

        // Fetch weather data using async jobs
        const weatherPath = getRecordPath('daily', window.tempLocation, `${month}-${day}`);
        const identifier = `${month}-${day}`;
        
        // Progress callback for async job
        const onProgress = (status) => {
          debugLog('Daily data job progress:', status);
          // Update loading message with job progress if available
          const loadingText = document.getElementById('loadingText');
          if (loadingText) {
            if (status.message) {
              loadingText.textContent = status.message;
            } else if (status.status === 'pending') {
              loadingText.textContent = 'Job queued, waiting to start processing...';
            } else if (status.status === 'processing') {
              loadingText.textContent = 'Processing temperature data...';
            }
          }
        };

        debugLog('Starting async daily data fetch...');
        const jobResult = await fetchTemperatureDataAsync('daily', window.tempLocation, identifier, onProgress);
        
        // Extract the data from the job result
        const weatherData = jobResult.data;
        debugLog('Job result structure:', jobResult);
        debugLog('Extracted weather data:', weatherData);
        
        // The new v1/records API structure - temperature data is in 'values' array
        if (!weatherData || !weatherData.values || !Array.isArray(weatherData.values)) {
          throw new Error('Invalid data format received. Expected values array.');
        }

        // Extract all data directly from the single response
        const temperatureData = weatherData.values;
        const averageData = { temp: weatherData.average.mean };
        const trendData = weatherData.trend;
        const summaryData = weatherData.summary;

        // Update the chart with the weather data
        // API returns data in {year, temperature} format, transform to {x: temperature, y: year} for horizontal bars
        const chartData = temperatureData.map(point => ({ x: point.temperature, y: point.year }));
        
        debugLog('Raw weather data:', temperatureData);
        debugLog('Chart data:', chartData);
        debugLog('Data structure:', {
          'Expected format': 'x: temperature, y: year',
          'Sample point': chartData[0],
          'Temperature values (p.x)': chartData.map(p => p.x),
          'Year values (p.y)': chartData.map(p => p.y)
        });
        
        
        // Create or update chart
        if (!chart) {
          debugTime('Chart initialization');
          const ctx = document.getElementById('tempChart').getContext('2d');
          
          // Calculate available height for bars
          const numBars = currentYear - startYear + 1;
          const targetBarHeight = 3;
          const totalBarHeight = numBars * targetBarHeight;
          const containerEl = canvasEl.parentElement;
          const containerHeight = containerEl.clientHeight;
          const availableHeight = containerHeight - 40;
          
          // Calculate temperature range
          const temps = chartData.map(p => p.x); // p.x is temperature in {x: temperature, y: year}
          const minTemp = Math.floor(Math.min(...temps) - 1);
          const maxTemp = Math.ceil(Math.max(...temps) + 1);
          
          debugLog('Temperature range calculation:', {
            temps,
            minTemp,
            maxTemp,
            chartDataLength: chartData.length,
            'data structure': 'x: temperature, y: year (API format)',
            'sample temps': temps.slice(0, 5),
            'sample years': chartData.map(p => p.y).slice(0, 5)
          });
          
          debugLog('Initial chart setup:', {
            windowWidth: window.innerWidth,
            targetBarHeight,
            numBars,
            totalBarHeight,
            containerHeight,
            availableHeight,
            canvasHeight: canvasEl.clientHeight,
            minTemp,
            maxTemp
          });

          // Destroy existing chart if it exists
          if (chart) {
            chart.destroy();
          }

          chart = new Chart(ctx, {
            type: 'bar',
            data: {
              datasets: [
                {
                  label: 'Trend',
                  type: 'line',
                  data: [],
                  backgroundColor: trendColour,
                  borderColor: trendColour,
                  fill: false,
                  pointRadius: 0,
                  borderWidth: 2,
                  opacity: 1,
                  hidden: !showTrend
                },
                {
                  label: `Temperature in ${getDisplayCity(window.tempLocation)} on ${friendlyDate}`,
                  type: 'bar',
                  data: chartData,
                  backgroundColor: chartData.map(point => 
                    point.y === currentYear ? thisYearColour : barColour
                  ),
                  borderWidth: 0,
                  base: minTemp
                }
              ]
            },
            options: {
              indexAxis: 'y',
              responsive: true,
              maintainAspectRatio: false,
              parsing: false,         // we feed {x,y} directly
              animation: false,       // instant updates
              normalized: true,       // faster parsing if large arrays
              layout: {
                padding: {
                  left: 0,
                  right: 20,
                  top: 15,
                  bottom: 15
                }
              },
              plugins: {
                legend: { display: false },
                annotation: {
                  annotations: {
                    averageLine: {
                      type: 'line',
                      yMin: startYear - 1,
                      yMax: currentYear + 1,
                      xMin: averageData.temp,
                      xMax: averageData.temp,
                      borderColor: avgColour,
                      borderWidth: 2,
                      label: {
                        display: true,
                        content: `Average: ${averageData.temp.toFixed(1)}°C`,
                        position: 'start',
                        font: {
                          size: 12
                        }
                      }
                    }
                  }
                },
                tooltip: {
                  callbacks: {
                    title: function(context) {
                      return `${context[0].parsed.y.toString()}: ${context[0].parsed.x}°C`
                    },
                    label: function() {
                      return ''
                    }
                  }
                }
              },
              scales: {
                x: {
                  type: 'linear',
                  title: {
                    display: true,
                    text: 'Temperature (°C)',
                    font: {
                      size: 12
                    },
                    color: '#ECECEC'
                  },
                  min: minTemp,
                  max: maxTemp,
                  ticks: {
                    font: {
                      size: 11
                    },
                    color: '#ECECEC',
                    stepSize: 2,
                    callback: function(value) {
                      //debugLog('X-axis tick callback:', value);
                      return value; // Show all temperature values
                    }
                  }
                },
                y: {
                  type: 'linear',
                  min: startYear,
                  max: currentYear,
                  ticks: {
                    maxTicksLimit: 20,
                    callback: val => val.toString(),
                    font: {
                      size: 11
                    },
                    color: '#ECECEC'
                  },
                  title: {
                    display: false,
                    text: 'Year'
                  },
                  grid: {
                    display: false
                  },
                  offset: true
                }
              },
              elements: {
                bar: {
                  minBarLength: 30,
                  maxBarThickness: 30,
                  categoryPercentage: 0.1,
                  barPercentage: 1.0
                }
              }
            }
          });
          
          debugTimeEnd('Chart initialization');
        } else {
          // Update existing chart
          const temps = chartData.map(p => p.x); // p.x is temperature in {x: temperature, y: year}
          const minTemp = Math.floor(Math.min(...temps) - 1);
          const maxTemp = Math.ceil(Math.max(...temps) + 1);
          
          chart.data.datasets[1].data = chartData;
          chart.data.datasets[1].backgroundColor = chartData.map(point => 
            point.y === currentYear ? thisYearColour : barColour // point.y is year in {x: temperature, y: year}
          );
          chart.data.datasets[1].base = minTemp;

          // Update x-axis range (temperature axis)
          chart.options.scales.x.min = minTemp;
          chart.options.scales.x.max = maxTemp;
        }

        // Update trend line if enabled
        if (showTrend && chart) {
          // chartData is now {x: temperature, y: year} (after transformation), but calculateTrendLine expects {x: year, y: temperature}
          const trendData = calculateTrendLine(chartData.map(d => ({ x: d.y, y: d.x })), 
            startYear - 0.5, currentYear + 0.5);
          chart.data.datasets[0].data = trendData.points.map(p => ({ x: p.y, y: p.x }));
        }

        // Update text elements with new API data
        document.getElementById('summaryText').textContent = summaryData || 'No summary available.';
        document.getElementById('avgText').textContent = `Average: ${averageData.temp.toFixed(1)}°C`;
        
        if (trendData) {
          // Use actual slope value for direction determination, not rounded display value
          const direction = Math.abs(trendData.slope) < 0.05 ? 'stable' : 
                           trendData.slope > 0 ? 'rising' : 'falling';
          const formatted = `Trend: ${direction} at ${Math.abs(trendData.slope).toFixed(1)} ${trendData.unit}`;
          document.getElementById('trendText').textContent = formatted;
        }

        // Show the chart
        showChart();
        chart.update('none');

        // Schedule background prefetching after daily chart renders successfully
        const anchorISO = `${currentYear}-${month}-${day}`; // e.g. "2025-09-24"
        schedulePrefetchAfterDaily(window.tempLocation, anchorISO, 'celsius', 'rolling1m');
        
        // Send analytics after successful data load
        sendAnalytics();

      } catch (error) {
        // Don't show error if request was aborted
        if (error.name === 'AbortError') {
          return;
        }
        
        logError(error, { 
          type: 'data_fetch_failure',
          location: window.tempLocation,
          date: `${month}-${day}`
        });
        
        console.error('Error fetching historical data:', error);
        hideChart();
        
        // Provide more specific error messages based on the error type
        let errorMessage = 'Sorry, there was a problem processing the temperature data. Please try again later.';
        
        if (error.message.includes('Job failed')) {
          errorMessage = 'The data processing job failed. This may be due to server issues. Please try again later.';
        } else if (error.message.includes('Job polling timed out')) {
          errorMessage = 'The data processing is taking longer than expected. Please try again later.';
        } else if (error.message.includes('Request aborted')) {
          errorMessage = 'The request was cancelled. Please try again.';
        } else if (error.message.includes('Failed to create job')) {
          errorMessage = 'Unable to start data processing. Please check your connection and try again.';
        }
        
        showError(errorMessage);
      }

      debugTimeEnd('Total fetch time');
    };

    // Location is now handled by the splash screen flow
    // The main app logic will be called after location is selected
    debugLog('Main app logic initialized, waiting for location selection');
    
    // If we already have a location (from splash screen), proceed with data fetching
    if (window.tempLocation) {
      displayLocationAndFetchData();
    }

    function calculateTrendLine(points, startX, endX) {
      const n = points.length;
      const sumX = points.reduce((sum, p) => sum + p.x, 0);
      const sumY = points.reduce((sum, p) => sum + p.y, 0);
      const sumXY = points.reduce((sum, p) => sum + p.x * p.y, 0);
      const sumXX = points.reduce((sum, p) => sum + p.x * p.x, 0);

      const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
      const intercept = (sumY - slope * sumX) / n;

      return {
        points: [
          { x: startX, y: slope * startX + intercept },
          { x: endX, y: slope * endX + intercept }
        ],
        slope
      };
    }

    // Make calculateTrendLine globally available for period views
    window.calculateTrendLine = calculateTrendLine;

    function getOrdinal(n) {
      const s = ["th", "st", "nd", "rd"];
      const v = n % 100;
      return n + (s[(v - 20) % 10] || s[v] || s[0]);
    }

    function displayLocationAndFetchData() {
      stopLocationProgress();
      
      debugLog('displayLocationAndFetchData called with window.tempLocation:', window.tempLocation);
      
      // Check if using the hardcoded default fallback location
      const isDefaultLocation = window.tempLocation === 'London, England, United Kingdom' && 
                                window.tempLocationIsDetected === false;
      const cityName = getDisplayCity(window.tempLocation);
      const locationDisplay = isDefaultLocation ? 
        `${cityName} (default location)` : 
        cityName;
      
      // Create location display with optional "Use my actual location" link
      const locationTextElement = document.getElementById('locationText');
      if (locationTextElement) {
        // Add classes based on location source
        locationTextElement.className = `location-text location-${window.tempLocationSource || 'unknown'}`;
        
        // Only show the link if it's not a detected location
        if (window.tempLocationSource !== 'detected') {
          locationTextElement.innerHTML = `${locationDisplay} <a href="#" id="useActualLocationLink" class="location-link">Use my actual location</a>`;
          
          // Add click handler for the link
          const useActualLocationLink = document.getElementById('useActualLocationLink');
          if (useActualLocationLink) {
            useActualLocationLink.addEventListener('click', async (e) => {
              e.preventDefault();
              await handleUseLocationFromMainApp();
            });
          }
        } else {
          // For detected locations, just show the location without the link
          locationTextElement.innerHTML = locationDisplay;
        }
      }
      
      // Clear the initial status message
      const locationMessage = isDefaultLocation ? 
        `📍 Using default location: <strong>${getDisplayCity(window.tempLocation)}</strong><br><small>Enable location permissions for your actual location</small>` :
        `📍 Location detected: <strong>${getDisplayCity(window.tempLocation)}</strong>`;
      
      updateDataNotice('', {
        debugOnly: true,
        useStructuredHtml: true,
        type: 'success',
        title: locationMessage,
        subtitle: 'Loading temperature data...'
      });
      
      setLocationCookie(window.tempLocation);
      
      // Chart area is ready - user can scroll naturally
      
      fetchData();
    }

    function fetchData() {
      fetchHistoricalData();
    }

    function showChart() {
      if (loadingCheckInterval) {
        clearInterval(loadingCheckInterval);
        loadingCheckInterval = null;
      }
      loadingStartTime = null;

      loadingEl.classList.add('hidden');
      loadingEl.classList.remove('visible');

      canvasEl.classList.add('visible');
      canvasEl.classList.remove('hidden');
      
      // Clear the data notice
      updateDataNotice('', {
        debugOnly: true,
        useStructuredHtml: true,
        type: 'success',
        title: '✅ Temperature data loaded successfully!',
        subtitle: `Showing data for ${getDisplayCity(window.tempLocation)}`
      });
      
      if (chart) {
        chart.update('none');
      }
      
      // Chart is now visible - user can scroll naturally
    }

    function hideChart() {
      // This function is now only called when we're about to fetch data
      // The loading state should already be shown by showInitialLoadingState()
      // Just ensure the chart is hidden
      canvasEl.classList.remove('visible');
      canvasEl.classList.add('hidden');
    }

    // Chart visibility is handled naturally by the user

    // Add reload button handler
    const reloadButton = document.getElementById('reloadButton');
    if (reloadButton) {
      reloadButton.addEventListener('click', () => {
        cleanupRequests();
        window.location.reload();
      });
    }

    // Manual location input is disabled to prevent API abuse
    function addManualLocationInput() {
      // This function is disabled to prevent API abuse
      // Users must enable location permissions to access the service
      updateDataNotice('', {
        useStructuredHtml: true,
        type: 'warning',
        title: '🔒 Manual Location Input Disabled',
        subtitle: 'To protect against API abuse, manual location entry is not available. Please enable location permissions in your browser settings to use this service.',
        largeTitle: true,
        secondarySubtitle: true,
        extraInfo: 'This ensures users can only access data for their actual location.'
      });
    }

    // Pre-check geolocation permission state
    async function checkGeolocationPermission() {
      if (!navigator.permissions || !navigator.permissions.query) {
        return 'unknown'; // Can't check, will try anyway
      }
      
      try {
        const permission = await navigator.permissions.query({ name: 'geolocation' });
        return permission.state;
      } catch (e) {
        debugLog('Could not check geolocation permission:', e);
        return 'unknown';
      }
    }

    // Show permission instructions based on current state and platform
    function showPermissionInstructions(permissionState, isMobile) {
      const platform = detectDeviceAndPlatform();
      
      if (permissionState === 'denied') {
        const instructions = `
          <div class="permission-box denied">
            <p class="permission-title">📍 Location Access Required</p>
            <p class="permission-text">To show temperature data for your exact location, please enable location access:</p>
            ${getPlatformSpecificInstructions(platform)}
            <button onclick="window.location.reload()" class="refresh-button">
              🔄 Refresh Page After Changing Settings
            </button>
          </div>
        `;
        const dataNotice = document.getElementById('dataNotice');
        if (dataNotice) {
          dataNotice.innerHTML = instructions;
        }
      } else if (permissionState === 'prompt') {
        const instructions = `
          <div class="permission-box prompt">
            <p class="permission-title">📍 Location Permission Request</p>
            <p class="permission-text">Your browser will ask for location access. Please click <strong>"Allow"</strong> to see temperature data for your exact location.</p>
            <p class="permission-hint">If you don't see a prompt, check your browser's address bar for a location icon.</p>
          </div>
        `;
        const dataNotice = document.getElementById('dataNotice');
        if (dataNotice) {
          dataNotice.innerHTML = instructions;
        }
      }
    }

    // Get platform-specific location permission instructions
    function getPlatformSpecificInstructions(platform) {
      if (platform.isIOS) {
        return `
          <div class="platform-instructions">
            <p class="platform-header">🍎 On ${platform.os} (${platform.browser}):</p>
            <ol>
              <li>Go to <strong>Settings > Privacy & Security > Location Services</strong></li>
              <li>Find <strong>${platform.browser}</strong> in the list</li>
              <li>Change it to <strong>"Ask Next Time"</strong> or <strong>"While Using"</strong></li>
              <li>Refresh this page</li>
            </ol>
          </div>
        `;
      } else if (platform.isAndroid) {
        return `
          <div class="platform-instructions">
            <p class="platform-header">🤖 On ${platform.os} (${platform.browser}):</p>
            <ol>
              <li>Tap the <strong>⋮</strong> menu in ${platform.browser}</li>
              <li>Go to <strong>Settings > Site Settings > Location</strong></li>
              <li>Change to <strong>"Ask before accessing"</strong></li>
              <li>Refresh this page</li>
            </ol>
          </div>
        `;
      } else if (platform.isMobile) {
        return `
          <div class="platform-instructions">
            <p class="platform-header">📱 On ${platform.os} (${platform.browser}):</p>
            <ol>
              <li>Check your browser's location settings</li>
              <li>Look for location permission options</li>
              <li>Enable location access for this site</li>
              <li>Refresh this page</li>
            </ol>
          </div>
        `;
      } else {
        return `
          <div class="platform-instructions">
            <p class="platform-header">💻 On ${platform.os} (${platform.browser}):</p>
            <ol>
              <li>Look for the location permission prompt in your browser</li>
              <li>Click <strong>"Allow"</strong> when prompted</li>
              <li>If no prompt appears, check your browser's location settings</li>
            </ol>
          </div>
        `;
      }
    }

    // Modify the detectUserLocation function to use cookies
    async function detectUserLocation() {
      debugLog('Starting location detection...');
      
      // Cancel any existing in-flight requests
      if (inFlightController) {
        inFlightController.abort();
        inFlightController = null;
      }
      
      
      // Log device and environment information for debugging
      const platform = detectDeviceAndPlatform();
      const deviceInfo = {
        userAgent: navigator.userAgent,
        platform: platform,
        isMobile: platform.isMobile,
        isSecure: window.location.protocol === 'https:' || window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1',
        protocol: window.location.protocol,
        hostname: window.location.hostname,
        hasGeolocation: !!navigator.geolocation,
        hasPermissions: !!navigator.permissions,
        connection: navigator.connection ? {
          effectiveType: navigator.connection.effectiveType,
          downlink: navigator.connection.downlink,
          rtt: navigator.connection.rtt
        } : 'Not available',
        screenSize: `${window.innerWidth}x${window.innerHeight}`,
        orientation: window.innerHeight > window.innerWidth ? 'Portrait' : 'Landscape'
      };
      
      debugLog('Device and environment info:', deviceInfo);
      
      // Update loading message for location stage
      updateLoadingMessageByStage('location');
      startLocationProgress();
      
      // Check for cached location first
      const cachedLocation = getLocationCookie();
      if (cachedLocation) {
        debugLog('Using cached location:', cachedLocation);
        stopLocationProgress();
        window.tempLocation = cachedLocation; // Update global location
        displayLocationAndFetchData();
        return;
      }

      // Check if we're on HTTPS (required for geolocation on mobile)
      const isSecure = window.location.protocol === 'https:' || window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
      if (!isSecure) {
        console.warn('Geolocation requires HTTPS on mobile devices');
        debugLog('Not on HTTPS, showing manual location input');
        
        updateDataNotice('', {
          useStructuredHtml: true,
          type: 'error',
          title: '📍 Location Access',
          subtitle: 'Mobile browsers require HTTPS for automatic location detection. Please enter your location manually below.'
        });
        
        // Show permission instructions for mobile
        showPermissionInstructions('denied', true);
        return;
      }

      if (!navigator.geolocation) {
        console.warn('Geolocation is not supported by this browser.');
        debugLog('Geolocation not supported, falling back to default location');
        displayLocationAndFetchData(); // fallback
        return;
      }

      // Pre-check geolocation permission state
      const permissionState = await checkGeolocationPermission();
      debugLog('Geolocation permission state:', permissionState);
      
      if (permissionState === 'denied') {
        console.warn('Geolocation permission already denied');
        debugLog('Geolocation permission denied, showing instructions');
        stopLocationProgress();
        
        
        showPermissionInstructions('denied', deviceInfo.isMobile);
        return;
      }
      
      // Show instructions if permission state is 'prompt'
      if (permissionState === 'prompt') {
        showPermissionInstructions('prompt', deviceInfo.isMobile);
      }

      // Set a timeout that accounts for both geolocation and OpenStreetMap API call
      const devicePlatform = detectDeviceAndPlatform();
      const totalTimeout = devicePlatform.isMobile ? 25000 : 30000; // 25 seconds for mobile, 30 for desktop
      const geolocationTimeout = setTimeout(() => {
        stopLocationProgress();
        debugLog('Total location detection timed out after ' + totalTimeout/1000 + ' seconds');
        console.warn('Location detection timed out, falling back to default location');
        
        // For mobile devices, show permission instructions
        if (devicePlatform.isMobile) {
          updateDataNotice('Location detection timed out. Please enable location permissions to use this service.', { type: 'error' });
          // Show permission instructions for mobile users
          showPermissionInstructions('denied', true);
        }
        
        displayLocationAndFetchData(); // fallback to default location
      }, totalTimeout);

      debugLog('Requesting geolocation...');
      
      // Update loading message for permission stage
      updateLoadingMessageByStage('permission');
      
      
      
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          clearTimeout(geolocationTimeout);
          stopLocationProgress();
          debugLog('Geolocation received:', position.coords);
          
          
          const { latitude, longitude } = position.coords;
          debugLog('Fetching city name from coordinates...');
          
          try {
            window.tempLocation = await getCityFromCoords(latitude, longitude); // Update global location
            debugLog('Location detection complete');
            
          } catch (error) {
            TempHist.analytics.locationFailures++;
            logError(error, { 
              type: 'location_lookup_failure',
              coordinates: { latitude, longitude }
            });
            
            console.warn('Error getting city name:', error);
            debugLog('Failed to get city name, falling back to default location');
            
            // Show error message to user on mobile
            if (isMobile) {
              updateDataNotice('Location lookup failed. Please enable location permissions to use this service.', { type: 'error' });
              // Show permission instructions for mobile users
              setTimeout(() => showPermissionInstructions('denied', true), 1000);
            }
          }
          
          displayLocationAndFetchData();
        },
        (error) => {
          clearTimeout(geolocationTimeout);
          stopLocationProgress();
          console.warn('Geolocation error:', error.message);
          debugLog('Geolocation failed:', error.code, error.message);
          
          
          // More specific error handling for mobile
          let errorMessage = 'Location detection failed. Using default location.';
          let showManualInput = false;
          
          switch(error.code) {
            case error.TIMEOUT:
              debugLog('Geolocation timed out');
              errorMessage = 'Location detection timed out. Please enable location permissions to use this service.';
              showManualInput = true;
              if (devicePlatform.isMobile) {
                console.warn('Mobile device geolocation timed out - this is common on mobile');
              }
              break;
            case error.POSITION_UNAVAILABLE:
              debugLog('Location information is unavailable');
              errorMessage = 'Location information unavailable. Please enable location permissions to use this service.';
              showManualInput = true;
              break;
            case error.PERMISSION_DENIED:
              debugLog('Location permission denied');
              errorMessage = 'Location access denied. Please enable location permissions to use this service.';
              showManualInput = true;
              if (devicePlatform.isMobile) {
                console.warn('Mobile device denied location permission - check browser settings');
              }
              break;
          }
          
          // Show error message and permission instructions if needed
          if (showManualInput) {
            // Show permission instructions instead of manual input
            showPermissionInstructions('denied', deviceInfo.isMobile);
          } else {
            updateDataNotice(errorMessage, { type: 'error' });
          }
          
          displayLocationAndFetchData();
        },
        {
          enableHighAccuracy: false, // Don't wait for GPS
          timeout: devicePlatform.isMobile ? 20000 : 25000, // 20 seconds for mobile, 25 for desktop
          maximumAge: 300000 // Accept cached location up to 5 minutes old
        }
      );
    }
  }

  // mainAppLogic will be called after location selection

  // Router will be activated after view registrations

  // Register view renderers
  window.TempHistViews.today = {
    render() {
      // This uses your existing displayLocationAndFetchData() path.
      // It assumes DOM elements (dateText, locationText, tempChart, etc.) already exist.
      // No-op here because app.js already triggers the "today" fetch on load.
      // If you need a re-trigger when navigating back to Today:
      if (typeof fetchData === 'function') {
        fetchData();
      }
    }
  };

  window.TempHistViews.about = {
    async render() {
      setSectionHTML('aboutView', `
        <div class="container">
          <h2>About TempHist</h2>
          <p>TempHist shows you how today's temperature compares to the same date over the past 50 years.</p>

          <h3>How it works</h3>
          <p>TempHist uses your location to fetch historical weather data and displays it in an easy-to-read chart. Each bar represents the temperature on this date in a different year, with the current year highlighted in green.</p>

          <h3>Data sources</h3>
          <p>Weather and climate data are provided via the TempHist API, which sources historical weather data from trusted meteorological providers.</p>

          <h3>Privacy</h3>
          <p>TempHist respects your privacy. We don't collect, store, or share any personal information. Location data is used only once to fetch weather data and is never stored.</p>

          <h3>Contact</h3>
          <p>TempHist is operated by Turnpiece Ltd. For questions or feedback, please visit <a href="https://turnpiece.com">https://turnpiece.com</a>.</p>
        </div>
      `);
    }
  };

  window.TempHistViews.privacy = {
    async render() {
      setSectionHTML('privacyView', `
        <div class="container">
          <h2>Privacy Policy</h2>
          <p>Effective date: September 2025</p>

          <p>TempHist, operated by Turnpiece Ltd., respects your privacy.</p>

          <h3>No personal data collected</h3>
          <p>TempHist does not collect, store, or share any personal information.</p>

          <h3>Location use</h3>
          <p>If you grant permission, the app uses your current location once to retrieve historical weather data for your area. Location data is never stored or shared.</p>

          <h3>No tracking or analytics</h3>
          <p>The app does not include analytics, advertising, or third-party tracking.</p>

          <h3>Data sources</h3>
          <p>Weather and climate data are provided via the TempHist API, which sources historical weather data from trusted providers. Requests are processed anonymously.</p>

          <h3>Contact</h3>
          <p>If you have questions, please contact Turnpiece Ltd. at <a href="https://turnpiece.com">https://turnpiece.com</a>.</p>
        </div>
      `);
    }
  };

  // Helper function to render period views (week/month/year)
  async function renderPeriod(sectionId, periodKey, title) {
    const sec = document.getElementById(sectionId);
    if (!sec) return;

    // Check if the app is properly initialized
    if (!window.tempLocation) {
      // Wait a bit for the app to initialize
      await new Promise(resolve => setTimeout(resolve, 100));
      if (!window.tempLocation) {
        debugLog('renderPeriod: No location found, using default');
        window.tempLocation = 'London, England, United Kingdom';
      }
    } else {
      debugLog('renderPeriod: Using existing location:', window.tempLocation);
    }

    // Check if Firebase auth is ready
    if (!window.currentUser) {
      // Wait for Firebase auth to be ready
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    // Get current date for display
    const now = new Date();
    const useYesterday = now.getHours() < 1;
    const dateToUse = new Date(now);
    if (useYesterday) {
      dateToUse.setDate(dateToUse.getDate() - 1);
    }
    
    // Handle 29 Feb fallback to 28 Feb if not a leap year
    const isLeapDay = dateToUse.getDate() === 29 && dateToUse.getMonth() === 1;
    if (isLeapDay) {
      dateToUse.setDate(28);
    }
    
    const day = dateToUse.getDate();
    const monthName = dateToUse.toLocaleString('en-GB', { month: 'long' });
    const friendlyDate = `${getOrdinal(day)} ${monthName}`;
    
    // Match Today page layout exactly
    sec.innerHTML = `
      <div class="container">
        <h2 id="${periodKey}DateText" class="date-heading"></h2>
        <div id="${periodKey}LocationText" class="standard-text"></div>
        <div id="${periodKey}DataNotice" class="notice"></div>
        <div id="${periodKey}SummaryText" class="standard-text"></div>
        
        <div class="chart-container">
          <div id="${periodKey}Loading" class="loading">
            <div class="spinner"></div>
            <p id="${periodKey}LoadingText" class="loading-text">Loading temperature data…</p>
          </div>
          
          <div id="${periodKey}ErrorContainer" class="error-container" style="display: none;">
            <div class="error-content">
              <div id="${periodKey}ErrorMessage" class="error-message"></div>
              <button id="${periodKey}ReloadButton" class="reload-button">Reload</button>
            </div>
          </div>
          
          <canvas id="${periodKey}Chart"></canvas>
        </div>
        
        <div id="${periodKey}AvgText" class="standard-text"></div>
        <div id="${periodKey}TrendText" class="standard-text"></div>
      </div>
    `;

    const loadingEl = document.getElementById(`${periodKey}Loading`);
    const canvas = document.getElementById(`${periodKey}Chart`);
    const ctx = canvas.getContext('2d');

    // Enhanced loading system for period pages (like Today page)
    let loadingStartTime = null;
    let loadingCheckInterval = null;

    function updateLoadingMessage() {
      if (!loadingStartTime) return;
      
      const elapsedSeconds = Math.floor((Date.now() - loadingStartTime) / 1000);
      const loadingText = document.getElementById(`${periodKey}LoadingText`);
      
      // Only update if this is still the active loading element and it exists
      if (!loadingText) return;
      
      if (elapsedSeconds < 5) {
        loadingText.textContent = 'Creating data processing job...';
      } else if (elapsedSeconds < 15) {
        const displayCity = window.tempLocation ? window.getDisplayCity(window.tempLocation) : 'your location';
        loadingText.textContent = `Processing ${title.toLowerCase()} temperature data for ${displayCity}...`;
      } else if (elapsedSeconds < 30) {
        const displayCity = window.tempLocation ? window.getDisplayCity(window.tempLocation) : 'your location';
        loadingText.textContent = `Analyzing historical ${title.toLowerCase()} data for ${displayCity}...`;
      } else if (elapsedSeconds < 45) {
        loadingText.textContent = `Generating ${title.toLowerCase()} temperature comparison chart...`;
      } else if (elapsedSeconds < 60) {
        loadingText.textContent = 'Almost done! Finalizing the results...';
      } else if (elapsedSeconds < 90) {
        loadingText.textContent = 'This is taking longer than usual. Please wait...';
      } else {
        loadingText.textContent = 'The data processing is taking a while. This may be due to high server load.';
      }
    }

    function showLoading(v) { 
      if (v) {
        // Clear any existing interval for this page
        if (loadingCheckInterval) {
          clearInterval(loadingCheckInterval);
          loadingCheckInterval = null;
        }
        
        loadingStartTime = Date.now();
        loadingCheckInterval = setInterval(updateLoadingMessage, 1000);
        loadingEl.classList.add('visible');
        loadingEl.classList.remove('hidden');
        canvas.classList.remove('visible');
        canvas.classList.add('hidden');
      } else {
        if (loadingCheckInterval) {
          clearInterval(loadingCheckInterval);
          loadingCheckInterval = null;
        }
        loadingStartTime = null;
        loadingEl.classList.add('hidden');
        loadingEl.classList.remove('visible');
        canvas.classList.add('visible');
        canvas.classList.remove('hidden');
      }
    }

    // Set the date text to match Today page format
    document.getElementById(`${periodKey}DateText`).textContent = `${title} ending ${friendlyDate}`;
    
    // Set location text early to prevent layout shifts
    const currentLocation = window.getCurrentLocation();
    const displayLocation = window.getDisplayCity(currentLocation);
    const locationTextElement = document.getElementById(`${periodKey}LocationText`);
    if (locationTextElement) {
      // Add classes based on location source
      locationTextElement.className = `location-text location-${window.tempLocationSource || 'unknown'}`;
      
      // Only show the link if it's not a detected location
      if (window.tempLocationSource !== 'detected') {
        locationTextElement.innerHTML = `${displayLocation} <a href="#" id="useActualLocationLink" class="location-link">Use my actual location</a>`;
        
        // Add click handler for the link
        const useActualLocationLink = document.getElementById('useActualLocationLink');
        if (useActualLocationLink) {
          useActualLocationLink.addEventListener('click', async (e) => {
            e.preventDefault();
            await handleUseLocationFromMainApp();
          });
        }
      } else {
        // For detected locations, just show the location without the link
        locationTextElement.textContent = displayLocation;
      }
    }
    
    showLoading(true);

    let payload = TempHist.cache.prefetch[periodKey];

    if (!payload) {
      // Check if prefetch is in progress and wait for it
      const prefetchPromise = TempHist.cache.prefetchPromise;
      if (prefetchPromise) {
        try {
          await prefetchPromise;
          payload = TempHist.cache.prefetch[periodKey];
        } catch (e) {
          // Prefetch failed, proceed with direct API call
        }
      } else {
        // No prefetch in progress, trigger it now for this specific period
        try {
          // Check API health before attempting immediate prefetch
          debugLog(`${periodKey}: Checking API health before immediate prefetch`);
          const isApiHealthy = await Promise.race([
            checkApiHealth(),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Health check timeout')), 5000))
          ]).catch(() => {
            debugLog(`${periodKey}: Health check failed or timed out`);
            return false;
          });
          
          if (!isApiHealthy) {
            debugLog(`${periodKey}: API is not healthy, skipping immediate prefetch`);
            throw new Error('API health check failed');
          }
          
          debugLog(`${periodKey}: API is healthy, proceeding with immediate prefetch`);
          
          const currentLocation = window.getCurrentLocation();
          const now = new Date();
          const useYesterday = now.getHours() < 1;
          const dateToUse = new Date(now);
          if (useYesterday) {
            dateToUse.setDate(dateToUse.getDate() - 1);
          }
          
          // Handle 29 Feb fallback to 28 Feb if not a leap year
          const isLeapDay = dateToUse.getDate() === 29 && dateToUse.getMonth() === 1;
          if (isLeapDay) {
            dateToUse.setDate(28);
          }
          
          const day = String(dateToUse.getDate()).padStart(2, '0');
          const month = String(dateToUse.getMonth() + 1).padStart(2, '0');
          const identifier = `${month}-${day}`;
          const anchorISO = `${dateToUse.getFullYear()}-${month}-${day}`;
          
          // Trigger immediate prefetch for this period using async jobs
          const onProgress = (status) => {
            debugLog(`${periodKey}: Immediate prefetch job progress:`, status);
            // Update loading message with job progress if available
            const loadingText = document.getElementById(`${periodKey}LoadingText`);
            if (loadingText) {
              if (status.message) {
                loadingText.textContent = status.message;
              } else if (status.status === 'pending') {
                loadingText.textContent = 'Job queued, waiting to start processing...';
              } else if (status.status === 'processing') {
                loadingText.textContent = `Processing ${periodKey} temperature data...`;
              }
            }
          };
          
          const jobResult = await fetchTemperatureDataAsync(periodKey, currentLocation, identifier, onProgress);
          
          // Extract the data from the job result
          payload = jobResult.data;
          debugLog(`${periodKey} immediate prefetch job result:`, jobResult);
          debugLog(`Extracted ${periodKey} prefetch data:`, payload);
          
          // Cache the result for future use
          TempHist.cache.prefetch[periodKey] = payload;
        } catch (e) {
          // Immediate prefetch failed, proceed with direct API call
          debugLog(`${periodKey}: Immediate prefetch failed:`, e.message);
        }
      }
    }

    if (!payload) {
      // Use global functions for API calls
      const currentLocation = window.getCurrentLocation();
      
      // Get current date for the identifier
      const now = new Date();
      const useYesterday = now.getHours() < 1;
      const dateToUse = new Date(now);
      if (useYesterday) {
        dateToUse.setDate(dateToUse.getDate() - 1);
      }
      
      // Handle 29 Feb fallback to 28 Feb if not a leap year
      const isLeapDay = dateToUse.getDate() === 29 && dateToUse.getMonth() === 1;
      if (isLeapDay) {
        dateToUse.setDate(28);
      }
      
      const day = String(dateToUse.getDate()).padStart(2, '0');
      const month = String(dateToUse.getMonth() + 1).padStart(2, '0');
      const identifier = `${month}-${day}`;
      
      try {
        // Check temperature data server health first (with timeout)
        const isApiHealthy = await Promise.race([
          checkApiHealth(),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Health check timeout')), 5000))
        ]).catch(() => {
          console.warn('Health check failed or timed out, proceeding anyway...');
          return true; // Proceed anyway if health check fails
        });
        
        if (!isApiHealthy) {
          console.warn('API health check failed, but proceeding with data fetch...');
        }
        
        // Progress callback for async job
        const onProgress = (status) => {
          debugLog(`${periodKey} data job progress:`, status);
          // Update loading message with job progress if available
          const loadingText = document.getElementById(`${periodKey}LoadingText`);
          if (loadingText) {
            if (status.message) {
              loadingText.textContent = status.message;
            } else if (status.status === 'pending') {
              loadingText.textContent = 'Job queued, waiting to start processing...';
            } else if (status.status === 'processing') {
              loadingText.textContent = `Processing ${periodKey} temperature data...`;
            }
          }
        };

        debugLog(`Starting async ${periodKey} data fetch...`);
        const jobResult = await fetchTemperatureDataAsync(periodKey, currentLocation, identifier, onProgress);
        
        // Extract the data from the job result
        payload = jobResult.data;
        debugLog(`${periodKey} job result structure:`, jobResult);
        debugLog(`Extracted ${periodKey} data:`, payload);
      } catch (e) {
        // Show error in error container instead of replacing entire content
        const errorContainer = document.getElementById(`${periodKey}ErrorContainer`);
        const errorMessage = document.getElementById(`${periodKey}ErrorMessage`);
        const loadingEl = document.getElementById(`${periodKey}Loading`);
        
        if (errorContainer && errorMessage) {
          // Provide more specific error messages based on the error type
          let userErrorMessage = 'Sorry, there was a problem processing the temperature data. Please try again later.';
          
          if (e.message.includes('Job failed')) {
            userErrorMessage = 'The data processing job failed. This may be due to server issues. Please try again later.';
          } else if (e.message.includes('Job polling timed out')) {
            userErrorMessage = 'The data processing is taking longer than expected. Please try again later.';
          } else if (e.message.includes('Request aborted')) {
            userErrorMessage = 'The request was cancelled. Please try again.';
          } else if (e.message.includes('Failed to create job')) {
            userErrorMessage = 'Unable to start data processing. Please check your connection and try again.';
          }
          
          errorMessage.textContent = userErrorMessage;
          errorContainer.style.display = 'block';
        }
        
        if (loadingEl) {
          loadingEl.classList.add('hidden');
          loadingEl.classList.remove('visible');
        }
        
        const canvas = document.getElementById(`${periodKey}Chart`);
        if (canvas) {
          canvas.classList.remove('visible');
          canvas.classList.add('hidden');
        }
        
        // Log the actual error for debugging
        console.error(`Error loading ${periodKey} data:`, e);
        debugLog(`${periodKey} data fetch failed:`, e.message);
        
        // Add reload button handler for error case
        const reloadButton = document.getElementById(`${periodKey}ReloadButton`);
        if (reloadButton) {
          // Remove any existing event listeners
          reloadButton.replaceWith(reloadButton.cloneNode(true));
          const newReloadButton = document.getElementById(`${periodKey}ReloadButton`);
          
          newReloadButton.addEventListener('click', () => {
            // Hide error and retry loading
            if (errorContainer) {
              errorContainer.style.display = 'none';
            }
            showLoading(true);
            // Re-trigger the render function
            window.TempHistViews[periodKey]?.render?.();
          });
        }
        
        return;
      }
    }

    // Expected payload shape (adjust mapping as needed):
    // { series: [{ date: '2025-09-19', temperature: 18.2 }, ...], location: 'London' }
    // Update location text with actual API location if available
    if (payload.location) {
      const displayLocation = window.getDisplayCity(payload.location);
      const locationTextElement = document.getElementById(`${periodKey}LocationText`);
      if (locationTextElement) {
        // Add classes based on location source
        locationTextElement.className = `location-text location-${window.tempLocationSource || 'unknown'}`;
        
        // Only show the link if it's not a detected location
        if (window.tempLocationSource !== 'detected') {
          locationTextElement.innerHTML = `${displayLocation} <a href="#" id="useActualLocationLink" class="location-link">Use my actual location</a>`;
          
          // Add click handler for the link
          const useActualLocationLink = document.getElementById('useActualLocationLink');
          if (useActualLocationLink) {
            useActualLocationLink.addEventListener('click', async (e) => {
              e.preventDefault();
              await handleUseLocationFromMainApp();
            });
          }
        } else {
          // For detected locations, just show the location without the link
          locationTextElement.textContent = displayLocation;
        }
      }
    }
    
    // Apply colors to match Today page
    const dateText = document.getElementById(`${periodKey}DateText`);
    const locationText = document.getElementById(`${periodKey}LocationText`);
    const summaryText = document.getElementById(`${periodKey}SummaryText`);
    const avgText = document.getElementById(`${periodKey}AvgText`);
    const trendText = document.getElementById(`${periodKey}TrendText`);
    
    // Don't set colors for dateText and locationText - let them inherit white from body
    if (summaryText) summaryText.classList.add('summary-text');
    if (avgText) avgText.classList.add('avg-text');
    if (trendText) trendText.classList.add('trend-text');

    // Transform data to horizontal bar format: {x: temperature, y: year}
    // The API returns data in 'values' array, not 'series'
    const seriesData = payload.values || payload.series || [];
    const chartData = seriesData.map(point => ({ 
      x: point.temperature, 
      y: new Date(point.date).getFullYear() 
    }));


    // Calculate temperature range
    const tempValues = chartData.map(p => p.x);
    const minTemp = Math.floor(Math.min(...tempValues) - 1);
    const maxTemp = Math.ceil(Math.max(...tempValues) + 1);
    
    // Get year range
    const years = chartData.map(p => p.y);
    const minYear = Math.min(...years);
    const maxYear = Math.max(...years);

    // Destroy any existing chart on this canvas
    const existingChart = Chart.getChart(ctx);
    if (existingChart) {
      existingChart.destroy();
    }

    const chart = new Chart(ctx, {
      type: 'bar',
      data: {
        datasets: [
          {
            label: 'Trend',
            type: 'line',
            data: [],
            backgroundColor: '#aaaa00',
            borderColor: '#aaaa00',
            fill: false,
            pointRadius: 0,
            borderWidth: 2,
            opacity: 1,
            hidden: false // Show trend line for period views
          },
          {
            label: `${title} temperature (°C)`,
            data: chartData,
            backgroundColor: chartData.map(point => {
              // Make current period (most recent year) green, others red
              const currentYear = new Date().getFullYear();
              return point.y === currentYear ? '#51cf66' : '#ff6b6b';
            }),
            borderWidth: 0,
            base: minTemp
          }
        ]
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        parsing: false,
        animation: false,
        normalized: true,
        layout: {
          padding: {
            left: 0,
            right: 20,
            top: 15,
            bottom: 15
          }
        },
        plugins: {
          legend: { display: false },
          annotation: {
            annotations: {
              averageLine: {
                type: 'line',
                yMin: minYear - 1,
                yMax: maxYear + 1,
                xMin: payload.average?.mean || 0,
                xMax: payload.average?.mean || 0,
                borderColor: '#4dabf7',
                borderWidth: 2,
                label: {
                  display: true,
                  content: `Average: ${(payload.average?.mean || 0).toFixed(1)}°C`,
                  position: 'start',
                  font: {
                    size: 12
                  }
                }
              }
            }
          },
          tooltip: {
            callbacks: {
              title: function(context) {
                return `${context[0].parsed.y.toString()}: ${context[0].parsed.x}°C`
              },
              label: function() {
                return ''
              }
            }
          }
        },
        scales: {
          x: {
            type: 'linear',
            title: {
              display: true,
              text: 'Temperature (°C)',
              font: {
                size: 12
              },
              color: '#ECECEC'
            },
            min: minTemp,
            max: maxTemp,
            ticks: {
              font: {
                size: 11
              },
              color: '#ECECEC',
              stepSize: 2
            }
          },
          y: {
            type: 'linear',
            min: minYear,
            max: maxYear,
            ticks: {
              maxTicksLimit: 20,
              callback: val => val.toString(),
              font: {
                size: 11
              },
              color: '#ECECEC'
            },
            title: {
              display: false,
              text: 'Year'
            },
            grid: {
              display: false
            },
            offset: true
          }
        },
        elements: {
          bar: {
            minBarLength: 30,
            maxBarThickness: 30,
            categoryPercentage: 0.1,
            barPercentage: 1.0
          }
        }
      }
    });

    // Update text elements with API data (like Today page)
    const summaryEl = document.getElementById(`${periodKey}SummaryText`);
    const avgEl = document.getElementById(`${periodKey}AvgText`);
    const trendEl = document.getElementById(`${periodKey}TrendText`);
    
    // Summary text
    if (summaryEl) {
      summaryEl.textContent = payload.summary || `Temperature data for ${title.toLowerCase()} ending ${friendlyDate}`;
    }
    
    // Average text
    if (avgEl && payload.average) {
      avgEl.textContent = `Average: ${payload.average.mean.toFixed(1)}°C`;
    }
    
    // Trend text
    if (trendEl && payload.trend) {
      // Use actual slope value for direction determination, not rounded display value
      const direction = Math.abs(payload.trend.slope) < 0.05 ? 'stable' : 
                       payload.trend.slope > 0 ? 'rising' : 'falling';
      const formatted = `Trend: ${direction} at ${Math.abs(payload.trend.slope).toFixed(1)} ${payload.trend.unit}`;
      trendEl.textContent = formatted;
    }

    // Calculate and add trend line
    if (payload.trend && chartData.length > 1) {
      // Transform data for trend calculation: {x: year, y: temperature}
      const trendData = window.calculateTrendLine(chartData.map(d => ({ x: d.y, y: d.x })), 
        minYear - 0.5, maxYear + 0.5);
      chart.data.datasets[0].data = trendData.points.map(p => ({ x: p.y, y: p.x }));
    }

    showLoading(false);
    
    // Force chart update
    chart.update('none');
  }

  window.TempHistViews.week = { render: () => renderPeriod('weekView', 'week', 'Week') };
  window.TempHistViews.month = { render: () => renderPeriod('monthView', 'month', 'Month') };
  window.TempHistViews.year = { render: () => renderPeriod('yearView', 'year', 'Year') };

  // Now activate the router after all views are registered
  if (window.TempHistRouter && typeof window.TempHistRouter.handleRoute === 'function') {
    window.TempHistRouter.handleRoute();
  }
}