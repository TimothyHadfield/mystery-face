// Mystery Face accounts: sign in (Google or email + password) on the shared free Firebase project
// th-board-games, and keep a player's custom people on the account so they show up on any device.
// Tim, 2026-11-06: "attatch the custome people with a user's account that they make."
//
// The same Firebase app ("online-mystery-face") and login as the online rooms (js/online.js), so a
// player has ONE uid. A player who already played online has an anonymous login: signing up LINKS it
// (same uid, rooms keep working); signing in to an existing account switches login, so it is refused
// while a game is open (online.js would keep the old uid).
//
// Firestore: games/mystery-face/users/{uid}/sets/{setId} = { title, people: [{ id, name, img }], updatedAt }
// Rules (Board and Card Games/_online/firestore.rules): only that uid, never anonymous, at most 40 people.
import { FIREBASE_CONFIG } from './online.js?v=a3d0418b';
import { cleanSet } from './faces.js';

const CDN = 'https://www.gstatic.com/firebasejs/12.16.0/';
export const APP_NAME = 'online-mystery-face';
export const GAME_ID = 'mystery-face';
const FLAG = 'mystery-face:acct';    // "this browser has signed in before": restore the session at start-up
const SET_MAX_CHARS = 900000;        // Firestore's limit is 1 MiB per document

let M = null, auth = null, db = null, loadP = null;
const subs = new Set();
const emit = () => { for (const f of subs) { try { f(user()); } catch (e) { console.error(e); } } };
export const onChange = (f) => { subs.add(f); return () => subs.delete(f); };

/** The signed-in account, or null (anonymous logins from online play don't count). */
export function user() {
  const u = auth && auth.currentUser;
  if (!u || u.isAnonymous) return null;
  return { uid: u.uid, email: u.email || '', name: u.displayName || '', provider: (u.providerData[0] || {}).providerId || '' };
}
export const loaded = () => !!auth;
export const wasSignedIn = () => { try { return localStorage.getItem(FLAG) === '1'; } catch (e) { return false; } };

/** Load the SDK and wait for the saved login. emulator: { host, authPort, firestorePort } for tests. */
export function load(emulator) {
  if (loadP) return loadP;
  loadP = (async () => {
    let mods;
    try {
      mods = await Promise.all([import(CDN + 'firebase-app.js'), import(CDN + 'firebase-auth.js'), import(CDN + 'firebase-firestore.js')]);
    } catch (e) { loadP = null; throw new Error('Accounts need the internet. Check your connection and try again.'); }
    const [A, U, F] = mods;
    M = { A, U, F };
    const existing = A.getApps().find((a) => a.name === APP_NAME);
    const app = existing || A.initializeApp(FIREBASE_CONFIG, APP_NAME);
    auth = U.getAuth(app);
    db = F.getFirestore(app);
    if (emulator && !existing) {
      U.connectAuthEmulator(auth, `http://${emulator.host}:${emulator.authPort}`, { disableWarnings: true });
      F.connectFirestoreEmulator(db, emulator.host, emulator.firestorePort);
    }
    await auth.authStateReady();
    U.onAuthStateChanged(auth, () => { remember(); emit(); });
    remember();
    return true;
  })();
  return loadP;
}
function remember() { try { if (user()) localStorage.setItem(FLAG, '1'); else localStorage.removeItem(FLAG); } catch (e) {} }

const MSG = {
  'auth/invalid-email': 'That email doesn\'t look right.',
  'auth/missing-password': 'Type a password.',
  'auth/weak-password': 'Use at least 6 characters for the password.',
  'auth/email-already-in-use': 'That email already has an account: sign in instead.',
  'auth/invalid-credential': 'Wrong email or password.',
  'auth/wrong-password': 'Wrong email or password.',
  'auth/user-not-found': 'No account with that email: create one.',
  'auth/too-many-requests': 'Too many tries. Wait a minute and try again.',
  'auth/popup-blocked': 'The sign-in window was blocked. Tap the button again.',
  'auth/popup-closed-by-user': 'Sign-in was closed.',
  'auth/cancelled-popup-request': 'Sign-in was closed.',
  'auth/network-request-failed': 'No connection. Try again.',
  'auth/operation-not-allowed': 'That kind of sign-in isn\'t turned on yet.',
};
const plain = (e) => MSG[e && e.code] || (e && e.message) || 'Something went wrong. Try again.';
const LOCKED = 'Leave the game first, then sign in.';

/** Google sign-in. Must be called straight from the tap (the popup is opened synchronously). */
export async function google({ inRoom } = {}) {
  if (!auth) return { ok: false, message: 'Still loading. Try again.' };
  const { U } = M;
  const prov = new U.GoogleAuthProvider();
  const cur = auth.currentUser;
  try {
    if (cur && cur.isAnonymous) {
      try { await U.linkWithPopup(cur, prov); }
      catch (e) {
        if (e.code !== 'auth/credential-already-in-use') throw e;
        if (inRoom) return { ok: false, message: LOCKED };
        await U.signInWithCredential(auth, U.GoogleAuthProvider.credentialFromError(e));
      }
    } else await U.signInWithPopup(auth, prov);
    remember(); emit();
    return { ok: true };
  } catch (e) { return { ok: false, message: plain(e) }; }
}

export async function emailSignUp(email, pw) {
  if (!auth) return { ok: false, message: 'Still loading. Try again.' };
  const { U } = M;
  try {
    const cur = auth.currentUser;
    if (cur && cur.isAnonymous) await U.linkWithCredential(cur, U.EmailAuthProvider.credential(String(email).trim(), pw));
    else await U.createUserWithEmailAndPassword(auth, String(email).trim(), pw);
    remember(); emit();
    return { ok: true };
  } catch (e) { return { ok: false, message: plain(e) }; }
}

export async function emailSignIn(email, pw, { inRoom } = {}) {
  if (!auth) return { ok: false, message: 'Still loading. Try again.' };
  if (inRoom) return { ok: false, message: LOCKED };
  try { await M.U.signInWithEmailAndPassword(auth, String(email).trim(), pw); remember(); emit(); return { ok: true }; }
  catch (e) { return { ok: false, message: plain(e) }; }
}

export async function resetPassword(email) {
  if (!auth) return { ok: false, message: 'Still loading. Try again.' };
  try { await M.U.sendPasswordResetEmail(auth, String(email).trim()); return { ok: true }; }
  catch (e) { return { ok: false, message: plain(e) }; }
}

export async function signOut({ inRoom } = {}) {
  if (!auth) return { ok: true };
  if (inRoom) return { ok: false, message: 'Leave the game first, then sign out.' };
  try { await M.U.signOut(auth); remember(); emit(); return { ok: true }; }
  catch (e) { return { ok: false, message: plain(e) }; }
}

// ------------------------------------------------------------------ sets on the account
const setsCol = (uid) => M.F.collection(db, 'games', GAME_ID, 'users', uid, 'sets');
const setDoc = (uid, id) => M.F.doc(db, 'games', GAME_ID, 'users', uid, 'sets', id);

export async function listSets() {
  const u = user(); if (!u) return { ok: false, message: 'Not signed in.' };
  try {
    const snap = await M.F.getDocs(setsCol(u.uid));
    return { ok: true, sets: snap.docs.filter((d) => d.id !== MEM_DOC).map((d) => cleanSet(Object.assign({}, d.data(), { id: d.id }))) };
  } catch (e) { return { ok: false, message: 'Couldn\'t load your people. Check your connection.' }; }
}

export function setSize(set) { return JSON.stringify({ title: set.title, people: set.people }).length; }

export async function saveSet(set) {
  const u = user(); if (!u) return { ok: false, message: 'Not signed in.' };
  const s = cleanSet(set);
  if (setSize(s) > SET_MAX_CHARS) return { ok: false, message: 'This set is too big to save. Remove a few photos.' };
  try {
    await M.F.setDoc(setDoc(u.uid, s.id), { title: s.title, people: s.people, updatedAt: s.updatedAt });
    return { ok: true };
  } catch (e) { return { ok: false, message: 'Couldn\'t save to your account. It\'s kept on this device.' }; }
}

// ------------------------------------------------------------------ face memory on the account
// Tim, 2026-11-06: "Remember all charactors on a users account as either known, don't know, or unused."
// It rides in the saved-sets folder the rules already allow (no rules change): one doc "_memory" whose
// `people` list holds a single string, the memory as JSON (engine.js memClean: { v, g, k, u }, ~30 chars
// a face, capped at 5000 faces, so ~150 KB at most). listSets skips it.
const MEM_DOC = '_memory';
export async function loadMemory() {
  const u = user(); if (!u) return { ok: false };
  try {
    const snap = await M.F.getDoc(setDoc(u.uid, MEM_DOC));
    if (!snap.exists()) return { ok: true, mem: null };
    const p = snap.data().people;
    return { ok: true, mem: JSON.parse(Array.isArray(p) && typeof p[0] === 'string' ? p[0] : 'null') };
  } catch (e) { return { ok: false }; }
}
export async function saveMemory(mem) {
  const u = user(); if (!u) return { ok: false };
  const json = JSON.stringify(mem);
  if (json.length > SET_MAX_CHARS) return { ok: false };
  try { await M.F.setDoc(setDoc(u.uid, MEM_DOC), { title: 'memory', people: [json], updatedAt: Date.now() }); return { ok: true }; }
  catch (e) { return { ok: false }; }
}

export async function deleteSet(id) {
  const u = user(); if (!u) return { ok: false, message: 'Not signed in.' };
  try { await M.F.deleteDoc(setDoc(u.uid, id)); return { ok: true }; }
  catch (e) { return { ok: false, message: 'Couldn\'t delete it from your account. Try again.' }; }
}
