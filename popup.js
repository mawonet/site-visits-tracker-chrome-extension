let CONFIG = {
  sites: []
};

// Load config.json from extension package
async function loadConfig() {
  const url = chrome.runtime.getURL('config.json'); // [web:103][web:101]
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error('Failed to load config.json');
  }
  const data = await response.json();
  CONFIG = data;
}

// Non-overlapping ranges for today / yesterday
function getRange(period) {
  const now = new Date();

  if (period === 'today') {
    const start = new Date(now);
    start.setHours(0, 0, 0, 0); // today 00:00
    return { startTime: start.getTime(), endTime: Date.now() };
  } else {
    // yesterday: from 00:00 yesterday to 00:00 today
    const start = new Date(now);
    start.setDate(start.getDate() - 1);
    start.setHours(0, 0, 0, 0); // yesterday 00:00

    const end = new Date(now);
    end.setHours(0, 0, 0, 0); // today 00:00

    return { startTime: start.getTime(), endTime: end.getTime() };
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  try {
    await loadConfig();
  } catch (e) {
    console.error(e);
    document.getElementById('stats').textContent = 'Failed to load config.';
    return;
  }

  document.getElementById('todayBtn').onclick = () => loadStats('today');
  document.getElementById('yesterdayBtn').onclick = () => loadStats('yesterday');

  loadStats('yesterday'); // default
});

async function loadStats(period) {
  const statsDiv = document.getElementById('stats');
  statsDiv.textContent = 'Loading...';

  const { startTime, endTime } = getRange(period);

  const allCount = await getVisitCount(startTime, endTime, '');

  const stats = [];
  let totalTargetVisits = 0;

  for (const item of CONFIG.sites) {
    const site = item.domain;
    const count = await getVisitCount(startTime, endTime, site);
    totalTargetVisits += count;
    const percent = allCount > 0 ? ((count / allCount) * 100).toFixed(1) : 0;
    stats.push({
      site,
      count,
      percent: Number(percent),
      color: item.color
    });
  }

  displayStats(stats, totalTargetVisits, allCount);
  updateButtons(period);
}

function getVisitCount(startTime, endTime, text) {
  return new Promise((resolve) => {
    chrome.history.search(
      {
        text: text || '',
        startTime,
        endTime,
        maxResults: 0
      },
      (results) => {
        resolve(results.length);
      }
    );
  });
}

function displayStats(stats, totalTarget, allCount) {
  const statsDiv = document.getElementById('stats');
  const totalPercent = allCount > 0 ? ((totalTarget / allCount) * 100).toFixed(1) : 0;

  statsDiv.innerHTML = `
    <div id="total">Tracked visits: ${totalTarget}</div>
    <div class="total-sub">${totalPercent}% of ${allCount} total visits</div>
    ${stats
      .map(
        ({ site, count, percent }) => `
      <div class="site-stat">
        <span class="site-name">${site}</span>
        <span class="site-value">${count} (${percent}%)</span>
      </div>`
      )
      .join('')}
  `;

  drawPieChart(stats);
}

function drawPieChart(stats) {
  const svg = document.getElementById('svg-chart');
  svg.innerHTML = '';

  const total = stats.reduce((sum, s) => sum + s.count, 0);
  if (total === 0) {
    svg.innerHTML =
      '<text x="150" y="110" text-anchor="middle" fill="#888" font-size="14">No data</text>';
    return;
  }

  let angle = -90; // start on top
  const radius = 75;
  const centerX = 90;
  const centerY = 110;

  stats.forEach(({ site, count, color }, i) => {
    if (count === 0) return;
    const sliceAngle = (count / total) * 360;
    const endAngle = angle + sliceAngle;

    const startX = centerX + radius * Math.cos((angle * Math.PI) / 180);
    const startY = centerY + radius * Math.sin((angle * Math.PI) / 180);
    const endX = centerX + radius * Math.cos((endAngle * Math.PI) / 180);
    const endY = centerY + radius * Math.sin((endAngle * Math.PI) / 180);

    svg.innerHTML += `
      <path d="
        M ${centerX} ${centerY}
        L ${startX} ${startY}
        A ${radius} ${radius} 0 ${sliceAngle > 180 ? 1 : 0} 1 ${endX} ${endY}
        Z
      " fill="${color || '#7c5cff'}" stroke="#333" stroke-width="2" data-site="${site}"/>
    `;

    angle = endAngle;
  });

  // Legend
  stats.forEach(({ site, count, color }, i) => {
    svg.innerHTML += `
      <circle cx="220" cy="${40 + i * 25}" r="8" fill="${color || '#7c5cff'}"/>
      <text x="235" y="${45 + i * 25}" font-size="12" fill="#fff">${site}: ${count}</text>
    `;
  });
}

function updateButtons(period) {
  document.querySelectorAll('.toggle-btn').forEach((btn) => btn.classList.remove('active'));
  document
    .getElementById(period === 'today' ? 'todayBtn' : 'yesterdayBtn')
    .classList.add('active');
}
