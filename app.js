Chart.register(window['chartjs-plugin-annotation']);

const apiBase = 'https://api.temphist.com';
const DEBUGGING = true;

const now = new Date();
const useYesterday = now.getHours() < 1;
const dateToUse = new Date(now);

if (useYesterday) {
  dateToUse.setDate(dateToUse.getDate() - 1);
}

// Handle 29 Feb fallback to 28 Feb if not a leap year in comparison range
const isLeapDay = dateToUse.getDate() === 29 && dateToUse.getMonth() === 1;

if (isLeapDay) {
  dateToUse.setDate(28);
  document.getElementById('dataNotice').textContent = '29th February detected — comparing 28th Feb instead for consistency.';
}

const day = String(dateToUse.getDate()).padStart(2, '0');
const month = String(dateToUse.getMonth() + 1).padStart(2, '0');
const currentYear = dateToUse.getFullYear();

const startYear = currentYear - 50;
const loadingEl = document.getElementById('loading');
const canvasEl = document.getElementById('tempChart');
const barColour = 'rgba(186, 0, 0, 1)';
const thisYearColour = 'rgba(32, 186, 0, 0.8)';
const showTrend = false;
const trendColour = '#999900';
const avgColour = '#009999';
const barData = [];

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

// Helper function to handle API URLs
function getApiUrl(path) {
  if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    return `http://localhost:3000/api${path}`;
  }
  return apiBase + path;
}

async function getCityFromCoords(lat, lon) {
  const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}`);
  const data = await response.json();
  return data.address.city || data.address.town || data.address.village || tempLocation;
}

async function detectUserLocation() {
  if (!navigator.geolocation) {
    console.warn('Geolocation is not supported by this browser.');
    fetchData(); // fallback
    return;
  }

  navigator.geolocation.getCurrentPosition(async (position) => {
    const { latitude, longitude } = position.coords;
    tempLocation = await getCityFromCoords(latitude, longitude);
    console.log(`Detected location: ${tempLocation}`);
    fetchData();
  }, (error) => {
    console.warn('Geolocation error:', error.message);
    fetchData(); // fallback
  });
}

// whether or not to show the chart
let chartVisible;

// set up the chart
let chart;
let chartInitialized = false;
let baseTemp = null;

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const friendlyDate = `${getOrdinal(Number(day))} ${new Date().toLocaleString('en-GB', { month: 'long' })}`;

// display the date
document.getElementById('dateText').textContent = friendlyDate;

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
  for (const batch of batches) {
    const batchResults = await Promise.allSettled(
      batch.map(async year => {
        const date = `${year}-${month}-${day}`;
        const url = getApiUrl(`/weather/${tempLocation}/${date}`);
        try {
          const startTime = DEBUGGING ? performance.now() : 0;
          const response = await fetch(url);
          const data = await response.json();
          if (DEBUGGING) {
            const endTime = performance.now();
            debugLog(`Year ${year} fetch took ${(endTime - startTime).toFixed(2)}ms`);
          }
          const temp = data.days?.[0]?.tempmax;
          return { year, temp };
        } catch (e) {
          console.warn(`Fetch failed for ${year}:`, e);
          return { year, temp: null };
        }
      })
    );
    results.push(...batchResults);
  }

  const validResults = results
    .filter(r => r.status === 'fulfilled' && r.value.temp !== null)
    .map(r => r.value)
    .sort((a, b) => a.year - b.year); // chronological order

  if (validResults.length) {
    debugTime('Chart initialization');
    baseTemp = validResults[0].temp;
    initChart();
    debugTimeEnd('Chart initialization');

    if (!chartVisible) {
      showChart();
    }

    debugTime('Adding data points');
    // Collect all data points first
    const allData = validResults.map(({ year, temp }) => ({ x: temp, y: year }));
    barData.push(...allData);
    
    // Update chart once with all data
    chart.data.datasets[1].data = [...barData];
    
    // Update colors for all bars
    chart.data.datasets[1].backgroundColor = barData.map(point => 
      point.y === currentYear ? thisYearColour : barColour
    );

    // Expand x-axis if needed
    const temps = barData.map(p => p.x);
    const minTemp = Math.min(...temps);
    const maxTemp = Math.max(...temps);
    chart.options.scales.x.min = Math.floor(minTemp - 1);
    chart.options.scales.x.max = Math.ceil(maxTemp + 1);

    chart.update();
    debugTimeEnd('Adding data points');

    // Get average from API
    debugTime('Average line update');
    await updateAverageLine();
    debugTimeEnd('Average line update');
  }

  debugTimeEnd('Total fetch time');

  if (showTrend) {
    const trendData = calculateTrendLine(barData.map(d => ({ x: d.y, y: d.x })), startYear - 0.5, currentYear + 0.5);
    chart.data.datasets[0].data = trendData.points.map(p => ({ x: p.y, y: p.x })); // swap back for chart
    chart.update();
  }
};

const fetchSummary = async () => {
  const url = getApiUrl(`/summary/${tempLocation}/${month}-${day}`);
  try {
    const response = await fetch(url);
    const data = await response.json();
    document.getElementById('summaryText').textContent = data.summary || 'No summary available.';
  } catch (error) {
    console.warn(`Summary fetch error: ${error.message}`);
  }
};

const fetchTrend = async () => {
  const url = getApiUrl(`/trend/${tempLocation}/${month}-${day}`);
  try {
    const response = await fetch(url);
    const data = await response.json();

    if (typeof data.slope === 'number' && data.units) {
      const direction = data.slope > 0 ? 'rising' : data.slope < 0 ? 'falling' : 'stable';
      const formatted = `Trend: ${direction} at ${Math.abs(data.slope).toFixed(3)} ${data.units}`;
      document.getElementById('trendText').textContent = formatted;
    } else {
      document.getElementById('trendText').textContent = 'No trend data available.';
    }
  } catch (error) {
    console.warn(`Trend fetch error: ${error.message}`);
  }
};

const params = new URLSearchParams(window.location.search);
if (params.get('location')) {
  tempLocation = params.get('location');
  fetchData();
} else {
  detectUserLocation(); // uses geolocation
}

function initChart() {
  const ctx = document.getElementById('tempChart').getContext('2d');

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
          borderWidth: 5,
          opacity: 1,
          hidden: !showTrend
        },
        {
          label: `Temperature in ${tempLocation} on ${friendlyDate}`,
          type: 'bar',
          data: [],
          backgroundColor: barColour,
          borderWidth: 0,
          barPercentage: 0.9,
          categoryPercentage: 1.0
        }
      ]
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      layout: {
        padding: {
          left: window.innerWidth < 500 ? 5 : 10,
          right: window.innerWidth < 500 ? 5 : 10
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
          title: {
            display: true,
            text: 'Temperature (°C)',
            font: {
              size: 12
            }
          },
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
            stepSize: 5,
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
          }
        }
      },
      elements: {
        bar: {
          minBarLength: 30,
          maxBarThickness: 50
        }
      }
    }
  });

  chartInitialized = true;
}

async function updateAverageLine() {
  try {
    const url = getApiUrl(`/average/${tempLocation}/${month}-${day}`);
    const response = await fetch(url);
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
  chartVisible = true;
}

function hideChart() {
  loadingStartTime = Date.now();
  loadingCheckInterval = setInterval(updateLoadingMessage, 1000);
  loadingEl.style.display = 'block';
  canvasEl.style.display = 'none';
  chartVisible = false;
  updateLoadingMessage(); // Initial message
}