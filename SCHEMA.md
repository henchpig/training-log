# Data model

Firestore, scoped per user under `users/{uid}/...`. All docs get `uid` denormalized
onto them so collection-group queries (used by Progress) can be secured with rules.

## users/{uid}/exercises/{exerciseId}
Reusable named exercises. Only used by categories `sc`, `cardio`, `finger`.
Bouldering / rope never reference this collection.

```
{
  name: string,
  category: 'sc' | 'cardio' | 'rehab',
  stimulus: 'strength' | 'power' | 'power_endurance' | 'endurance' | 'capacity',
  movement: ['push'|'pull'|'hinge'|'squat'|'hold', ...],   // sc only, optional
  targets: ['legs'|'arms'|'chest'|'back'|'hips'|'core', ...], // sc only, optional
  cardioType: 'bike'|'run'|'row'|'swim'|..., // cardio only
  createdAt: timestamp
}
```

## users/{uid}/sessions/{sessionId}
```
{
  date: 'YYYY-MM-DD',
  notes: string,
  createdAt, updatedAt
}
```

## users/{uid}/sessions/{sessionId}/entries/{entryId}
One entry per exercise-block logged in a session, OR one entry per climb for
bouldering/rope redpoint. `date` and `uid` are denormalized from the parent
session for progress queries via `collectionGroup('entries')`.

Common: `{ uid, date, category, createdAt }`

`date` is copied down from the parent session so progress queries never need to
join back to it.

**category: 'sc'** (Strength & Conditioning)
```
exerciseId, exerciseName,
sets: [{ weight, weightType: 'absolute'|'relative', reps, rpe }]
// 'relative' = bodyweight movement; `weight` is load added to bodyweight,
// negative for assisted, 0/blank for straight bodyweight.
```

**category: 'cardio'**
```
exerciseId, exerciseName, cardioClass: 'endurance' | 'intervals',
// endurance:
endurance: { distance, distanceUnit: 'mi'|'km', timeSec }
// intervals:
sets: [{ workSec, restSec, reps, distance|null }]
```

**category: 'finger'**
```
exerciseId, exerciseName,
protocol: 'max_hang' | 'density_hang' | 'repeaters' | 'pulses',
sets: [ ... shape depends on protocol, see below ]
```
Every finger set carries `grip`, `apparatus` ('hb_bimanual'|'hb_unilateral'|'no_hang')
and `implement` (free text — the edge/block you pulled on, e.g. "unlevel edge";
autocompletes from history, not a tracked entity). Then, by protocol:
- `max_hang` / `density_hang` (share a shape — same data, different training intent):
  `{ ...grip/apparatus/implement, restSec, reps: [{ load, durationSec, rpe }] }`
- `repeaters`:
  `{ ...grip/apparatus/implement, load, workSec, restSec, reps }`
- `pulses` (pick the weight up and set it straight back down, for reps):
  `{ ...grip/apparatus/implement, load, reps, rpe }`

**category: 'rehab'**
Kept separate from both S&C and finger training so rehab loads never share an axis
with training loads.
```
exerciseId, exerciseName,
sets: [{ load, reps, durationSec, rpe }]   // all optional — fill what applies
```

**category: 'boulder' | 'rope_redpoint'**
One entry = one climb (no exercise library involved).
```
name: string|null,       // free-text shorthand, autocompletes from history, not saved as a library item
grade: string,
outcome: 'flash' | 'send' | 'attempt',
attempts: number,        // locked to 1 when outcome === 'flash'
notes: string
```

**category: 'rope_endurance'**
```
sets: [{ grade, laps, timeSec, rpe }]
```

## Grades
Boulder uses the V scale. Rope is stored and displayed as full YDS (`5.9`, `5.12a`).
Only the grade *picker* shortens the labels — you choose `9` or `12a`, and it reads
back everywhere as `5.9` / `5.12a`. See `gradeLabel` in `state.js`; it's a display
concern only, so nothing downstream has to translate.

## Progress queries
- S&C / Cardio / Finger: `collectionGroup('entries').where('uid','==',uid).where('exerciseId','==',id)`,
  sorted client-side by `date`. Finger additionally filters by `protocol` (and optionally `grip`)
  since Max Hang / Density Hang / Repeaters / Pulses are separate charts.
- Rehab: per exercise, metrics load / duration / reps.
- The per-session charts plot the best set of each day; hovering a point shows that
  set's details (grip, implement, apparatus, load, duration, RPE).
- Boulder / Rope Redpoint / Rope Endurance: `collectionGroup('entries').where('uid','==',uid).where('category','==','boulder'|'rope_redpoint'|'rope_endurance')`,
  sorted client-side by `date`. Rope Endurance additionally flattens `sets` (one point per set).
