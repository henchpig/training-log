import { S, CATEGORIES, LIBRARY_CATEGORIES, FINGER_PROTOCOLS, APPARATUS, gradeScale } from './state.js';
import { esc, fmtSecAsMMSS, fmtDate } from './utils.js';
import { fetchEntriesByExercise, fetchEntriesByCategory } from './db.js';
import { renderPyramid } from './pyramid.js';

const C = {
  green: '#4ecdc4', amber: '#f7b731', red: '#fc5c65', blue: '#74b9ff',
  purple: '#a29bfe', pink: '#fd79a8', muted: '#777', border: '#2a2a2a', text: '#e8e8e8'
};

let chart = null;
let cache = { key: null, entries: [] };

// Every metric for a category is drawn on one chart, each on its own axis, so
// they can be read against each other instead of toggled between. Only the
// first two get a visible ruler — a third would crowd a phone screen — but all
// are in the legend (click to hide) and the tooltip.
const SERIES = {
  sc: [
    { key: 'load', label: 'Load (lb)', color: C.blue },
    { key: 'reps', label: 'Reps', color: C.amber },
    { key: 'work', label: 'Total work', color: C.purple }
  ],
  rehab: [
    { key: 'load', label: 'Load (lb)', color: C.purple },
    { key: 'duration', label: 'Duration (s)', color: C.green },
    { key: 'reps', label: 'Reps', color: C.amber }
  ],
  cardio: [
    { key: 'distance', label: 'Distance', color: C.pink },
    { key: 'time', label: 'Time (min)', color: C.blue },
    { key: 'pace', label: 'Pace (min/unit)', color: C.amber }
  ],
  max_hang: [
    { key: 'load', label: 'Load (lb)', color: C.green },
    { key: 'duration', label: 'Duration (s)', color: C.amber }
  ],
  density_hang: [
    { key: 'load', label: 'Load (lb)', color: C.green },
    { key: 'duration', label: 'Duration (s)', color: C.amber }
  ],
  repeaters: [
    { key: 'load', label: 'Load (lb)', color: C.green },
    { key: 'reps', label: 'Reps', color: C.amber }
  ],
  pulses: [
    { key: 'load', label: 'Load (lb)', color: C.green },
    { key: 'reps', label: 'Reps', color: C.amber }
  ]
};

const seriesFor = p => SERIES[p.category === 'finger' ? p.protocol : p.category];

export function renderProgress() {
  const el = document.getElementById('tab-progress');
  const p = S.progress;

  el.innerHTML = `
    <div class="card">
      <div class="section-label">Category</div>
      <div class="pill-row" style="margin-top:8px;margin-bottom:0">
        ${Object.entries(CATEGORIES).map(([v, l]) =>
          `<span class="pill${p.category === v ? ' active' : ''}" data-prog-cat="${v}">${l}</span>`).join('')}
      </div>
      <div id="prog-sub"></div>
    </div>
    <div id="prog-stats"></div>
    <div class="card">
      <div class="chart-wrap"><canvas id="prog-chart"></canvas></div>
      <div id="prog-legend" class="chart-note"></div>
    </div>`;

  el.querySelectorAll('[data-prog-cat]').forEach(n => n.onclick = () => {
    p.category = n.dataset.progCat;
    p.exerciseId = null;
    p.protocol = p.category === 'finger' ? 'max_hang' : null;
    p.grip = null;
    renderProgress();
  });

  refresh();
}

// Sub-picker depends on the data (which grips were actually trained), so it is
// rendered after the fetch rather than alongside the category row.
async function refresh() {
  const p = S.progress;
  const sub = document.getElementById('prog-sub');

  if (LIBRARY_CATEGORIES.includes(p.category)) {
    const list = S.exercises.filter(e => e.category === p.category);
    sub.innerHTML = `<div class="sub-picker">${
      list.length ? `<div class="chip-list">${list.map(e =>
        `<button class="chip${p.exerciseId === e.id ? ' active-chip' : ''}" data-prog-ex="${e.id}">${esc(e.name)}</button>`).join('')}</div>`
        : '<span style="color:var(--dim);font-size:12px">No exercises in library</span>'
    }</div>`;
    sub.querySelectorAll('[data-prog-ex]').forEach(n => n.onclick = () => {
      p.exerciseId = n.dataset.progEx;
      renderProgress();
    });
    if (!p.exerciseId) return setEmpty('Pick an exercise');
  } else if (p.category === 'finger') {
    sub.innerHTML = `<div class="sub-picker">
      <div class="section-label" style="margin-bottom:6px">Protocol</div>
      <div class="pill-row">
        ${Object.entries(FINGER_PROTOCOLS).map(([v, l]) =>
          `<span class="pill${p.protocol === v ? ' active' : ''}" data-prog-proto="${v}">${l}</span>`).join('')}
      </div>
      <div id="prog-grips"></div>
    </div>`;
    sub.querySelectorAll('[data-prog-proto]').forEach(n => n.onclick = () => {
      p.protocol = n.dataset.progProto;
      p.grip = null;
      renderProgress();
    });
  } else if (p.category === 'rope_redpoint') {
    sub.innerHTML = `<div class="sub-picker">
      <div class="pill-row" style="margin-bottom:0">
        <span class="pill${p.redpointView === 'chart' ? ' active' : ''}" data-prog-view="chart">Chart</span>
        <span class="pill${p.redpointView === 'pyramid' ? ' active' : ''}" data-prog-view="pyramid">Pyramid</span>
      </div>
    </div>`;
    sub.querySelectorAll('[data-prog-view]').forEach(n => n.onclick = () => {
      p.redpointView = n.dataset.progView;
      renderProgress();
    });
  } else {
    sub.innerHTML = '';
  }

  let entries;
  try {
    entries = await loadEntries();
  } catch (err) {
    return showQueryError(err);
  }
  if (!entries.length) return setEmpty('No data yet');

  if (p.category === 'rope_redpoint' && p.redpointView === 'pyramid') return showPyramid(entries);
  if (p.category === 'boulder' || p.category === 'rope_redpoint') return drawClimbChart(entries);
  if (p.category === 'rope_endurance') return drawLapsChart(entries);
  if (p.category === 'finger') return drawFingerChart(entries);
  if (p.category === 'cardio') return drawCardioChart(entries);
  if (p.category === 'rehab') return drawRehabChart(entries);
  return drawSCChart(entries);
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

// ── Chart plumbing ───────────────────────────────────────────
function setEmpty(msg) {
  if (chart) { chart.destroy(); chart = null; }
  document.querySelector('#tab-progress .chart-wrap')?.classList.remove('is-pyramid');
  document.getElementById('prog-stats').innerHTML = '';
  document.getElementById('prog-legend').innerHTML = '';
  document.querySelector('#tab-progress .chart-wrap').innerHTML =
    `<div class="empty"><div class="empty-icon">📈</div>${msg}</div>`;
}

function resetCanvas() {
  const wrap = document.querySelector('#tab-progress .chart-wrap');
  wrap.classList.remove('is-pyramid');
  wrap.innerHTML = '<canvas id="prog-chart"></canvas>';
  return document.getElementById('prog-chart').getContext('2d');
}

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

// Firestore rejects a collection-group query until its composite index exists,
// and puts a one-click creation link in the message. Surface that.
function showQueryError(err) {
  const link = /https:\/\/console\.firebase\.google\.com\/\S+/.exec(err.message || '')?.[0];
  document.getElementById('prog-stats').innerHTML = '';
  document.getElementById('prog-legend').innerHTML = '';
  document.querySelector('#tab-progress .chart-wrap').innerHTML = link
    ? `<div class="empty" style="padding:24px">
         <div class="empty-icon">🔑</div>
         <div style="margin-bottom:10px">This chart needs a Firestore index.</div>
         <a href="${esc(link)}" target="_blank" rel="noopener"
            style="color:var(--green);font-size:13px">Create it (opens Firebase) →</a>
         <div style="font-size:11px;margin-top:8px">Takes about a minute to build, then reload.</div>
       </div>`
    : `<div class="empty"><div class="empty-icon">⚠️</div>${esc(err.message || 'Could not load data')}</div>`;
}

function statGrid(stats) {
  document.getElementById('prog-stats').innerHTML = `
    <div class="stat-grid">
      ${stats.map(([label, val]) => `
        <div class="stat"><div class="stat-val">${esc(val)}</div><div class="stat-lbl">${esc(label)}</div></div>`).join('')}
    </div>`;
}

const AXIS_IDS = ['y', 'y1', 'y2'];

// dates: string[]; byDate: Map<date, {values:{key:num}, lines:string[]}>
function drawOverlay(dates, byDate, series, note) {
  const ctx = resetCanvas();
  const scales = {
    x: { type: 'category', grid: { color: C.border },
         ticks: { color: C.muted, maxRotation: 45, font: { size: 10 }, autoSkipPadding: 12 } }
  };
  series.forEach((s, i) => {
    const id = AXIS_IDS[i] || `y${i}`;
    scales[id] = {
      position: i === 1 ? 'right' : 'left',
      display: i < 2,
      grid: { color: i === 0 ? C.border : 'transparent', drawOnChartArea: i === 0 },
      ticks: { color: s.color, font: { size: 10 } },
      title: { display: i < 2, text: s.label, color: s.color, font: { size: 10 } }
    };
  });

  chart = safeChart(ctx, {
    type: 'line',
    data: {
      labels: dates.map(fmtDate),
      datasets: series.map((s, i) => ({
        label: s.label,
        data: dates.map(d => byDate.get(d).values[s.key] ?? null),
        borderColor: s.color, backgroundColor: s.color,
        yAxisID: AXIS_IDS[i] || `y${i}`,
        tension: .25, pointRadius: 3, borderWidth: 2, spanGaps: true
      }))
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      scales,
      plugins: {
        legend: { labels: { color: C.muted, boxWidth: 12, font: { size: 11 }, usePointStyle: true } },
        tooltip: {
          callbacks: {
            afterBody: items => byDate.get(dates[items[0].dataIndex])?.lines || []
          }
        }
      }
    }
  });
  document.getElementById('prog-legend').innerHTML = note || '';
}

// ── Strength & Conditioning ──────────────────────────────────
function drawSCChart(entries) {
  const byDate = new Map();
  entries.forEach(e => {
    const sets = (e.sets || []).filter(s => s.reps != null || s.weight != null);
    if (!sets.length) return;
    const cur = byDate.get(e.date) || { values: { load: 0, reps: 0, work: 0 }, lines: [] };
    sets.forEach(s => {
      const w = s.weight || 0, r = s.reps || 0;
      cur.values.load = Math.max(cur.values.load, w);
      cur.values.reps += r;
      cur.values.work += w * r;
    });
    cur.lines = sets.map((s, i) =>
      `${i + 1}. ${s.weightType === 'relative' ? `BW${s.weight > 0 ? '+' : ''}${s.weight || 0}` : s.weight}`
      + ` × ${s.reps ?? '–'}${s.rpe ? ` @ RPE ${s.rpe}` : ''}`);
    byDate.set(e.date, cur);
  });
  const dates = [...byDate.keys()].sort();
  if (!dates.length) return setEmpty('No data yet');

  drawOverlay(dates, byDate, SERIES.sc,
    'Load = heaviest set · Reps = total reps · Total work = Σ(load × reps). Tap a legend key to hide a line.');
  statGrid([
    ['Sessions', dates.length],
    ['Best load', Math.max(...dates.map(d => byDate.get(d).values.load))],
    ['Latest load', byDate.get(dates[dates.length - 1]).values.load]
  ]);
}

// ── Rehab ────────────────────────────────────────────────────
function drawRehabChart(entries) {
  const byDate = new Map();
  entries.forEach(e => (e.sets || []).forEach(s => {
    const cur = byDate.get(e.date) || { values: { load: 0, duration: 0, reps: 0 }, lines: [] };
    cur.values.load = Math.max(cur.values.load, s.load || 0);
    cur.values.duration = Math.max(cur.values.duration, s.durationSec || 0);
    cur.values.reps = Math.max(cur.values.reps, s.reps || 0);
    byDate.set(e.date, cur);
  }));
  entries.forEach(e => {
    const cur = byDate.get(e.date);
    if (cur) cur.lines = (e.sets || []).map((s, i) =>
      `${i + 1}. ${[s.load != null ? `${s.load}lb` : null, s.reps != null ? `× ${s.reps}` : null,
        s.durationSec != null ? `${s.durationSec}s` : null].filter(Boolean).join(' ')}`);
  });
  const dates = [...byDate.keys()].sort();
  if (!dates.length) return setEmpty('No data yet');

  drawOverlay(dates, byDate, SERIES.rehab, 'Best set of each session.');
  statGrid([
    ['Sessions', dates.length],
    ['Best load', Math.max(...dates.map(d => byDate.get(d).values.load))],
    ['Latest load', byDate.get(dates[dates.length - 1]).values.load]
  ]);
}

// ── Cardio ───────────────────────────────────────────────────
function drawCardioChart(entries) {
  const byDate = new Map();
  entries.filter(e => e.cardioClass === 'endurance' && e.endurance).forEach(e => {
    const d = e.endurance;
    const min = d.timeSec ? d.timeSec / 60 : null;
    byDate.set(e.date, {
      values: {
        distance: d.distance ?? null,
        time: min,
        pace: d.distance && min ? +(min / d.distance).toFixed(2) : null
      },
      lines: [`${d.distance ?? '–'} ${d.distanceUnit || ''} in ${fmtSecAsMMSS(d.timeSec)}`]
    });
  });
  const dates = [...byDate.keys()].sort();
  if (!dates.length) return setEmpty('No endurance cardio logged for this exercise');

  drawOverlay(dates, byDate, SERIES.cardio, 'Pace is derived from distance and time — lower is faster.');
  statGrid([
    ['Sessions', dates.length],
    ['Total dist', dates.reduce((a, d) => a + (byDate.get(d).values.distance || 0), 0).toFixed(1)],
    ['Total time', fmtSecAsMMSS(dates.reduce((a, d) => a + (byDate.get(d).values.time || 0) * 60, 0))]
  ]);
}

// ── Finger training — one grip at a time, load and duration together ──
function drawFingerChart(entries) {
  const p = S.progress;
  const forProtocol = entries.filter(e => e.protocol === p.protocol);

  const grips = [...new Set(forProtocol.flatMap(e => (e.sets || []).map(s => s.grip)).filter(Boolean))].sort();
  const gripsEl = document.getElementById('prog-grips');
  if (!grips.length) {
    if (gripsEl) gripsEl.innerHTML = '';
    return setEmpty('No data for this protocol yet');
  }
  if (!p.grip || !grips.includes(p.grip)) p.grip = grips[0];

  if (gripsEl) {
    gripsEl.innerHTML = `
      <div class="section-label" style="margin:10px 0 6px">Grip</div>
      <div class="pill-row" style="margin-bottom:0">
        ${grips.map(g => `<span class="pill${p.grip === g ? ' active' : ''}" data-prog-grip="${esc(g)}">${esc(g)}</span>`).join('')}
      </div>`;
    gripsEl.querySelectorAll('[data-prog-grip]').forEach(n => n.onclick = () => {
      p.grip = n.dataset.progGrip;
      refresh();
    });
  }

  const byDate = new Map();
  forProtocol.forEach(e => {
    const sets = (e.sets || []).filter(s => s.grip === p.grip);
    if (!sets.length) return;
    const cur = byDate.get(e.date) || { values: { load: 0, duration: 0, reps: 0 }, lines: [] };
    const lines = [];
    sets.forEach(s => {
      const detail = [s.implement, APPARATUS[s.apparatus] || s.apparatus].filter(Boolean).join(' · ');
      if (p.protocol === 'max_hang' || p.protocol === 'density_hang') {
        (s.reps || []).forEach(r => {
          cur.values.load = Math.max(cur.values.load, r.load || 0);
          cur.values.duration = Math.max(cur.values.duration, r.durationSec || 0);
          lines.push(`${r.load ?? '–'}lb × ${r.durationSec ?? '–'}s${r.rpe ? ` @ RPE ${r.rpe}` : ''}`);
        });
      } else {
        cur.values.load = Math.max(cur.values.load, s.load || 0);
        cur.values.reps = Math.max(cur.values.reps, s.reps || 0);
        lines.push(`${s.load ?? '–'}lb × ${s.reps ?? '–'}`);
      }
      if (detail) lines.push(detail);
    });
    cur.lines = lines;
    byDate.set(e.date, cur);
  });

  const dates = [...byDate.keys()].sort();
  if (!dates.length) return setEmpty(`No ${p.grip} data for this protocol yet`);

  drawOverlay(dates, byDate, SERIES[p.protocol],
    `${FINGER_PROTOCOLS[p.protocol]} · ${esc(p.grip)} — best set of each session.`);
  statGrid([
    ['Sessions', dates.length],
    ['Best load', Math.max(...dates.map(d => byDate.get(d).values.load))],
    ['Latest load', byDate.get(dates[dates.length - 1]).values.load]
  ]);
}

// ── Redpoint pyramid ─────────────────────────────────────────
function showPyramid(entries) {
  if (chart) { chart.destroy(); chart = null; }
  document.getElementById('prog-stats').innerHTML = '';
  document.getElementById('prog-legend').innerHTML = '';
  // The pyramid isn't a chart — give it the whole card, unconstrained by the
  // fixed chart height.
  const wrap = document.querySelector('#tab-progress .chart-wrap');
  wrap.classList.add('is-pyramid');
  renderPyramid(entries, wrap);
}

// ── Bouldering / Rope Redpoint ───────────────────────────────
const attemptColor = n => n <= 1 ? C.green : n <= 3 ? C.amber : C.red;

function gradeScaleOptions(scale, pts) {
  return {
    min: Math.max(0, Math.min(...pts.map(p => p.y)) - 1),
    max: Math.min(scale.length - 1, Math.max(...pts.map(p => p.y)) + 1),
    ticks: { color: C.muted, stepSize: 1, callback: v => scale[v] || '', font: { size: 10 } },
    grid: { color: C.border },
    title: { display: true, text: 'Grade', color: C.muted, font: { size: 11 } }
  };
}

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

  const ctx = resetCanvas();
  chart = safeChart(ctx, {
    type: 'scatter',
    data: {
      labels: [...new Set(pts.map(p => p.x))],
      datasets: [
        { label: 'Sent', data: sent, pointRadius: 6,
          pointBackgroundColor: sent.map(p => attemptColor(p.attempts)),
          pointBorderColor: sent.map(p => attemptColor(p.attempts)) },
        { label: 'Attempted', data: tried, pointRadius: 6,
          pointBackgroundColor: 'transparent', borderWidth: 2,
          pointBorderColor: tried.map(p => attemptColor(p.attempts)) }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      scales: {
        x: { type: 'category', grid: { color: C.border },
             ticks: { color: C.muted, maxRotation: 45, font: { size: 10 }, autoSkipPadding: 12 } },
        y: gradeScaleOptions(scale, pts)
      },
      plugins: {
        legend: { labels: { color: C.muted, boxWidth: 12, font: { size: 11 } } },
        tooltip: { callbacks: { label: ctx => {
          const p = ctx.raw;
          return [`${p.grade}${p.name ? ` — ${p.name}` : ''}`,
            `${p.outcome} · ${p.attempts} attempt${p.attempts === 1 ? '' : 's'}`];
        } } }
      }
    }
  });

  statGrid([
    ['Climbs', pts.length],
    ['Sent', sent.length],
    ['Hardest sent', sent.length ? scale[Math.max(...sent.map(p => p.y))] : '–']
  ]);
  document.getElementById('prog-legend').innerHTML =
    'Solid = sent · Hollow = attempted &nbsp;|&nbsp; '
    + `<span style="color:${C.green}">1 try</span> · <span style="color:${C.amber}">2–3</span> · <span style="color:${C.red}">4+</span>`;
}

// ── Rope Endurance Laps ──────────────────────────────────────
function drawLapsChart(entries) {
  const scale = gradeScale('rope_endurance');
  const pts = [];
  entries.forEach(e => (e.sets || []).forEach(s => {
    if (!s.grade || !scale.includes(s.grade)) return;
    pts.push({ x: fmtDate(e.date), y: scale.indexOf(s.grade), grade: s.grade,
      laps: s.laps, timeSec: s.timeSec, rpe: s.rpe });
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
    options: {
      responsive: true, maintainAspectRatio: false,
      scales: {
        x: { type: 'category', grid: { color: C.border },
             ticks: { color: C.muted, maxRotation: 45, font: { size: 10 }, autoSkipPadding: 12 } },
        y: gradeScaleOptions(scale, pts)
      },
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: ctx => {
          const p = ctx.raw;
          return [`${p.grade}`, `${p.laps ?? '–'} laps`,
            p.timeSec ? `${fmtSecAsMMSS(p.timeSec)} on the wall` : '',
            p.rpe ? `RPE ${p.rpe}` : ''].filter(Boolean);
        } } }
      }
    }
  });

  document.getElementById('prog-stats').innerHTML = '';
  document.getElementById('prog-legend').innerHTML =
    'One point per lap set — tap for laps, time and RPE.';
}

export function invalidateProgressCache() { cache = { key: null, entries: [] }; }
