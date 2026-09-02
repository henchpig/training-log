export function uid() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export function todayStr() {
  return new Date().toLocaleDateString('en-CA');
}

export function esc(s) {
  if (s == null) return '';
  return String(s).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

export function toast(msg, type = 'ok') {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.className = 'toast show ' + type;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => { el.className = 'toast ' + type; }, 2200);
}

export function fmtDate(dateStr) {
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function fmtSecAsMMSS(sec) {
  if (sec == null || isNaN(sec)) return '';
  sec = Math.round(sec);
  const m = Math.floor(sec / 60), s = sec % 60;
  return m > 0 ? `${m}:${String(s).padStart(2, '0')}` : `${s}s`;
}

export function paceStr(distance, unit, timeSec) {
  if (!distance || !timeSec) return '';
  const secPerUnit = timeSec / distance;
  return fmtSecAsMMSS(secPerUnit) + '/' + unit;
}

// Accepts "3:30", "210", "3m30s" → seconds. Empty → null.
export function parseDuration(str) {
  if (str == null) return null;
  str = String(str).trim();
  if (!str) return null;
  if (str.includes(':')) {
    const [m, s] = str.split(':');
    return (Number(m) || 0) * 60 + (Number(s) || 0);
  }
  const n = Number(str);
  return isNaN(n) ? null : n;
}

export function debounce(fn, ms = 250) {
  let t;
  const wrapped = (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
  wrapped.cancel = () => clearTimeout(t);
  return wrapped;
}

export function downloadCSV(filename, rows) {
  const csv = rows.map(r => r.map(v => {
    v = v == null ? '' : String(v);
    return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
  }).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}
