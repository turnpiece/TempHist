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
const labels = [];
const temperatures = [];

let chart;
let chartInitialized = false;
let baseTemp = null;

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

function initChart(yMin, yMax) {
  const ctx = document.getElementById('tempChart').getContext('2d');

  chart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: [],
      datasets: [{
        label: `Avg Temp in ${tempLocation} on ${month}-${day}`,
        data: [],
        backgroundColor: 'rgba(54, 162, 235, 0.5)',
        borderColor: 'rgba(54, 162, 235, 1)',
        borderWidth: 1
      }]
    },
    options: {
      responsive: true,
      plugins: {
        legend: { display: true },
        annotation: {
          annotations: {}
        }
      },
      scales: {
        x: {
          reverse: false,
          title: {
            display: true,
            text: 'Year'
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
  labels.push(year.toString());
  temperatures.push(temp);

  chart.data.labels = labels;
  chart.data.datasets[0].data = temperatures;

  // Check if we need to expand y-axis
  if (temp < chart.options.scales.y.min) {
    chart.options.scales.y.min = Math.floor(temp - 1);
  }
  if (temp > chart.options.scales.y.max) {
    chart.options.scales.y.max = Math.ceil(temp + 1);
  }

  // Update average line
  const avg = temperatures.reduce((sum, t) => sum + t, 0) / temperatures.length;

  chart.options.plugins.annotation.annotations.averageLine = {
    type: 'line',
    yMin: avg,
    yMax: avg,
    borderColor: 'red',
    borderWidth: 2,
    label: {
      content: `Avg: ${avg.toFixed(1)}°C`,
      enabled: true,
      position: 'end'
    }
  };

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
};


fetchHistoricalData();
