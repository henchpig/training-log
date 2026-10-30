import {
  db, collection, collectionGroup, doc, addDoc, setDoc, updateDoc, deleteDoc,
  getDoc, getDocs, query, where, orderBy, limit, serverTimestamp
} from './firebase-init.js';
import { S } from './state.js';

const uidPath = () => `users/${S.user.uid}`;

// ── Exercises ────────────────────────────────────────────────
export async function fetchExercises() {
  const snap = await getDocs(query(collection(db, `${uidPath()}/exercises`), orderBy('name')));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function createExercise(data) {
  const ref = await addDoc(collection(db, `${uidPath()}/exercises`), {
    ...data, uid: S.user.uid, createdAt: serverTimestamp()
  });
  return ref.id;
}

export function updateExercise(id, data) {
  return updateDoc(doc(db, `${uidPath()}/exercises/${id}`), data);
}

export function deleteExercise(id) {
  return deleteDoc(doc(db, `${uidPath()}/exercises/${id}`));
}

// ── Sessions ─────────────────────────────────────────────────
export async function fetchSessions(max = 200) {
  const snap = await getDocs(query(
    collection(db, `${uidPath()}/sessions`), orderBy('date', 'desc'), limit(max)
  ));
  return snap.docs.map(d => ({ id: d.id, ...d.data() })).sort(byDateDesc);
}

export async function fetchSessionEntries(sessionId) {
  const snap = await getDocs(collection(db, `${uidPath()}/sessions/${sessionId}/entries`));
  return snap.docs.map(d => ({ id: d.id, ...d.data() })).sort(byOrder);
}

export async function saveSession(session) {
  const { id, date, notes, entries } = session;
  const payload = {
    date,
    notes: notes || '',
    uid: S.user.uid,
    updatedAt: serverTimestamp()
  };

  let sessionId = id;
  if (sessionId) {
    await updateDoc(doc(db, `${uidPath()}/sessions/${sessionId}`), payload);
    // Replace entries wholesale — simplest correct approach for an edit.
    const existing = await getDocs(collection(db, `${uidPath()}/sessions/${sessionId}/entries`));
    await Promise.all(existing.docs.map(d => deleteDoc(d.ref)));
  } else {
    const ref = await addDoc(collection(db, `${uidPath()}/sessions`), {
      ...payload, createdAt: serverTimestamp()
    });
    sessionId = ref.id;
  }

  // `date` is denormalized onto every entry so the Progress tab's
  // collection-group queries don't have to join back to the session.
  // `order` keeps the entries in the sequence they were logged in — these
  // writes go out in parallel, so neither the auto-IDs nor createdAt can.
  await Promise.all(entries.map((e, i) => {
    const { _localId, ...rest } = e;
    return addDoc(collection(db, `${uidPath()}/sessions/${sessionId}/entries`), {
      ...rest, uid: S.user.uid, date, order: i, createdAt: serverTimestamp()
    });
  }));

  return sessionId;
}

export async function deleteSession(sessionId) {
  const existing = await getDocs(collection(db, `${uidPath()}/sessions/${sessionId}/entries`));
  await Promise.all(existing.docs.map(d => deleteDoc(d.ref)));
  await deleteDoc(doc(db, `${uidPath()}/sessions/${sessionId}`));
}

// ── Progress queries (collection group across all sessions) ──
export async function fetchEntriesByExercise(exerciseId) {
  const snap = await getDocs(query(
    collectionGroup(db, 'entries'),
    where('uid', '==', S.user.uid),
    where('exerciseId', '==', exerciseId)
  ));
  return snap.docs.map(d => ({ id: d.id, ...d.data() })).sort(byDate);
}

export async function fetchEntriesByCategory(category) {
  const snap = await getDocs(query(
    collectionGroup(db, 'entries'),
    where('uid', '==', S.user.uid),
    where('category', '==', category)
  ));
  return snap.docs.map(d => ({ id: d.id, ...d.data() })).sort(byDate);
}

const byDate = (a, b) => (a.date || '').localeCompare(b.date || '');

// Two sessions on the same day tie on `date`, and Firestore breaks that tie by
// document ID — random, for auto-IDs. createdAt is when the session was first
// saved, which is the closest thing we store to when it happened. Sorting here
// rather than with a second orderBy keeps it off a composite index.
const byDateDesc = (a, b) =>
  (b.date || '').localeCompare(a.date || '') || (ms(b) - ms(a));

// Firestore hands documents back in auto-ID order, which is effectively random,
// so a session's entries carry an explicit `order`. Entries written before that
// field existed (the backfill imports) went in one at a time, so their
// createdAt is in the logged order and stands in for it.
const ms = e => e.createdAt?.toMillis?.() ?? (e.createdAt?.seconds ?? 0) * 1000;
const byOrder = (a, b) => {
  if (a.order != null && b.order != null) return a.order - b.order;
  if (a.order != null) return -1;
  if (b.order != null) return 1;
  return ms(a) - ms(b);
};
