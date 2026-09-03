# Training Log

A climbing-focused training logger. Static frontend (no build step), Firebase for
auth + storage, deployable to GitHub Pages.

## Structure

```
index.html            app shell + tab nav
css/main.css
js/
  firebase-config.js  ← your Firebase project config (fill this in)
  firebase-init.js    Firebase SDK imports + init
  state.js            categories, grade scales, shared app state
  db.js               all Firestore reads/writes
  auth.js             email/password sign in
  log.js              Log tab — session builder, all five entry shapes
  history.js          History tab — session list, detail, edit, delete
  progress.js         Progress tab — charts
  pyramid.js          Pyramid tab — redpoint pyramid
  library.js          Library tab — S&C + cardio exercise CRUD
  format.js           shared entry → display-text formatting
  utils.js
firestore.rules       security rules (deploy these!)
firestore.indexes.json composite indexes for the Progress queries
SCHEMA.md             data model reference
```

## Setup

### 1. Create the Firebase project
1. <https://console.firebase.google.com> → **Add project** (no billing needed, Spark plan is free).
2. **Build → Authentication → Get started → Email/Password → Enable.**
3. **Build → Firestore Database → Create database** → start in **production mode**, pick a region.

### 2. Wire up the config
Firebase Console → **Project settings** (gear icon) → **General** → scroll to *Your apps* →
click the web icon `</>` → register the app → copy the `firebaseConfig` values into
`js/firebase-config.js`.

These values are **not secrets** — they identify the project, they don't grant access.
Access control is entirely in `firestore.rules`. It's normal to commit them.

### 3. Deploy the security rules
Without this step your database is either wide open or fully closed.

**Easiest (console):** Firestore Database → **Rules** tab → paste the contents of
`firestore.rules` → **Publish**.

**Or with the CLI:**
```bash
npm i -g firebase-tools
firebase login
firebase deploy --only firestore:rules,firestore:indexes
```

### 4. Create the composite indexes
The Progress tab uses collection-group queries that need indexes. Either deploy
`firestore.indexes.json` via the CLI above, or just open the Progress tab once —
Firestore will log a console error containing a one-click "create index" link.

### 5. Run it
Any static server works, e.g.:
```bash
python3 -m http.server 8000
```
then open <http://localhost:8000>. Create your account with the **Create account**
button on first run.

### 6. Deploy to GitHub Pages
Repo **Settings → Pages → Source: Deploy from a branch**, pick your branch and `/ (root)`.
Add your Pages domain to Firebase Console → **Authentication → Settings → Authorized domains**,
otherwise sign-in will be rejected there.

## Tests

```bash
npm install      # playwright (dev only — the app itself has no dependencies)
npm test
```

Drives the real UI in headless Chromium with the Firebase boundary (`auth.js`,
`db.js`) and the Chart.js CDN swapped for in-memory stubs — so it needs no Firebase
project and no network. Covers all five entry shapes, draft autosave, save/edit/delete
round-trips, the redpoint pyramid, the mobile layout, and every progress chart's
config. Screenshots land in `test/screenshots/`.

## Notes

- **The exercise library starts empty.** Add your own S&C and cardio exercises from
  the Library tab — nothing is pre-seeded.
- **Recall panel.** Adding an S&C, cardio, rehab or finger entry shows the last three
  sessions of that exercise — load × reps @ RPE — above the empty sets you're about to
  fill. Nothing is pre-filled: what you lift today depends on the warm-up, so the panel
  informs the choice rather than making it.
- **Draft autosave** — the in-progress session is saved to `localStorage` on every
  keystroke, so a refresh or closing the tab won't lose it. It clears on save.
- **Weights are absolute or relative.** An S&C set is either `lb` (absolute) or `BW±`,
  where the number is load added to bodyweight — negative for assisted, blank for
  straight bodyweight. Bodyweight itself isn't tracked.
- **Finger training has no library entries.** The protocol (Max Hang / Density Hang /
  Repeaters / Pulses) plus per-set grip and apparatus fully describe the work,
  so you pick the protocol directly when logging. Each protocol gets its own progress chart.
- **Rehab is its own category**, with load / reps / duration / RPE per set (fill what
  applies). It's separate from S&C so a 30 lb wrist extension never shares a chart axis
  with a 200 lb lift.
- **Finger sets carry an implement** — free text for the edge or block you pulled on,
  independent of grip. Half crimp on an unlevel edge and half crimp on a crimp block are
  the same grip, different implements. It shows up when you hover a progress chart point.
- **Progress charts overlay their metrics** rather than tabbing between them — load,
  reps and total work share one chart on separate axes. Tap a legend key to hide a line.
  Finger training charts one grip at a time (grip is a tab) with load and duration
  overlaid, since blending grips on one line hides the thing you're looking for.
- **Built for a phone.** Tab bar sits at the bottom within thumb reach, the Save
  button sticks above it, inputs are 16px so iOS doesn't zoom when you focus one,
  and set columns are labelled — placeholders disappear once a box has a number in it.
- **Redpoint pyramid** has its own tab. Tiers come from `REDPOINT_PYRAMID` in
  `state.js`; edit that array to change the shape. Only sends fill blocks, a send counts
  toward its own tier only, and blocks fill oldest-first. Tap a filled block (or hover on
  desktop) for its date, grade, name and attempts.
- **Climbs aren't library items either.** Name is optional free text (autocompleting from
  your own history) — it's shorthand for your memory, not a tracked entity. Grade,
  outcome and attempts are what get charted.
- See `SCHEMA.md` for the full data model.
