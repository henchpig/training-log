import { S, REDPOINT_PYRAMID } from './state.js';
import { esc, fmtDate } from './utils.js';
import { fetchEntriesByCategory } from './db.js';

const isSend = e => e.outcome === 'send' || e.outcome === 'flash';

// Sends drop into the tier holding their grade, oldest first, so the pyramid
// fills in the order the climbs actually happened. A send fills only its own
// tier — a 5.12b never counts down toward the base. A grade outside every tier
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

export async function renderPyramidTab() {
  const el = document.getElementById('tab-pyramid');
  el.innerHTML = '<div class="empty"><div class="spinner"></div>Loading…</div>';

  let entries;
  try {
    entries = await fetchEntriesByCategory('rope_redpoint');
  } catch (err) {
    const link = /https:\/\/console\.firebase\.google\.com\/\S+/.exec(err.message || '')?.[0];
    el.innerHTML = link
      ? `<div class="empty" style="padding:24px"><div class="empty-icon">🔑</div>
           <div style="margin-bottom:10px">This needs a Firestore index.</div>
           <a href="${esc(link)}" target="_blank" rel="noopener"
              style="color:var(--green);font-size:13px">Create it (opens Firebase) →</a></div>`
      : `<div class="empty"><div class="empty-icon">⚠️</div>${esc(err.message)}</div>`;
    return;
  }

  const tiers = buildPyramid(entries);
  const done = tiers.reduce((a, t) => a + t.filled.length, 0);
  const total = tiers.reduce((a, t) => a + t.slots, 0);
  const nextTier = [...tiers].reverse().find(t => t.filled.length < t.slots);

  el.innerHTML = `
    <div class="card pyr-summary">
      <div>
        <div class="pyr-summary-num">${done}<span>/${total}</span></div>
        <div class="stat-lbl">Sends placed</div>
      </div>
      ${nextTier ? `<div class="pyr-summary-next">
        Next up<br><strong>${nextTier.grades.join(' / ')}</strong>
        <span>${nextTier.slots - nextTier.filled.length} to go</span>
      </div>` : '<div class="pyr-summary-next">Pyramid complete 🎉</div>'}
    </div>

    <div class="card">
      <div class="pyramid">
        ${tiers.map((t, ti) => `
          <div class="pyr-row">
            <div class="pyr-head">
              <span class="pyr-label">${t.grades.join(' / ')}</span>
              <span class="pyr-count">${t.filled.length}/${t.slots}${t.overflow ? ` +${t.overflow}` : ''}</span>
            </div>
            <div class="pyr-blocks">
              ${Array.from({ length: t.slots }, (_, i) => {
                const send = t.filled[i];
                if (!send) return '<div class="pyr-block"></div>';
                const label = [fmtDate(send.date), send.grade, send.name].filter(Boolean).join(' · ');
                return `<button class="pyr-block filled" data-pyr="${ti}-${i}"
                          title="${esc(label)}" aria-label="${esc(label)}"></button>`;
              }).join('')}
            </div>
          </div>`).join('')}
      </div>
      <div id="pyr-detail" class="pyr-detail">
        ${done ? 'Tap a filled block for its details.' : 'No redpoint sends logged yet.'}
      </div>
      <div class="chart-note">
        Sends only — attempts never fill a block, and a send counts toward its own
        tier only.${tiers.some(t => t.overflow) ? ' “+n” means more sends at that grade than the pyramid asks for.' : ''}
      </div>
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
