import { S, REDPOINT_PYRAMID } from './state.js';
import { esc, fmtDate } from './utils.js';

const isSend = e => e.outcome === 'send' || e.outcome === 'flash';

// Sends drop into the tier holding their grade, oldest first, so the pyramid
// fills in the order the climbs actually happened. A grade outside every tier
// (a 5.10 warm-up, say) simply isn't part of this pyramid.
export function buildPyramid(entries) {
  const sends = entries
    .filter(e => isSend(e) && e.grade)
    .sort((a, b) => (a.date || '').localeCompare(b.date || ''));

  return REDPOINT_PYRAMID.map(tier => {
    const matches = sends.filter(s => tier.grades.includes(s.grade));
    return {
      ...tier,
      filled: matches.slice(0, tier.slots),
      overflow: Math.max(0, matches.length - tier.slots)
    };
  });
}

export function renderPyramid(entries, el) {
  const tiers = buildPyramid(entries);
  const done = tiers.reduce((a, t) => a + t.filled.length, 0);
  const total = tiers.reduce((a, t) => a + t.slots, 0);

  el.innerHTML = `
    <div class="pyramid">
      ${tiers.map((t, ti) => `
        <div class="pyr-row">
          <div class="pyr-label">${t.grades.join(' / ')}</div>
          <div class="pyr-blocks">
            ${Array.from({ length: t.slots }, (_, i) => {
              const send = t.filled[i];
              if (!send) return `<div class="pyr-block" aria-hidden="true"></div>`;
              const label = [fmtDate(send.date), send.grade, send.name].filter(Boolean).join(' · ');
              return `<button class="pyr-block filled" data-pyr="${ti}-${i}" title="${esc(label)}"
                        aria-label="${esc(label)}"></button>`;
            }).join('')}
          </div>
          <div class="pyr-count">${t.filled.length}/${t.slots}${t.overflow ? ` +${t.overflow}` : ''}</div>
        </div>`).join('')}
    </div>
    <div id="pyr-detail" class="pyr-detail">Tap a filled block for its details.</div>
    <div class="chart-note">
      ${done} of ${total} slots — sends only, attempts never fill a block.
      ${tiers.some(t => t.overflow) ? 'A “+n” means more sends at that grade than the pyramid asks for.' : ''}
    </div>`;

  const detail = el.querySelector('#pyr-detail');
  el.querySelectorAll('[data-pyr]').forEach(b => {
    b.onclick = () => {
      const [ti, i] = b.dataset.pyr.split('-').map(Number);
      const send = tiers[ti].filled[i];
      el.querySelectorAll('[data-pyr]').forEach(x => x.classList.remove('picked'));
      b.classList.add('picked');
      detail.innerHTML = `
        <div class="pyr-detail-grade">${esc(send.grade)}${send.name ? ` — ${esc(send.name)}` : ''}</div>
        <div class="pyr-detail-meta">${esc(fmtDate(send.date))} · ${esc(send.outcome)}
          · ${send.attempts ?? 1} attempt${send.attempts === 1 ? '' : 's'}</div>
        ${send.notes ? `<div class="pyr-detail-meta">${esc(send.notes)}</div>` : ''}`;
    };
  });
}
