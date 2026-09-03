import { S } from './state.js';
import { initAuth } from './auth.js';
import { fetchExercises, fetchEntriesByCategory } from './db.js';
import { renderLibrary } from './library.js';
import { renderLog, newSession, loadDraft } from './log.js';
import { loadHistory } from './history.js';
import { renderProgress, invalidateProgressCache } from './progress.js';
import { toast } from './utils.js';

const show = (id, on) => { document.getElementById(id).style.display = on ? (id === 'auth-screen' ? 'flex' : 'block') : 'none'; };

function switchTab(name, btn) {
  S.currentTab = name;
  document.querySelectorAll('.tab').forEach(t => t.style.display = 'none');
  document.querySelectorAll('#tab-nav button').forEach(b => b.classList.remove('active'));
  document.getElementById('tab-' + name).style.display = 'block';
  (btn || document.querySelector(`#tab-nav button[data-tab="${name}"]`)).classList.add('active');

  if (name === 'log') renderLog();
  if (name === 'history') loadHistory();
  if (name === 'progress') { invalidateProgressCache(); renderProgress(); }
  if (name === 'library') renderLibrary();
}

document.querySelectorAll('#tab-nav button').forEach(btn => {
  btn.onclick = () => switchTab(btn.dataset.tab, btn);
});

async function loadAutocompleteValues() {
  try {
    const [b, r, f] = await Promise.all([
      fetchEntriesByCategory('boulder'),
      fetchEntriesByCategory('rope_redpoint'),
      fetchEntriesByCategory('finger')
    ]);
    const newestFirst = (x, y) => (y.date || '').localeCompare(x.date || '');
    S.recentClimbNames = [...b, ...r].sort(newestFirst)
      .map(e => e.name).filter(Boolean).slice(0, 50);
    S.recentImplements = f.sort(newestFirst)
      .flatMap(e => (e.sets || []).map(s => s.implement)).filter(Boolean).slice(0, 50);
  } catch { S.recentClimbNames = []; S.recentImplements = []; }
}

initAuth({
  onSignedIn: async user => {
    S.user = user;
    show('auth-screen', false);
    show('main-app', true);
    try {
      S.exercises = await fetchExercises();
    } catch (e) {
      toast('Could not load exercises: ' + e.message, 'err');
    }
    if (!loadDraft()) newSession();
    switchTab('log');
    loadAutocompleteValues();
  },
  onSignedOut: () => {
    S.user = null;
    S.exercises = [];
    S.session = null;
    show('main-app', false);
    show('auth-screen', true);
  }
});
