import {
  S, CATEGORIES, LIBRARY_CATEGORIES, GRIPS, FINGER_PROTOCOLS, APPARATUS,
  OUTCOMES, gradeScale
} from './state.js';
import { esc, toast, todayStr, uid, parseDuration, debounce } from './utils.js';
import { saveSession } from './db.js';

const DRAFT_KEY = () => `tl_draft_${S.user.uid}`;

// ── Draft lifecycle ──────────────────────────────────────────
export function newSession() {
  S.session = { id: null, date: todayStr(), notes: '', entries: [] };
}

export function loadDraft() {
  try {
    const raw = localStorage.getItem(DRAFT_KEY());
    if (!raw) return false;
    const d = JSON.parse(raw);
    if (!d || (!d.entries?.length && !d.notes)) return false;
    S.session = d;
    return true;
  } catch { return false; }
}

const persistDraft = debounce(() => {
  if (!S.user || !S.session) return;
  try { localStorage.setItem(DRAFT_KEY(), JSON.stringify(S.session)); } catch {}
}, 300);

export function clearDraft() {
  // Cancel any pending debounced write first, or it would resurrect the draft
  // a moment after we clear it.
  persistDraft.cancel();
  try { localStorage.removeItem(DRAFT_KEY()); } catch {}
}

// ── Entry factories ──────────────────────────────────────────
const scSet = () => ({ weight: '', weightType: 'absolute', reps: '', rpe: '' });
const intervalSet = () => ({ workSec: '', restSec: '', reps: '', distance: '' });
const hangRep = () => ({ load: '', durationSec: '', rpe: '' });
const hangSet = () => ({ grip: GRIPS[0], apparatus: 'hb_bimanual', implement: '', restSec: '', reps: [hangRep()] });
const repeaterSet = () => ({ grip: GRIPS[0], apparatus: 'hb_bimanual', implement: '', load: '', workSec: '7', restSec: '3', reps: '' });
const pulseSet = () => ({ grip: GRIPS[0], apparatus: 'no_hang', implement: '', load: '', reps: '', rpe: '' });
const rehabSet = () => ({ load: '', reps: '', durationSec: '', rpe: '' });
const lapSet = () => ({ grade: '', laps: '', timeSec: '', rpe: '' });

function fingerSetFor(protocol) {
  if (protocol === 'repeaters') return repeaterSet();
  if (protocol === 'pulses') return pulseSet();
  return hangSet();
}

function setFactoryFor(e) {
  if (e.category === 'sc') return scSet;
  if (e.category === 'cardio') return intervalSet;
  if (e.category === 'rehab') return rehabSet;
  if (e.category === 'rope_endurance') return lapSet;
  return () => fingerSetFor(e.protocol);
}

function addEntry(entry) {
  S.session.entries.push({ _localId: uid(), ...entry });
  renderLog();
}

// ── Save ─────────────────────────────────────────────────────
const num = v => (v === '' || v == null ? null : Number(v));

function normalizeEntry(e) {
  const base = { category: e.category };
  switch (e.category) {
    case 'sc':
      return { ...base, exerciseId: e.exerciseId, exerciseName: e.exerciseName,
        sets: e.sets.map(s => ({
          weight: num(s.weight), weightType: s.weightType, reps: num(s.reps), rpe: num(s.rpe)
        })) };
    case 'cardio': {
      const out = { ...base, exerciseId: e.exerciseId, exerciseName: e.exerciseName,
        cardioClass: e.cardioClass };
      if (e.cardioClass === 'endurance') {
        out.endurance = {
          distance: num(e.endurance.distance),
          distanceUnit: e.endurance.distanceUnit,
          timeSec: parseDuration(e.endurance.timeSec)
        };
      } else {
        out.sets = e.sets.map(s => ({
          workSec: parseDuration(s.workSec), restSec: parseDuration(s.restSec),
          reps: num(s.reps), distance: num(s.distance)
        }));
      }
      return out;
    }
    case 'finger':
      return { ...base, protocol: e.protocol, sets: e.sets.map(s => {
        const setBase = { grip: s.grip, apparatus: s.apparatus, implement: s.implement || null };
        if (e.protocol === 'repeaters') {
          return { ...setBase, load: num(s.load),
            workSec: parseDuration(s.workSec), restSec: parseDuration(s.restSec), reps: num(s.reps) };
        }
        if (e.protocol === 'pulses') {
          return { ...setBase, load: num(s.load), reps: num(s.reps), rpe: num(s.rpe) };
        }
        return { ...setBase, restSec: parseDuration(s.restSec),
          reps: s.reps.map(r => ({ load: num(r.load), durationSec: parseDuration(r.durationSec), rpe: num(r.rpe) })) };
      }) };
    case 'rehab':
      return { ...base, exerciseId: e.exerciseId, exerciseName: e.exerciseName,
        sets: e.sets.map(s => ({
          load: num(s.load), reps: num(s.reps),
          durationSec: parseDuration(s.durationSec), rpe: num(s.rpe)
        })) };
    case 'boulder':
    case 'rope_redpoint':
      return { ...base, name: e.name || null, grade: e.grade,
        outcome: e.outcome, attempts: e.outcome === 'flash' ? 1 : (num(e.attempts) || 1),
        notes: e.notes || '' };
    case 'rope_endurance':
      return { ...base, sets: e.sets.map(s => ({
        grade: s.grade, laps: num(s.laps), timeSec: parseDuration(s.timeSec), rpe: num(s.rpe)
      })) };
    default:
      return base;
  }
}

async function doSave() {
  const sess = S.session;
  if (!sess.entries.length) return toast('Add at least one entry', 'err');
  if (!sess.date) return toast('Pick a date', 'err');
  const btn = document.getElementById('save-session-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }
  try {
    await saveSession({ ...sess, entries: sess.entries.map(normalizeEntry) });
    clearDraft();
    newSession();
    S.editingSessionId = null;
    toast('Session saved');
    renderLog();
  } catch (err) {
    toast('Save failed: ' + err.message, 'err');
    if (btn) { btn.disabled = false; btn.textContent = 'Save Session'; }
  }
}

// ── Render ───────────────────────────────────────────────────
export function renderLog() {
  if (!S.session) newSession();
  const el = document.getElementById('tab-log');
  const s = S.session;

  el.innerHTML = `
    ${S.editingSessionId ? `
      <div class="edit-banner">
        <span>Editing session — ${esc(s.date)}</span>
        <button class="btn btn-sm" id="cancel-edit-btn">Cancel</button>
      </div>` : ''}

    <div class="card">
      <div class="field-row">
        <div class="field"><label>Date</label><input type="date" id="sess-date" value="${esc(s.date)}"></div>
      </div>
      <div class="field full"><label>Session notes</label><textarea id="sess-notes" placeholder="Overall notes...">${esc(s.notes)}</textarea></div>
    </div>

    <div id="log-entries">
      ${s.entries.map((e, i) => renderEntry(e, i)).join('')}
    </div>

    ${renderAddPanel()}

    <div style="display:flex;gap:8px;margin-top:10px">
      <button class="btn btn-primary btn-block" id="save-session-btn">${S.editingSessionId ? 'Update Session' : 'Save Session'}</button>
      <button class="btn btn-block" style="max-width:110px;color:var(--red)" id="clear-session-btn">Clear</button>
    </div>`;

  wireLog();
}

function renderEntry(e, i) {
  const title = e.category === 'finger' ? FINGER_PROTOCOLS[e.protocol]
    : (e.exerciseName || CATEGORIES[e.category]);
  // Climb/lap entries have no exercise name, so the title is already the category
  // label — don't repeat it in a tag beside itself.
  const showTag = title !== CATEGORIES[e.category];
  return `
    <div class="entry-card" data-cat="${e.category}">
      <div class="entry-header">
        <div>
          <span class="entry-name">${esc(title)}</span>
          ${showTag ? `<span class="tag tag-${e.category}" style="margin-left:6px">${CATEGORIES[e.category]}</span>` : ''}
        </div>
        <button class="btn-danger" data-act="del-entry" data-e="${i}">✕</button>
      </div>
      <div class="entry-body">${entryBody(e, i)}</div>
    </div>`;
}

function entryBody(e, i) {
  switch (e.category) {
    case 'sc': return scBody(e, i);
    case 'cardio': return cardioBody(e, i);
    case 'rehab': return rehabBody(e, i);
    case 'finger': return fingerBody(e, i);
    case 'boulder':
    case 'rope_redpoint': return climbBody(e, i);
    case 'rope_endurance': return lapsBody(e, i);
    default: return '';
  }
}

// 'relative' = bodyweight movement; the number is load added to (or, when
// negative, taken off) bodyweight. Blank/0 means straight bodyweight.
const WEIGHT_TYPES = { absolute: 'lb', relative: 'BW±' };

function scBody(e, i) {
  return `
    <div class="section-label" style="margin-bottom:4px">Sets</div>
    ${e.sets.map((s, si) => `
      <div class="set-row">
        <span class="set-num">${si + 1}</span>
        <select data-e="${i}" data-s="${si}" data-f="weightType" style="flex:0 0 78px">
          ${Object.entries(WEIGHT_TYPES).map(([v, l]) => `<option value="${v}"${s.weightType === v ? ' selected' : ''}>${l}</option>`).join('')}
        </select>
        <input type="number" step="0.5" placeholder="${s.weightType === 'relative' ? '±lb' : 'wt'}" value="${esc(s.weight)}" data-e="${i}" data-s="${si}" data-f="weight">
        <input type="number" placeholder="reps" value="${esc(s.reps)}" data-e="${i}" data-s="${si}" data-f="reps">
        <input type="number" step="0.5" placeholder="RPE" value="${esc(s.rpe)}" data-e="${i}" data-s="${si}" data-f="rpe">
        <button class="btn-danger" data-act="del-set" data-e="${i}" data-s="${si}">✕</button>
      </div>`).join('')}
    <button class="btn btn-sm" style="margin-top:6px" data-act="add-set" data-e="${i}">+ Set</button>`;
}

function cardioBody(e, i) {
  const isEnd = e.cardioClass === 'endurance';
  return `
    <div class="pill-row">
      <span class="pill${isEnd ? ' active' : ''}" data-act="cardio-class" data-e="${i}" data-val="endurance">Endurance</span>
      <span class="pill${!isEnd ? ' active' : ''}" data-act="cardio-class" data-e="${i}" data-val="intervals">Intervals</span>
    </div>
    ${isEnd ? `
      <div class="field-row">
        <div class="field"><label>Distance</label><input type="number" step="0.01" value="${esc(e.endurance.distance)}" data-e="${i}" data-f="endurance.distance"></div>
        <div class="field" style="flex:0 0 70px"><label>Unit</label>
          <select data-e="${i}" data-f="endurance.distanceUnit">
            <option value="mi"${e.endurance.distanceUnit === 'mi' ? ' selected' : ''}>mi</option>
            <option value="km"${e.endurance.distanceUnit === 'km' ? ' selected' : ''}>km</option>
            <option value="m"${e.endurance.distanceUnit === 'm' ? ' selected' : ''}>m</option>
          </select>
        </div>
        <div class="field"><label>Time (mm:ss)</label><input type="text" placeholder="32:00" value="${esc(e.endurance.timeSec)}" data-e="${i}" data-f="endurance.timeSec"></div>
      </div>` : `
      <div class="section-label" style="margin-bottom:4px">Interval sets</div>
      ${e.sets.map((s, si) => `
        <div class="set-row">
          <span class="set-num">${si + 1}</span>
          <input type="text" placeholder="work s" value="${esc(s.workSec)}" data-e="${i}" data-s="${si}" data-f="workSec">
          <input type="text" placeholder="rest s" value="${esc(s.restSec)}" data-e="${i}" data-s="${si}" data-f="restSec">
          <input type="number" placeholder="reps" value="${esc(s.reps)}" data-e="${i}" data-s="${si}" data-f="reps">
          <input type="number" step="0.01" placeholder="dist" value="${esc(s.distance)}" data-e="${i}" data-s="${si}" data-f="distance">
          <button class="btn-danger" data-act="del-set" data-e="${i}" data-s="${si}">✕</button>
        </div>`).join('')}
      <button class="btn btn-sm" style="margin-top:6px" data-act="add-set" data-e="${i}">+ Interval set</button>`}`;
}

function gripApparatusFields(s, i, si) {
  return `
    <select data-e="${i}" data-s="${si}" data-f="grip" style="flex:1 1 110px">
      ${GRIPS.map(g => `<option value="${esc(g)}"${s.grip === g ? ' selected' : ''}>${esc(g)}</option>`).join('')}
    </select>
    <select data-e="${i}" data-s="${si}" data-f="apparatus" style="flex:1 1 130px">
      ${Object.entries(APPARATUS).map(([v, l]) => `<option value="${v}"${s.apparatus === v ? ' selected' : ''}>${l}</option>`).join('')}
    </select>
    <input type="text" list="implements" placeholder="implement" value="${esc(s.implement)}" data-e="${i}" data-s="${si}" data-f="implement" style="flex:1 1 120px">`;
}

function rehabBody(e, i) {
  return `
    <div class="section-label" style="margin-bottom:4px">Sets — fill what applies</div>
    ${e.sets.map((s, si) => `
      <div class="set-row">
        <span class="set-num">${si + 1}</span>
        <input type="number" step="0.5" placeholder="load" value="${esc(s.load)}" data-e="${i}" data-s="${si}" data-f="load">
        <input type="number" placeholder="reps" value="${esc(s.reps)}" data-e="${i}" data-s="${si}" data-f="reps">
        <input type="text" placeholder="secs" value="${esc(s.durationSec)}" data-e="${i}" data-s="${si}" data-f="durationSec">
        <input type="number" step="0.5" placeholder="RPE" value="${esc(s.rpe)}" data-e="${i}" data-s="${si}" data-f="rpe">
        <button class="btn-danger" data-act="del-set" data-e="${i}" data-s="${si}">✕</button>
      </div>`).join('')}
    <button class="btn btn-sm" style="margin-top:6px" data-act="add-set" data-e="${i}">+ Set</button>`;
}

function fingerBody(e, i) {
  const timed = e.protocol === 'max_hang' || e.protocol === 'density_hang';
  if (timed) {
    return `
      ${e.sets.map((s, si) => `
        <div class="card-flat">
          <div class="set-row" style="background:none;padding:0;margin-bottom:6px">
            <span class="set-num">${si + 1}</span>
            ${gripApparatusFields(s, i, si)}
            <input type="text" placeholder="rest" value="${esc(s.restSec)}" data-e="${i}" data-s="${si}" data-f="restSec" style="flex:0 0 70px">
            <button class="btn-danger" data-act="del-set" data-e="${i}" data-s="${si}">✕</button>
          </div>
          ${s.reps.map((r, ri) => `
            <div class="set-row">
              <span class="set-num">·${ri + 1}</span>
              <input type="number" step="0.5" placeholder="load" value="${esc(r.load)}" data-e="${i}" data-s="${si}" data-r="${ri}" data-f="load">
              <input type="text" placeholder="secs" value="${esc(r.durationSec)}" data-e="${i}" data-s="${si}" data-r="${ri}" data-f="durationSec">
              <input type="number" step="0.5" placeholder="RPE" value="${esc(r.rpe)}" data-e="${i}" data-s="${si}" data-r="${ri}" data-f="rpe">
              <button class="btn-danger" data-act="del-rep" data-e="${i}" data-s="${si}" data-r="${ri}">✕</button>
            </div>`).join('')}
          <button class="btn btn-sm" style="margin-top:4px" data-act="add-rep" data-e="${i}" data-s="${si}">+ Rep</button>
        </div>`).join('')}
      <button class="btn btn-sm" data-act="add-set" data-e="${i}">+ Set</button>`;
  }
  if (e.protocol === 'repeaters') {
    return `
      ${e.sets.map((s, si) => `
        <div class="card-flat">
          <div class="set-row" style="background:none;padding:0;margin-bottom:6px">
            <span class="set-num">${si + 1}</span>
            ${gripApparatusFields(s, i, si)}
            <button class="btn-danger" data-act="del-set" data-e="${i}" data-s="${si}">✕</button>
          </div>
          <div class="set-row">
            <input type="number" step="0.5" placeholder="load" value="${esc(s.load)}" data-e="${i}" data-s="${si}" data-f="load">
            <input type="text" placeholder="work s" value="${esc(s.workSec)}" data-e="${i}" data-s="${si}" data-f="workSec">
            <input type="text" placeholder="rest s" value="${esc(s.restSec)}" data-e="${i}" data-s="${si}" data-f="restSec">
            <input type="number" placeholder="reps" value="${esc(s.reps)}" data-e="${i}" data-s="${si}" data-f="reps">
          </div>
        </div>`).join('')}
      <button class="btn btn-sm" data-act="add-set" data-e="${i}">+ Set</button>`;
  }
  return `
    ${e.sets.map((s, si) => `
      <div class="card-flat">
        <div class="set-row" style="background:none;padding:0;margin-bottom:6px">
          <span class="set-num">${si + 1}</span>
          ${gripApparatusFields(s, i, si)}
          <button class="btn-danger" data-act="del-set" data-e="${i}" data-s="${si}">✕</button>
        </div>
        <div class="set-row">
          <input type="number" step="0.5" placeholder="load" value="${esc(s.load)}" data-e="${i}" data-s="${si}" data-f="load">
          <input type="number" placeholder="reps" value="${esc(s.reps)}" data-e="${i}" data-s="${si}" data-f="reps">
          <input type="number" step="0.5" placeholder="RPE" value="${esc(s.rpe)}" data-e="${i}" data-s="${si}" data-f="rpe">
        </div>
      </div>`).join('')}
    <button class="btn btn-sm" data-act="add-set" data-e="${i}">+ Set</button>`;
}

function climbBody(e, i) {
  const grades = gradeScale(e.category);
  const isFlash = e.outcome === 'flash';
  return `
    <div class="field-row">
      <div class="field" style="flex:0 0 90px"><label>Grade</label>
        <select data-e="${i}" data-f="grade">
          <option value="">—</option>
          ${grades.map(g => `<option value="${g}"${e.grade === g ? ' selected' : ''}>${g}</option>`).join('')}
        </select>
      </div>
      <div class="field wide"><label>Name (optional)</label>
        <input type="text" list="climb-names" placeholder="shorthand" value="${esc(e.name)}" data-e="${i}" data-f="name">
      </div>
    </div>
    <div class="pill-row">
      ${Object.entries(OUTCOMES).map(([v, l]) =>
        `<span class="pill${e.outcome === v ? ' active' : ''}" data-act="outcome" data-e="${i}" data-val="${v}">${l}</span>`).join('')}
      <input type="number" min="1" style="width:90px" placeholder="attempts" value="${isFlash ? 1 : esc(e.attempts)}" data-e="${i}" data-f="attempts"${isFlash ? ' disabled' : ''}>
    </div>
    <input type="text" placeholder="notes" value="${esc(e.notes)}" data-e="${i}" data-f="notes">`;
}

function lapsBody(e, i) {
  return `
    <div class="section-label" style="margin-bottom:4px">Lap sets</div>
    ${e.sets.map((s, si) => `
      <div class="set-row">
        <span class="set-num">${si + 1}</span>
        <select data-e="${i}" data-s="${si}" data-f="grade" style="flex:0 0 90px">
          <option value="">grade</option>
          ${gradeScale('rope_endurance').map(g => `<option value="${g}"${s.grade === g ? ' selected' : ''}>${g}</option>`).join('')}
        </select>
        <input type="number" placeholder="laps" value="${esc(s.laps)}" data-e="${i}" data-s="${si}" data-f="laps">
        <input type="text" placeholder="mm:ss" value="${esc(s.timeSec)}" data-e="${i}" data-s="${si}" data-f="timeSec">
        <input type="number" step="0.5" placeholder="RPE" value="${esc(s.rpe)}" data-e="${i}" data-s="${si}" data-f="rpe">
        <button class="btn-danger" data-act="del-set" data-e="${i}" data-s="${si}">✕</button>
      </div>`).join('')}
    <button class="btn btn-sm" style="margin-top:6px" data-act="add-set" data-e="${i}">+ Lap set</button>`;
}

function renderAddPanel() {
  const cat = S.log.addCat;
  let picker = '';

  if (LIBRARY_CATEGORIES.includes(cat)) {
    const list = S.exercises.filter(e => e.category === cat &&
      (!S.log.search || e.name.toLowerCase().includes(S.log.search.toLowerCase())));
    picker = `
      <input type="text" id="add-search" placeholder="search exercises..." value="${esc(S.log.search)}" style="margin-top:8px">
      <div class="chip-list">
        ${list.length ? list.map(e => `<button class="chip" data-act="add-lib" data-ex="${e.id}">${esc(e.name)}</button>`).join('')
          : '<span style="color:var(--dim);font-size:12px">No exercises — add some in Library</span>'}
      </div>`;
  } else if (cat === 'finger') {
    picker = `<div class="chip-list">
      ${Object.entries(FINGER_PROTOCOLS).map(([v, l]) => `<button class="chip" data-act="add-finger" data-val="${v}">${l}</button>`).join('')}
    </div>`;
  } else if (cat === 'rope_endurance') {
    picker = `<div class="chip-list"><button class="chip" data-act="add-laps">+ Add lap block</button></div>`;
  } else {
    picker = `<div class="chip-list"><button class="chip" data-act="add-climb" data-val="${cat}">+ Add climb</button></div>`;
  }

  return `
    <div class="card">
      <div class="section-label">Add to session</div>
      <div class="pill-row" style="margin-top:8px">
        ${Object.entries(CATEGORIES).map(([v, l]) =>
          `<span class="pill${S.log.addCat === v ? ' active' : ''}" data-act="add-cat" data-val="${v}">${l}</span>`).join('')}
      </div>
      ${picker}
    </div>
    <datalist id="climb-names">
      ${[...new Set(S.recentClimbNames || [])].map(n => `<option value="${esc(n)}">`).join('')}
    </datalist>
    <datalist id="implements">
      ${[...new Set(S.recentImplements || [])].map(n => `<option value="${esc(n)}">`).join('')}
    </datalist>`;
}

// ── Wiring ───────────────────────────────────────────────────
function resolveTarget(ds) {
  const entry = S.session.entries[+ds.e];
  if (ds.s == null) return entry;
  const set = entry.sets[+ds.s];
  if (ds.r == null) return set;
  return set.reps[+ds.r];
}

function assignPath(obj, path, value) {
  const parts = path.split('.');
  while (parts.length > 1) obj = obj[parts.shift()];
  obj[parts[0]] = value;
}

function wireLog() {
  const el = document.getElementById('tab-log');

  document.getElementById('sess-date').onchange = e => { S.session.date = e.target.value; persistDraft(); };
  document.getElementById('sess-notes').oninput = e => { S.session.notes = e.target.value; persistDraft(); };

  // Field edits: update state in place, never re-render (keeps focus).
  el.querySelectorAll('#log-entries [data-f]').forEach(input => {
    const handler = ev => {
      const ds = ev.target.dataset;
      const target = ds.f.includes('.') ? S.session.entries[+ds.e] : resolveTarget(ds);
      assignPath(target, ds.f, ev.target.value);
      persistDraft();
    };
    input.oninput = handler;
    input.onchange = handler;
  });

  el.querySelectorAll('[data-act]').forEach(node => {
    node.onclick = () => {
      const ds = node.dataset;
      const e = ds.e != null ? S.session.entries[+ds.e] : null;
      switch (ds.act) {
        case 'add-cat': S.log.addCat = ds.val; S.log.search = ''; break;
        case 'add-lib': {
          const ex = S.exercises.find(x => x.id === ds.ex);
          if (!ex) return;
          if (ex.category === 'rehab') {
            addEntry({ category: 'rehab', exerciseId: ex.id, exerciseName: ex.name,
              sets: [rehabSet(), rehabSet(), rehabSet()] });
            return;
          }
          if (ex.category === 'cardio') {
            addEntry({ category: 'cardio', exerciseId: ex.id, exerciseName: ex.name,
              cardioClass: 'endurance',
              endurance: { distance: '', distanceUnit: 'mi', timeSec: '' },
              sets: [intervalSet()] });
          } else {
            addEntry({ category: 'sc', exerciseId: ex.id, exerciseName: ex.name,
              sets: [scSet(), scSet(), scSet()] });
          }
          return;
        }
        case 'add-finger':
          addEntry({ category: 'finger', protocol: ds.val, sets: [fingerSetFor(ds.val)] });
          return;
        case 'add-climb':
          addEntry({ category: ds.val, name: '', grade: '', outcome: 'attempt', attempts: '1', notes: '' });
          return;
        case 'add-laps':
          addEntry({ category: 'rope_endurance', sets: [lapSet()] });
          return;
        case 'del-entry': S.session.entries.splice(+ds.e, 1); break;
        case 'add-set':
          e.sets.push(setFactoryFor(e)());
          break;
        case 'del-set':
          e.sets.splice(+ds.s, 1);
          if (!e.sets.length) e.sets.push(setFactoryFor(e)());
          break;
        case 'add-rep': e.sets[+ds.s].reps.push(hangRep()); break;
        case 'del-rep':
          e.sets[+ds.s].reps.splice(+ds.r, 1);
          if (!e.sets[+ds.s].reps.length) e.sets[+ds.s].reps.push(hangRep());
          break;
        case 'cardio-class': e.cardioClass = ds.val; break;
        case 'outcome':
          e.outcome = ds.val;
          if (ds.val === 'flash') e.attempts = '1';
          break;
      }
      persistDraft();
      renderLog();
    };
  });

  const search = document.getElementById('add-search');
  if (search) {
    search.oninput = ev => {
      S.log.search = ev.target.value;
      renderLog();
      const box = document.getElementById('add-search');
      box.focus();
      box.setSelectionRange(box.value.length, box.value.length);
    };
  }

  document.getElementById('save-session-btn').onclick = doSave;
  document.getElementById('clear-session-btn').onclick = () => {
    if (!confirm('Clear this session?')) return;
    clearDraft();
    newSession();
    S.editingSessionId = null;
    renderLog();
  };
  const cancelBtn = document.getElementById('cancel-edit-btn');
  if (cancelBtn) cancelBtn.onclick = () => {
    clearDraft();
    newSession();
    S.editingSessionId = null;
    renderLog();
  };
}
