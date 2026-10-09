import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged, setPersistence, browserLocalPersistence, browserSessionPersistence } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js';
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager, memoryLocalCache, collection, doc, onSnapshot, writeBatch } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';

const app = initializeApp({
  apiKey: 'AIzaSyBmVxln6Ao7lV4VMOoqAT1n_tGLhmeCpRQ',
  authDomain: 'classroom-map-99e84.firebaseapp.com',
  projectId: 'classroom-map-99e84',
  storageBucket: 'classroom-map-99e84.firebasestorage.app',
  messagingSenderId: '34629391255',
  appId: '1:34629391255:web:7caeab509e37ba43246ad2'
});
const auth = getAuth(app);
let db, user, unsubscribe, unsubscribeProfile, known = new Map(), pending = 0, generation = 0, lastSnapshot, active = null, preferences = {};
let receive, report;
let trusted = false;
try { trusted = localStorage.getItem('classroom-map-trusted-device') === 'true'; } catch {}

function status(error) {
  report({ user, pending: pending > 0, offline: !navigator.onLine, fromCache: lastSnapshot?.metadata.fromCache, trusted, error });
}
export function connect(onData, onStatus) {
  receive = onData;
  report = onStatus;
  onAuthStateChanged(auth, next => {
    generation++;
    unsubscribe?.();
    unsubscribeProfile?.();
    user = next;
    known = new Map();
    pending = 0;
    lastSnapshot = null;
    active = null;
    preferences = {};
    receive(null);
    status();
    if (!user) return;
    db ||= initializeFirestore(app, { localCache: trusted
      ? persistentLocalCache({ tabManager: persistentMultipleTabManager() })
      : memoryLocalCache() });
    const session = generation;
    unsubscribeProfile = onSnapshot(doc(db, 'users', user.uid), profile => {
      if (session !== generation || pending) return;
      active = profile.data()?.active || null;
      preferences = profile.data()?.preferences || {};
      if (lastSnapshot) applySnapshot(lastSnapshot);
    }, error => status(error));
    unsubscribe = onSnapshot(collection(db, 'users', user.uid, 'classes'), { includeMetadataChanges: true }, snapshot => {
      if (session !== generation) return;
      lastSnapshot = snapshot;
      if (pending === 0) applySnapshot(snapshot);
      status();
    }, error => status(error));
  });
  addEventListener('online', () => status());
  addEventListener('offline', () => status());
  return trusted;
}
function applySnapshot(snapshot) {
  const classes = snapshot.docs.map(d => ({ ...d.data(), id: d.id }));
  known = new Map(classes.map(c => [c.id, JSON.stringify(c)]));
  receive({ classes, active, preferences, fromCache: snapshot.metadata.fromCache });
}
export async function login(remember) {
  if (!navigator.onLine) throw new Error('La première connexion nécessite Internet.');
  trusted = remember;
  try { localStorage.setItem('classroom-map-trusted-device', String(remember)); } catch {}
  await setPersistence(auth, remember ? browserLocalPersistence : browserSessionPersistence);
  await signInWithPopup(auth, new GoogleAuthProvider());
}
export async function logout() {
  if (pending) throw new Error('Attendez la synchronisation avant de vous déconnecter.');
  await signOut(auth);
  // Reinitialize the cache mode for the next sign-in on this device.
  location.reload();
}
export function persist(data) {
  if (!user || !db) return;
  const next = new Map(data.classes.map(c => [c.id, JSON.stringify(c)]));
  const batch = writeBatch(db);
  let changed = false;
  if (active !== data.active || JSON.stringify(preferences) !== JSON.stringify(data.preferences)) {
    batch.set(doc(db, 'users', user.uid), { active: data.active, preferences: data.preferences }, { merge: true });
    active = data.active;
    preferences = structuredClone(data.preferences);
    changed = true;
  }
  for (const c of data.classes) {
    if (known.get(c.id) === next.get(c.id)) continue;
    batch.set(doc(db, 'users', user.uid, 'classes', c.id), c);
    changed = true;
  }
  for (const id of known.keys()) {
    if (next.has(id)) continue;
    batch.delete(doc(db, 'users', user.uid, 'classes', id));
    changed = true;
  }
  if (!changed) return;
  known = next;
  const session = generation;
  pending++;
  status();
  // Firestore queues this atomic write locally, including while offline.
  batch.commit().then(() => {
    if (session !== generation) return;
    pending--;
    if (!pending && lastSnapshot) applySnapshot(lastSnapshot);
    status();
  }).catch(error => {
    if (session !== generation) return;
    pending--;
    if (!pending && lastSnapshot) applySnapshot(lastSnapshot);
    status(error);
  });
}
