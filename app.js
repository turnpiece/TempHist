// Constants and configuration
const DEBUGGING = true;

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

const API_TOKEN = 'testing'; // For testing - Ideally, inject via server or obfuscate if needed

// Wrapper function for API fetches that adds the API token
async function apiFetch(url, options = {}) {
  const headers = {
    'X-API-Token': API_TOKEN,
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

// Wait for Chart.js to be available
document.addEventListener('DOMContentLoaded', () => {
  if (typeof Chart === 'undefined') {
    console.error('Chart.js not loaded');
    return;
  }

  Chart.register(window['chartjs-plugin-annotation']);

  const apiBase = 'https://api.temphist.com';
  const localApiBase = 'http://localhost:3000/api';

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
  const barData = [];

  // whether or not to show the chart
  let chart;

  const friendlyDate = `${getOrdinal(Number(day))} ${new Date().toLocaleString('en-GB', { month: 'long' })}`;

  // display the date
  document.getElementById('dateText').textContent = friendlyDate;

  // Apply colors to text elements
  function applyTextColors() {
    // Text colors
    document.getElementById('summaryText').style.color = thisYearColour;
    document.getElementById('avgText').style.color = avgColour;
    document.getElementById('trendText').style.color = trendColour;
    
    // Header and footer colors
    document.getElementById('header').style.color = barColour;
    document.getElementById('footer').style.color = barColour;
    document.querySelector('#footer a').style.color = barColour;
    
    // Spinner colors
    const spinner = document.querySelector('.spinner');
    spinner.style.borderColor = `${barColour}33`; // 20% opacity
    spinner.style.borderTopColor = barColour;
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
    } else if (elapsedSeconds < 30) {
      loadingText.textContent = 'Still loading... This might take a moment.';
    } else if (elapsedSeconds < 60) {
      loadingText.textContent = 'Taking longer than usual... The server is waking up.';
    } else {
      loadingText.textContent = 'The server is taking a while to respond. This is normal for the first request after inactivity.';
    }
  }

  // get the location
  let tempLocation = 'London'; // default

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
    return data.address.city || data.address.town || data.address.village || tempLocation;
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

  // Modify the fetchHistoricalData function to handle timeouts better
  const fetchHistoricalData = async () => {
    debugTime('Total fetch time');
    hideChart();

    const years = Array.from({ length: currentYear - startYear + 1 }, (_, i) => currentYear - i);
    debugLog(`Fetching data for ${years.length} years...`);

    // Batch the years into groups of 10 for parallel processing
    const batchSize = 10;
    const batches = [];
    for (let i = 0; i < years.length; i += batchSize) {
      batches.push(years.slice(i, i + batchSize));
    }

    const results = [];
    let firstBatchReceived = false;

    for (const batch of batches) {
      const batchResults = await Promise.allSettled(
        batch.map(async year => {
          const date = `${year}-${month}-${day}`;
          const url = getApiUrl(`/weather/${tempLocation}/${date}`);
          try {
            const startTime = DEBUGGING ? performance.now() : 0;
            const response = await apiFetch(url);
            if (!response.ok) {
              throw new Error(`HTTP error! status: ${response.status}`);
            }
            const data = await response.json();
            if (DEBUGGING) {
              const endTime = performance.now();
              debugLog(`Year ${year} fetch took ${(endTime - startTime).toFixed(2)}ms`);
            }
            const temp = data.days?.[0]?.temp;
            return { year, temp };
          } catch (e) {
            console.warn(`Fetch failed for ${year}:`, e.message);
            return { year, temp: null };
          }
        })
      );
      results.push(...batchResults);

      // After first batch, initialize and show chart
      if (!firstBatchReceived) {
        const validResults = results
          .filter(r => r.status === 'fulfilled' && r.value.temp !== null)
          .map(r => r.value)
          .sort((a, b) => a.year - b.year);

        if (validResults.length) {
          debugTime('Chart initialization');
          const initialData = validResults.map(({ year, temp }) => ({ x: temp, y: year }));
          barData.push(...initialData);
          
          // Create initial chart
          const ctx = document.getElementById('tempChart').getContext('2d');
          
          // Calculate available height for bars
          const numBars = currentYear - startYear + 1;
          const targetBarHeight = 3; // Reduced from 35 to 3
          const totalBarHeight = numBars * targetBarHeight;
          const containerEl = canvasEl.parentElement;
          const containerHeight = containerEl.clientHeight;
          const availableHeight = containerHeight - 40; // Subtract some padding for axes
          
          debugLog('Initial chart setup:', {
            windowWidth: window.innerWidth,
            targetBarHeight,
            numBars,
            totalBarHeight,
            containerHeight,
            availableHeight,
            canvasHeight: canvasEl.clientHeight
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
                  data: barData,
                  backgroundColor: barData.map(point => 
                    point.y === currentYear ? thisYearColour : barColour
                  ),
                  borderWidth: 0
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
                  right: 0,
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
                      xMin: 0,
                      xMax: 0,
                      borderColor: avgColour,
                      borderWidth: 2,
                      label: {
                        display: true,
                        content: 'Average',
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
                    }
                  },
                  min: Math.floor(Math.min(...barData.map(p => p.x)) - 1),
                  max: Math.ceil(Math.max(...barData.map(p => p.x)) + 1),
                  ticks: {
                    font: {
                      size: 11
                    },
                    stepSize: 2,
                    callback: function(value) {
                      // Only show even numbers
                      return value % 2 === 0 ? value : '';
                    }
                  }
                },
                y: {
                  reverse: false,
                  type: 'linear',
                  min: startYear,
                  max: currentYear,
                  ticks: {
                    stepSize: 1,
                    callback: val => val.toString(),
                    font: {
                      size: 11
                    }
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
          
          debugLog('Initial chart created with data:', barData);
          debugLog('Initial x-axis config:', chart.options.scales.x);
          
          debugTimeEnd('Chart initialization');
          showChart();
          firstBatchReceived = true;
        }
      }
    }

    const validResults = results
      .filter(r => r.status === 'fulfilled' && r.value.temp !== null)
      .map(r => r.value)
      .sort((a, b) => a.year - b.year);

    if (validResults.length) {
      debugTime('Adding data points');
      // Collect all data points
      const allData = validResults.map(({ year, temp }) => ({ x: temp, y: year }));
      barData.length = 0; // Clear existing data
      barData.push(...allData);
      
      debugLog('Updating chart with data:', barData);
      debugLog('Current x-axis config before update:', chart.options.scales.x);
      
      // Update existing chart instead of recreating it
      chart.data.datasets[1].data = [...barData];
      chart.data.datasets[1].backgroundColor = barData.map(point => 
        point.y === currentYear ? thisYearColour : barColour
      );

      // Update x-axis range
      const temps = barData.map(p => p.x);
      const minTemp = Math.min(...temps);
      const maxTemp = Math.max(...temps);

      // Ensure min and max are even numbers
      const min = Math.floor(minTemp - 1);
      const max = Math.ceil(maxTemp + 1);
      const evenMin = min % 2 === 0 ? min : min - 1;
      const evenMax = max % 2 === 0 ? max : max + 1;

      // Completely reset the x-axis configuration
      chart.options.scales.x = {
        type: 'linear',
        title: {
          display: true,
          text: 'Temperature (°C)',
          font: {
            size: 12
          }
        },
        min: evenMin,
        max: evenMax,
        ticks: {
          font: {
            size: 11
          },
          stepSize: 2,
          callback: function(value) {
            // Only show even numbers
            return value % 2 === 0 ? value : '';
          }
        }
      };

      debugLog('New x-axis config:', chart.options.scales.x);

      // Force a complete update with animation disabled
      chart.update('none');
      
      debugLog('Chart updated. Current x-axis config:', chart.options.scales.x);
      debugLog('Chart dimensions:', {
        width: chart.width,
        height: chart.height,
        canvasWidth: chart.canvas.width,
        canvasHeight: chart.canvas.height
      });

      debugTimeEnd('Adding data points');

      // Get average from API
      debugTime('Average line update');
      await updateAverageLine();
      debugTimeEnd('Average line update');
    }

    debugTimeEnd('Total fetch time');

    if (showTrend && chart) {
      const trendData = calculateTrendLine(barData.map(d => ({ x: d.y, y: d.x })), startYear - 0.5, currentYear + 0.5);
      chart.data.datasets[0].data = trendData.points.map(p => ({ x: p.y, y: p.x })); // swap back for chart
      chart.update();
    }
  };

  const fetchSummary = async () => {
    const url = getApiUrl(`/summary/${tempLocation}/${month}-${day}`);
    try {
      const response = await apiFetch(url);
      const data = await response.json();
      document.getElementById('summaryText').textContent = data.summary || 'No summary available.';
    } catch (error) {
      console.warn(`Summary fetch error: ${error.message}`);
    }
  };

  const fetchTrend = async () => {
    const url = getApiUrl(`/trend/${tempLocation}/${month}-${day}`);
    try {
      const response = await apiFetch(url);
      const data = await response.json();

      if (typeof data.slope === 'number' && data.units) {
        const direction = data.slope > 0 ? 'rising' : data.slope < 0 ? 'falling' : 'stable';
        const formatted = `Trend: ${direction} at ${Math.abs(data.slope).toFixed(2)} ${data.units}`;
        document.getElementById('trendText').textContent = formatted;
      } else {
        document.getElementById('trendText').textContent = 'No trend data available.';
      }
    } catch (error) {
      console.warn(`Trend fetch error: ${error.message}`);
    }
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

  async function updateAverageLine() {
    try {
      const url = getApiUrl(`/average/${tempLocation}/${month}-${day}`);
      const response = await apiFetch(url);
      const data = await response.json();
      
      if (typeof data.average === 'number') {
        const annotation = chart.options.plugins.annotation.annotations.averageLine;
        annotation.xMin = data.average;
        annotation.xMax = data.average;
        annotation.label.content = `Average: ${data.average.toFixed(1)}°C`;
        chart.update();

        // display average temperature
        document.getElementById('avgText').textContent = `Average: ${data.average.toFixed(1)}°C`;
      }
    } catch (error) {
      console.warn('Average fetch error:', error);
    }
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
    fetchSummary();
    if (showTrend) {
      fetchTrend();
    }
  }

  function showChart() {
    if (loadingCheckInterval) {
      clearInterval(loadingCheckInterval);
      loadingCheckInterval = null;
    }
    loadingStartTime = null;
    loadingEl.style.display = 'none';
    canvasEl.style.display = 'block';
    
    // Force a chart update if it exists
    if (chart) {
      chart.update('none'); // 'none' means don't animate
    }
  }

  function hideChart() {
    loadingStartTime = Date.now();
    loadingCheckInterval = setInterval(updateLoadingMessage, 1000);
    loadingEl.style.display = 'block';
    canvasEl.style.display = 'none';
    updateLoadingMessage(); // Initial message
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
});