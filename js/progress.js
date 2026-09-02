import { S, CATEGORIES, LIBRARY_CATEGORIES, FINGER_PROTOCOLS, GRIPS, gradeScale } from './state.js';
import { esc, fmtSecAsMMSS, fmtDate } from './utils.js';
import { fetchEntriesByExercise, fetchEntriesByCategory } from './db.js';

const C = {
  green: '#4ecdc4', amber: '#f7b731', red: '#fc5c65', blue: '#74b9ff',
  purple: '#a29bfe', pink: '#fd79a8', muted: '#777', border: '#2a2a2a', text: '#e8e8e8'
};

let chart = null;
let cache = { key: null, entries: [] };

const METRICS = {
  sc: { load: 'Load', reps: 'Reps', work: 'Total Work' },
  cardio: { distance: 'Distance', time: 'Time', pace: 'Pace' },
  max_hang: { load: 'Load', duration: 'Duration' },
  density_hang: { load: 'Load', duration: 'Duration' },
  repeaters: { load: 'Load', reps: 'Reps' },
  pulses: { load: 'Load', reps: 'Reps', work: 'Total Work' }
};

function defaultMetric(p) {
  const set = METRICS[p.category === 'finger' ? p.protocol : p.category];
  return set ? Object.keys(set)[0] : null;
}

export function renderProgress() {
  const el = document.getElementById('tab-progress');
  const p = S.progress;

  let picker = '';
  if (LIBRARY_CATEGORIES.includes(p.category)) {
    const list = S.exercises.filter(e => e.category === p.category);
    picker = `<div class="chip-list">
      ${list.length ? list.map(e =>
        `<button class="chip${p.exerciseId === e.id ? ' active-chip' : ''}" data-prog-ex="${e.id}">${esc(e.name)}</button>`).join('')
        : '<span style="color:var(--dim);font-size:12px">No exercises in library</span>'}
    </div>`;
  } else if (p.category === 'finger') {
    picker = `
      <div class="pill-row" style="margin-top:8px">
        ${Object.entries(FINGER_PROTOCOLS).map(([v, l]) =>
          `<span class="pill${p.protocol === v ? ' active' : ''}" data-prog-proto="${v}">${l}</span>`).join('')}
      </div>
      <div class="field" style="max-width:180px"><label>Grip filter</label>
        <select id="prog-grip">
          <option value="">all grips</option>
          ${GRIPS.map(g => `<option value="${esc(g)}"${p.grip === g ? ' selected' : ''}>${esc(g)}</option>`).join('')}
        </select>
      </div>`;
  }

  const metricSet = METRICS[p.category === 'finger' ? p.protocol : p.category];
  const metricRow = metricSet ? `
    <div class="pill-row" style="margin-top:10px">
      ${Object.entries(metricSet).map(([v, l]) =>
        `<span class="pill${p.metric === v ? ' active' : ''}" data-prog-metric="${v}">${l}</span>`).join('')}
    </div>` : '';

  el.innerHTML = `
    <div class="card">
      <div class="section-label">Category</div>
      <div class="pill-row" style="margin-top:8px">
        ${Object.entries(CATEGORIES).map(([v, l]) =>
          `<span class="pill${p.category === v ? ' active' : ''}" data-prog-cat="${v}">${l}</span>`).join('')}
      </div>
      ${picker}
      ${metricRow}
    </div>
    <div id="prog-stats"></div>
    <div class="card"><div class="chart-wrap"><canvas id="prog-chart"></canvas></div>
      <div id="prog-legend" style="display:flex;gap:16px;margin-top:8px;font-size:11px;color:var(--muted);flex-wrap:wrap"></div>
    </div>`;

  wireProgress();
  drawChart();
}

function wireProgress() {
  const el = document.getElementById('tab-progress');
  el.querySelectorAll('[data-prog-cat]').forEach(n => n.onclick = () => {
    const p = S.progress;
    p.category = n.dataset.progCat;
    p.exerciseId = null;
    p.protocol = p.category === 'finger' ? 'max_hang' : null;
    p.grip = '';
    p.metric = defaultMetric(p);
    renderProgress();
  });
  el.querySelectorAll('[data-prog-ex]').forEach(n => n.onclick = () => {
    S.progress.exerciseId = n.dataset.progEx;
    S.progress.metric = S.progress.metric || defaultMetric(S.progress);
    renderProgress();
  });
  el.querySelectorAll('[data-prog-proto]').forEach(n => n.onclick = () => {
    S.progress.protocol = n.dataset.progProto;
    S.progress.metric = defaultMetric(S.progress);
    renderProgress();
  });
  el.querySelectorAll('[data-prog-metric]').forEach(n => n.onclick = () => {
    S.progress.metric = n.dataset.progMetric;
    renderProgress();
  });
  const grip = document.getElementById('prog-grip');
  if (grip) grip.onchange = () => { S.progress.grip = grip.value; renderProgress(); };
}

async function loadEntries() {
  const p = S.progress;
  const key = LIBRARY_CATEGORIES.includes(p.category) ? `ex:${p.exerciseId}` : `cat:${p.category}`;
  if (cache.key === key) return cache.entries;
  let entries = [];
  if (LIBRARY_CATEGORIES.includes(p.category)) {
    if (!p.exerciseId) return [];
    entries = await fetchEntriesByExercise(p.exerciseId);
  } else {
    entries = await fetchEntriesByCategory(p.category);
  }
  cache = { key, entries };
  return entries;
}

function setEmpty(msg) {
  if (chart) { chart.destroy(); chart = null; }
  document.getElementById('prog-stats').innerHTML = '';
  document.getElementById('prog-legend').innerHTML = '';
  const wrap = document.querySelector('#tab-progress .chart-wrap');
  wrap.innerHTML = `<div class="empty"><div class="empty-icon">📈</div>${msg}</div>`;
}

function resetCanvas() {
  const wrap = document.querySelector('#tab-progress .chart-wrap');
  wrap.innerHTML = '<canvas id="prog-chart"></canvas>';
  return document.getElementById('prog-chart').getContext('2d');
}

// Never let a charting failure (blocked CDN, bad data) take out the stats and
// legend rendered alongside it.
function safeChart(ctx, config) {
  if (chart) { chart.destroy(); chart = null; }
  if (typeof Chart === 'undefined') {
    document.querySelector('#tab-progress .chart-wrap').innerHTML =
      '<div class="empty">Chart library failed to load — check your connection</div>';
    return null;
  }
  try {
    return new Chart(ctx, config);
  } catch (e) {
    document.querySelector('#tab-progress .chart-wrap').innerHTML =
      `<div class="empty">Could not draw chart: ${esc(e.message)}</div>`;
    return null;
  }
}

async function drawChart() {
  const p = S.progress;
  if (LIBRARY_CATEGORIES.includes(p.category) && !p.exerciseId) {
    return setEmpty('Pick an exercise');
  }
  const entries = await loadEntries();
  if (!entries.length) return setEmpty('No data yet');

  if (p.category === 'boulder' || p.category === 'rope_redpoint') return drawClimbChart(entries);
  if (p.category === 'rope_endurance') return drawLapsChart(entries);
  if (p.category === 'finger') return drawFingerChart(entries);
  if (p.category === 'cardio') return drawCardioChart(entries);
  return drawSCChart(entries);
}

const baseOptions = (yTitle, extra = {}) => ({
  responsive: true, maintainAspectRatio: false,
  scales: {
    x: { type: 'category', grid: { color: C.border }, ticks: { color: C.muted, maxRotation: 45, font: { size: 10 } } },
    y: { title: { display: true, text: yTitle, color: C.muted, font: { size: 11 } },
         grid: { color: C.border }, ticks: { color: C.muted, font: { size: 10 } } },
    ...(extra.scales || {})
  },
  plugins: {
    legend: { display: extra.legend !== false, labels: { color: C.muted, boxWidth: 12, font: { size: 11 } } },
    tooltip: extra.tooltip || {}
  }
});

function statGrid(stats) {
  document.getElementById('prog-stats').innerHTML = `
    <div class="stat-grid">
      ${stats.map(([label, val]) => `
        <div class="stat"><div class="stat-val">${esc(val)}</div><div class="stat-lbl">${esc(label)}</div></div>`).join('')}
    </div>`;
}

// ── Strength & Conditioning ──────────────────────────────────
function drawSCChart(entries) {
  const metric = S.progress.metric || 'load';
  const byDate = new Map();
  entries.forEach(e => {
    const sets = (e.sets || []).filter(s => s.reps != null || s.weight != null);
    if (!sets.length) return;
    const cur = byDate.get(e.date) || { maxLoad: 0, reps: 0, work: 0 };
    sets.forEach(s => {
      const w = s.weight || 0, r = s.reps || 0;
      cur.maxLoad = Math.max(cur.maxLoad, w);
      cur.reps += r;
      cur.work += w * r;
    });
    byDate.set(e.date, cur);
  });
  const dates = [...byDate.keys()].sort();
  const pick = d => ({ load: byDate.get(d).maxLoad, reps: byDate.get(d).reps, work: byDate.get(d).work }[metric]);
  const data = dates.map(pick);

  const ctx = resetCanvas();
  chart = safeChart(ctx, {
    type: 'line',
    data: { labels: dates.map(fmtDate), datasets: [{
      label: METRICS.sc[metric], data, borderColor: C.blue,
      backgroundColor: C.blue, tension: .25, pointRadius: 4
    }] },
    options: baseOptions(METRICS.sc[metric], { legend: false })
  });

  const last = data[data.length - 1];
  statGrid([
    ['Sessions', dates.length],
    ['Best', Math.max(...data).toLocaleString()],
    ['Latest', last?.toLocaleString() ?? '–']
  ]);
  document.getElementById('prog-legend').innerHTML =
    'Load = heaviest set that day · Reps = total reps · Total Work = Σ(load × reps). '
    + 'For BW± sets the load is the weight added (negative = assisted).';
}

// ── Cardio ───────────────────────────────────────────────────
function drawCardioChart(entries) {
  const metric = S.progress.metric || 'distance';
  const rows = entries
    .filter(e => e.cardioClass === 'endurance' && e.endurance)
    .map(e => ({ date: e.date, d: e.endurance.distance, t: e.endurance.timeSec, u: e.endurance.distanceUnit }));
  if (!rows.length) return setEmpty('No endurance cardio logged for this exercise');

  const value = r => metric === 'distance' ? r.d
    : metric === 'time' ? (r.t ? r.t / 60 : null)
    : (r.d && r.t ? (r.t / 60) / r.d : null);
  const yTitle = metric === 'distance' ? `Distance (${rows[0].u || ''})`
    : metric === 'time' ? 'Time (min)' : `Pace (min/${rows[0].u || 'mi'})`;

  const ctx = resetCanvas();
  chart = safeChart(ctx, {
    type: 'line',
    data: { labels: rows.map(r => fmtDate(r.date)), datasets: [{
      label: yTitle, data: rows.map(value), borderColor: C.pink,
      backgroundColor: C.pink, tension: .25, pointRadius: 4
    }] },
    options: baseOptions(yTitle, {
      legend: false,
      scales: metric === 'pace' ? { y: { reverse: true, grid: { color: C.border }, ticks: { color: C.muted } } } : {}
    })
  });
  statGrid([
    ['Sessions', rows.length],
    ['Total dist', rows.reduce((a, r) => a + (r.d || 0), 0).toFixed(1)],
    ['Total time', fmtSecAsMMSS(rows.reduce((a, r) => a + (r.t || 0), 0))]
  ]);
  document.getElementById('prog-legend').innerHTML = metric === 'pace' ? 'Lower is faster (axis inverted)' : '';
}

// ── Finger training (one chart per protocol) ─────────────────
function drawFingerChart(entries) {
  const p = S.progress;
  const metric = p.metric || 'load';
  const rows = [];

  entries.filter(e => e.protocol === p.protocol).forEach(e => {
    (e.sets || []).forEach(s => {
      if (p.grip && s.grip !== p.grip) return;
      if (p.protocol === 'max_hang' || p.protocol === 'density_hang') {
        (s.reps || []).forEach(r => rows.push({
          date: e.date, load: r.load, duration: r.durationSec, grip: s.grip
        }));
      } else if (p.protocol === 'repeaters') {
        rows.push({ date: e.date, load: s.load, reps: s.reps, grip: s.grip });
      } else {
        rows.push({ date: e.date, load: s.load, reps: s.reps, work: (s.load || 0) * (s.reps || 0), grip: s.grip });
      }
    });
  });
  if (!rows.length) return setEmpty('No data for this protocol/grip yet');

  // Best value per session date.
  const byDate = new Map();
  rows.forEach(r => {
    const v = r[metric];
    if (v == null) return;
    byDate.set(r.date, Math.max(byDate.get(r.date) ?? -Infinity, v));
  });
  const dates = [...byDate.keys()].sort();
  if (!dates.length) return setEmpty('No data for this metric yet');
  const data = dates.map(d => byDate.get(d));
  const yTitle = METRICS[p.protocol][metric] + (metric === 'duration' ? ' (s)' : metric === 'load' ? ' (lb)' : '');

  const ctx = resetCanvas();
  chart = safeChart(ctx, {
    type: 'line',
    data: { labels: dates.map(fmtDate), datasets: [{
      label: yTitle, data, borderColor: C.green, backgroundColor: C.green, tension: .25, pointRadius: 4
    }] },
    options: baseOptions(yTitle, { legend: false })
  });
  statGrid([
    ['Sessions', dates.length],
    ['Best', Math.max(...data)],
    ['Latest', data[data.length - 1]]
  ]);
  document.getElementById('prog-legend').innerHTML =
    `${FINGER_PROTOCOLS[p.protocol]}${p.grip ? ` · ${esc(p.grip)}` : ' · all grips'} — best value per session`;
}

// ── Bouldering / Rope Redpoint ───────────────────────────────
const attemptColor = n => n <= 1 ? C.green : n <= 3 ? C.amber : C.red;

function drawClimbChart(entries) {
  const scale = gradeScale(S.progress.category);
  const pts = entries
    .filter(e => e.grade && scale.includes(e.grade))
    .map(e => ({
      x: fmtDate(e.date), y: scale.indexOf(e.grade),
      grade: e.grade, name: e.name, outcome: e.outcome, attempts: e.attempts || 1
    }));
  if (!pts.length) return setEmpty('No climbs logged yet');

  const sent = pts.filter(p => p.outcome === 'send' || p.outcome === 'flash');
  const tried = pts.filter(p => p.outcome === 'attempt');
  const labels = [...new Set(pts.map(p => p.x))];

  const ctx = resetCanvas();
  chart = safeChart(ctx, {
    type: 'scatter',
    data: {
      labels,
      datasets: [
        { label: 'Sent', data: sent, pointRadius: 6, pointStyle: 'circle',
          pointBackgroundColor: sent.map(p => attemptColor(p.attempts)),
          pointBorderColor: sent.map(p => attemptColor(p.attempts)) },
        { label: 'Attempted', data: tried, pointRadius: 6, pointStyle: 'circle',
          pointBackgroundColor: 'transparent', borderWidth: 2,
          pointBorderColor: tried.map(p => attemptColor(p.attempts)) }
      ]
    },
    options: baseOptions('Grade', {
      scales: {
        y: {
          min: Math.max(0, Math.min(...pts.map(p => p.y)) - 1),
          max: Math.min(scale.length - 1, Math.max(...pts.map(p => p.y)) + 1),
          ticks: { color: C.muted, stepSize: 1, callback: v => scale[v] || '', font: { size: 10 } },
          grid: { color: C.border },
          title: { display: true, text: 'Grade', color: C.muted, font: { size: 11 } }
        }
      },
      tooltip: {
        callbacks: {
          label: ctx => {
            const p = ctx.raw;
            return [`${p.grade}${p.name ? ` — ${p.name}` : ''}`,
              `${p.outcome} · ${p.attempts} attempt${p.attempts === 1 ? '' : 's'}`];
          }
        }
      }
    })
  });

  const hardestSent = sent.length ? scale[Math.max(...sent.map(p => p.y))] : '–';
  statGrid([
    ['Climbs', pts.length],
    ['Sent', sent.length],
    ['Hardest sent', hardestSent]
  ]);
  document.getElementById('prog-legend').innerHTML =
    'Solid = sent · Hollow = attempted &nbsp;|&nbsp; ' +
    `<span style="color:${C.green}">1 try</span> · <span style="color:${C.amber}">2–3</span> · <span style="color:${C.red}">4+</span>`;
}

// ── Rope Endurance Laps ──────────────────────────────────────
function drawLapsChart(entries) {
  const scale = gradeScale('rope_endurance');
  const pts = [];
  entries.forEach(e => (e.sets || []).forEach(s => {
    if (!s.grade || !scale.includes(s.grade)) return;
    pts.push({ x: fmtDate(e.date), y: scale.indexOf(s.grade), grade: s.grade, laps: s.laps, timeSec: s.timeSec });
  }));
  if (!pts.length) return setEmpty('No lap sets logged yet');

  const ctx = resetCanvas();
  chart = safeChart(ctx, {
    type: 'scatter',
    data: {
      labels: [...new Set(pts.map(p => p.x))],
      datasets: [{ label: 'Lap set', data: pts, pointRadius: 6,
        pointBackgroundColor: C.green, pointBorderColor: C.green }]
    },
    options: baseOptions('Grade', {
      legend: false,
      scales: {
        y: {
          min: Math.max(0, Math.min(...pts.map(p => p.y)) - 1),
          max: Math.min(scale.length - 1, Math.max(...pts.map(p => p.y)) + 1),
          ticks: { color: C.muted, stepSize: 1, callback: v => scale[v] || '', font: { size: 10 } },
          grid: { color: C.border },
          title: { display: true, text: 'Grade', color: C.muted, font: { size: 11 } }
        }
      },
      tooltip: {
        callbacks: {
          label: ctx => {
            const p = ctx.raw;
            return [`${p.grade}`, `${p.laps ?? '–'} laps`,
              p.timeSec ? `${fmtSecAsMMSS(p.timeSec)} on the wall` : ''].filter(Boolean);
          }
        }
      }
    })
  });

  statGrid([
    ['Lap sets', pts.length],
    ['Total laps', pts.reduce((a, p) => a + (p.laps || 0), 0)],
    ['Time on wall', fmtSecAsMMSS(pts.reduce((a, p) => a + (p.timeSec || 0), 0))]
  ]);
  document.getElementById('prog-legend').innerHTML = 'One point per lap set — hover for laps and time on the wall';
}

export function invalidateProgressCache() { cache = { key: null, entries: [] }; }
