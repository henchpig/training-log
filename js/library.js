import { S, CATEGORIES, LIBRARY_CATEGORIES, STIMULI, MOVEMENTS, TARGETS, CARDIO_TYPES } from './state.js';
import { esc, toast } from './utils.js';
import { createExercise, updateExercise, deleteExercise, fetchExercises } from './db.js';

export function renderLibrary() {
  const el = document.getElementById('tab-library');
  const { catFilter, search } = S.library;
  const filtered = S.exercises.filter(e =>
    (!catFilter || e.category === catFilter) &&
    (!search || e.name.toLowerCase().includes(search.toLowerCase()))
  );

  el.innerHTML = `
    <div class="card">
      <div class="section-label" style="margin-bottom:10px">New exercise</div>
      <div class="field-row">
        <div class="field wide"><label>Name</label><input type="text" id="new-ex-name" placeholder="Exercise name"></div>
        <div class="field"><label>Category</label>
          <select id="new-ex-cat">
            ${LIBRARY_CATEGORIES.map(c => `<option value="${c}">${CATEGORIES[c]}</option>`).join('')}
          </select>
        </div>
        <div class="field"><label>Stimulus</label>
          <select id="new-ex-stim">${STIMULI.map(s => `<option value="${s}">${s.replace(/_/g, ' ')}</option>`).join('')}</select>
        </div>
      </div>
      <div id="new-ex-sc-fields">
        <div class="field full" style="margin-bottom:8px">
          <label>Movement</label>
          <div class="chip-list" id="new-ex-movement" style="margin-top:4px">
            ${MOVEMENTS.map(m => `<span class="mp-chip" data-val="${m}">${m}</span>`).join('')}
          </div>
        </div>
        <div class="field full">
          <label>Target (optional, for isolation work)</label>
          <div class="chip-list" id="new-ex-targets" style="margin-top:4px">
            ${TARGETS.map(t => `<span class="mp-chip" data-val="${t}">${t}</span>`).join('')}
          </div>
        </div>
      </div>
      <div id="new-ex-cardio-fields" style="display:none">
        <div class="field"><label>Cardio type</label>
          <select id="new-ex-cardiotype">${CARDIO_TYPES.map(t => `<option value="${t}">${t}</option>`).join('')}</select>
        </div>
      </div>
      <button class="btn btn-primary" style="margin-top:10px" id="new-ex-add">Add exercise</button>
    </div>

    <div class="filter-bar">
      <select id="lib-cat-filter">
        <option value="">all categories</option>
        ${LIBRARY_CATEGORIES.map(c => `<option value="${c}"${catFilter === c ? ' selected' : ''}>${CATEGORIES[c]}</option>`).join('')}
      </select>
      <input type="text" id="lib-search" placeholder="search..." value="${esc(search)}">
    </div>
    <div class="card" style="padding:0;overflow:hidden">
      ${filtered.length ? LIBRARY_CATEGORIES.map(c => {
        const inCat = filtered.filter(e => e.category === c);
        if (!inCat.length) return '';
        return `<div class="section-label" style="padding:8px 12px;border-bottom:1px solid var(--border);background:var(--surface2)">${CATEGORIES[c]}</div>`
          + inCat.map(renderExRow).join('');
      }).join('') : '<div class="empty">No exercises found</div>'}
    </div>`;

  wireLibrary();
}

function renderExRow(ex) {
  if (S.library.editingId === ex.id) {
    return `
      <div class="card-flat" style="margin:0;border-radius:0;border-bottom:1px solid var(--border);padding:12px" data-ex-edit="${ex.id}">
        <div class="field-row">
          <div class="field wide"><label>Name</label><input type="text" class="edit-name" value="${esc(ex.name)}"></div>
          <div class="field"><label>Stimulus</label>
            <select class="edit-stim">${STIMULI.map(s => `<option value="${s}"${ex.stimulus === s ? ' selected' : ''}>${s.replace(/_/g, ' ')}</option>`).join('')}</select>
          </div>
        </div>
        ${ex.category === 'sc' ? `
          <div class="field full" style="margin-bottom:8px"><label>Movement</label>
            <div class="chip-list edit-movement" style="margin-top:4px">
              ${MOVEMENTS.map(m => `<span class="mp-chip${(ex.movement || []).includes(m) ? ' selected' : ''}" data-val="${m}">${m}</span>`).join('')}
            </div>
          </div>
          <div class="field full"><label>Target</label>
            <div class="chip-list edit-targets" style="margin-top:4px">
              ${TARGETS.map(t => `<span class="mp-chip${(ex.targets || []).includes(t) ? ' selected' : ''}" data-val="${t}">${t}</span>`).join('')}
            </div>
          </div>` : `
          <div class="field"><label>Cardio type</label>
            <select class="edit-cardiotype">${CARDIO_TYPES.map(t => `<option value="${t}"${ex.cardioType === t ? ' selected' : ''}>${t}</option>`).join('')}</select>
          </div>`}
        <div class="btn-group" style="margin-top:10px">
          <button class="btn btn-sm btn-primary" data-lib-save="${ex.id}">Save</button>
          <button class="btn btn-sm" data-lib-cancel="1">Cancel</button>
          <button class="btn-danger" data-lib-del="${ex.id}">Delete</button>
        </div>
      </div>`;
  }
  const meta = [ex.stimulus?.replace(/_/g, ' '), ex.cardioType,
    (ex.movement || []).join('/'), (ex.targets || []).join('/')].filter(Boolean).join(' · ');
  return `
    <div style="display:flex;align-items:center;padding:10px 12px;border-bottom:1px solid var(--border);gap:10px">
      <div style="flex:1;min-width:0">
        <div style="font-size:14px">${esc(ex.name)}</div>
        <div style="font-size:11px;color:var(--muted)">${esc(meta)}</div>
      </div>
      <button class="btn btn-sm" data-lib-edit="${ex.id}">Edit</button>
      <button class="btn-danger" data-lib-del="${ex.id}">✕</button>
    </div>`;
}

function chipValues(container) {
  return [...container.querySelectorAll('.mp-chip.selected')].map(c => c.dataset.val);
}

function wireLibrary() {
  const el = document.getElementById('tab-library');

  el.querySelectorAll('.mp-chip').forEach(chip => {
    chip.onclick = () => chip.classList.toggle('selected');
  });

  const catSel = document.getElementById('new-ex-cat');
  const syncCatFields = () => {
    const isCardio = catSel.value === 'cardio';
    document.getElementById('new-ex-sc-fields').style.display = isCardio ? 'none' : 'block';
    document.getElementById('new-ex-cardio-fields').style.display = isCardio ? 'block' : 'none';
  };
  catSel.onchange = syncCatFields;
  syncCatFields();

  document.getElementById('new-ex-add').onclick = async () => {
    const name = document.getElementById('new-ex-name').value.trim();
    if (!name) return toast('Enter a name', 'err');
    if (S.exercises.some(e => e.name.toLowerCase() === name.toLowerCase())) {
      return toast('Already exists', 'err');
    }
    const category = catSel.value;
    const data = { name, category, stimulus: document.getElementById('new-ex-stim').value };
    if (category === 'cardio') {
      data.cardioType = document.getElementById('new-ex-cardiotype').value;
    } else {
      data.movement = chipValues(document.getElementById('new-ex-movement'));
      data.targets = chipValues(document.getElementById('new-ex-targets'));
    }
    await createExercise(data);
    S.exercises = await fetchExercises();
    toast('Added');
    renderLibrary();
  };

  document.getElementById('lib-cat-filter').onchange = e => {
    S.library.catFilter = e.target.value; renderLibrary();
  };
  document.getElementById('lib-search').oninput = e => {
    S.library.search = e.target.value;
    renderLibrary();
    const box = document.getElementById('lib-search');
    box.focus();
    box.setSelectionRange(box.value.length, box.value.length);
  };

  el.querySelectorAll('[data-lib-edit]').forEach(b => {
    b.onclick = () => { S.library.editingId = b.dataset.libEdit; renderLibrary(); };
  });
  el.querySelectorAll('[data-lib-cancel]').forEach(b => {
    b.onclick = () => { S.library.editingId = null; renderLibrary(); };
  });
  el.querySelectorAll('[data-lib-del]').forEach(b => {
    b.onclick = async () => {
      if (!confirm('Delete this exercise? Past logged sessions keep their data.')) return;
      await deleteExercise(b.dataset.libDel);
      S.exercises = await fetchExercises();
      S.library.editingId = null;
      toast('Deleted');
      renderLibrary();
    };
  });
  el.querySelectorAll('[data-lib-save]').forEach(b => {
    b.onclick = async () => {
      const id = b.dataset.libSave;
      const row = el.querySelector(`[data-ex-edit="${id}"]`);
      const ex = S.exercises.find(e => e.id === id);
      const name = row.querySelector('.edit-name').value.trim();
      if (!name) return toast('Name required', 'err');
      const data = { name, stimulus: row.querySelector('.edit-stim').value };
      if (ex.category === 'cardio') {
        data.cardioType = row.querySelector('.edit-cardiotype').value;
      } else {
        data.movement = chipValues(row.querySelector('.edit-movement'));
        data.targets = chipValues(row.querySelector('.edit-targets'));
      }
      await updateExercise(id, data);
      S.exercises = await fetchExercises();
      S.library.editingId = null;
      toast('Updated');
      renderLibrary();
    };
  });
}
