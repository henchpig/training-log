// The entry form: the stack of entry cards, and the picker beneath them for
// adding another. Shared by the Log tab, which fills one in for a real session,
// and the Templates tab, which builds a reusable one — so it knows about
// neither, and works from a context instead:
//
//   { host, entries, ui, rerender, onChange }
//
// `entries` is the live array it edits, `ui` is that tab's own picker state
// ({ addCat, search }) so the two tabs don't share a selected category,
// `rerender` repaints the owning tab after a structural change, and `onChange`
// runs after every edit — the Log tab saves its draft there.
import {
  S, CATEGORIES, LIBRARY_CATEGORIES, GRIPS, FINGER_PROTOCOLS, APPARATUS,
  OUTCOMES, gradeScale, LAP_CATEGORIES, ROPE_PROTOCOLS, ropeProtocol
} from './state.js';
import { esc, uid, toast } from './utils.js';

const scSet = () => ({ weight: '', weightType: 'absolute', reps: '', rpe: '' });
const intervalSet = () => ({ workSec: '', restSec: '', reps: '', distance: '' });
const hangRep = () => ({ load: '', durationSec: '', rpe: '' });
const hangSet = () => ({ grip: GRIPS[0], apparatus: 'hb_bimanual', implement: '', restSec: '', reps: [hangRep()] });
const repeaterSet = () => ({ grip: GRIPS[0], apparatus: 'hb_bimanual', implement: '', load: '', workSec: '7', restSec: '3', reps: '' });
const pulseSet = () => ({ grip: GRIPS[0], apparatus: 'no_hang', implement: '', load: '', reps: '', rpe: '' });
const rehabSet = () => ({ load: '', reps: '', durationSec: '', rpe: '' });
const lapSet = () => ({ grade: '', laps: '', timeSec: '', rpe: '' });
const boulderLapSet = () => ({ grade: '', laps: '' });
// One set = one full run through the crux sequence, the last pass continuing to
// the top. Four passes is the protocol, but it gets bent, so it's editable.
const cruxSet = () => ({ grade: '', passes: '4', outcome: 'fell', rpe: '' });

function fingerSetFor(protocol) {
  if (protocol === 'repeaters') return repeaterSet();
  if (protocol === 'pulses') return pulseSet();
  return hangSet();
}

function setFactoryFor(e) {
  if (e.category === 'sc') return scSet;
  if (e.category === 'cardio') return intervalSet;
  if (e.category === 'rehab') return rehabSet;
  if (e.category === 'rope_endurance') {
    return ropeProtocol(e) === 'crux_intervals' ? cruxSet : lapSet;
  }
  if (e.category === 'boulder_laps') return boulderLapSet;
  return () => fingerSetFor(e.protocol);
}
function renderEntry(e, i) {
  const title = e.category === 'finger' ? FINGER_PROTOCOLS[e.protocol]
    : e.category === 'rope_endurance' ? ROPE_PROTOCOLS[ropeProtocol(e)]
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
      <div class="entry-body">
        <div data-recall="${e._localId}"></div>
        ${entryBody(e, i)}
      </div>
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
    case 'rope_endurance':
      return ropeProtocol(e) === 'crux_intervals' ? cruxBody(e, i) : lapsBody(e, i);
    case 'boulder_laps': return boulderLapsBody(e, i);
    default: return '';
  }
}

// 'relative' = bodyweight movement; the number is load added to (or, when
// negative, taken off) bodyweight. Blank/0 means straight bodyweight.
const WEIGHT_TYPES = { absolute: 'lb', relative: 'BW±' };

// Placeholders vanish once a box has a value, which on a phone leaves a row of
// unlabelled numbers. A header keeps the columns readable.
const setHead = (...labels) => `
  <div class="set-head"><span class="set-num"></span>
    ${labels.map(l => `<span>${l}</span>`).join('')}
    <span class="spacer-btn"></span>
  </div>`;

function scBody(e, i) {
  return `
    <div class="section-label" style="margin-bottom:4px">Sets</div>
    ${setHead('type', 'weight', 'reps', 'RPE')}
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
      ${setHead('work s', 'rest s', 'reps', 'dist')}
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
    <select data-e="${i}" data-s="${si}" data-f="apparatus" style="flex:1 1 165px">
      ${Object.entries(APPARATUS).map(([v, l]) => `<option value="${v}"${s.apparatus === v ? ' selected' : ''}>${l}</option>`).join('')}
    </select>
    <input type="text" list="implements" placeholder="implement" value="${esc(s.implement)}" data-e="${i}" data-s="${si}" data-f="implement" style="flex:1 1 120px">`;
}

function rehabBody(e, i) {
  return `
    <div class="section-label" style="margin-bottom:4px">Sets — fill what applies</div>
    ${setHead('load', 'reps', 'secs', 'RPE')}
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
          ${setHead('load', 'secs', 'RPE')}
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
          ${setHead('load', 'work s', 'rest s', 'reps')}
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
        ${setHead('load', 'reps', 'RPE')}
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
    ${setHead('grade', 'laps', 'time', 'RPE')}
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

function cruxBody(e, i) {
  return `
    <div class="section-label" style="margin-bottom:4px">Sets — each is one run through the crux</div>
    ${setHead('grade', 'passes', 'finish', 'RPE')}
    ${e.sets.map((s, si) => `
      <div class="set-row">
        <span class="set-num">${si + 1}</span>
        <select data-e="${i}" data-s="${si}" data-f="grade" style="flex:1 1 86px">
          <option value="">grade</option>
          ${gradeScale('rope_endurance').map(g => `<option value="${g}"${s.grade === g ? ' selected' : ''}>${g}</option>`).join('')}
        </select>
        <input type="number" placeholder="passes" value="${esc(s.passes)}" data-e="${i}" data-s="${si}" data-f="passes">
        <select data-e="${i}" data-s="${si}" data-f="outcome" style="flex:1 1 80px">
          <option value="sent"${s.outcome === 'sent' ? ' selected' : ''}>sent</option>
          <option value="fell"${s.outcome === 'fell' ? ' selected' : ''}>fell</option>
        </select>
        <input type="number" step="0.5" placeholder="RPE" value="${esc(s.rpe)}" data-e="${i}" data-s="${si}" data-f="rpe">
        <button class="btn-danger" data-act="del-set" data-e="${i}" data-s="${si}">✕</button>
      </div>`).join('')}
    <button class="btn btn-sm" style="margin-top:6px" data-act="add-set" data-e="${i}">+ Set</button>`;
}

function boulderLapsBody(e, i) {
  return `
    <div class="section-label" style="margin-bottom:4px">Lap sets</div>
    ${setHead('grade', 'laps')}
    ${e.sets.map((s, si) => `
      <div class="set-row">
        <span class="set-num">${si + 1}</span>
        <select data-e="${i}" data-s="${si}" data-f="grade" style="flex:1 1 90px">
          <option value="">grade</option>
          ${gradeScale('boulder_laps').map(g => `<option value="${g}"${s.grade === g ? ' selected' : ''}>${g}</option>`).join('')}
        </select>
        <input type="number" placeholder="laps" value="${esc(s.laps)}" data-e="${i}" data-s="${si}" data-f="laps">
        <button class="btn-danger" data-act="del-set" data-e="${i}" data-s="${si}">✕</button>
      </div>`).join('')}
    <button class="btn btn-sm" style="margin-top:6px" data-act="add-set" data-e="${i}">+ Lap set</button>`;
}

export function renderAddPanel(ctx) {
  const cat = ctx.ui.addCat;
  let picker = '';

  if (cat === 'template') {
    const list = S.templates.items || [];
    picker = `
      <div class="chip-list">
        ${list.length ? list.map(t =>
            `<button class="chip" data-act="add-template" data-id="${t.id}">${esc(t.name)}</button>`).join('')
          : '<span style="color:var(--dim);font-size:12px">No templates — build one in the Templates tab</span>'}
      </div>`;
  } else if (LIBRARY_CATEGORIES.includes(cat)) {
    const list = S.exercises.filter(e => e.category === cat &&
      (!ctx.ui.search || e.name.toLowerCase().includes(ctx.ui.search.toLowerCase())));
    picker = `
      <input type="text" data-role="add-search" placeholder="search exercises..." value="${esc(ctx.ui.search)}" style="margin-top:8px">
      <div class="chip-list">
        ${list.length ? list.map(e => `<button class="chip" data-act="add-lib" data-ex="${e.id}">${esc(e.name)}</button>`).join('')
          : '<span style="color:var(--dim);font-size:12px">No exercises — add some in Library</span>'}
      </div>`;
  } else if (cat === 'finger') {
    picker = `<div class="chip-list">
      ${Object.entries(FINGER_PROTOCOLS).map(([v, l]) => `<button class="chip" data-act="add-finger" data-val="${v}">${l}</button>`).join('')}
    </div>`;
  } else if (cat === 'rope_endurance') {
    picker = `<div class="chip-list">
      ${Object.entries(ROPE_PROTOCOLS).map(([v, l]) =>
        `<button class="chip" data-act="add-rope" data-val="${v}">${l}</button>`).join('')}
    </div>`;
  } else if (LAP_CATEGORIES.includes(cat)) {
    picker = `<div class="chip-list"><button class="chip" data-act="add-laps" data-val="${cat}">+ Add lap block</button></div>`;
  } else {
    picker = `<div class="chip-list"><button class="chip" data-act="add-climb" data-val="${cat}">+ Add climb</button></div>`;
  }

  return `
    <div class="card">
      <div class="section-label">${esc(ctx.addLabel || 'Add to session')}</div>
      <div class="pill-row" style="margin-top:8px">
        ${ctx.offerTemplates ? `<span class="pill${cat === 'template' ? ' active' : ''}" data-act="add-cat" data-val="template">Templates</span>` : ''}
        ${Object.entries(CATEGORIES).map(([v, l]) =>
          `<span class="pill${cat === v ? ' active' : ''}" data-act="add-cat" data-val="${v}">${l}</span>`).join('')}
      </div>
      ${picker}
    </div>`;
}

// ── Entry list ───────────────────────────────────────────────
export function renderEntries(ctx) {
  return `<div class="form-entries">${ctx.entries.map((e, i) => renderEntry(e, i)).join('')}</div>`;
}

export function addEntryTo(ctx, entry) {
  const withId = { _localId: uid(), ...entry };
  ctx.entries.push(withId);
  ctx.rerender();
  ctx.onAdd?.(withId);
  return withId;
}

// A template's entries are a blueprint, not the thing being edited, so they're
// copied on the way in — and given fresh local ids, since the originals are
// still in the template.
export function cloneEntries(entries) {
  return JSON.parse(JSON.stringify(entries)).map(e => ({ ...e, _localId: uid() }));
}

// ── Wiring ───────────────────────────────────────────────────
function resolveTarget(ctx, ds) {
  const entry = ctx.entries[+ds.e];
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

export function wireEntryForm(ctx) {
  const { host, entries } = ctx;

  // Field edits: update state in place, never re-render (keeps focus).
  host.querySelectorAll('.form-entries [data-f]').forEach(input => {
    const handler = ev => {
      const ds = ev.target.dataset;
      const target = ds.f.includes('.') ? entries[+ds.e] : resolveTarget(ctx, ds);
      assignPath(target, ds.f, ev.target.value);
      ctx.onChange();
    };
    input.oninput = handler;
    input.onchange = handler;
  });

  host.querySelectorAll('[data-act]').forEach(node => {
    node.onclick = () => {
      const ds = node.dataset;
      const e = ds.e != null ? entries[+ds.e] : null;
      switch (ds.act) {
        case 'add-cat': ctx.ui.addCat = ds.val; ctx.ui.search = ''; break;
        case 'add-lib': {
          const ex = S.exercises.find(x => x.id === ds.ex);
          if (!ex) return;
          if (ex.category === 'rehab') {
            addEntryTo(ctx, { category: 'rehab', exerciseId: ex.id, exerciseName: ex.name,
              sets: [rehabSet(), rehabSet(), rehabSet()] });
            return;
          }
          if (ex.category === 'cardio') {
            addEntryTo(ctx, { category: 'cardio', exerciseId: ex.id, exerciseName: ex.name,
              cardioClass: 'endurance',
              endurance: { distance: '', distanceUnit: 'mi', timeSec: '' },
              sets: [intervalSet()] });
          } else {
            addEntryTo(ctx, { category: 'sc', exerciseId: ex.id, exerciseName: ex.name,
              sets: [scSet(), scSet(), scSet()] });
          }
          return;
        }
        case 'add-finger':
          addEntryTo(ctx, { category: 'finger', protocol: ds.val, sets: [fingerSetFor(ds.val)] });
          return;
        case 'add-climb':
          addEntryTo(ctx, { category: ds.val, name: '', grade: '', outcome: 'attempt', attempts: '1', notes: '' });
          return;
        case 'add-rope':
          addEntryTo(ctx, { category: 'rope_endurance', protocol: ds.val,
            sets: [ds.val === 'crux_intervals' ? cruxSet() : lapSet()] });
          return;
        case 'add-laps':
          addEntryTo(ctx, { category: ds.val,
            sets: [ds.val === 'boulder_laps' ? boulderLapSet() : lapSet()] });
          return;
        case 'add-template': {
          const t = (S.templates.items || []).find(x => x.id === ds.id);
          if (!t) return;
          entries.push(...cloneEntries(t.entries || []));
          ctx.onChange();
          ctx.rerender();
          ctx.onAddTemplate?.(t);
          return;
        }
        case 'del-entry': entries.splice(+ds.e, 1); break;
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
      ctx.onChange();
      ctx.rerender();
    };
  });

  const search = host.querySelector('[data-role=add-search]');
  if (search) {
    search.oninput = ev => {
      ctx.ui.search = ev.target.value;
      ctx.rerender();
      const box = ctx.host.querySelector('[data-role=add-search]');
      box.focus();
      box.setSelectionRange(box.value.length, box.value.length);
    };
  }
}
