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
        loadingText.textContent = 'Is today warmer than average in '+tempLocation+'?';
      } else if (elapsedSeconds < 60) {
        loadingText.textContent = 'Once we have the data we\'ll know.';
      } else if (elapsedSeconds < 80) {
        loadingText.textContent = 'Please be patient. It shouldn\'t be much longer.';
      } else {
        loadingText.textContent = 'The server is taking a while to respond.';
      }
    }

    // get the location
    let tempLocation = 'London, UK'; // default

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

    async function getCityFromCoords(lat, lon) {
      const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}`);
      const data = await response.json();
      
      // Get city name
      const city = data.address.city || data.address.town || data.address.village;
      
      // Get country code
      const country = data.address.country_code;
      
      if (city && country) {
        // Convert country code to country name for better readability
        const countryNames = {
          'gb': 'UK',
          'us': 'US',
          'ca': 'Canada',
          'au': 'Australia',
          'de': 'Germany',
          'fr': 'France',
          'it': 'Italy',
          'es': 'Spain',
          'nl': 'Netherlands',
          'be': 'Belgium',
          'ch': 'Switzerland',
          'at': 'Austria',
          'se': 'Sweden',
          'no': 'Norway',
          'dk': 'Denmark',
          'fi': 'Finland',
          'pl': 'Poland',
          'cz': 'Czech Republic',
          'hu': 'Hungary',
          'ro': 'Romania',
          'bg': 'Bulgaria',
          'hr': 'Croatia',
          'si': 'Slovenia',
          'sk': 'Slovakia',
          'lt': 'Lithuania',
          'lv': 'Latvia',
          'ee': 'Estonia',
          'ie': 'Ireland',
          'pt': 'Portugal',
          'gr': 'Greece',
          'cy': 'Cyprus',
          'mt': 'Malta',
          'lu': 'Luxembourg',
          'is': 'Iceland',
          'jp': 'Japan',
          'kr': 'South Korea',
          'cn': 'China',
          'in': 'India',
          'br': 'Brazil',
          'mx': 'Mexico',
          'ar': 'Argentina',
          'cl': 'Chile',
          'pe': 'Peru',
          'co': 'Colombia',
          've': 'Venezuela',
          'uy': 'Uruguay',
          'py': 'Paraguay',
          'bo': 'Bolivia',
          'ec': 'Ecuador',
          'nz': 'New Zealand',
          'za': 'South Africa',
          'eg': 'Egypt',
          'ma': 'Morocco',
          'tn': 'Tunisia',
          'dz': 'Algeria',
          'ly': 'Libya',
          'sd': 'Sudan',
          'et': 'Ethiopia',
          'ke': 'Kenya',
          'ng': 'Nigeria',
          'gh': 'Ghana',
          'ci': 'Ivory Coast',
          'sn': 'Senegal',
          'ml': 'Mali',
          'bf': 'Burkina Faso',
          'ne': 'Niger',
          'td': 'Chad',
          'cm': 'Cameroon',
          'cf': 'Central African Republic',
          'cg': 'Congo',
          'cd': 'DR Congo',
          'ao': 'Angola',
          'zm': 'Zambia',
          'zw': 'Zimbabwe',
          'bw': 'Botswana',
          'na': 'Namibia',
          'sz': 'Eswatini',
          'ls': 'Lesotho',
          'mg': 'Madagascar',
          'mu': 'Mauritius',
          'sc': 'Seychelles',
          'km': 'Comoros',
          'dj': 'Djibouti',
          'so': 'Somalia',
          'er': 'Eritrea',
          'ss': 'South Sudan',
          'ug': 'Uganda',
          'rw': 'Rwanda',
          'bi': 'Burundi',
          'tz': 'Tanzania',
          'mw': 'Malawi',
          'mz': 'Mozambique'
        };
        
        const countryName = countryNames[country.toLowerCase()] || country.toUpperCase();
        return `${city}, ${countryName}`;
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
      hideChart();
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
                  label: `Temperature in ${tempLocation} on ${friendlyDate}`,
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
      document.getElementById('locationText').textContent = tempLocation;
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

    // Add reload button handler (moved outside DOMContentLoaded)
    const reloadButton = document.getElementById('reloadButton');
    if (reloadButton) {
      reloadButton.addEventListener('click', () => {
        window.location.reload();
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

      // Set a timeout for geolocation
      const geolocationTimeout = setTimeout(() => {
        debugLog('Geolocation request timed out after 10 seconds');
        console.warn('Geolocation request timed out, falling back to default location');
        displayLocationAndFetchData(); // fallback to default location
      }, 10000); // 10 second timeout

      debugLog('Requesting geolocation...');
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          clearTimeout(geolocationTimeout);
          debugLog('Geolocation received:', position.coords);
          const { latitude, longitude } = position.coords;
          debugLog('Fetching city name from coordinates...');
          try {
            tempLocation = await getCityFromCoords(latitude, longitude);
            console.log(`Detected location: ${tempLocation}`);
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
          switch(error.code) {
            case error.TIMEOUT:
              debugLog('Geolocation timed out');
              break;
            case error.POSITION_UNAVAILABLE:
              debugLog('Location information is unavailable');
              break;
            case error.PERMISSION_DENIED:
              debugLog('Location permission denied');
              break;
          }
          displayLocationAndFetchData();
        },
        {
          enableHighAccuracy: false, // Don't wait for GPS
          timeout: 5000, // 5 second timeout
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