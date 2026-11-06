// Prebuilt sessions. A template is a named list of entries in the same shape
// the Log tab's form holds them, so adding one to a log is a copy — see
// entryform.js, which both tabs share.
import { S } from './state.js';
import { esc, toast } from './utils.js';
import { fetchTemplates, createTemplate, updateTemplate, deleteTemplate } from './db.js';
import { renderEntries, renderAddPanel, wireEntryForm, cloneEntries } from './entryform.js';
import { entryTitle } from './format.js';

export async function loadTemplates() {
  try {
    S.templates.items = await fetchTemplates();
  } catch (err) {
    S.templates.items = [];
    toast('Could not load templates: ' + err.message, 'err');
  }
  // Only repaint if the user is looking at them; otherwise the Log tab picks
  // them up on its next render.
  if (S.currentTab === 'templates') renderTemplatesTab();
}

export function renderTemplatesTab() {
  return S.templates.editing ? renderEditor() : renderList();
}

// ── List ─────────────────────────────────────────────────────
function renderList() {
  const el = document.getElementById('tab-templates');
  const items = S.templates.items || [];

  el.innerHTML = `
    <div class="card">
      <div class="section-label">Templates</div>
      <div style="font-size:12px;color:var(--muted);margin:6px 0 10px">
        Build a session once, then add it to a log in one tap. Two templates in
        one log gives you a double.
      </div>
      <button class="btn btn-primary btn-block" data-tpl="new">+ New template</button>
    </div>

    <div class="card" style="padding:0;overflow:hidden">
      ${items.length ? items.map(t => `
        <div class="session-row" data-tpl="edit" data-id="${t.id}">
          <div class="session-info">
            <div style="font-weight:500">${esc(t.name)}</div>
            <div class="session-ex-list">${esc(summarize(t))}</div>
          </div>
          <span style="color:var(--dim)">›</span>
        </div>`).join('')
        : '<div class="empty"><div class="empty-icon">📋</div>No templates yet</div>'}
    </div>`;

  el.querySelectorAll('[data-tpl]').forEach(node => {
    node.onclick = () => {
      if (node.dataset.tpl === 'new') {
        S.templates.editing = { id: null, name: '', entries: [] };
      } else {
        const t = items.find(x => x.id === node.dataset.id);
        if (!t) return;
        // Edited through a copy, so backing out leaves the stored one alone.
        S.templates.editing = { id: t.id, name: t.name, entries: cloneEntries(t.entries || []) };
      }
      S.templates.ui.search = '';
      renderTemplatesTab();
    };
  });
}

function summarize(t) {
  const entries = t.entries || [];
  if (!entries.length) return 'empty';
  return entries.map(entryTitle).join(', ');
}

// ── Editor ───────────────────────────────────────────────────
function renderEditor() {
  const el = document.getElementById('tab-templates');
  const t = S.templates.editing;
  const ctx = {
    host: el,
    entries: t.entries,
    ui: S.templates.ui,
    rerender: renderTemplatesTab,
    // Nothing to autosave: a template is written when you save it.
    onChange: () => {},
    addLabel: 'Add to template',
    offerTemplates: false
  };

  el.innerHTML = `
    <div class="edit-banner">
      <span>${t.id ? 'Editing template' : 'New template'}</span>
      <button class="btn btn-sm" id="tpl-cancel">Cancel</button>
    </div>

    <div class="card">
      <div class="field full">
        <label>Template name</label>
        <input type="text" id="tpl-name" placeholder="e.g. Strength Day A" value="${esc(t.name)}">
      </div>
      <div style="font-size:12px;color:var(--muted)">
        Whatever you type into the sets is saved with it and comes back pre-filled.
        Leave a box blank to fill it in on the day.
      </div>
    </div>

    ${renderEntries(ctx)}
    ${renderAddPanel(ctx)}

    <div class="save-bar">
      <button class="btn btn-primary btn-block" id="tpl-save">${t.id ? 'Update Template' : 'Save Template'}</button>
      ${t.id ? '<button class="btn btn-block" style="max-width:110px;color:var(--red)" id="tpl-del">Delete</button>' : ''}
    </div>`;

  document.getElementById('tpl-name').oninput = ev => { t.name = ev.target.value; };
  wireEntryForm(ctx);

  document.getElementById('tpl-cancel').onclick = () => {
    S.templates.editing = null;
    renderTemplatesTab();
  };
  document.getElementById('tpl-save').onclick = doSave;
  const del = document.getElementById('tpl-del');
  if (del) del.onclick = doDelete;
}

// `_localId` is the form's own handle on a card — it belongs to the editing
// session, not to the stored template, and cloneEntries hands out fresh ones.
const strip = entries => entries.map(({ _localId, ...rest }) => rest);

async function doSave() {
  const t = S.templates.editing;
  const name = (t.name || '').trim();
  if (!name) return toast('Name the template', 'err');
  if (!t.entries.length) return toast('Add at least one entry', 'err');

  const btn = document.getElementById('tpl-save');
  if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }
  const payload = { name, entries: strip(t.entries) };
  try {
    if (t.id) {
      await updateTemplate(t.id, payload);
    } else {
      t.id = await createTemplate(payload);
    }
    S.templates.editing = null;
    await loadTemplates();
    toast('Template saved');
    renderTemplatesTab();
  } catch (err) {
    toast('Save failed: ' + err.message, 'err');
    if (btn) { btn.disabled = false; btn.textContent = 'Save Template'; }
  }
}

async function doDelete() {
  const t = S.templates.editing;
  if (!confirm(`Delete the "${t.name}" template?`)) return;
  try {
    await deleteTemplate(t.id);
    S.templates.editing = null;
    await loadTemplates();
    toast('Template deleted');
    renderTemplatesTab();
  } catch (err) {
    toast('Delete failed: ' + err.message, 'err');
  }
}
