import { S, CATEGORIES } from './state.js';
import { esc, toast, fmtDate, uid } from './utils.js';
import { fetchSessions, fetchSessionEntries, deleteSession } from './db.js';
import { renderEntryReadonly, sessionSummary, sessionCategories } from './format.js';
import { renderLog, clearDraft } from './log.js';

export async function loadHistory() {
  const el = document.getElementById('tab-history');
  el.innerHTML = '<div class="empty"><div class="spinner"></div>Loading…</div>';
  const sessions = await fetchSessions();
  // Entries live in a subcollection; fetch them per session for list summaries.
  await Promise.all(sessions.map(async s => { s.entries = await fetchSessionEntries(s.id); }));
  S.history.items = sessions;
  renderHistory();
}

export function renderHistory() {
  const el = document.getElementById('tab-history');
  if (S.history.view === 'detail') return renderDetail(el);

  const { catFilter, items } = S.history;
  const filtered = catFilter ? items.filter(s => (s.entries || []).some(e => e.category === catFilter)) : items;

  el.innerHTML = `
    <div class="pill-row">
      <span class="pill${!catFilter ? ' active' : ''}" data-hist-cat="">all</span>
      ${Object.entries(CATEGORIES).map(([v, l]) =>
        `<span class="pill${catFilter === v ? ' active' : ''}" data-hist-cat="${v}">${l}</span>`).join('')}
    </div>
    <div class="card" style="padding:0;overflow:hidden">
      ${filtered.length ? filtered.map(s => `
        <div class="session-row" data-sess="${s.id}">
          <div class="session-date-col">${esc(fmtDate(s.date))}</div>
          <div class="session-info">
            <div class="session-tags">
              ${sessionCategories(s.entries || []).map(c => `<span class="tag tag-${c}">${CATEGORIES[c]}</span>`).join('')}
            </div>
            <div class="session-ex-list">${esc(sessionSummary(s.entries || []))}</div>
          </div>
          <span style="color:var(--dim)">›</span>
        </div>`).join('')
        : '<div class="empty"><div class="empty-icon">📓</div>No sessions logged yet</div>'}
    </div>`;

  el.querySelectorAll('[data-hist-cat]').forEach(p => {
    p.onclick = () => { S.history.catFilter = p.dataset.histCat; renderHistory(); };
  });
  el.querySelectorAll('[data-sess]').forEach(row => {
    row.onclick = () => {
      S.history.detailId = row.dataset.sess;
      S.history.view = 'detail';
      renderHistory();
    };
  });
}

function renderDetail(el) {
  const s = S.history.items.find(x => x.id === S.history.detailId);
  if (!s) { S.history.view = 'list'; return renderHistory(); }

  el.innerHTML = `
    <div class="detail-back" id="hist-back">← Back</div>
    <div class="card">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:12px">
        <div>
          <div style="font-size:16px;font-weight:500">${esc(fmtDate(s.date))}</div>
        </div>
        <div class="btn-group">
          <button class="btn btn-sm" id="hist-edit">Edit</button>
          <button class="btn-danger" id="hist-del">Delete</button>
        </div>
      </div>
      ${s.notes ? `<div style="font-size:13px;color:var(--muted);font-style:italic;margin-bottom:12px">${esc(s.notes)}</div>` : ''}
      ${(s.entries || []).map(renderEntryReadonly).join('')}
    </div>`;

  document.getElementById('hist-back').onclick = () => {
    S.history.view = 'list'; renderHistory();
  };
  document.getElementById('hist-del').onclick = async () => {
    if (!confirm('Delete this whole session?')) return;
    await deleteSession(s.id);
    S.history.items = S.history.items.filter(x => x.id !== s.id);
    S.history.view = 'list';
    toast('Session deleted');
    renderHistory();
  };
  document.getElementById('hist-edit').onclick = () => {
    clearDraft();
    S.session = {
      id: s.id,
      date: s.date,
      notes: s.notes || '',
      entries: (s.entries || []).map(e => ({ ...e, _localId: uid() }))
    };
    S.editingSessionId = s.id;
    S.history.view = 'list';
    document.querySelector('#tab-nav button[data-tab="log"]').click();
    renderLog();
  };
}
