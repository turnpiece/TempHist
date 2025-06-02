Chart.register(window['chartjs-plugin-annotation']);

const apiBase = 'https://temphist-api.onrender.com';
const tempLocation = 'London';

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
const friendlyDate = `${getOrdinal(Number(day))} ${new Date().toLocaleString('en-GB', { month: 'long' })}`;

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
          label: `Average temperature in ${tempLocation} on ${friendlyDate}`,
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
          max: currentYear,
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

function getOrdinal(n) {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
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

  const [start, end] = trendData.points;
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const angleRad = Math.atan2(dy, dx);       // angle in radians
  const angleDeg = angleRad * (180 / Math.PI); // convert to degrees

  const slopePerYear = trendData.slope;
  const slopeLabel = `${slopePerYear >= 0 ? '+' : ''}${slopePerYear.toFixed(2)}°C/year`;

  chart.options.plugins.annotation.annotations.trendLabel = {
    type: 'label',
    xValue: currentYear - 1.5,
    yValue: trendData.points[1].y + 1,
    xAdjust: -20,
    font: {
      size: 12,
      weight: 'bold'
    },
    color: 'rgba(0, 0, 235, 0.4)',
    padding: 10,
    content: slopeLabel,
    position: 'start',
    rotation: -angleDeg
  };

  chart.update();

  // Summary text
  const latest = barData[barData.length - 1];
  const previous = barData.slice(0, -1); // exclude current year
  const avgPrevious = previous.reduce((sum, p) => sum + p.y, 0) / previous.length;
  const diff = latest.y - avgPrevious;
  const roundedDiff = diff.toFixed(1);

  // Detect hot and cold records
  const isWarmestOnRecord = previous.every(p => latest.y > p.y);

  let warmSummary = '';
  if (isWarmestOnRecord) {
    warmSummary = `This is the warmest ${friendlyDate} on record.`;
  } else {
    let lastWarmerYear = null;
    for (let i = previous.length - 1; i >= 0; i--) {
      if (previous[i].y > latest.y) {
        lastWarmerYear = previous[i].x;
        break;
      }
    }
    if (lastWarmerYear !== null) {
      const yearsSinceWarm = latest.x - lastWarmerYear;
      if (yearsSinceWarm > 1) {
        if (yearsSinceWarm <= 10) {
          warmSummary = `This is the warmest ${friendlyDate} since ${lastWarmerYear}.`;
        } else {
          warmSummary = `This is the warmest ${friendlyDate} in ${yearsSinceWarm} years.`;
        }
      }
    }
  }

  // Find if this is the coldest on record
  const isColdestOnRecord = previous.every(p => latest.y < p.y);

  let coldSummary = '';
  if (isColdestOnRecord) {
    coldSummary = `This is the coldest ${friendlyDate} on record.`;
  } else {
    // Find the last year where it was colder than today
    let lastColderYear = null;
    for (let i = previous.length - 1; i >= 0; i--) {
      if (previous[i].y < latest.y) {
        lastColderYear = previous[i].x;
        break;
      }
    }
    if (lastColderYear !== null) {
      const yearsSinceCold = latest.x - lastColderYear;
      if (yearsSinceCold > 1) {
        coldSummary = `This is the coldest ${friendlyDate} `;
        if (yearsSinceCold <= 10) {
          coldSummary += `since ${lastColderYear}.`;
        } else {
          coldSummary += `in ${yearsSinceCold} years.`;
        }
      }
    }
  }

  let summaryText = '';

  summaryText += ` ${warmSummary}`;
  summaryText += ` ${coldSummary}`;

  // Temperature difference from average
  if (Math.abs(diff) < 0.05) {
    summaryText += ` It is about average for this date.`;
  } else if (diff > 0) {
    summaryText += ` It is ${roundedDiff}°C warmer than average today.`;
  } else {
    summaryText += ` It is ${Math.abs(roundedDiff)}°C cooler than average today.`;
  }

  document.getElementById('summary').textContent = summaryText;

};

fetchHistoricalData();
