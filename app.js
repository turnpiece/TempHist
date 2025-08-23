import './styles.scss';
import { initializeApp } from "firebase/app";
import { getAuth, signInAnonymously, onAuthStateChanged } from "firebase/auth";

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

  // Move your main code into a function:
  function startAppWithFirebaseUser(user) {
    // Constants and configuration
    const DEBUGGING = false;
    
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

  // Wrapper function for API fetches that adds the Firebase ID token
  async function apiFetch(url, options = {}) {
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
        headers
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
      console.error('Fetch error:', {
        url,
        error: error.message,
        headers,
        stack: error.stack
      });
      throw error;
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
      // Development (local)
      if (import.meta.env.DEV) {
        return 'http://localhost:3000'; // Point to server.js
      }
      // Production
      return 'https://api.temphist.com';
    })();

    debugLog('Constants initialized');
    
    // Add visual debugging for platform detection
    const platform = detectDeviceAndPlatform();
    if (platform.isMobile) {
      const debugDiv = document.createElement('div');
      debugDiv.id = 'mobileDebug';
      debugDiv.style.cssText = 'background: rgba(0,0,0,0.9); color: white; padding: 15px; margin: 10px 0; border-radius: 8px; font-family: monospace; font-size: 12px; line-height: 1.4; border: 2px solid #ff6b6b; position: fixed; top: 10px; right: 10px; max-width: 350px; z-index: 1000;';
      debugDiv.innerHTML = `
        <strong>🔧 PLATFORM DEBUG:</strong><br>
        <strong>OS:</strong> ${platform.os}<br>
        <strong>Browser:</strong> ${platform.browser}<br>
        <strong>Device:</strong> ${platform.deviceType}<br>
        <strong>API Base:</strong> ${apiBase}<br>
        <strong>Protocol:</strong> ${window.location.protocol}<br>
        <strong>Security:</strong> 🔒 Manual input disabled<br>
        <strong>Status:</strong> <span id="debugStatus">Starting...</span><br>
        <hr style="border-color: #666;">
        <button onclick="document.getElementById('mobileDebug').remove()" style="background: #ff6b6b; color: white; border: none; padding: 5px 10px; border-radius: 4px; cursor: pointer;">Close</button>
      `;
      
      document.body.appendChild(debugDiv);
      
      // Update status function
      window.updateDebugStatus = function(status) {
        const statusEl = document.getElementById('debugStatus');
        if (statusEl) {
          statusEl.textContent = status;
          statusEl.style.color = status.includes('Error') ? '#ff6b6b' : status.includes('Success') ? '#51cf66' : '#4dabf7';
        }
      };
    }


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
      dataNotice.style.color = '#666';
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
      const footer = document.getElementById('footer');
      const footerLink = document.querySelector('#footer a');
      const spinner = document.querySelector('.spinner');
      
      // Apply colors only if elements exist
      if (summaryText) summaryText.style.color = thisYearColour;
      if (avgText) avgText.style.color = avgColour;
      if (trendText) trendText.style.color = trendColour;
      
      // Header and footer colors
      if (header) header.style.color = barColour;
      if (footer) footer.style.color = barColour;
      if (footerLink) footerLink.style.color = barColour;
      
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
    const skeleton = document.getElementById('skeletonLoader');
    if (skeleton) {
      skeleton.classList.add('hidden');
      skeleton.classList.remove('visible');
    }

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

      const skeleton = document.getElementById('skeletonLoader');
      skeleton.classList.remove('hidden');
      skeleton.classList.add('visible');

      canvasEl.classList.remove('visible');
      canvasEl.classList.add('hidden');
      
      // Update loading message for fetching stage
      updateLoadingMessageByStage('fetching');
      
      // Loading area is now visible - user can scroll naturally
    }

    // get the location
    let tempLocation = 'London, England, United Kingdom'; // default

    // Helper function to handle API URLs with proper encoding
    function getApiUrl(path) {
      // Ensure the path is properly encoded for the API
      // encodeURI handles most cases, but we can be more specific if needed
      const encodedPath = encodeURI(path);
      const fullUrl = `${apiBase}${encodedPath}`;
      
      if (DEBUGGING) {
        console.log('🔗 API URL Debug:', {
          apiBase,
          path,
          encodedPath,
          fullUrl,
          hostname: window.location.hostname
        });
      }
      
      return fullUrl;
    }

    // Helper function to get just the city name (first location component)
    function getDisplayCity(fullLocation) {
      if (!fullLocation) return fullLocation;
      
      // Split by commas and get the first part (city)
      const parts = fullLocation.split(',').map(part => part.trim());
      return parts[0];
    }

    async function getCityFromCoords(lat, lon) {
      try {
        // Add timeout to the OpenStreetMap API call - longer timeout for mobile
        const platform = detectDeviceAndPlatform();
        const timeoutMs = platform.isMobile ? 15000 : 10000; // 15 seconds for mobile, 10 for desktop
        
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
        
        debugLog(`Fetching location data with ${timeoutMs}ms timeout, mobile: ${platform.isMobile}`);
        
        const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}&zoom=10&addressdetails=1`, {
          signal: controller.signal,
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
          console.warn(`OpenStreetMap API call timed out after ${platform.isMobile ? '15' : '10'} seconds`);
          debugLog('OpenStreetMap API timeout');
        } else {
          console.warn('OpenStreetMap API error:', error);
          debugLog('OpenStreetMap API error:', error.message);
        }
        throw error;
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
      document.getElementById('loading').classList.add('hidden');
      document.getElementById('loading').classList.remove('visible');
      document.getElementById('skeletonLoader').classList.add('hidden');
      document.getElementById('skeletonLoader').classList.remove('visible');
      document.getElementById('tempChart').classList.remove('visible');
      document.getElementById('tempChart').classList.add('hidden');
      errorMessage.textContent = message;
      errorContainer.style.display = 'block';
    }

    function hideError() {
      const errorContainer = document.getElementById('errorContainer');
      errorContainer.style.display = 'none';
      document.getElementById('errorMessage').textContent = '';
    }

    // Modify the fetchHistoricalData function to handle timeouts better
    const fetchHistoricalData = async () => {
      debugTime('Total fetch time');
      showInitialLoadingState();
      hideError();

      try {
        const url = getApiUrl(`/data/${tempLocation}/${month}-${day}`);
        const response = await apiFetch(url);
        
        // Log the raw response for debugging
        const responseText = await response.text();
        console.log('🔍 Raw API Response:', {
          status: response.status,
          statusText: response.statusText,
          headers: Object.fromEntries(response.headers.entries()),
          body: responseText
        });
        
        // Try to parse as JSON
        let data;
        try {
          data = JSON.parse(responseText);
        } catch (parseError) {
          console.error('❌ JSON Parse Error:', parseError);
          console.error('❌ Response was not valid JSON:', responseText);
          throw new Error(`Invalid JSON response: ${responseText.substring(0, 200)}...`);
        }

        if (!data.weather?.data) {
          throw new Error('Invalid data format received from '+url);
        }

        // Update the chart with the weather data
        // Transform API data from {x: year, y: temperature} to {x: temperature, y: year} for horizontal bars
        const chartData = data.weather.data.map(point => ({ x: point.y, y: point.x }));
        
        debugLog('Raw weather data:', data.weather.data);
        debugLog('Chart data:', chartData);
        debugLog('Data structure:', {
          'Expected format': 'x: temperature, y: year',
          'Sample point': chartData[0],
          'Temperature values (p.x)': chartData.map(p => p.x),
          'Year values (p.y)': chartData.map(p => p.y)
        });
        
        // Additional debugging for data format issues
        console.log('🔍 DEBUG: Data format check');
        console.log('First data point:', chartData[0]);
        console.log('All data points:', chartData);
        console.log('X values (should be temperatures):', chartData.map(p => p.x));
        console.log('Y values (should be years):', chartData.map(p => p.y));
        console.log('Data types:', {
          'x type': typeof chartData[0]?.x,
          'y type': typeof chartData[0]?.y
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
                      xMin: data.average.average,
                      xMax: data.average.average,
                      borderColor: avgColour,
                      borderWidth: 2,
                      label: {
                        display: true,
                        content: `Average: ${data.average.average.toFixed(1)}°C`,
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
                    stepSize: 1,
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

        // Update text elements
        document.getElementById('summaryText').textContent = data.summary || 'No summary available.';
        document.getElementById('avgText').textContent = `Average: ${data.average.average.toFixed(1)}°C`;
        
        if (data.trend) {
          const direction = data.trend.slope > 0 ? 'rising' : data.trend.slope < 0 ? 'falling' : 'stable';
          const formatted = `Trend: ${direction} at ${Math.abs(data.trend.slope).toFixed(2)} ${data.trend.units}`;
          document.getElementById('trendText').textContent = formatted;
        }

        // Show the chart
        showChart();
        chart.update('none');

      } catch (error) {
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

    function getOrdinal(n) {
      const s = ["th", "st", "nd", "rd"];
      const v = n % 100;
      return n + (s[(v - 20) % 10] || s[v] || s[0]);
    }

    function displayLocationAndFetchData() {
      stopLocationProgress();
      document.getElementById('locationText').textContent = getDisplayCity(tempLocation);
      
      // Clear the initial status message and show location confirmation
      const dataNotice = document.getElementById('dataNotice');
      if (dataNotice) {
        dataNotice.innerHTML = `<div style="text-align: center; padding: 15px; color: #51cf66; background: rgba(81,207,102,0.1); border-radius: 6px; border: 1px solid rgba(81,207,102,0.3);">
          <p style="margin: 0; font-weight: 500;">📍 Location set to: <strong>${getDisplayCity(tempLocation)}</strong></p>
          <p style="margin: 5px 0 0 0; font-size: 14px;">Loading temperature data...</p>
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

      const skeleton = document.getElementById('skeletonLoader');
      skeleton.classList.add('hidden');
      skeleton.classList.remove('visible');

      canvasEl.classList.add('visible');
      canvasEl.classList.remove('hidden');
      
      // Clear the data notice and show success message
      const dataNotice = document.getElementById('dataNotice');
      if (dataNotice) {
        dataNotice.innerHTML = `<div style="text-align: center; padding: 15px; color: #51cf66; background: rgba(81,207,102,0.1); border-radius: 6px; border: 1px solid rgba(81,207,102,0.3);">
          <p style="margin: 0; font-weight: 500;">✅ Temperature data loaded successfully!</p>
          <p style="margin: 5px 0 0 0; font-size: 14px;">Showing data for ${getDisplayCity(tempLocation)}</p>
        </div>`;
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
        <div style="text-align: center; padding: 20px; color: #ff6b6b; background: rgba(255,107,107,0.1); border-radius: 8px; border: 2px solid rgba(255,107,107,0.3);">
          <p style="margin: 0 0 15px 0; font-weight: 600; font-size: 16px;">🔒 Manual Location Input Disabled</p>
          <p style="margin: 0 0 15px 0; color: #666; font-size: 14px;">To protect against API abuse, manual location entry is not available. Please enable location permissions in your browser settings to use this service.</p>
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
      
      // Update debug status
      if (window.updateDebugStatus) {
        window.updateDebugStatus('Starting location detection...');
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
      console.log('Location detection environment:', deviceInfo);
      
      // Add more specific debugging for mobile location issues
      if (platform.isMobile) {
        console.log('🔍 MOBILE LOCATION DEBUG INFO:');
        console.log('- HTTPS:', deviceInfo.isSecure);
        console.log('- Geolocation available:', deviceInfo.hasGeolocation);
        console.log('- Permissions available:', deviceInfo.hasPermissions);
        console.log('- Current protocol:', deviceInfo.protocol);
        console.log('- Current hostname:', deviceInfo.hostname);
        console.log('- User agent:', deviceInfo.userAgent);
        
        // Add visual debugging to the page
        const debugInfo = document.createElement('div');
        debugInfo.style.cssText = 'background: rgba(0,0,0,0.8); color: white; padding: 15px; margin: 10px 0; border-radius: 8px; font-family: monospace; font-size: 12px; line-height: 1.4;';
        debugInfo.innerHTML = `
          <strong>🔍 Mobile Location Debug Info:</strong><br>
          HTTPS: ${deviceInfo.isSecure ? '✅ Yes' : '❌ No'}<br>
          Geolocation: ${deviceInfo.hasGeolocation ? '✅ Available' : '❌ Not Available'}<br>
          Permissions: ${deviceInfo.hasPermissions ? '✅ Available' : '❌ Not Available'}<br>
          Protocol: ${deviceInfo.protocol}<br>
          Hostname: ${deviceInfo.hostname}<br>
          User Agent: ${deviceInfo.userAgent.substring(0, 50)}...
        `;
        
        const dataNotice = document.getElementById('dataNotice');
        if (dataNotice) {
          dataNotice.appendChild(debugInfo);
        }
      }
      
      // Update loading message for location stage
      updateLoadingMessageByStage('location');
      startLocationProgress();
      
      // Check for cached location first
      const cachedLocation = getLocationCookie();
      if (cachedLocation) {
        debugLog('Using cached location:', cachedLocation);
        stopLocationProgress();
        tempLocation = cachedLocation;
        displayLocationAndFetchData();
        return;
      }

      // Check if we're on HTTPS (required for geolocation on mobile)
      const isSecure = window.location.protocol === 'https:' || window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
      if (!isSecure) {
        console.warn('Geolocation requires HTTPS on mobile devices');
        debugLog('Not on HTTPS, showing manual location input');
        
        // Update debug status
        if (window.updateDebugStatus) {
          window.updateDebugStatus('HTTP detected - showing manual input');
        }
        
        const dataNotice = document.getElementById('dataNotice');
        if (dataNotice) {
          dataNotice.innerHTML = `
            <div style="text-align: center; padding: 15px; color: #ff6b6b; background: rgba(255,107,107,0.1); border-radius: 6px; border: 2px solid rgba(255,107,107,0.3);">
              <p style="margin: 0; font-weight: 500;">📍 Location Access</p>
              <p style="margin: 5px 0 0 0; font-size: 14px;">Mobile browsers require HTTPS for automatic location detection. Please enter your location manually below.</p>
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
        
        // Update debug status
        if (window.updateDebugStatus) {
          window.updateDebugStatus('Permission denied - showing instructions');
        }
        
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
            dataNotice.style.color = '#ff6b6b';
            // Show permission instructions for mobile users
            showPermissionInstructions('denied', true);
          }
        }
        
        displayLocationAndFetchData(); // fallback to default location
      }, totalTimeout);

      debugLog('Requesting geolocation...');
      
      // Update loading message for permission stage
      updateLoadingMessageByStage('permission');
      
      // Update debug status
      if (window.updateDebugStatus) {
        window.updateDebugStatus('Requesting geolocation...');
      }
      
      console.log('Geolocation options:', {
        enableHighAccuracy: false,
        timeout: devicePlatform.isMobile ? 20000 : 25000, // 20 seconds for mobile, 25 for desktop
        maximumAge: 300000, // Accept cached location up to 5 minutes old
        isMobile: devicePlatform.isMobile,
        permissionState,
        isSecure
      });
      
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          clearTimeout(geolocationTimeout);
          stopLocationProgress();
          debugLog('Geolocation received:', position.coords);
          
          // Update debug status
          if (window.updateDebugStatus) {
            window.updateDebugStatus('Geolocation received, fetching city...');
          }
          
          const { latitude, longitude } = position.coords;
          debugLog('Fetching city name from coordinates...');
          
          try {
            tempLocation = await getCityFromCoords(latitude, longitude);
            console.log(`Detected location: ${tempLocation} (city: ${getDisplayCity(tempLocation)})`);
            debugLog('Location detection complete');
            
            // Update debug status
            if (window.updateDebugStatus) {
              window.updateDebugStatus('Success: Location detected');
            }
          } catch (error) {
            console.warn('Error getting city name:', error);
            debugLog('Failed to get city name, falling back to default location');
            
            // Show error message to user on mobile
            if (isMobile) {
              const dataNotice = document.getElementById('dataNotice');
              if (dataNotice) {
                dataNotice.textContent = 'Location lookup failed. Please enable location permissions to use this service.';
                dataNotice.style.color = '#ff6b6b';
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
          
          // Update debug status
          if (window.updateDebugStatus) {
            window.updateDebugStatus(`Error: ${error.message}`);
          }
          
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
              dataNotice.style.color = '#ff6b6b';
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
}