import { CATEGORIES, FINGER_PROTOCOLS, APPARATUS, OUTCOMES } from './state.js';
import { esc, fmtSecAsMMSS, paceStr } from './utils.js';

export function entryTitle(e) {
  if (e.category === 'finger') return FINGER_PROTOCOLS[e.protocol] || 'Finger Training';
  if (e.category === 'boulder' || e.category === 'rope_redpoint') {
    return [e.grade, e.name].filter(Boolean).join(' · ') || CATEGORIES[e.category];
  }
  return e.exerciseName || CATEGORIES[e.category];
}

const wt = (s) => {
  if (s.weightType !== 'relative') return `${s.weight ?? 0}`;
  const w = s.weight || 0;
  return w === 0 ? 'BW' : `BW${w > 0 ? '+' : ''}${w}`;
};

// Returns an array of plain-text lines describing the entry's contents.
export function entryLines(e) {
  switch (e.category) {
    case 'sc':
      return (e.sets || []).map((s, i) =>
        `${i + 1}.  ${wt(s)} × ${s.reps ?? '–'}${s.rpe ? ` @ RPE ${s.rpe}` : ''}`);
    case 'cardio':
      if (e.cardioClass === 'endurance') {
        const d = e.endurance || {};
        const pace = paceStr(d.distance, d.distanceUnit, d.timeSec);
        return [`${d.distance ?? '–'} ${d.distanceUnit || ''} in ${fmtSecAsMMSS(d.timeSec)}${pace ? `  (${pace})` : ''}`];
      }
      return (e.sets || []).map((s, i) =>
        `${i + 1}.  ${s.workSec ?? '–'}s on : ${s.restSec ?? '–'}s off × ${s.reps ?? '–'}${s.distance ? ` · ${s.distance}` : ''}`);
    case 'finger':
      return (e.sets || []).flatMap((s, i) => {
        const head = `${i + 1}.  ${s.grip} · ${APPARATUS[s.apparatus] || s.apparatus}`;
        if (e.protocol === 'repeaters') {
          return [`${head} — ${s.load ?? 0}lb, ${s.workSec ?? '–'}:${s.restSec ?? '–'} × ${s.reps ?? '–'}`];
        }
        if (e.protocol === 'pulses') {
          return [`${head} — ${s.load ?? 0}lb × ${s.reps ?? '–'}${s.rpe ? ` @ RPE ${s.rpe}` : ''}`];
        }
        return [head, ...(s.reps || []).map((r, ri) =>
          `    ·${ri + 1}  ${r.load ?? 0}lb × ${r.durationSec ?? '–'}s${r.rpe ? ` @ RPE ${r.rpe}` : ''}`)];
      });
    case 'boulder':
    case 'rope_redpoint':
      return [`${OUTCOMES[e.outcome] || e.outcome} in ${e.attempts ?? 1} attempt${e.attempts === 1 ? '' : 's'}`]
        .concat(e.notes ? [e.notes] : []);
    case 'rope_endurance':
      return (e.sets || []).map((s, i) =>
        `${i + 1}.  ${s.grade || '–'} × ${s.laps ?? '–'} laps${s.timeSec ? ` · ${fmtSecAsMMSS(s.timeSec)} on the wall` : ''}`);
    default:
      return [];
  }
}

export function sessionSummary(entries) {
  return entries.map(entryTitle).join(', ');
}

export function sessionCategories(entries) {
  return [...new Set(entries.map(e => e.category))];
}

export function renderEntryReadonly(e) {
  return `
    <div style="margin-bottom:14px;padding-bottom:14px;border-bottom:1px solid var(--border)">
      <div style="font-weight:500;margin-bottom:6px">
        ${esc(entryTitle(e))}
        <span class="tag tag-${e.category}" style="margin-left:6px">${CATEGORIES[e.category]}</span>
      </div>
      ${entryLines(e).map(l =>
        `<div style="font-family:var(--mono);font-size:12px;color:var(--muted);line-height:1.7">${esc(l)}</div>`).join('')}
    </div>`;
}
