Chart.register(window['chartjs-plugin-annotation']);

const apiBase = 'https://temphist-api.onrender.com';

const now = new Date();
const useYesterday = now.getHours() < 12;
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
const barColour = 'rgba(255, 0, 0, 0.8)';
const trendColour = 'rgba(0, 255, 0, 0.25)';
const barData = [];

// get the location
let tempLocation = 'London'; // default

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

// set up the chart
let chart;
let chartInitialized = false;
let baseTemp = null;

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const friendlyDate = `${getOrdinal(Number(day))} ${new Date().toLocaleString('en-GB', { month: 'long' })}`;

const fetchHistoricalData = async () => {
  loadingEl.style.display = 'block';
  canvasEl.style.display = 'none';

  const years = Array.from({ length: currentYear - startYear + 1 }, (_, i) => currentYear - i);

  const results = await Promise.allSettled(
    years.map(async year => {
      const date = `${year}-${month}-${day}`;
      const url = `${apiBase}/weather/${tempLocation}/${date}`;
      try {
        const response = await fetch(url);
        const data = await response.json();
        const temp = data.days?.[0]?.temp;
        return { year, temp };
      } catch (e) {
        console.warn(`Fetch failed for ${year}:`, e);
        return { year, temp: null };
      }
    })
  );

  const validResults = results
    .filter(r => r.status === 'fulfilled' && r.value.temp !== null)
    .map(r => r.value)
    .sort((a, b) => a.year - b.year); // chronological order

  if (validResults.length) {
    baseTemp = validResults[0].temp;
    initChart();

    for (const { year, temp } of validResults) {
      updateChart(year, temp);
    }
  }

  loadingEl.style.display = 'none';
  canvasEl.style.display = 'block';

  const barData = chart.data.datasets[1].data;
  const trendData = calculateTrendLine(barData.map(d => ({ x: d.y, y: d.x })), startYear - 0.5, currentYear + 0.5);
  chart.data.datasets[0].data = trendData.points.map(p => ({ x: p.y, y: p.x })); // swap back for chart

  chart.update();
};

const fetchSummary = async () => {
  const url = `${apiBase}/summary/${tempLocation}/${month}-${day}`;
  try {
    const response = await fetch(url);
    const data = await response.json();
    document.getElementById('summaryText').textContent = data.summary || 'No summary available.';
  } catch (error) {
    console.warn(`Summary fetch error: ${error.message}`);
  }
};

const fetchTrend = async () => {
  const url = `${apiBase}/trend/${tempLocation}/${month}-${day}`;
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
          backgroundColor: trendColour, // Filled area
          fill: true,                   // ✅ fill area below line
          pointRadius: 0,
          borderWidth: 0
        },
        {
          label: `Temperature in ${tempLocation} on ${friendlyDate}`,
          type: 'bar',
          data: [],
          backgroundColor: barColour,
          borderWidth: 0,
          categoryPercentage: 1.0,
          barPercentage: 1.0
        }
      ]
    },
    options: {
      indexAxis: 'y',
      responsive: false,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: true },
        annotation: { annotations: {} }
      },
      scales: {
        x: {
          title: {
            display: true,
            text: 'Temperature (°C)'
          }
        },
        y: {
          reverse: false,
          type: 'linear',
          min: startYear,
          max: currentYear,
          ticks: {
            stepSize: 5,
            callback: val => val.toString()
          },
          title: {
            display: false,
            text: 'Year'
          },
          grid: {
            display: false
          }
        }
      }
    }
  });

  chartInitialized = true;
}

function updateChart(year, temp) {
  barData.push({ x: temp, y: year });

  chart.data.datasets[1].data = [...barData];

  // Expand x-axis if needed (temperature now on x-axis)
  const temps = barData.map(p => p.x);
  const minTemp = Math.min(...temps);
  const maxTemp = Math.max(...temps);
  chart.options.scales.x.min = Math.floor(minTemp - 1);
  chart.options.scales.x.max = Math.ceil(maxTemp + 1);

  chart.update();
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
  fetchTrend();
}
