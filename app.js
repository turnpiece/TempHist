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
        api_failure_rate: analyticsData.apiFailureRate,
        retry_attempts: analyticsData.retryAttempts,
        location_failures: analyticsData.locationFailures,
        error_count: analyticsData.errorCount,
        recent_errors: analyticsData.recentErrors,
        app_version: "1.0.0",
        platform: "web"
      };

      const response = await fetch(getApiUrl('/analytics'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        console.warn('Analytics reporting failed:', response.status);
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
    return window.tempLocation || 'London, England, United Kingdom';
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

  // Move your main code into a function:
  function startAppWithFirebaseUser(user) {
    // Constants and configuration
    const DEBUGGING = false;
    
    // Initialize analytics reporting
    setupAnalyticsReporting();
    
    // SECURITY NOTE: Manual location input is disabled to prevent API abuse.
    // Users must enable location permissions to access the service.
    // This ensures users can only access data for their actual location.

  // Helper function for debug logging
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

  // Enhanced device and platform detection
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

  debugLog('Script starting...');

  // Store the Firebase user for use in apiFetch
  let currentUser = user;
  window.currentUser = currentUser; // Make it globally available

  // Global AbortController to cancel in-flight requests
  let inFlightController = null;

  // Cleanup function to cancel any pending requests
  function cleanupRequests() {
    if (inFlightController) {
      inFlightController.abort();
      inFlightController = null;
    }
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
    const idToken = await currentUser.getIdToken();

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

  function mainAppLogic() {
    // Wait for Chart.js to be available
    if (typeof Chart === 'undefined') {
      console.error('Chart.js not loaded');
      return;
    }

    Chart.register(window['chartjs-plugin-annotation']);

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
      document.getElementById('dataNotice').textContent = '29th February detected — comparing 28th Feb instead for consistency.';
      debugLog('Leap day detected, using 28th Feb instead');
    }

    const day = String(dateToUse.getDate()).padStart(2, '0');
    const month = String(dateToUse.getMonth() + 1).padStart(2, '0');
    const currentYear = dateToUse.getFullYear();

    debugLog('Date components prepared:', { day, month, currentYear });

    const startYear = currentYear - 50;
    const loadingEl = document.getElementById('loading');
    const canvasEl = document.getElementById('tempChart');
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
    const dataNotice = document.getElementById('dataNotice');
    if (dataNotice) {
      dataNotice.textContent = 'Determining your location...';
      dataNotice.classList.add('status-neutral');
    }
    
    // Add a simple progress indicator for location detection
    let locationProgressInterval;
    function startLocationProgress() {
      let dots = 0;
      locationProgressInterval = setInterval(() => {
        dots = (dots + 1) % 4;
        const progressText = 'Determining your location' + '.'.repeat(dots);
        if (dataNotice) {
          dataNotice.textContent = progressText;
        }
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
      
      if (elapsedSeconds < 10) {
        loadingText.textContent = 'Loading temperature data...';
      } else if (elapsedSeconds < 25) {
        loadingText.textContent = 'Getting temperatures on '+friendlyDate+' over the past 50 years.';
      } else if (elapsedSeconds < 45) {
        const displayCity = tempLocation ? getDisplayCity(tempLocation) : 'your location';
        loadingText.textContent = 'Is today warmer than average in '+displayCity+'?';
      } else if (elapsedSeconds < 60) {
        loadingText.textContent = 'Once we have the data we\'ll know.';
      } else if (elapsedSeconds < 80) {
        loadingText.textContent = 'Please be patient. It shouldn\'t be much longer.';
      } else {
        loadingText.textContent = 'The server is taking a while to respond.';
      }
    }
    
    // Function to update loading message based on current stage (for initial stages)
    function updateLoadingMessageByStage(stage) {
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

    // get the location
    let tempLocation = 'London, England, United Kingdom'; // default
    window.tempLocation = tempLocation; // Make it globally accessible

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
    function getRollingBundlePath(location, anchorISO, qs = '') {
      const encodedLocation = encodeURIComponent(location);
      const base = `/v1/records/rolling-bundle/${encodedLocation}/${anchorISO}`;
      return qs ? `${base}?${qs}` : base;
    }

    // Format MM-DD for "yesterday/previous" given a base Date
    function mmddFrom(anchorDate, offsetDays = 0) {
      const d = new Date(anchorDate);
      d.setDate(d.getDate() - offsetDays);
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${m}-${day}`;
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
        return tempLocation;
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

    // Add these functions near the top with other utility functions
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
        return;
      }
      // Daily: yesterday / two days ago / three days ago
      const idD1 = mmddFrom(dateToUse, 1);
      const idD2 = mmddFrom(dateToUse, 2);
      const idD3 = mmddFrom(dateToUse, 3);

      ric(async () => {
        try {
          const p = `${getRecordPath('daily', location, idD1)}?include=series,average,trend,summary`;
          const idToken = await currentUser.getIdToken();
          await fetch(getApiUrl(p), {
            headers: {
              'Authorization': `Bearer ${idToken}`,
              'Content-Type': 'application/json',
              'Accept': 'application/json'
            }
          });
        } catch (e) {
          // Silently ignore prefetch errors
        }
      });
      ric(async () => {
        try {
          const p = `${getRecordPath('daily', location, idD2)}?include=series,average,trend,summary`;
          const idToken = await currentUser.getIdToken();
          await fetch(getApiUrl(p), {
            headers: {
              'Authorization': `Bearer ${idToken}`,
              'Content-Type': 'application/json',
              'Accept': 'application/json'
            }
          });
        } catch (e) {
          // Silently ignore prefetch errors
        }
      });
      ric(async () => {
        try {
          const p = `${getRecordPath('daily', location, idD3)}?include=series,average,trend,summary`;
          const idToken = await currentUser.getIdToken();
          await fetch(getApiUrl(p), {
            headers: {
              'Authorization': `Bearer ${idToken}`,
              'Content-Type': 'application/json',
              'Accept': 'application/json'
            }
          });
        } catch (e) {
          // Silently ignore prefetch errors
        }
      });

      // Prefetch using bundle endpoint (more efficient)
      const bundlePrefetchPromise = (async () => {
        try {
          // Check if we have a valid user and location before making the request
          if (!currentUser || !location) {
            return;
          }
          
          const qs = new URLSearchParams({
            include: 'weekly,monthly,yearly',
            unit_group: unitGroup,
            month_mode: monthMode
          }).toString();
          const idToken = await currentUser.getIdToken();
          const bundleUrl = getApiUrl(getRollingBundlePath(location, anchorDateISO, qs));
          
          const response = await fetch(bundleUrl, {
            headers: {
              'Authorization': `Bearer ${idToken}`,
              'Content-Type': 'application/json',
              'Accept': 'application/json'
            }
          });
          
          if (response.ok) {
            const data = await response.json();
            // Populate cache with prefetched data from bundle
            if (data.weekly) {
              TempHist.cache.prefetch.week = data.weekly;
            }
            if (data.monthly) {
              TempHist.cache.prefetch.month = data.monthly;
            }
            if (data.yearly) {
              TempHist.cache.prefetch.year = data.yearly;
            }
          }
        } catch (e) {
          // Silently ignore prefetch errors
        }
      })();
      
      // Store the promise so other parts can wait for it
      TempHist.cache.prefetchPromise = bundlePrefetchPromise;
      
      ric(() => bundlePrefetchPromise);

      // Fallback: prefetch individual period endpoints if bundle fails
      ric(async () => {
        try {
          const idToken = await currentUser.getIdToken();
          const weeklyUrl = getApiUrl(`/v1/records/weekly/${encodeURIComponent(location)}/${month}-${day}`);
          
          const response = await fetch(weeklyUrl, {
            headers: {
              'Authorization': `Bearer ${idToken}`,
              'Content-Type': 'application/json',
              'Accept': 'application/json'
            }
          });
          
          if (response.ok) {
            const data = await response.json();
            TempHist.cache.prefetch.week = data;
          }
        } catch (e) {
          // Silently ignore prefetch errors
        }
      });

      ric(async () => {
        try {
          const idToken = await currentUser.getIdToken();
          const response = await fetch(getApiUrl(`/v1/records/monthly/${encodeURIComponent(location)}/${month}-${day}`), {
            headers: {
              'Authorization': `Bearer ${idToken}`,
              'Content-Type': 'application/json',
              'Accept': 'application/json'
            }
          });
          
          if (response.ok) {
            const data = await response.json();
            TempHist.cache.prefetch.month = data;
          }
        } catch (e) {
          // Silently ignore prefetch errors
        }
      });

      ric(async () => {
        try {
          const idToken = await currentUser.getIdToken();
          const response = await fetch(getApiUrl(`/v1/records/yearly/${encodeURIComponent(location)}/${month}-${day}`), {
            headers: {
              'Authorization': `Bearer ${idToken}`,
              'Content-Type': 'application/json',
              'Accept': 'application/json'
            }
          });
          
          if (response.ok) {
            const data = await response.json();
            TempHist.cache.prefetch.year = data;
          }
        } catch (e) {
          // Silently ignore prefetch errors
        }
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

    // Modified fetchHistoricalData function to use new records API
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

        // Fetch weather data using new records API with retry
        const weatherPath = getRecordPath('daily', tempLocation, `${month}-${day}`);
        const weatherUrl = getApiUrl(weatherPath);
        const weatherResponse = await fetchWithRetry(weatherUrl);
        
        // Parse the response
        const responseText = await weatherResponse.text();
        let weatherData;
        try {
          weatherData = JSON.parse(responseText);
        } catch (parseError) {
          throw new Error(`Invalid JSON response: ${responseText.substring(0, 200)}...`);
        }
        
        // The new v1/records API structure - temperature data is in 'values' array
        if (!weatherData.values || !Array.isArray(weatherData.values)) {
          throw new Error('Invalid data format received from '+weatherUrl + '. Expected values array.');
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
                  label: `Temperature in ${getDisplayCity(tempLocation)} on ${friendlyDate}`,
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
                      debugLog('X-axis tick callback:', value);
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
        schedulePrefetchAfterDaily(tempLocation, anchorISO, 'celsius', 'rolling1m');
        
        // Send analytics after successful data load
        sendAnalytics();

      } catch (error) {
        // Don't show error if request was aborted
        if (error.name === 'AbortError') {
          return;
        }
        
        logError(error, { 
          type: 'data_fetch_failure',
          location: tempLocation,
          date: `${month}-${day}`
        });
        
        console.error('Error fetching historical data:', error);
        hideChart();
        showError('Sorry, there was a problem connecting to the temperature data server. Please check your connection or try again later.');
      }

      debugTimeEnd('Total fetch time');
    };

    // SECURITY: Location query string parameter removed to prevent API abuse
    // Users must enable location permissions to access the service
    // This ensures users can only access data for their actual location
    debugLog('Starting geolocation detection');
    detectUserLocation(); // uses geolocation

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
      
      // Check if using default fallback location
      const isDefaultLocation = tempLocation === 'London, England, United Kingdom';
      const locationDisplay = isDefaultLocation ? 
        `${getDisplayCity(tempLocation)} (default location)` : 
        getDisplayCity(tempLocation);
      
      document.getElementById('locationText').textContent = locationDisplay;
      
      // Clear the initial status message and show location confirmation
      const dataNotice = document.getElementById('dataNotice');
      if (dataNotice) {
        const locationMessage = isDefaultLocation ? 
          `📍 Using default location: <strong>${getDisplayCity(tempLocation)}</strong><br><small>Enable location permissions for your actual location</small>` :
          `📍 Location set to: <strong>${getDisplayCity(tempLocation)}</strong>`;
          
        dataNotice.innerHTML = `<div class="notice-content success">
          <p class="notice-title">${locationMessage}</p>
          ${DEBUGGING ? '<p class="notice-subtitle">Loading temperature data...</p>' : ''}
        </div>`;
      }
      
      setLocationCookie(tempLocation);
      
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
      
      // Clear the data notice and show success message if debugging
      const dataNotice = document.getElementById('dataNotice');
      if (dataNotice) {
        dataNotice.innerHTML = DEBUGGING ? `<div class="notice-content success">
          <p class="notice-title">✅ Temperature data loaded successfully!</p>
          <p class="notice-subtitle">Showing data for ${getDisplayCity(tempLocation)}</p>
        </div>` : '';
      }
      
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
      const dataNotice = document.getElementById('dataNotice');
      if (!dataNotice) return;
      
      dataNotice.innerHTML = `
        <div class="notice-content warning">
          <p class="notice-title large">🔒 Manual Location Input Disabled</p>
          <p class="notice-subtitle secondary">To protect against API abuse, manual location entry is not available. Please enable location permissions in your browser settings to use this service.</p>
          <p style="margin: 0; font-size: 12px; color: #888;">This ensures users can only access data for their actual location.</p>
        </div>
      `;
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
      const dataNotice = document.getElementById('dataNotice');
      if (!dataNotice) return;
      
      const platform = detectDeviceAndPlatform();
      let instructions = '';
      
      if (permissionState === 'denied') {
        instructions = `
          <div style="text-align: center; padding: 20px; color: #ff6b6b; background: rgba(255,107,107,0.1); border-radius: 8px; border: 2px solid rgba(255,107,107,0.3);">
            <p style="margin: 0 0 15px 0; font-weight: 600; font-size: 16px;">📍 Location Access Required</p>
            <p style="margin: 0 0 15px 0; color: #666; font-size: 14px;">To show temperature data for your exact location, please enable location access:</p>
            ${getPlatformSpecificInstructions(platform)}
            <button onclick="window.location.reload()" style="background: #ff6b6b; color: white; border: none; padding: 12px 24px; border-radius: 6px; cursor: pointer; font-size: 14px; font-weight: 600; margin-top: 10px;">
              🔄 Refresh Page After Changing Settings
            </button>
          </div>
        `;
      } else if (permissionState === 'prompt') {
        instructions = `
          <div style="text-align: center; padding: 20px; color: #4dabf7; background: rgba(77,171,247,0.1); border-radius: 8px; border: 2px solid rgba(77,171,247,0.3);">
            <p style="margin: 0 0 15px 0; font-weight: 600; font-size: 16px;">📍 Location Permission Request</p>
            <p style="margin: 0 0 15px 0; color: #666; font-size: 14px;">Your browser will ask for location access. Please click <strong>"Allow"</strong> to see temperature data for your exact location.</p>
            <p style="margin: 0; font-size: 12px; color: #888;">If you don't see a prompt, check your browser's address bar for a location icon.</p>
          </div>
        `;
      }
      
      if (instructions) {
        dataNotice.innerHTML = instructions;
      }
    }

    // Get platform-specific location permission instructions
    function getPlatformSpecificInstructions(platform) {
      if (platform.isIOS) {
        return `
          <div style="text-align: left; background: rgba(0,0,0,0.05); padding: 15px; border-radius: 6px; margin: 15px 0; font-size: 13px;">
            <p style="margin: 0 0 10px 0; font-weight: 600;">🍎 On ${platform.os} (${platform.browser}):</p>
            <ol style="margin: 0; padding-left: 20px; line-height: 1.6;">
              <li>Go to <strong>Settings > Privacy & Security > Location Services</strong></li>
              <li>Find <strong>${platform.browser}</strong> in the list</li>
              <li>Change it to <strong>"Ask Next Time"</strong> or <strong>"While Using"</strong></li>
              <li>Refresh this page</li>
            </ol>
          </div>
        `;
      } else if (platform.isAndroid) {
        return `
          <div style="text-align: left; background: rgba(0,0,0,0.05); padding: 15px; border-radius: 6px; margin: 15px 0; font-size: 13px;">
            <p style="margin: 0 0 10px 0; font-weight: 600;">🤖 On ${platform.os} (${platform.browser}):</p>
            <ol style="margin: 0; padding-left: 20px; line-height: 1.6;">
              <li>Tap the <strong>⋮</strong> menu in ${platform.browser}</li>
              <li>Go to <strong>Settings > Site Settings > Location</strong></li>
              <li>Change to <strong>"Ask before accessing"</strong></li>
              <li>Refresh this page</li>
            </ol>
          </div>
        `;
      } else if (platform.isMobile) {
        return `
          <div style="text-align: left; background: rgba(0,0,0,0.05); padding: 15px; border-radius: 6px; margin: 15px 0; font-size: 13px;">
            <p style="margin: 0 0 10px 0; font-weight: 600;">📱 On ${platform.os} (${platform.browser}):</p>
            <ol style="margin: 0; padding-left: 20px; line-height: 1.6;">
              <li>Check your browser's location settings</li>
              <li>Look for location permission options</li>
              <li>Enable location access for this site</li>
              <li>Refresh this page</li>
            </ol>
          </div>
        `;
      } else {
        return `
          <div style="text-align: left; background: rgba(0,0,0,0.05); padding: 15px; border-radius: 6px; margin: 15px 0; font-size: 13px;">
            <p style="margin: 0 0 10px 0; font-weight: 600;">💻 On ${platform.os} (${platform.browser}):</p>
            <ol style="margin: 0; padding-left: 20px; line-height: 1.6;">
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
        tempLocation = cachedLocation;
        window.tempLocation = tempLocation; // Update global location
        displayLocationAndFetchData();
        return;
      }

      // Check if we're on HTTPS (required for geolocation on mobile)
      const isSecure = window.location.protocol === 'https:' || window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
      if (!isSecure) {
        console.warn('Geolocation requires HTTPS on mobile devices');
        debugLog('Not on HTTPS, showing manual location input');
        
        
        const dataNotice = document.getElementById('dataNotice');
        if (dataNotice) {
          dataNotice.innerHTML = `
            <div class="notice-content error">
              <p class="notice-title">📍 Location Access</p>
              <p class="notice-subtitle">Mobile browsers require HTTPS for automatic location detection. Please enter your location manually below.</p>
            </div>
          `;
        }
        
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
          const dataNotice = document.getElementById('dataNotice');
          if (dataNotice) {
            dataNotice.textContent = 'Location detection timed out. Please enable location permissions to use this service.';
            dataNotice.classList.remove('status-neutral');
            dataNotice.classList.add('status-error');
            // Show permission instructions for mobile users
            showPermissionInstructions('denied', true);
          }
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
            tempLocation = await getCityFromCoords(latitude, longitude);
            window.tempLocation = tempLocation; // Update global location
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
              const dataNotice = document.getElementById('dataNotice');
              if (dataNotice) {
                dataNotice.textContent = 'Location lookup failed. Please enable location permissions to use this service.';
                dataNotice.classList.remove('status-neutral');
                dataNotice.classList.add('status-error');
                // Show permission instructions for mobile users
                setTimeout(() => showPermissionInstructions('denied', true), 1000);
              }
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
          const dataNotice = document.getElementById('dataNotice');
          if (dataNotice) {
            if (showManualInput) {
              // Show permission instructions instead of manual input
              showPermissionInstructions('denied', deviceInfo.isMobile);
            } else {
              dataNotice.textContent = errorMessage;
              dataNotice.classList.remove('status-neutral');
              dataNotice.classList.add('status-error');
            }
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

  // Ensure mainAppLogic always runs after DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mainAppLogic);
  } else {
    mainAppLogic();
  }

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
        window.tempLocation = 'London, England, United Kingdom';
      }
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
      
      if (elapsedSeconds < 5) {
        loadingText.textContent = 'Loading temperature data...';
      } else if (elapsedSeconds < 15) {
        const displayCity = window.tempLocation ? window.getDisplayCity(window.tempLocation) : 'your location';
        loadingText.textContent = `Getting temperatures in ${displayCity} over the past 50 years.`;
      } else if (elapsedSeconds < 30) {
        const displayCity = window.tempLocation ? window.getDisplayCity(window.tempLocation) : 'your location';
        loadingText.textContent = `Was this past ${title.toLowerCase()} warmer than average in ${displayCity}?`;
      } else if (elapsedSeconds < 45) {
        loadingText.textContent = 'Once we have the data we\'ll know.';
      } else if (elapsedSeconds < 60) {
        loadingText.textContent = 'Please be patient. It shouldn\'t be much longer.';
      } else {
        loadingText.textContent = 'The server is taking a while to respond.';
      }
    }

    function showLoading(v) { 
      if (v) {
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
    document.getElementById(`${periodKey}LocationText`).textContent = displayLocation;
    
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
          
          // Trigger immediate prefetch for this period
          const immediatePrefetchUrl = window.getApiUrl(`/v1/records/${periodKey}ly/${currentLocation}/${identifier}`);
          
          const res = await apiFetch(immediatePrefetchUrl);
          if (res.ok) {
            payload = await res.json();
            // Cache the result for future use
            TempHist.cache.prefetch[periodKey] = payload;
          }
        } catch (e) {
          // Immediate prefetch failed, proceed with direct API call
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
      
      const url = window.getApiUrl(`/v1/records/${periodKey}ly/${currentLocation}/${identifier}`);
      
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
        
        // Use the same authenticated fetch as the main app
        const res = await apiFetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        payload = await res.json();
      } catch (e) {
        // Show error in error container instead of replacing entire content
        const errorContainer = document.getElementById(`${periodKey}ErrorContainer`);
        const errorMessage = document.getElementById(`${periodKey}ErrorMessage`);
        const loadingEl = document.getElementById(`${periodKey}Loading`);
        
        if (errorContainer && errorMessage) {
          // Show the specific error message from the API or health check
          const errorText = e.message || 'Unknown error occurred';
          errorMessage.textContent = errorText;
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
      document.getElementById(`${periodKey}LocationText`).textContent = displayLocation;
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