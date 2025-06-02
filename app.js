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
const barColour = 'rgba(235, 0, 0, 0.5)';
const trendColour = 'rgba(0, 0, 235, 0.4)';
const barData = [];

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
          label: 'Linear Trend',
          type: 'line',
          data: [],
          backgroundColor: trendColour, // Filled area
          fill: true,                           // ✅ fill area below line
          pointRadius: 0,
          borderWidth: 0
        },
        {
          label: `Avg Temp in ${tempLocation} on ${month}-${day}`,
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
  barData.push({ x: year, y: temp });

  chart.data.datasets[1].data = [...barData];

  // Expand y-axis if needed
  const temps = barData.map(p => p.y);
  const minTemp = Math.min(...temps);
  const maxTemp = Math.max(...temps);
  chart.options.scales.y.min = Math.floor(minTemp - 1);
  chart.options.scales.y.max = Math.ceil(maxTemp + 1);

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

  const barData = chart.data.datasets[1].data;
  const trendData = calculateTrendLine(barData, startYear - 0.5, currentYear + 0.5);
  chart.data.datasets[0].data = trendData.points;
  
  const slopePerYear = trendData.slope;
  const slopeLabel = `${slopePerYear >= 0 ? '+' : ''}${slopePerYear.toFixed(2)}°C/year`;

  chart.options.plugins.annotation.annotations.trendLabel = {
    type: 'label',
    xValue: currentYear,
    yValue: trendData.points[1].y,
    backgroundColor: 'rgba(0,0,0,0.8)',
    font: {
      size: 12,
      weight: 'bold'
    },
    color: 'white',
    padding: 6,
    content: slopeLabel,
    position: 'start'
  };

  chart.update();
};

fetchHistoricalData();
