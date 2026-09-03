// Drives the real UI in Chromium with the Firebase boundary (auth.js, db.js)
// and the Chart.js CDN replaced by in-memory stubs, so no Firebase project or
// network access is needed. Run with:  npm test
import { chromium } from 'playwright';
import http from 'http';
import fs from 'fs';
import path from 'path';

import { fileURLToPath } from 'url';
const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };

const server = http.createServer((req, res) => {
  const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]) === '/' ? 'index.html' : decodeURIComponent(req.url.split('?')[0]));
  if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end('nf'); }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'text/plain' });
  fs.createReadStream(p).pipe(res);
});
fs.mkdirSync(path.join(ROOT, 'test/screenshots'), { recursive: true });
await new Promise(r => server.listen(8123, r));

// ── Stubs replacing the Firebase boundary ──────────────────────
const AUTH_STUB = `
export function initAuth({ onSignedIn }) {
  document.getElementById('signout-btn').onclick = () => {};
  setTimeout(() => onSignedIn({ uid: 'testuser', email: 't@example.com' }), 0);
}`;

const DB_STUB = `
let exercises = [];
let sessions = [];
let entries = [];  // flat, each has sessionId
let seq = 1;
const nid = () => 'id' + (seq++);

export async function fetchExercises() { return exercises.map(e => ({...e})).sort((a,b)=>a.name.localeCompare(b.name)); }
export async function createExercise(data) { const id = nid(); exercises.push({ id, ...data }); return id; }
export async function updateExercise(id, data) { Object.assign(exercises.find(e=>e.id===id), data); }
export async function deleteExercise(id) { exercises = exercises.filter(e=>e.id!==id); }
export async function fetchSessions() { return sessions.map(s=>({...s})).sort((a,b)=>b.date.localeCompare(a.date)); }
export async function fetchSessionEntries(sessionId) { return entries.filter(e=>e.sessionId===sessionId).map(e=>({...e})); }
export async function saveSession(session) {
  let id = session.id;
  if (id) { Object.assign(sessions.find(s=>s.id===id), { date: session.date, notes: session.notes });
            entries = entries.filter(e=>e.sessionId!==id); }
  else { id = nid(); sessions.push({ id, date: session.date, notes: session.notes }); }
  // mirrors db.js: date denormalized onto each entry
  session.entries.forEach(e => entries.push({ id: nid(), sessionId: id, uid: 'testuser', date: session.date, ...e }));
  window.__DB = { exercises, sessions, entries };
  return id;
}
export async function deleteSession(id) { sessions = sessions.filter(s=>s.id!==id); entries = entries.filter(e=>e.sessionId!==id); }
export async function fetchEntriesByExercise(exerciseId) { return entries.filter(e=>e.exerciseId===exerciseId).map(e=>({...e})).sort((a,b)=>a.date.localeCompare(b.date)); }
export async function fetchEntriesByCategory(category) {
  if (window.__FAIL_INDEX) {
    throw new Error('The query requires an index. You can create it here: https://console.firebase.google.com/v1/r/project/x/firestore/indexes?create_composite=abc');
  } return entries.filter(e=>e.category===category).map(e=>({...e})).sort((a,b)=>a.date.localeCompare(b.date)); }
window.__DB = { get exercises(){return exercises}, get sessions(){return sessions}, get entries(){return entries} };
`;

const CHART_STUB = `
window.__CHARTS = [];
window.Chart = class Chart {
  constructor(ctx, config) { this.config = config; window.__CHARTS.push(config); }
  destroy() {}
};`;

const browser = await chromium.launch();
const page = await browser.newPage();
const errors = [];
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));

await page.route('**/Chart.js/**/chart.umd.js', r => r.fulfill({ contentType: 'text/javascript', body: CHART_STUB }));
await page.route('**/js/auth.js', r => r.fulfill({ contentType: 'text/javascript', body: AUTH_STUB }));
await page.route('**/js/db.js', r => r.fulfill({ contentType: 'text/javascript', body: DB_STUB }));

await page.goto('http://localhost:8123/');
await page.waitForSelector('#main-app', { state: 'visible', timeout: 5000 });
await page.waitForTimeout(400);

const step = async (name, fn) => {
  try { await fn(); console.log('  ✓ ' + name); }
  catch (e) { console.log('  ✗ ' + name + ' → ' + e.message); errors.push(name + ': ' + e.message); }
};

console.log('\n--- LOG TAB ---');
await step('library starts empty (no pre-seeding)', async () => {
  const n = await page.evaluate(() => window.__DB.exercises.length);
  if (n !== 0) throw new Error('expected empty library, got ' + n + ' exercises');
});
await step('create Bench Press in Library', async () => {
  await page.click('#tab-nav button[data-tab=library]');
  await page.waitForTimeout(250);
  await page.fill('#new-ex-name', 'Bench Press');
  await page.locator('#new-ex-movement .mp-chip', { hasText: 'push' }).click();
  await page.click('#new-ex-add');
  await page.waitForTimeout(300);
  await page.click('#tab-nav button[data-tab=log]');
  await page.waitForTimeout(250);
});
await step('add S&C entry (Bench Press)', async () => {
  await page.locator('#tab-log .chip', { hasText: 'Bench Press' }).click();
  await page.waitForSelector('.entry-card[data-cat=sc]');
  const sets = await page.locator('.entry-card[data-cat=sc] .set-row').count();
  if (sets !== 3) throw new Error('expected 3 default sets, got ' + sets);
});
await step('fill S&C sets', async () => {
  const rows = page.locator('.entry-card[data-cat=sc] .set-row');
  for (let i = 0; i < 3; i++) {
    await rows.nth(i).locator('input[data-f=weight]').fill(String(135 + i * 10));
    await rows.nth(i).locator('input[data-f=reps]').fill('5');
    await rows.nth(i).locator('input[data-f=rpe]').fill('8');
  }
});
await step('BW± set accepts a negative (assisted) load', async () => {
  const row = page.locator('.entry-card[data-cat=sc] .set-row').first();
  await row.locator('select[data-f=weightType]').selectOption('relative');
  await row.locator('input[data-f=weight]').fill('-20');
  await page.waitForTimeout(150);
});
await step('add finger training Max Hang', async () => {
  await page.locator('#tab-log .pill', { hasText: 'Finger Training' }).click();
  await page.locator('#tab-log .chip', { hasText: 'Max Hang' }).click();
  await page.waitForSelector('.entry-card[data-cat=finger]');
});
await step('finger set has grip + apparatus, fill a rep', async () => {
  const card = page.locator('.entry-card[data-cat=finger]');
  await card.locator('select[data-f=grip]').first().selectOption('half crimp');
  await card.locator('select[data-f=apparatus]').first().selectOption('hb_bimanual');
  await card.locator('input[data-f=implement]').first().fill('unlevel edge');
  await card.locator('input[data-f=load]').first().fill('40');
  await card.locator('input[data-f=durationSec]').first().fill('10');
  await card.locator('input[data-f=rpe]').first().fill('9');
});
await step('add a second rep to the hang set', async () => {
  await page.locator('.entry-card[data-cat=finger] [data-act=add-rep]').first().click();
  await page.waitForTimeout(150);
  const reps = await page.locator('.entry-card[data-cat=finger] input[data-f=durationSec]').count();
  if (reps !== 2) throw new Error('expected 2 reps, got ' + reps);
});
await step('add boulder climb, flash locks attempts to 1', async () => {
  await page.locator('#tab-log .pill', { hasText: 'Bouldering' }).click();
  await page.locator('#tab-log .chip', { hasText: 'Add climb' }).click();
  const card = page.locator('.entry-card[data-cat=boulder]');
  await card.locator('select[data-f=grade]').selectOption('V5');
  await card.locator('input[data-f=name]').fill('blue slab');
  await card.locator('.pill', { hasText: 'Flash' }).click();
  await page.waitForTimeout(150);
  const attempts = page.locator('.entry-card[data-cat=boulder] input[data-f=attempts]');
  if (!(await attempts.isDisabled())) throw new Error('attempts should be disabled on flash');
  if (await attempts.inputValue() !== '1') throw new Error('attempts should be 1 on flash');
});
await step('add rope endurance laps', async () => {
  await page.locator('#tab-log .pill', { hasText: 'Rope Endurance Laps' }).click();
  await page.locator('#tab-log .chip', { hasText: 'Add lap block' }).click();
  const card = page.locator('.entry-card[data-cat=rope_endurance]');
  await card.locator('select[data-f=grade]').first().selectOption('11a');
  await card.locator('input[data-f=laps]').first().fill('4');
  await card.locator('input[data-f=timeSec]').first().fill('3:30');
  await card.locator('input[data-f=rpe]').first().fill('7');
});
await step('create a Rehab exercise and log timed-hold sets', async () => {
  await page.click('#tab-nav button[data-tab=library]');
  await page.waitForTimeout(250);
  await page.fill('#new-ex-name', 'Iso Wrist Extension');
  await page.selectOption('#new-ex-cat', 'rehab');
  await page.waitForTimeout(150);
  await page.click('#new-ex-add');
  await page.waitForTimeout(300);
  await page.click('#tab-nav button[data-tab=log]');
  await page.waitForTimeout(250);
  await page.locator('#tab-log .pill', { hasText: 'Rehab' }).click();
  await page.locator('#tab-log .chip', { hasText: 'Iso Wrist Extension' }).click();
  await page.waitForSelector('.entry-card[data-cat=rehab]');
  const rows = page.locator('.entry-card[data-cat=rehab] .set-row');
  if (await rows.count() !== 3) throw new Error('expected 3 rehab sets');
  for (let i = 0; i < 3; i++) {
    await rows.nth(i).locator('input[data-f=load]').fill('30');
    await rows.nth(i).locator('input[data-f=durationSec]').fill('20');
    await rows.nth(i).locator('input[data-f=rpe]').fill('6');
  }
});

await page.setViewportSize({ width: 480, height: 1400 });
await page.waitForTimeout(200);
await page.screenshot({ path: path.join(ROOT, 'test/screenshots/populated.png'), fullPage: true });
await page.setViewportSize({ width: 1280, height: 720 });
await step('draft persisted to localStorage', async () => {
  await page.waitForTimeout(500);
  const draft = await page.evaluate(() => localStorage.getItem('tl_draft_testuser'));
  if (!draft) throw new Error('no draft saved');
  const d = JSON.parse(draft);
  if (d.entries.length !== 5) throw new Error('draft has ' + d.entries.length + ' entries, expected 5');
});
await step('save session', async () => {
  await page.fill('#sess-notes', 'test session');
  await page.click('#save-session-btn');
  await page.waitForTimeout(600);
  const n = await page.evaluate(() => window.__DB.sessions.length);
  if (n !== 1) throw new Error('expected 1 saved session, got ' + n);
});
await step('draft cleared after save', async () => {
  await page.waitForTimeout(600);
  const draft = await page.evaluate(() => localStorage.getItem('tl_draft_testuser'));
  if (draft) throw new Error('draft not cleared');
});
await step('normalized data shapes are correct', async () => {
  const e = await page.evaluate(() => window.__DB.entries.map(x => JSON.parse(JSON.stringify(x))));
  const sc = e.find(x => x.category === 'sc');
  if (sc.sets[1].weight !== 145 || sc.sets[1].reps !== 5) throw new Error('sc set wrong: ' + JSON.stringify(sc.sets[1]));
  if (sc.sets[0].weight !== -20) throw new Error('BW± set should store -20, got ' + sc.sets[0].weight);
  const finger = e.find(x => x.category === 'finger');
  if (finger.protocol !== 'max_hang') throw new Error('protocol wrong');
  if (finger.sets[0].reps[0].durationSec !== 10) throw new Error('hang duration wrong');
  const boulder = e.find(x => x.category === 'boulder');
  if (boulder.outcome !== 'flash' || boulder.attempts !== 1) throw new Error('flash wrong: ' + JSON.stringify(boulder));
  if (finger.sets[0].implement !== 'unlevel edge') throw new Error('implement not stored: ' + finger.sets[0].implement);
  const rehab = e.find(x => x.category === 'rehab');
  if (!rehab) throw new Error('no rehab entry saved');
  if (rehab.sets[0].load !== 30 || rehab.sets[0].durationSec !== 20 || rehab.sets[0].reps !== null) {
    throw new Error('rehab set wrong: ' + JSON.stringify(rehab.sets[0]));
  }
  const laps = e.find(x => x.category === 'rope_endurance');
  if (laps.sets[0].timeSec !== 210) throw new Error('mm:ss not parsed, got ' + laps.sets[0].timeSec);
  if (laps.sets[0].grade !== '11a') throw new Error('grade should be shorthand, got ' + laps.sets[0].grade);
  if (laps.sets[0].rpe !== 7) throw new Error('lap rpe not stored, got ' + laps.sets[0].rpe);
});

console.log('\n--- HISTORY TAB ---');
await step('history lists the session', async () => {
  await page.click('#tab-nav button[data-tab=history]');
  await page.waitForSelector('.session-row', { timeout: 3000 });
});
await step('detail view renders all entries', async () => {
  await page.locator('.session-row').first().click();
  await page.waitForSelector('#hist-edit');
  const txt = await page.locator('#tab-history').innerText();
  for (const want of ['Bench Press', 'Max Hang', 'V5', 'blue slab', '4 laps']) {
    if (!txt.includes(want)) throw new Error('detail missing "' + want + '"');
  }
});
await step('edit loads session back into Log tab', async () => {
  await page.click('#hist-edit');
  await page.waitForTimeout(400);
  const banner = await page.locator('.edit-banner').count();
  if (!banner) throw new Error('no edit banner');
  const cards = await page.locator('#tab-log .entry-card').count();
  if (cards !== 5) throw new Error('expected 5 entries loaded, got ' + cards);
  await page.click('#cancel-edit-btn');
  await page.waitForTimeout(200);
});

console.log('\n--- PROGRESS TAB ---');
await step('S&C chart renders for Bench Press', async () => {
  await page.click('#tab-nav button[data-tab=progress]');
  await page.waitForTimeout(300);
  await page.locator('#tab-progress .chip', { hasText: 'Bench Press' }).click();
  await page.waitForTimeout(500);
  const has = await page.evaluate(() => !!document.querySelector('#prog-chart'));
  if (!has) throw new Error('no canvas');
  const stats = await page.locator('#prog-stats').innerText();
  // sets: BW-20, 145, 155 → heaviest load 155
  if (!stats.includes('155')) throw new Error('expected best load 155, got: ' + stats.replace(/\n/g, ' '));
});
await step('relative (BW±) weight type round-trips', async () => {
  const sc = await page.evaluate(() => window.__DB.entries.find(e => e.category === 'sc'));
  if (sc.sets[0].weightType !== 'relative' || sc.sets[0].weight !== -20) {
    throw new Error('BW± set wrong: ' + JSON.stringify(sc.sets[0]));
  }
});
await step('history shows BW-20 for the relative set', async () => {
  await page.click('#tab-nav button[data-tab=history]');
  await page.waitForTimeout(400);
  await page.locator('.session-row').first().click();
  await page.waitForSelector('#hist-edit');
  const txt = await page.locator('#tab-history').innerText();
  if (!txt.includes('BW-20')) throw new Error('expected BW-20 in history, got: ' + txt.slice(0, 300));
  await page.click('#tab-nav button[data-tab=progress]');
  await page.waitForTimeout(400);
  await page.locator('#tab-progress .chip', { hasText: 'Bench Press' }).click();
  await page.waitForTimeout(400);
});
await step('S&C metric toggles work', async () => {
  for (const m of ['Reps', 'Total Work']) {
    await page.locator('#tab-progress .pill', { hasText: m }).first().click();
    await page.waitForTimeout(300);
  }
});
await step('finger chart splits by protocol', async () => {
  await page.locator('#tab-progress .pill', { hasText: 'Finger Training' }).click();
  await page.waitForTimeout(400);
  const protos = await page.locator('#tab-progress [data-prog-proto]').count();
  if (protos !== 4) throw new Error('expected 4 protocol pills, got ' + protos);
  const legend = await page.locator('#prog-legend').innerText();
  if (!legend.includes('Max Hang')) throw new Error('legend: ' + legend);
});
await step('density hang (no data) shows empty state, not a crash', async () => {
  await page.locator('#tab-progress [data-prog-proto=density_hang]').click();
  await page.waitForTimeout(400);
  const txt = await page.locator('#tab-progress').innerText();
  if (!txt.includes('No data')) throw new Error('expected empty state');
});
await step('boulder scatter renders with grade axis', async () => {
  await page.locator('#tab-progress .pill', { hasText: 'Bouldering' }).click();
  await page.waitForTimeout(500);
  const stats = await page.locator('#prog-stats').innerText();
  if (!stats.includes('V5')) throw new Error('expected V5 hardest sent, got: ' + stats.replace(/\n/g, ' '));
  const legend = await page.locator('#prog-legend').innerText();
  if (!legend.toLowerCase().includes('solid')) throw new Error('legend missing solid/hollow key');
});
await step('endurance laps chart renders', async () => {
  await page.locator('#tab-progress .pill', { hasText: 'Rope Endurance Laps' }).click();
  await page.waitForTimeout(500);
  const stats = await page.locator('#prog-stats').innerText();
  if (!stats.includes('4')) throw new Error('expected 4 total laps, got: ' + stats.replace(/\n/g, ' '));
});

await step('boulder chart config: solid sent vs hollow attempted', async () => {
  await page.locator('#tab-progress .pill', { hasText: 'Bouldering' }).click();
  await page.waitForTimeout(500);
  const cfg = await page.evaluate(() => window.__CHARTS[window.__CHARTS.length - 1]);
  if (cfg.type !== 'scatter') throw new Error('expected scatter, got ' + cfg.type);
  const [sent, tried] = cfg.data.datasets;
  if (sent.label !== 'Sent' || tried.label !== 'Attempted') throw new Error('dataset labels wrong');
  if (tried.pointBackgroundColor !== 'transparent') throw new Error('attempted should be hollow');
  if (sent.data[0].grade !== 'V5') throw new Error('sent point grade wrong');
});
await step('laps chart config: one point per set w/ laps+time in point', async () => {
  await page.locator('#tab-progress .pill', { hasText: 'Rope Endurance Laps' }).click();
  await page.waitForTimeout(500);
  const cfg = await page.evaluate(() => window.__CHARTS[window.__CHARTS.length - 1]);
  const pt = cfg.data.datasets[0].data[0];
  if (pt.grade !== '11a' || pt.laps !== 4 || pt.timeSec !== 210 || pt.rpe !== 7) {
    throw new Error('lap point wrong: ' + JSON.stringify(pt));
  }
});

await step('rehab chart renders with its own metrics', async () => {
  await page.locator('#tab-progress .pill', { hasText: 'Rehab' }).click();
  await page.waitForTimeout(300);
  await page.locator('#tab-progress .chip', { hasText: 'Iso Wrist Extension' }).click();
  await page.waitForTimeout(500);
  const metrics = await page.locator('#tab-progress [data-prog-metric]').allInnerTexts();
  if (!metrics.includes('Duration')) throw new Error('rehab should offer a Duration metric, got ' + metrics.join(','));
  const stats = await page.locator('#prog-stats').innerText();
  if (!stats.includes('30')) throw new Error('expected best load 30, got: ' + stats.replace(/\n/g, ' '));
});
await step('finger tooltip carries grip / implement / apparatus', async () => {
  await page.locator('#tab-progress .pill', { hasText: 'Finger Training' }).click();
  await page.waitForTimeout(500);
  const cfg = await page.evaluate(() => {
    const c = window.__CHARTS[window.__CHARTS.length - 1];
    const cb = c.options.plugins.tooltip.callbacks.afterBody;
    return cb([{ dataIndex: 0 }]);
  });
  const joined = cfg.join(' | ');
  for (const want of ['half crimp', 'unlevel edge', 'Hangboard']) {
    if (!joined.includes(want)) throw new Error(`tooltip missing "${want}": ${joined}`);
  }
});

await step('missing-index error surfaces a create link, not a crash', async () => {
  await page.evaluate(() => { window.__FAIL_INDEX = true; });
  await page.locator('#tab-progress .pill', { hasText: 'Bouldering' }).click();
  await page.waitForTimeout(500);
  const txt = await page.locator('#tab-progress').innerText();
  if (!txt.includes('needs a Firestore index')) throw new Error('no index message: ' + txt.slice(0, 200));
  const href = await page.locator('#tab-progress .chart-wrap a').getAttribute('href');
  if (!href.startsWith('https://console.firebase.google.com/')) throw new Error('bad link: ' + href);
  await page.evaluate(() => { window.__FAIL_INDEX = false; });
});

console.log('\n--- LIBRARY TAB ---');
await step('library lists what I created', async () => {
  await page.click('#tab-nav button[data-tab=library]');
  await page.waitForTimeout(300);
  const txt = await page.locator('#tab-library').innerText();
  if (!txt.includes('Bench Press')) throw new Error('missing created exercise');
});
await step('add a new exercise', async () => {
  await page.fill('#new-ex-name', 'Front Lever Row');
  await page.locator('#new-ex-movement .mp-chip', { hasText: 'pull' }).click();
  await page.click('#new-ex-add');
  await page.waitForTimeout(400);
  const txt = await page.locator('#tab-library').innerText();
  if (!txt.includes('Front Lever Row')) throw new Error('new exercise not listed');
});
await step('cardio category switches form fields', async () => {
  await page.selectOption('#new-ex-cat', 'cardio');
  await page.waitForTimeout(200);
  const vis = await page.locator('#new-ex-cardio-fields').isVisible();
  if (!vis) throw new Error('cardio fields not shown');
});

await page.screenshot({ path: path.join(ROOT, 'test/screenshots/library.png') });
await page.click('#tab-nav button[data-tab=log]');
await page.waitForTimeout(300);
await page.screenshot({ path: path.join(ROOT, 'test/screenshots/log.png'), fullPage: true });

console.log('\n--- CONSOLE ERRORS ---');
// The Chart.js CDN request is stubbed, so its blocked network fetch is expected.
const real = errors.filter(e => !e.includes('favicon') && !e.includes('Failed to load resource'));
console.log(real.length ? real.join('\n') : '(none)');

await browser.close();
server.close();
process.exit(real.length ? 1 : 0);
