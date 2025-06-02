Chart.register(window['chartjs-plugin-annotation']);

const apiBase = 'https://temphist-api.onrender.com';
const tempLocation = 'London';

const today = new Date();
const month = String(today.getMonth() + 1).padStart(2, '0');
const day = String(today.getDate()).padStart(2, '0');
const currentYear = today.getFullYear();
const startYear = currentYear - 50;
const loadingEl = document.getElementById('loading');
const canvasEl = document.getElementById('tempChart');
const barThickness = 20;
const labels = [];
const temperatures = [];

// set chart width
document.getElementById('tempChart').width = (currentYear - startYear + 1) * barThickness;

// set up the chart
let chart;
let chartInitialized = false;
let baseTemp = null;

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

function initChart(yMin, yMax) {
  const ctx = document.getElementById('tempChart').getContext('2d');

  chart = new Chart(ctx, {
    type: 'bar',
    data: {
      datasets: [
        {
          label: `Avg Temp in ${tempLocation} on ${month}-${day}`,
          type: 'bar',
          data: [],
          backgroundColor: 'rgba(54, 162, 235, 0.5)',
          borderWidth: 0,
          categoryPercentage: 1.0,
          barPercentage: 1.0
        },
        {
          label: 'Linear Trend',
          type: 'line',
          data: [],
          borderColor: 'black',
          backgroundColor: 'rgba(0, 0, 0, 0.1)',
          fill: false,
          borderDash: [5, 5],
          pointRadius: 0,
          borderWidth: 2
        }
      ]
    },
    options: {
      responsive: false,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: true },
        annotation: { annotations: {} }
      },
      scales: {
        x: {
          type: 'linear',
          position: 'bottom',
          min: startYear,
          max: currentYear + 1,
          ticks: {
            stepSize: 5,
            callback: val => val.toString()
          },
          title: {
            display: true,
            text: 'Year'
          },
          grid: {
            display: false
          }
        },
        y: {
          min: yMin,
          max: yMax,
          title: {
            display: true,
            text: 'Temperature (°C)'
          }
        }
      }
    }
  });

  chartInitialized = true;
}

function updateChart(year, temp) {
  const barData = chart.data.datasets[0].data;

  barData.push({ x: year, y: temp });

  // Update y-axis range based on all data
  const values = barData.map(point => point.y);
  const minTemp = Math.min(...values);
  const maxTemp = Math.max(...values);
  chart.options.scales.y.min = Math.floor(minTemp - 1);
  chart.options.scales.y.max = Math.ceil(maxTemp + 1);

  chart.update();
}

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
    const yMin = Math.floor(baseTemp - 3);
    const yMax = Math.ceil(baseTemp + 3);
    initChart(yMin, yMax);

    for (const { year, temp } of validResults) {
      updateChart(year, temp);
    }
  }

  loadingEl.style.display = 'none';
  canvasEl.style.display = 'block';

  const barData = chart.data.datasets[0].data;
  const trendLine = calculateTrendLine(barData);
  chart.data.datasets[1].data = trendLine;
  chart.update();
};

fetchHistoricalData();

function calculateTrendLine(points) {
  const n = points.length;
  const sumX = points.reduce((sum, p) => sum + p.x, 0);
  const sumY = points.reduce((sum, p) => sum + p.y, 0);
  const sumXY = points.reduce((sum, p) => sum + p.x * p.y, 0);
  const sumXX = points.reduce((sum, p) => sum + p.x * p.x, 0);

  const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
  const intercept = (sumY - slope * sumX) / n;

  const xStart = points[0].x;
  const xEnd = points[points.length - 1].x;

  return [
    { x: xStart, y: slope * xStart + intercept },
    { x: xEnd, y: slope * xEnd + intercept }
  ];
}
