export const CATEGORIES = {
  sc: 'Strength & Conditioning',
  finger: 'Finger Training',
  cardio: 'Cardio',
  rehab: 'Rehab',
  boulder: 'Bouldering',
  rope_redpoint: 'Rope Redpoint',
  rope_endurance: 'Rope Endurance Laps'
};

// Categories with a reusable, user-managed exercise library. Finger training is
// excluded on purpose: protocol + grip + apparatus fully describe the work, so a
// library entry would only be a redundant name.
export const LIBRARY_CATEGORIES = ['sc', 'cardio', 'rehab'];

export const STIMULI = ['strength', 'power', 'power_endurance', 'endurance', 'capacity'];
export const MOVEMENTS = ['push', 'pull', 'hinge', 'squat', 'hold'];
export const TARGETS = ['legs', 'arms', 'chest', 'back', 'hips', 'core'];
export const CARDIO_TYPES = ['bike', 'run', 'row', 'swim', 'hike', 'other'];
export const GRIPS = ['half crimp', 'full crimp', 'open', '3 finger drag', 'pocket', 'mono', 'pinch'];
export const FINGER_PROTOCOLS = {
  max_hang: 'Max Hang',
  density_hang: 'Density Hang',
  repeaters: 'Repeaters',
  pulses: 'Pulses'
};
export const APPARATUS = {
  hb_bimanual: 'Hangboard (2 arms)',
  hb_unilateral: 'Hangboard (1 arm)',
  no_hang: 'No-Hang (1 arm)'
};

export const V_GRADES = ['VB','V0','V1','V2','V3','V4','V5','V6','V7','V8','V9','V10','V11','V12','V13','V14','V15','V16','V17'];
// Stored, displayed and picked as full YDS. The picker is a dropdown, so the
// prefix costs nothing to choose.
export const YDS_GRADES = ['5.6','5.7','5.8','5.9','5.10a','5.10b','5.10c','5.10d','5.11a','5.11b','5.11c','5.11d','5.12a','5.12b','5.12c','5.12d','5.13a','5.13b','5.13c','5.13d','5.14a','5.14b','5.14c','5.14d','5.15a'];
export const gradeScale = cat => cat === 'boulder' ? V_GRADES : YDS_GRADES;

export const OUTCOMES = { flash: 'Flash', send: 'Send', attempt: 'Attempt' };

export const S = {
  user: null,
  exercises: [],
  currentTab: 'log',
  session: null,      // { id|null, date, notes, entries: [] } — the in-progress draft
  editingSessionId: null,
  log: { addCat: 'sc', search: '' },
  history: { items: [], catFilter: '', view: 'list', detailId: null },
  library: { catFilter: '', search: '', editingId: null },
  progress: { category: 'sc', exerciseId: null, metric: null, protocol: null, grip: '' }
};
