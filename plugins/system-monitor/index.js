/**
 * System Monitor Dashboard Plugin for Kagora
 *
 * Provides real-time system metrics via webhook endpoints:
 *   GET /api/plugins/system-monitor/dashboard  - HTML dashboard
 *   GET /api/plugins/system-monitor/status      - JSON system status
 *   GET /api/plugins/system-monitor/history     - JSON metrics history
 *
 * Collects: CPU usage, memory, uptime, agent count, message rates.
 * Updates every 10 seconds, keeps 360 data points (1 hour of history).
 */

const os = require('os')

// ---- Metrics Store ----

const MAX_HISTORY = 360 // 1 hour at 10s intervals
const COLLECT_INTERVAL_MS = 10_000

let metricsHistory = []
let lastCpuInfo = null
let startTime = Date.now()
let chatCtx = null

function getCpuUsage() {
  const cpus = os.cpus()
  let totalIdle = 0
  let totalTick = 0

  for (const cpu of cpus) {
    for (const type in cpu.times) {
      totalTick += cpu.times[type]
    }
    totalIdle += cpu.times.idle
  }

  const result = { idle: totalIdle / cpus.length, total: totalTick / cpus.length }

  if (lastCpuInfo) {
    const idleDelta = result.idle - lastCpuInfo.idle
    const totalDelta = result.total - lastCpuInfo.total
    const usage = totalDelta > 0 ? Math.round((1 - idleDelta / totalDelta) * 100) : 0
    lastCpuInfo = result
    return Math.max(0, Math.min(100, usage))
  }

  lastCpuInfo = result
  return 0
}

function collectMetrics() {
  const totalMem = os.totalmem()
  const freeMem = os.freemem()
  const usedMem = totalMem - freeMem
  const agents = chatCtx ? chatCtx.agents() : []

  const point = {
    timestamp: Date.now(),
    cpu: getCpuUsage(),
    memory: {
      total: totalMem,
      used: usedMem,
      free: freeMem,
      percent: Math.round((usedMem / totalMem) * 100)
    },
    uptime: {
      system: os.uptime(),
      kagora: Math.floor((Date.now() - startTime) / 1000)
    },
    agents: {
      total: agents.length,
      online: agents.filter(a => a.status === 'online').length,
      list: agents.map(a => ({ id: a.id, name: a.name, status: a.status }))
    },
    platform: {
      hostname: os.hostname(),
      platform: os.platform(),
      arch: os.arch(),
      nodeVersion: process.version,
      cpuModel: os.cpus()[0]?.model || 'unknown',
      cpuCores: os.cpus().length
    }
  }

  metricsHistory.push(point)
  if (metricsHistory.length > MAX_HISTORY) {
    metricsHistory = metricsHistory.slice(-MAX_HISTORY)
  }

  return point
}

// ---- Dashboard HTML ----

function dashboardHTML() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Kagora System Monitor</title>
<style>
  :root {
    --bg: #0d1117; --card: #161b22; --border: #30363d;
    --text: #e6edf3; --muted: #8b949e; --accent: #58a6ff;
    --green: #3fb950; --yellow: #d29922; --red: #f85149;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: var(--bg); color: var(--text); padding: 24px; }
  h1 { font-size: 24px; margin-bottom: 4px; }
  .subtitle { color: var(--muted); margin-bottom: 24px; font-size: 14px; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 16px; margin-bottom: 24px; }
  .card { background: var(--card); border: 1px solid var(--border); border-radius: 8px; padding: 20px; }
  .card h3 { font-size: 13px; color: var(--muted); text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 12px; }
  .big-number { font-size: 36px; font-weight: 700; }
  .unit { font-size: 14px; color: var(--muted); margin-left: 4px; }
  .bar-container { height: 8px; background: var(--border); border-radius: 4px; margin-top: 8px; overflow: hidden; }
  .bar { height: 100%; border-radius: 4px; transition: width 0.5s ease; }
  .bar.green { background: var(--green); }
  .bar.yellow { background: var(--yellow); }
  .bar.red { background: var(--red); }
  .agent-list { list-style: none; }
  .agent-list li { padding: 6px 0; border-bottom: 1px solid var(--border); display: flex; align-items: center; gap: 8px; font-size: 14px; }
  .agent-list li:last-child { border-bottom: none; }
  .dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
  .dot.online { background: var(--green); }
  .dot.offline { background: var(--muted); }
  .info-row { display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px solid var(--border); font-size: 14px; }
  .info-row:last-child { border-bottom: none; }
  .info-label { color: var(--muted); }
  canvas { width: 100%; height: 120px; }
  .chart-card { grid-column: 1 / -1; }
  .refresh-note { color: var(--muted); font-size: 12px; text-align: right; margin-top: 8px; }
  @media (max-width: 600px) { .grid { grid-template-columns: 1fr; } body { padding: 12px; } }
</style>
</head>
<body>
<h1>Kagora System Monitor</h1>
<p class="subtitle">Real-time dashboard &mdash; auto-refreshes every 10s</p>

<div class="grid">
  <div class="card" id="cpu-card">
    <h3>CPU Usage</h3>
    <div class="big-number" id="cpu-val">--<span class="unit">%</span></div>
    <div class="bar-container"><div class="bar green" id="cpu-bar" style="width:0%"></div></div>
  </div>

  <div class="card" id="mem-card">
    <h3>Memory Usage</h3>
    <div class="big-number" id="mem-val">--<span class="unit">%</span></div>
    <div class="bar-container"><div class="bar green" id="mem-bar" style="width:0%"></div></div>
    <div style="color:var(--muted);font-size:13px;margin-top:8px" id="mem-detail"></div>
  </div>

  <div class="card">
    <h3>Uptime</h3>
    <div class="big-number" id="uptime-sys">--</div>
    <div style="color:var(--muted);font-size:13px;margin-top:4px" id="uptime-kagora"></div>
  </div>

  <div class="card">
    <h3>Agents</h3>
    <div class="big-number" id="agent-count">--</div>
    <ul class="agent-list" id="agent-list"></ul>
  </div>

  <div class="card">
    <h3>System Info</h3>
    <div id="sys-info"></div>
  </div>

  <div class="card chart-card">
    <h3>CPU &amp; Memory History (last 60 data points)</h3>
    <canvas id="chart" height="120"></canvas>
  </div>
</div>

<div class="refresh-note" id="last-update">Connecting...</div>

<script>
function fmt(bytes) {
  if (bytes >= 1073741824) return (bytes / 1073741824).toFixed(1) + ' GB';
  if (bytes >= 1048576) return (bytes / 1048576).toFixed(0) + ' MB';
  return (bytes / 1024).toFixed(0) + ' KB';
}

function fmtTime(seconds) {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return d + 'd ' + h + 'h';
  if (h > 0) return h + 'h ' + m + 'm';
  return m + 'm';
}

function barColor(pct) {
  if (pct > 90) return 'red';
  if (pct > 70) return 'yellow';
  return 'green';
}

let histCpu = [];
let histMem = [];

function update(data) {
  // CPU
  document.getElementById('cpu-val').innerHTML = data.cpu + '<span class="unit">%</span>';
  const cpuBar = document.getElementById('cpu-bar');
  cpuBar.style.width = data.cpu + '%';
  cpuBar.className = 'bar ' + barColor(data.cpu);

  // Memory
  const mp = data.memory.percent;
  document.getElementById('mem-val').innerHTML = mp + '<span class="unit">%</span>';
  const memBar = document.getElementById('mem-bar');
  memBar.style.width = mp + '%';
  memBar.className = 'bar ' + barColor(mp);
  document.getElementById('mem-detail').textContent = fmt(data.memory.used) + ' / ' + fmt(data.memory.total);

  // Uptime
  document.getElementById('uptime-sys').textContent = fmtTime(data.uptime.system);
  document.getElementById('uptime-kagora').textContent = 'Kagora: ' + fmtTime(data.uptime.kagora);

  // Agents
  document.getElementById('agent-count').textContent = data.agents.online + ' / ' + data.agents.total;
  const list = document.getElementById('agent-list');
  list.innerHTML = data.agents.list.map(a =>
    '<li><span class="dot ' + (a.status === 'online' ? 'online' : 'offline') + '"></span>' + a.name + ' <span style="color:var(--muted)">(' + a.id + ')</span></li>'
  ).join('');

  // System info
  if (data.platform) {
    const p = data.platform;
    document.getElementById('sys-info').innerHTML = [
      ['Hostname', p.hostname],
      ['Platform', p.platform + ' / ' + p.arch],
      ['CPU', p.cpuModel],
      ['Cores', p.cpuCores],
      ['Node.js', p.nodeVersion],
    ].map(([k, v]) => '<div class="info-row"><span class="info-label">' + k + '</span><span>' + v + '</span></div>').join('');
  }

  // History
  histCpu.push(data.cpu);
  histMem.push(data.memory.percent);
  if (histCpu.length > 60) { histCpu.shift(); histMem.shift(); }
  drawChart();

  document.getElementById('last-update').textContent = 'Last update: ' + new Date().toLocaleTimeString();
}

function drawChart() {
  const canvas = document.getElementById('chart');
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  ctx.scale(dpr, dpr);
  const w = rect.width, h = rect.height;

  ctx.clearRect(0, 0, w, h);

  // Grid lines
  ctx.strokeStyle = '#30363d';
  ctx.lineWidth = 0.5;
  for (let i = 0; i <= 4; i++) {
    const y = (h / 4) * i;
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
  }

  // Draw lines
  function drawLine(data, color) {
    if (data.length < 2) return;
    ctx.beginPath();
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    const step = w / (60 - 1);
    const offset = (60 - data.length) * step;
    for (let i = 0; i < data.length; i++) {
      const x = offset + i * step;
      const y = h - (data[i] / 100) * h;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  drawLine(histCpu, '#58a6ff');
  drawLine(histMem, '#3fb950');

  // Legend
  ctx.font = '11px sans-serif';
  ctx.fillStyle = '#58a6ff'; ctx.fillText('CPU', 8, 14);
  ctx.fillStyle = '#3fb950'; ctx.fillText('Memory', 42, 14);
}

async function poll() {
  try {
    const res = await fetch('/api/plugins/system-monitor/status');
    if (res.ok) update(await res.json());
  } catch (e) {
    document.getElementById('last-update').textContent = 'Connection error: ' + e.message;
  }
}

poll();
setInterval(poll, 10000);
</script>
</body>
</html>`
}

// ---- Plugin Exports ----

function activate(ctx) {
  chatCtx = ctx.chat
  startTime = Date.now()

  // Collect initial metrics
  collectMetrics()

  // Schedule periodic collection
  ctx.scheduler.addInterval('collect-metrics', COLLECT_INTERVAL_MS, () => {
    collectMetrics()
  })

  // GET /api/plugins/system-monitor/status - JSON metrics
  ctx.webhook.register('GET', 'status', (_req, res) => {
    const latest = metricsHistory.length > 0
      ? metricsHistory[metricsHistory.length - 1]
      : collectMetrics()
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(latest, null, 2))
  })

  // GET /api/plugins/system-monitor/history - JSON history
  ctx.webhook.register('GET', 'history', (_req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({
      count: metricsHistory.length,
      intervalMs: COLLECT_INTERVAL_MS,
      points: metricsHistory.slice(-60)
    }))
  })

  // GET /api/plugins/system-monitor/dashboard - HTML dashboard
  ctx.webhook.register('GET', 'dashboard', (_req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
    res.end(dashboardHTML())
  })

  ctx.log.info('System Monitor activated. Dashboard at /api/plugins/system-monitor/dashboard')
}

function deactivate() {
  metricsHistory = []
  lastCpuInfo = null
  chatCtx = null
}

module.exports = { activate, deactivate }
