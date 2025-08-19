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

    const apiBase = 'https://api.temphist.com';
    const localApiBase = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
      ? 'http://localhost:3000/api'
      : apiBase;

    debugLog('Constants initialized');

    const now = new Date();
    const useYesterday = now.getHours() < 1;
    const dateToUse = new Date(now);

    debugLog('Date calculations complete:', { now, useYesterday, dateToUse });

    if (useYesterday) {
      dateToUse.setDate(dateToUse.getDate() - 1);
      debugLog('Using yesterday\'s date');
    }

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
      
      updateLoadingMessage();
    }

    // get the location
    let tempLocation = 'London, England, United Kingdom'; // default

    // Helper function to handle API URLs
    function getApiUrl(path) {
      const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
      if (isLocalhost) {
        if (DEBUGGING) {
          const dataNotice = document.getElementById('dataNotice');
          dataNotice.textContent = `Debug: Using local API at ${localApiBase}${path}`;
          dataNotice.style.color = '#666';
        }
        return `${localApiBase}${path}`;
      }
      return apiBase + path;
    }

    // Helper function to get display-friendly location (without country)
    function getDisplayLocation(fullLocation) {
      if (!fullLocation) return fullLocation;
      
      // Split by commas and remove the last part (country)
      const parts = fullLocation.split(',').map(part => part.trim());
      
      // If we have 3 or more parts, remove the last one (country)
      if (parts.length >= 3) {
        return parts.slice(0, -1).join(', ');
      }
      
      // If we have 2 parts, assume it's city, country, so remove country
      if (parts.length === 2) {
        return parts[0];
      }
      
      // If only 1 part, return as is
      return fullLocation;
    }

    // Helper function to get just the city name (first location component)
    function getDisplayCity(fullLocation) {
      if (!fullLocation) return fullLocation;
      
      // Split by commas and get the first part (city)
      const parts = fullLocation.split(',').map(part => part.trim());
      return parts[0];
    }

    async function getCityFromCoords(lat, lon) {
      const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}`);
      const data = await response.json();
      
      debugLog('OpenStreetMap address data:', data.address);
      
      // Get city name
      const city = data.address.city || data.address.town || data.address.village;
      
      // Get state/province information
      const state = data.address.state || data.address.province || data.address.county;
      
      // Get country name (prefer full name over code for better API compatibility)
      const country = data.address.country || data.address.country_code;
      
      debugLog('Location components:', { city, state, country });
      
      if (city && country) {
        // Build location string with state/province and country
        if (state) {
          return `${city}, ${state}, ${country}`;
        } else {
          return `${city}, ${country}`;
        }
      }
      
      // Fallback to just city name if no country info
      return city || tempLocation;
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
        const data = await response.json();

        if (!data.weather?.data) {
          throw new Error('Invalid data format received from '+url);
        }

        // Update the chart with the weather data
        const chartData = data.weather.data.map(point => ({ x: point.y, y: point.x }));
        
        debugLog('Raw weather data:', data.weather.data);
        debugLog('Processed chart data:', chartData);
        
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
          const temps = chartData.map(p => p.x);
          const minTemp = Math.floor(Math.min(...temps) - 1);
          const maxTemp = Math.ceil(Math.max(...temps) + 1);
          
          debugLog('Temperature range calculation:', {
            temps,
            minTemp,
            maxTemp,
            chartDataLength: chartData.length
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
                  label: `Temperature in ${getDisplayLocation(tempLocation)} on ${friendlyDate}`,
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
          const temps = chartData.map(p => p.x);
          const minTemp = Math.floor(Math.min(...temps) - 1);
          const maxTemp = Math.ceil(Math.max(...temps) + 1);
          
          chart.data.datasets[1].data = chartData;
          chart.data.datasets[1].backgroundColor = chartData.map(point => 
            point.y === currentYear ? thisYearColour : barColour
          );
          chart.data.datasets[1].base = minTemp;

          // Update x-axis range (temperature axis)
          chart.options.scales.x.min = minTemp;
          chart.options.scales.x.max = maxTemp;
        }

        // Update trend line if enabled
        if (showTrend && chart) {
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

    const params = new URLSearchParams(window.location.search);
    debugLog('URL parameters checked');
    if (params.get('location')) {
      debugLog('Location parameter found in URL');
      tempLocation = params.get('location');
      displayLocationAndFetchData();
    } else {
      debugLog('No location parameter, starting geolocation detection');
      detectUserLocation(); // uses geolocation
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

    function getOrdinal(n) {
      const s = ["th", "st", "nd", "rd"];
      const v = n % 100;
      return n + (s[(v - 20) % 10] || s[v] || s[0]);
    }

    function displayLocationAndFetchData() {
      document.getElementById('locationText').textContent = getDisplayLocation(tempLocation);
      
      // Clear the initial status message
      const dataNotice = document.getElementById('dataNotice');
      if (dataNotice) {
        dataNotice.textContent = '';
      }
      
      setLocationCookie(tempLocation);
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
      if (chart) {
        chart.update('none');
      }
    }

    function hideChart() {
      // This function is now only called when we're about to fetch data
      // The loading state should already be shown by showInitialLoadingState()
      // Just ensure the chart is hidden
      canvasEl.classList.remove('visible');
      canvasEl.classList.add('hidden');
    }

    // Add reload button handler (moved outside DOMContentLoaded)
    const reloadButton = document.getElementById('reloadButton');
    if (reloadButton) {
      reloadButton.addEventListener('click', () => {
        window.location.reload();
      });
    }

    // Add manual location input functionality
    function addManualLocationInput() {
      const dataNotice = document.getElementById('dataNotice');
      if (!dataNotice) return;
      
      // Create manual location input
      const locationInput = document.createElement('div');
      locationInput.innerHTML = `
        <div style="margin: 10px 0; padding: 10px; background: rgba(255,107,107,0.1); border-radius: 5px;">
          <p style="margin: 0 0 10px 0; color: #ff6b6b;">Location not detected automatically</p>
          <input type="text" id="manualLocation" placeholder="Enter your city (e.g., Manchester, England, United Kingdom)" 
                 style="width: 100%; padding: 8px; border: 1px solid #ccc; border-radius: 3px; margin-right: 10px;">
          <button id="setLocationBtn" style="padding: 8px 16px; background: #ff6b6b; color: white; border: none; border-radius: 3px; cursor: pointer;">
            Set Location
          </button>
        </div>
      `;
      
      dataNotice.appendChild(locationInput);
      
      // Add event listeners
      const setLocationBtn = document.getElementById('setLocationBtn');
      const manualLocationInput = document.getElementById('manualLocation');
      
      setLocationBtn.addEventListener('click', () => {
        const location = manualLocationInput.value.trim();
        if (location) {
          tempLocation = location;
          setLocationCookie(location);
          displayLocationAndFetchData();
          // Remove the manual input
          locationInput.remove();
        }
      });
      
      // Allow Enter key to submit
      manualLocationInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
          setLocationBtn.click();
        }
      });
    }

    // Modify the detectUserLocation function to use cookies
    async function detectUserLocation() {
      debugLog('Starting location detection...');
      
      // Check for cached location first
      const cachedLocation = getLocationCookie();
      if (cachedLocation) {
        debugLog('Using cached location:', cachedLocation);
        tempLocation = cachedLocation;
        displayLocationAndFetchData();
        return;
      }

      if (!navigator.geolocation) {
        console.warn('Geolocation is not supported by this browser.');
        debugLog('Geolocation not supported, falling back to default location');
        displayLocationAndFetchData(); // fallback
        return;
      }

      // Check if geolocation permission is already denied
      if (navigator.permissions && navigator.permissions.query) {
        try {
          const permission = await navigator.permissions.query({ name: 'geolocation' });
          if (permission.state === 'denied') {
            console.warn('Geolocation permission already denied');
            debugLog('Geolocation permission denied, falling back to default location');
            displayLocationAndFetchData();
            return;
          }
        } catch (e) {
          debugLog('Could not check geolocation permission:', e);
        }
      }

      // Set a shorter timeout for mobile devices
      const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
      const geolocationTimeout = setTimeout(() => {
        debugLog('Geolocation request timed out after ' + (isMobile ? '5' : '10') + ' seconds');
        console.warn('Geolocation request timed out, falling back to default location');
        
        // For mobile devices, show manual location input
        if (isMobile) {
          const dataNotice = document.getElementById('dataNotice');
          if (dataNotice) {
            dataNotice.textContent = 'Location detection timed out. Using default location.';
            dataNotice.style.color = '#ff6b6b';
            // Add manual location input for mobile users
            setTimeout(() => addManualLocationInput(), 1000);
          }
        }
        
        displayLocationAndFetchData(); // fallback to default location
      }, isMobile ? 5000 : 10000); // 5 seconds for mobile, 10 for desktop

      debugLog('Requesting geolocation...');
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          clearTimeout(geolocationTimeout);
          debugLog('Geolocation received:', position.coords);
          const { latitude, longitude } = position.coords;
          debugLog('Fetching city name from coordinates...');
          try {
            tempLocation = await getCityFromCoords(latitude, longitude);
            console.log(`Detected location: ${tempLocation} (display: ${getDisplayLocation(tempLocation)}, city: ${getDisplayCity(tempLocation)})`);
            debugLog('Location detection complete');
          } catch (error) {
            console.warn('Error getting city name:', error);
            debugLog('Failed to get city name, falling back to default location');
          }
          
          displayLocationAndFetchData();
        },
        (error) => {
          clearTimeout(geolocationTimeout);
          console.warn('Geolocation error:', error.message);
          debugLog('Geolocation failed:', error.code, error.message);
          
          // More specific error handling for mobile
          switch(error.code) {
            case error.TIMEOUT:
              debugLog('Geolocation timed out');
              if (isMobile) {
                console.warn('Mobile device geolocation timed out - this is common on mobile');
              }
              break;
            case error.POSITION_UNAVAILABLE:
              debugLog('Location information is unavailable');
              break;
            case error.PERMISSION_DENIED:
              debugLog('Location permission denied');
              if (isMobile) {
                console.warn('Mobile device denied location permission - check browser settings');
              }
              break;
          }
          
          // For mobile devices, show a more helpful message and manual input
          if (isMobile) {
            if (error.code === error.PERMISSION_DENIED) {
              const dataNotice = document.getElementById('dataNotice');
              if (dataNotice) {
                dataNotice.textContent = 'Location access denied. Using default location.';
                dataNotice.style.color = '#ff6b6b';
                // Add manual location input for mobile users
                setTimeout(() => addManualLocationInput(), 1000);
              }
            } else if (error.code === error.TIMEOUT) {
              const dataNotice = document.getElementById('dataNotice');
              if (dataNotice) {
                dataNotice.textContent = 'Location detection timed out. Using default location.';
                dataNotice.style.color = '#ff6b6b';
                // Add manual location input for mobile users
                setTimeout(() => addManualLocationInput(), 1000);
              }
            }
          }
          
          displayLocationAndFetchData();
        },
        {
          enableHighAccuracy: false, // Don't wait for GPS
          timeout: isMobile ? 8000 : 5000, // 8 seconds for mobile, 5 for desktop
          maximumAge: 60000 // Accept cached location up to 1 minute old
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