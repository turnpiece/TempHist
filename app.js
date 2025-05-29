Chart.register(window['chartjs-plugin-annotation']);

const apiBase = 'https://temphist-api.onrender.com';
const tempLocation = 'London';

const today = new Date();
const month = String(today.getMonth() + 1).padStart(2, '0');
const day = String(today.getDate()).padStart(2, '0');
const currentYear = today.getFullYear();
const startYear = 1970;

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
          reverse: true,
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
  for (let year = currentYear; year >= startYear; year--) {
    const date = `${year}-${month}-${day}`;
    const url = `${apiBase}/weather/${tempLocation}/${date}`;

    try {
      const response = await fetch(url);
      const contentType = response.headers.get("content-type");

      if (!contentType || !contentType.includes("application/json")) {
        const text = await response.text();
        console.warn(`Error for ${year}: Non-JSON response - "${text}"`);
        continue;
      }

      const data = await response.json();
      const temp = data.days?.[0]?.temp;

      if (temp !== undefined) {
        console.log(`Loaded: ${year} - ${temp}°C`);

        if (!chartInitialized) {
          baseTemp = temp;
          const yMin = Math.floor(baseTemp - 7);
          const yMax = Math.ceil(baseTemp + 7);
          initChart(yMin, yMax);
        }

        updateChart(year, temp);
      } else {
        console.warn(`No temperature data for ${date}`);
      }
    } catch (error) {
      console.warn(`Fetch error for ${year}: ${error.message}`);
    }

    await delay(300);
  }
};

fetchHistoricalData();
