import { S, ropeProtocol } from './state.js';
import { esc, toast, todayStr, parseDuration, debounce, fmtDateShort } from './utils.js';
import { saveSession, fetchEntriesByExercise, fetchEntriesByCategory } from './db.js';
import { compactSets } from './format.js';
import { renderEntries, renderAddPanel, wireEntryForm } from './entryform.js';

// What you lifted last time, for autoregulating today against it. Cached per
// exercise for the life of the page — it can't change while you're logging.
const RECALL_SESSIONS = 3;
const recallCache = new Map();

const recallKey = e => e.category === 'finger' ? `proto:${e.protocol}`
  : e.exerciseId ? `ex:${e.exerciseId}` : null;

async function loadRecall(entry) {
  const key = recallKey(entry);
  if (!key || isEditing()) return;
  if (!recallCache.has(key)) {
    try {
      const rows = entry.category === 'finger'
        ? (await fetchEntriesByCategory('finger')).filter(x => x.protocol === entry.protocol)
        : await fetchEntriesByExercise(entry.exerciseId);
      recallCache.set(key, rows);
    } catch {
      recallCache.set(key, []);
    }
  }
  paintRecall(entry);
}

function recentSessions(entry) {
  const rows = recallCache.get(recallKey(entry));
  if (!rows) return null;                       // still loading
  // Today's own entries aren't history, and neither is anything after it.
  const byDate = new Map();
  rows.filter(r => r.date && r.date < S.session.date)
      .sort((a, b) => b.date.localeCompare(a.date))
      .forEach(r => { if (!byDate.has(r.date)) byDate.set(r.date, r); });
  return [...byDate.values()].slice(0, RECALL_SESSIONS);
}

// Only while logging. Editing an existing session is bookkeeping — the numbers
// are already known, and prior sessions aren't what you're deciding against.
// A session carrying an id is one that already exists, which also covers
// reloading mid-edit, when editingSessionId is gone but the id survives.
const isEditing = () => Boolean(S.editingSessionId || S.session?.id);

function paintRecall(entry) {
  const host = document.querySelector(`[data-recall="${entry._localId}"]`);
  if (!host) return;
  if (isEditing()) { host.innerHTML = ''; return; }
  const recent = recentSessions(entry);
  if (!recent || !recent.length) { host.innerHTML = ''; return; }
  host.innerHTML = `
    <div class="recall">
      <div class="recall-head">Last ${recent.length === 1 ? 'session' : `${recent.length} sessions`}</div>
      ${recent.map(r => `
        <div class="recall-row">
          <span class="recall-date">${esc(fmtDateShort(r.date))}</span>
          <span class="recall-sets">${esc(compactSets(r))}</span>
        </div>`).join('')}
    </div>`;
}

const DRAFT_KEY = () => `tl_draft_${S.user.uid}`;

// ── Draft lifecycle ──────────────────────────────────────────
export function newSession() {
  S.session = { id: null, date: todayStr(), notes: '', entries: [] };
}

export function primeRecall() {
  if (isEditing()) return;
  (S.session?.entries || []).forEach(e => { if (recallKey(e)) loadRecall(e); });
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
    case 'rope_endurance': {
      const protocol = ropeProtocol(e);
      if (protocol === 'crux_intervals') {
        return { ...base, protocol, sets: e.sets.map(s => ({
          grade: s.grade, passes: num(s.passes), outcome: s.outcome, rpe: num(s.rpe)
        })) };
      }
      return { ...base, protocol, sets: e.sets.map(s => ({
        grade: s.grade, laps: num(s.laps), timeSec: parseDuration(s.timeSec), rpe: num(s.rpe)
      })) };
    }
    case 'boulder_laps':
      return { ...base, sets: e.sets.map(s => ({ grade: s.grade, laps: num(s.laps) })) };
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
    recallCache.clear();
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
// The Log tab's form context: it edits the session's entries, autosaves a draft
// on every change, and is the one form a whole template can be dropped into.
function formCtx() {
  return {
    host: document.getElementById('tab-log'),
    entries: S.session.entries,
    ui: S.log,
    rerender: renderLog,
    onChange: persistDraft,
    offerTemplates: true,
    onAdd: loadRecall,
    onAddTemplate: t => { primeRecall(); toast(`Added ${t.name}`); }
  };
}

export function renderLog() {
  if (!S.session) newSession();
  const el = document.getElementById('tab-log');
  const s = S.session;
  const ctx = formCtx();

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

    ${renderEntries(ctx)}
    ${renderAddPanel(ctx)}

    <div class="save-bar">
      <button class="btn btn-primary btn-block" id="save-session-btn">${S.editingSessionId ? 'Update Session' : 'Save Session'}</button>
      <button class="btn btn-block" style="max-width:110px;color:var(--red)" id="clear-session-btn">Clear</button>
    </div>`;

  wireLog(ctx);
  S.session.entries.forEach(e => { if (recallKey(e)) paintRecall(e); });
}

// ── Wiring ───────────────────────────────────────────────────
function wireLog(ctx) {
  document.getElementById('sess-date').onchange = e => { S.session.date = e.target.value; persistDraft(); };
  document.getElementById('sess-notes').oninput = e => { S.session.notes = e.target.value; persistDraft(); };

  wireEntryForm(ctx);

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
