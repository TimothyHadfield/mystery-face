// Mystery Face: the page. Rules live in engine.js (pure), faces in faces.js, custom sets in people.js,
// accounts in account.js, online rooms in the shared online.js (copied unchanged from ../_online).
// Tim, 2026-11-06: "This game will be online only with another real person ... make a in-person
// varient where both boards are shown on the same computer and one user looks away while they pick".
import './fx.js';
import { game, commitOf, makeSalt, checkReview } from './engine.js';
import * as FC from './faces.js';
import * as KIT from './kit.js';
import * as PPL from './people.js';
import * as ACCT from './account.js';

const BUILD = '2026-11-06.1';
const ONLINE_JS = './online.js?v=a3d0418b';
const KEY = 'mystery-face:v1';
const $ = (s, r = document) => r.querySelector(s);
const esc = FC.esc;
const FX = window.FX, PF = window.Profile, COACH = window.COACH;

// ------------------------------------------------------------------ state
const DEF = { tab: 'play', mode: 'online', src: { kind: 'deck', decks: [], tags: [] }, n: 24, lives: 1, timer: 0, names: true, name: '' };
let S = load();
function load() {
  let s = null;
  try { s = JSON.parse(localStorage.getItem(KEY)); } catch (e) {}
  s = Object.assign({}, DEF, s || {});
  s.src = Object.assign({}, DEF.src, s.src || {});
  if (![16, 24, 30].includes(s.n)) s.n = 24;
  if (s.play && (s.play.kind !== 'local' || !s.play.state || !s.play.state.board)) s.play = null;
  return s;
}
function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} }

// per-game private bits for online rooms (this phone only): secret pick, flips
const secKey = (code, round) => `mystery-face:sec:${code}:${round}`;
const flipKey = (code, round) => `mystery-face:flip:${code}:${round}`;
const lsGet = (k) => { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
// Faces this player said they don't know (deck people only), never dealt to them again. Kept on this
// device only: the account's Firestore rules allow just the saved-sets docs, so an account copy would
// need a rules change.
const DUNNO_KEY = 'mystery-face:dunno';
const dunnoList = () => { const a = lsGet(DUNNO_KEY); return Array.isArray(a) ? a.filter((x) => typeof x === 'string') : []; };
function addDunno(ids) {
  const add = ids.filter((id) => id && !id.startsWith('c/'));
  if (!add.length) return;
  lsSet(DUNNO_KEY, Array.from(new Set(dunnoList().concat(add))).slice(-500));
}

// ui-only state
const U = { marks: new Set(), pickSel: -1, guessing: false, guessSel: -1, peek: false, lastRec: '', lastAuto: '', timerKey: '', timerAt: 0, timerRang: false, sheet: false, busy: false, joinCode: '', online: null, snap: null, zoom: null, oflips: [], home: false };

// ------------------------------------------------------------------ kits
FX.init({ game: 'mystery-face', accent: '#f0b354', clickSelector: 'button:not(.face)' });
if (PF) PF.init({ game: 'mystery-face', achievements: KIT.ACHIEVEMENTS, draws: false, modes: { online: { name: 'Online' }, friends: { name: 'Same screen', hide: false } } });

// ------------------------------------------------------------------ small ui helpers
let toastT = null;
function toast(msg) {
  let t = $('#toast');
  if (!t) { t = document.createElement('div'); t.id = 'toast'; t.setAttribute('role', 'status'); document.body.appendChild(t); }
  t.textContent = msg; t.classList.add('on');
  clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('on'), 2600);
}
function sheet(html, { wide = false } = {}) {
  const l = $('#layer');
  l.innerHTML = `<div class="veil" data-act="sheetx"></div><div class="sheet${wide ? ' wide' : ''}" role="dialog" aria-modal="true">${html}</div>`;
  l.classList.add('on'); U.sheet = true;
}
function closeSheet() { const l = $('#layer'); l.classList.remove('on'); l.innerHTML = ''; U.sheet = false; U.zoom = null; }

// ------------------------------------------------------------------ accounts
const inRoom = () => !!(U.online && U.snap && U.snap.code && !['none', 'closed', 'left'].includes(U.snap.status));
const acctCtx = {
  user: ACCT.user, listSets: ACCT.listSets, saveSet: ACCT.saveSet, deleteSet: ACCT.deleteSet,
};
PPL.initPeople({ $, toast, sheet, closeSheet, render: () => renderAll(), acct: acctCtx, playWithSet, FX });
ACCT.onChange((u) => { renderAcctBtn(); PPL.onAccount(u); if (U.online && !inRoom()) U.online = null; });

function renderAcctBtn() {
  const u = ACCT.user();
  const b = $('#acctBtn');
  b.classList.toggle('in', !!u);
  b.innerHTML = u ? `<span>${esc(FC.initials(u.name || u.email || '?'))}</span>` : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="9" r="3.6"/><path d="M5 20c1-3.6 3.8-5.4 7-5.4s6 1.8 7 5.4"/><circle cx="12" cy="12" r="10"/></svg>`;
  b.setAttribute('aria-label', u ? 'Account: ' + (u.email || 'signed in') : 'Sign in');
}

function accountSheet(mode = 'in') {
  const u = ACCT.user();
  if (u) {
    sheet(`<h3>Your account</h3><p class="muted">${esc(u.email || u.name)}</p><p class="small muted">Your people are saved on this account and show up on any device where you sign in.</p>
      <div class="row end"><button class="btn" data-act="signout">Sign out</button><button class="btn main" data-act="sheetx">Done</button></div>`);
    return;
  }
  sheet(`<h3>${mode === 'up' ? 'Make an account' : 'Sign in'}</h3>
    <p class="small muted">Keep your people on every device. Playing doesn't need an account.</p>
    <button class="btn google" data-act="google" ${ACCT.loaded() ? '' : 'disabled'}><svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M22.5 12.3c0-.8-.1-1.5-.2-2.2H12v4.2h5.9a5 5 0 0 1-2.2 3.3v2.7h3.6c2-1.9 3.2-4.7 3.2-8z"/><path fill="#34A853" d="M12 23c3 0 5.5-1 7.3-2.7l-3.6-2.7c-1 .7-2.2 1.1-3.7 1.1-2.9 0-5.3-1.9-6.2-4.5H2.1v2.8A11 11 0 0 0 12 23z"/><path fill="#FBBC05" d="M5.8 14.2a6.6 6.6 0 0 1 0-4.3V7.1H2.1a11 11 0 0 0 0 9.9l3.7-2.8z"/><path fill="#EA4335" d="M12 5.4c1.6 0 3.1.6 4.2 1.7l3.2-3.2A11 11 0 0 0 2.1 7.1l3.7 2.8C6.7 7.3 9.1 5.4 12 5.4z"/></svg>${ACCT.loaded() ? 'Continue with Google' : 'Loading…'}</button>
    <div class="or"><span>or</span></div>
    <label class="field"><span class="small muted">Email</span><input id="aEmail" type="email" autocomplete="email" inputmode="email"></label>
    <label class="field"><span class="small muted">Password</span><input id="aPw" type="password" autocomplete="${mode === 'up' ? 'new-password' : 'current-password'}" minlength="6"></label>
    <div class="row end">${mode === 'up' ? '<button class="btn" data-act="acct-in">I have an account</button><button class="btn main" data-act="emailup">Create account</button>'
      : '<button class="link small" data-act="reset">Forgot password?</button><span class="grow"></span><button class="btn" data-act="acct-up">New account</button><button class="btn main" data-act="emailin">Sign in</button>'}</div>`);
  if (!ACCT.loaded()) ACCT.load().then(() => { if (U.sheet && $('#aEmail')) accountSheet(mode); }, (e) => toast(e.message));
}

// ------------------------------------------------------------------ decks + the board source
let DECKS_READY = false;
async function loadDecks() {
  const idx = await FC.loadIndex();
  await Promise.all(idx.map((d) => FC.loadDeck(d.id).catch(() => null)));
  if (!S.src.decks || !S.src.decks.length || S.src.decks.some((d) => !FC.deck(d))) {
    const ok = idx.filter((d) => FC.deck(d.id)).map((d) => d.id);
    if (S.src.kind === 'deck') S.src.decks = ok.length ? [ok[0]] : [];
  }
  DECKS_READY = true;
  renderAll();
  setTimeout(warmImages, 1200);
}
// Same screen works offline: fetch the chosen deck's pictures once (the service worker keeps a copy),
// so a board dealt with no signal still shows photos. A picture that still fails shows its name tile.
let warmed = '';
function warmImages() {
  if (S.src.kind !== 'deck' || navigator.onLine === false || (navigator.connection && navigator.connection.saveData)) return;
  const key = (S.src.decks || []).join('+');
  if (warmed === key) return;
  warmed = key;
  const urls = (S.src.decks || []).flatMap((d) => (FC.deck(d) ? FC.deck(d).people.map((p) => p.img) : [])).filter(Boolean).slice(0, 400);
  let i = 0;
  const next = () => { if (i >= urls.length) return; fetch(urls[i++]).catch(() => {}).finally(() => setTimeout(next, 30)); };
  for (let k = 0; k < 4; k++) next();
}
/** The faces a new game may use, from the chosen source. */
function sourcePool() {
  if (S.src.kind === 'set') {
    const set = PPL.getSet(S.src.id);
    if (!set) return { ids: [], set: null, title: '' };
    return { ids: set.people.map((p) => 'c/' + p.id), set, title: set.title };
  }
  const decks = (S.src.decks || []).filter((d) => FC.deck(d));
  const tags = (S.src.tags || []).filter((t) => FC.tagCounts(decks).some((x) => x.tag === t));
  const ids = FC.poolFor(decks, tags);
  // Mixed stars also deals the player's own people (Your people), favoured by the deal
  const mix = decks.includes('mixed') ? ownPeople() : null;
  if (mix) ids.push(...mix.people.map((p) => 'c/' + p.id));
  return { ids, set: null, mix, title: decks.map((d) => FC.deck(d).title).join(' + ') };
}
/** Every custom person on this device/account (up to 20, picked at random), as one set: { title, people } */
function ownPeople() {
  const seen = new Set(), people = [];
  for (const s of PPL.allSets()) {
    const names = FC.displayNames(s.people);
    s.people.forEach((p, i) => { if (!seen.has(p.id)) { seen.add(p.id); people.push({ id: p.id, name: p.name || names[i], img: p.img || null }); } });
  }
  if (!people.length) return null;
  return { title: 'Your people', people: people.sort(() => Math.random() - 0.5).slice(0, 20) };
}
function playWithSet(id) {
  S.src = { kind: 'set', id, decks: S.src.decks || [], tags: [] };
  S.tab = 'play'; save(); renderAll();
}

// ------------------------------------------------------------------ the game, as the page sees it
// One shape for both modes: { kind, pub, names: [a, b], me (online seat | null), toAct, custom }
function G() {
  if (S.play && S.play.kind === 'local') {
    const st = S.play.state;
    return { kind: 'local', pub: st, names: ['Player 1', 'Player 2'], me: null, toAct: game.toAct(st), custom: S.play.custom || null };
  }
  const sn = U.snap;
  if (U.online && sn && sn.status === 'playing' || (sn && sn.status === 'finished' && sn.pub)) {
    return { kind: 'online', pub: sn.pub, names: sn.seats.map((s, i) => (i === sn.mySeat ? 'You' : (s.name || 'Friend').replace(/ \(computer\)$/, ''))), me: sn.mySeat, toAct: sn.toAct || [], custom: (sn.options && (sn.options.custom || sn.options.mixCustom)) || null, snap: sn };
  }
  return null;
}
const other = (s) => 1 - s;
// online: my secret (face + salt) for this round; local: both
function secretOf(g, seat) {
  if (g.kind === 'local') return (S.play.secrets || [])[seat] || null;
  return lsGet(secKey(g.snap.code, g.pub.round));
}
function flipsOf(g, seat) {
  if (g.kind === 'local') { S.play.flips = S.play.flips || [{}, {}]; return S.play.flips[seat]; }
  return lsGet(flipKey(g.snap.code, g.pub.round)) || {};
}
function setFlips(g, seat, f) {
  if (g.kind === 'local') { S.play.flips[seat] = f; save(); return; }
  lsSet(flipKey(g.snap.code, g.pub.round), f);
}
const turnNo = (pub) => pub.log.filter((e) => !('guess' in e)).length;

// ------------------------------------------------------------------ moves
async function send(seat, action) {
  const g = G(); if (!g) return false;
  if (g.kind === 'local') {
    try { S.play.state = game.apply(JSON.parse(JSON.stringify(S.play.state)), seat, action, Math.random); }
    catch (e) { FX.play('error'); toast(e.message); return false; }
    afterLocal(); save(); renderAll(); return true;
  }
  if (U.busy) return false;
  U.busy = true;
  try {
    const r = await U.online.act(action);
    if (!r.ok) { if (!r.stale) FX.play('error'); toast(r.message); return false; }
    return true;
  } catch (e) { toast('No connection. Try again.'); return false; }
  finally { U.busy = false; }
}

// same screen: the app answers for the guessed player (it knows both faces) and reveals at the end
function afterLocal() {
  const st = S.play.state;
  for (let k = 0; k < 4; k++) {
    if (st.phase === 'verdict') {
      const who = other(st.pending.by);
      S.play.state = game.apply(S.play.state, who, { t: 'verdict', ok: S.play.secrets[who].face === st.pending.face }, Math.random);
    } else if (S.play.state.phase === 'reveal') {
      for (const i of game.toAct(S.play.state)) S.play.state = game.apply(S.play.state, i, { t: 'reveal', face: S.play.secrets[i].face, salt: S.play.secrets[i].salt }, Math.random);
    } else break;
  }
  const s2 = S.play.state;
  if (s2.phase === 'over') recordOnce('local:' + S.play.id + ':' + s2.round, s2, null);
  if (s2.phase === 'flip') S.play.view = s2.turn;
  if (s2.phase === 'answer') S.play.view = s2.turn;
}

function recordOnce(key, pub, mySeat) {
  if (!PF || U.lastRec === key || lsGet('mystery-face:rec') === key) return;
  U.lastRec = key; lsSet('mystery-face:rec', key);
  const custom = !!pub.custom;
  if (mySeat === null) { PF.recordResult({ mode: 'friends', won: null, extra: { custom, n: pub.board.length } }); return; }
  if (pub.reason === 'left' && pub.gone === mySeat) return;
  const asked = pub.log.filter((e) => e.by === mySeat && !('guess' in e)).length;
  const r = PF.recordResult({ mode: 'online', won: pub.winner === mySeat, extra: { asked, custom, n: pub.board.length } });
  if (r && pub.winner === mySeat) FX.celebrate({ kind: 'win', colors: ['#f0b354', '#6ea8fe', '#4ade80'] });
  else FX.celebrate({ kind: 'lose' });
}

// ------------------------------------------------------------------ starting games
function newLocal() {
  const src = sourcePool();
  if (src.ids.length < 2) return toast(src.set ? 'Add at least 2 people to this set.' : 'No faces match. Pick other kinds.');
  const custom = src.set ? { title: src.set.title, people: src.set.people } : src.mix || null;
  const opts = { pool: src.ids, n: S.n, first: Math.random() < 0.5 ? 0 : 1, custom: !!src.set, meta: src.set ? null : FC.metaFor(src.ids, src.mix), avoid: src.set ? [] : dunnoList() };
  const st = game.setup(2, opts, Math.random);
  S.play = { kind: 'local', id: Date.now().toString(36), state: st, custom, secrets: [null, null], flips: [{}, {}], view: st.first, pick: null };
  FC.useCustom(custom);
  U.marks.clear(); U.pickSel = -1; U.guessing = false;
  save(); FX.play('shuffle'); renderAll();
}
function quitLocal() { S.play = null; FC.useCustom(null); save(); renderAll(); }

async function ensureOnline() {
  if (U.online) return U.online;
  if (navigator.onLine === false) throw new Error('offline');
  if (ACCT.wasSignedIn() || ACCT.loaded()) { try { await ACCT.load(); } catch (e) {} }  // the saved login first, so the room uses the account's uid
  const mod = await import(ONLINE_JS);
  const o = mod.createOnline({ game, gameId: 'mystery-face', botDelayMs: 700 });
  o.on('change', onSnap);
  o.on('error', (m) => toast(m));
  U.online = o;
  return o;
}
const OFFLINE_MSG = 'Online play needs the internet. Same screen works offline.';

async function createRoom() {
  if (U.busy) return;
  const name = ($('#oname')?.value || S.name || (PF && PF.name) || '').trim();
  if (!name) { toast('Type your name first'); $('#oname')?.focus(); return; }
  S.name = name.slice(0, 20); save();
  if (PF && !PF.name) PF.setName(S.name);
  const src = sourcePool();
  if (src.ids.length < 2) return toast(src.set ? 'Add at least 2 people to this set.' : 'No faces match. Pick other kinds.');
  // each player's don't-knows reach the host as a quiet swap when the round starts (autoAvoid)
  let options = { pool: src.ids, n: S.n, timer: S.timer, first: Math.random() < 0.5 ? 0 : 1, turnTimeoutSec: 0, custom: null, title: src.title, meta: src.set ? null : FC.metaFor(src.ids, src.mix) };
  if (src.set) {
    // only the faces this board needs travel with the room (the room doc must stay under 1 MiB)
    const ppl = src.set.people.slice().sort(() => Math.random() - 0.5).slice(0, S.n);
    options.custom = { title: src.set.title, people: ppl.map((p, i) => ({ id: p.id, name: FC.displayNames(src.set.people)[src.set.people.indexOf(p)] === p.name ? p.name : (p.name || FC.displayNames(src.set.people)[src.set.people.indexOf(p)]), img: p.img || null })) };
    options.pool = options.custom.people.map((p) => 'c/' + p.id);
    options.custom_ = true;
    if (JSON.stringify(options).length > 700000) return toast('This set is too big to share. Use fewer photos.');
  }
  // Mixed stars + the host's own people (the guest's aren't shared before the game starts)
  if (src.mix) {
    options.mixCustom = src.mix;
    if (JSON.stringify(options).length > 700000) return toast('Your people are too big to share. Use fewer photos.');
  }
  options = Object.assign(options, { custom: options.custom, n: S.n });
  U.busy = true;
  let r;
  try { const o = await ensureOnline(); toast('Making a room…'); r = await o.createRoom({ name: S.name, seats: ['human', 'empty'], options: Object.assign({}, options, { custom: options.custom }) }); }
  catch (e) { r = { ok: false, message: e.message === 'offline' ? OFFLINE_MSG : 'No connection. Try again.' }; }
  finally { U.busy = false; }
  if (!r.ok) return toast(r.message);
  history.replaceState(null, '', location.pathname);
  renderAll();
}
async function joinRoom(codeIn) {
  if (U.busy) return;
  const name = ($('#oname')?.value || S.name || (PF && PF.name) || '').trim();
  const code = String(codeIn || $('#ocode')?.value || '').trim().toUpperCase();
  if (!name) { toast('Type your name first'); $('#oname')?.focus(); return; }
  if (!code) { toast('Type the room code'); $('#ocode')?.focus(); return; }
  S.name = name.slice(0, 20); save();
  if (PF && !PF.name) PF.setName(S.name);
  U.busy = true;
  let r;
  try { const o = await ensureOnline(); toast('Joining…'); r = await o.joinRoom(code, S.name); }
  catch (e) { r = { ok: false, message: e.message === 'offline' ? OFFLINE_MSG : 'No connection. Try again.' }; }
  finally { U.busy = false; }
  if (!r.ok) return toast(r.message);
  U.joinCode = '';
  history.replaceState(null, '', location.pathname);
  renderAll();
}
async function leaveRoom() {
  closeSheet();
  if (!U.online) return;
  const g = G();
  if (g && g.kind === 'online' && g.pub && g.pub.phase !== 'over' && g.toAct.includes(g.me) && !game.isOver(g.pub)) await U.online.act({ t: 'quit' }).catch(() => {});
  await U.online.leave();
  U.snap = null; FC.useCustom(null);
  renderAll();
}

// ------------------------------------------------------------------ online snapshots: sounds + automatic answers
let prevPub = null;
function onSnap(snap) {
  const was = U.snap;
  U.snap = snap;
  if (snap.status === 'closed' || snap.status === 'left') { U.snap = null; prevPub = null; FC.useCustom(null); toast(snap.status === 'closed' ? 'Room closed' : 'You left the room'); renderAll(); return; }
  FC.useCustom(snap.options && (snap.options.custom || snap.options.mixCustom) || null);
  const pub = snap.pub;
  if (pub) {
    FC.ensureFor(pub.board).then(() => { if (U.snap === snap) renderPlay(); });
    sounds(prevPub, pub, snap.mySeat);
    if (prevPub && (prevPub.round !== pub.round)) { U.marks.clear(); U.pickSel = -1; U.guessing = false; }
    auto(snap);
    autoAvoid(snap);
    if (pub.phase === 'over' && pub.winner !== null) recordOnce('online:' + snap.code + ':' + pub.round, pub, snap.mySeat);
    if (game.isOver(pub) && pub.gone !== snap.mySeat && (!prevPub || !game.isOver(prevPub))) toast(`${(snap.seats[pub.gone] || {}).name ? 'Your friend' : 'Your friend'} left the game.`);
  }
  if (!was || was.status !== snap.status) U.marks.clear();
  if (pub && prevPub && (pub.undo || 0) < (prevPub.undo || 0)) { U.lastAuto = ''; U.guessing = false; }   // someone pressed Back
  prevPub = pub || null;
  renderAll();
}
// Online: once a round, tell the host this player's remembered don't-knows; any already on the board
// are swapped out quietly (no highlight), and none of them is dealt again this game.
function autoAvoid(snap) {
  const pub = snap.pub, me = snap.mySeat;
  if (!pub || pub.phase !== 'dunno' || pub.custom || pub.ready[me] || !(snap.toAct || []).includes(me)) return;
  const key = snap.code + ':' + pub.round;
  if (U.lastAvoid === key) return;
  const list = dunnoList();
  if (!list.length) return;
  U.lastAvoid = key;
  const mine = new Set(list);
  const idx = pub.board.map((id, i) => (mine.has(id) ? i : -1)).filter((i) => i >= 0);
  idx.forEach((i) => U.marks.delete(i));
  U.online.act({ t: 'swap', idx, avoid: list, quiet: true }).catch(() => { U.lastAvoid = ''; });
}
// Our phone answers "was that my face?" and shows its face at the end, from the secret saved at the pick.
function auto(snap) {
  const pub = snap.pub, me = snap.mySeat;
  if (!pub || !(snap.toAct || []).includes(me)) return;
  const key = pub.round + ':' + pub.phase + ':' + pub.log.length;
  if (U.lastAuto === key) return;
  const sec = lsGet(secKey(snap.code, pub.round));
  if (pub.phase === 'verdict' && sec) { U.lastAuto = key; U.online.act({ t: 'verdict', ok: pub.pending.face === sec.face }); }
  if (pub.phase === 'reveal') { U.lastAuto = key; U.online.act({ t: 'reveal', face: sec ? sec.face : '', salt: sec ? sec.salt : '' }); }
}
function sounds(a, b, me) {
  if (!a || a.round !== b.round) { if (a && b.phase === 'dunno') FX.play('shuffle'); return; }
  if (b.log.length > a.log.length) {
    const e = b.log[b.log.length - 1];
    if ('guess' in e) FX.play(e.ok ? 'ding' : 'error');
    else FX.play('pop', { vol: e.by === me ? 0.6 : 0.9 });
  } else if (b.log.length && a.log.length === b.log.length) {
    const e = b.log[b.log.length - 1], p = a.log[a.log.length - 1];
    if (e && p && e.a && !p.a) FX.play(e.a === 'yes' ? 'ding' : e.a === 'no' ? 'place' : 'tick');
  }
  if (b.phase === 'verdict' && a.phase !== 'verdict') FX.play('drumroll');
  const myTurnNow = (b.phase === 'ask' && b.turn === me) || (b.phase === 'answer' && b.turn !== me);
  const myTurnBefore = (a.phase === 'ask' && a.turn === me) || (a.phase === 'answer' && a.turn !== me);
  if (myTurnNow && !myTurnBefore) FX.play('turn');
}

// ------------------------------------------------------------------ rendering
function renderAll() {
  document.querySelectorAll('.tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === S.tab));
  document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('on', t.id === 'tab-' + S.tab));
  if (S.tab === 'play') renderPlay();
  if (S.tab === 'people') PPL.renderPeople($('#tab-people'));
  if (S.tab === 'settings') renderSettings();
  renderTop();
}
function renderTop() {
  const g = G();
  const el = $('#topInfo');
  const showGame = g && g.pub && g.pub.score && !(g.kind === 'local' && U.home);
  const score = showGame ? `<span class="score" title="Score">${esc(g.names[0])} <b>${g.pub.score[0]}</b>–<b>${g.pub.score[1]}</b> ${esc(g.names[1])}</span>` : '';
  // Back + Home (Tim, 2026-11-06): on every in-game screen, top right
  const inRoomNow = U.online && U.snap && U.snap.status && U.snap.status !== 'none';
  const nav = (showGame || inRoomNow) && S.tab === 'play' ? `<span class="navbtns"><button class="btn small icon" data-act="back" aria-label="Back: undo the last action" ${canBack(g) ? '' : 'disabled'}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 14L4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 010 11H11"/></svg></button><button class="btn small icon" data-act="home" aria-label="Home"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M3 11l9-7 9 7"/><path d="M5 10v10h5v-6h4v6h5V10"/></svg></button></span>` : '';
  el.innerHTML = score + nav;
}

// ---- Back: undo the previous action, whatever it was
const LOCAL_SNAP_ACTS = new Set(['swap', 'ready', 'pickstart', 'random', 'lockin', 'asked', 'answer', 'done', 'again']);
function snapStr() {
  const st = S.play.state;
  const { pool, hist, spareIds, ...rest } = st;
  if (st.phase === 'dunno') rest.spareIds = spareIds;
  return JSON.stringify({ state: rest, secrets: S.play.secrets, flips: S.play.flips, pick: S.play.pick ?? null, view: S.play.view, marks: [...U.marks], pickSel: U.pickSel });
}
function localSnap() {
  if (!S.play || S.play.kind !== 'local') return;
  const snap = snapStr();
  const h = S.play.hist || (S.play.hist = []);
  if (h[h.length - 1] !== snap) h.push(snap);
  if (h.length > 60) h.splice(0, h.length - 60);
}
const flipKey2 = (p) => p.round + ':' + p.phase + ':' + p.log.length + ':' + p.turn;
function canBack(g) {
  if (!g || !g.pub) return false;
  if (U.guessing) return true;
  if (g.kind === 'local') return !!(S.play.hist && S.play.hist.length);
  const p = g.pub;
  if (game.isOver(p)) return false;
  const top = U.oflips[U.oflips.length - 1];
  if (top && top.key === flipKey2(p)) return true;
  if ((p.phase === 'dunno' && U.marks.size) || (p.phase === 'pick' && U.pickSel >= 0)) return true;
  return g.toAct.includes(g.me) && p.undo > 0;
}
async function goBack(g) {
  if (!g) return;
  if (U.guessing) { U.guessing = false; return renderAll(); }
  if (g.kind === 'local') {
    const h = S.play.hist || [];
    const now = snapStr();
    while (h.length && h[h.length - 1] === now) h.pop();   // a tap that changed nothing
    if (!h.length) return;
    const o = JSON.parse(h.pop());
    const cur = S.play.state;
    S.play.state = Object.assign(o.state, { pool: cur.pool, spareIds: o.state.spareIds || cur.spareIds });
    Object.assign(S.play, { secrets: o.secrets, flips: o.flips, pick: o.pick, view: o.view });
    U.marks = new Set(o.marks); U.pickSel = o.pickSel;
    FX.play('tap'); save(); renderAll(); return;
  }
  const p = g.pub;
  const top = U.oflips[U.oflips.length - 1];
  if (top && top.key === flipKey2(p)) { U.oflips.pop(); setFlips(g, g.me, top.flips); FX.play('cardFlip'); return renderAll(); }
  if (p.phase === 'dunno' && U.marks.size) { U.marks.delete([...U.marks].pop()); return renderAll(); }
  if (p.phase === 'pick' && U.pickSel >= 0) { U.pickSel = -1; return renderAll(); }
  if (await send(g.me, { t: 'undo' })) FX.play('tap');
}

// ---- Play: home (no game)
function renderHome(el) {
  const idx = FC.deckIndex();
  const sets = PPL.allSets();
  const srcKey = S.src.kind === 'set' ? 'set:' + S.src.id : 'deck:' + (S.src.decks || []).join('+');
  const allDecks = idx.filter((d) => FC.deck(d.id)).map((d) => d.id);
  const cards = [];
  for (const d of idx) {
    const dk = FC.deck(d.id);
    if (!dk) continue;
    const kinds = FC.tagCounts([d.id]).slice(0, 3).map((t) => KIT.tagLabel(t.tag)).join(', ');
    cards.push(`<button class="src${srcKey === 'deck:' + d.id ? ' on' : ''}" data-act="src" data-k="deck" data-v="${esc(d.id)}">${deckMosaic(dk.people.slice(0, 4).map((p) => ({ name: p.name, img: p.img, from: p.from })))}<b>${esc(dk.title)}</b><span>${dk.people.length} · ${esc(kinds)}</span></button>`);
  }
  if (allDecks.length > 1) cards.push(`<button class="src${srcKey === 'deck:' + allDecks.join('+') ? ' on' : ''}" data-act="src" data-k="mix">${deckMosaic(allDecks.slice(0, 4).map((d) => { const p = FC.deck(d).people[0]; return { name: p.name, img: p.img, from: p.from }; }))}<b>Mix</b><span>All decks</span></button>`);
  for (const s of sets) cards.push(`<button class="src${srcKey === 'set:' + s.id ? ' on' : ''}" data-act="src" data-k="set" data-v="${esc(s.id)}">${deckMosaic(s.people.slice(0, 4).map((p, i) => ({ name: FC.displayNames(s.people)[i], img: p.img })))}<b>${esc(s.title)}</b><span>${s.people.length} · yours</span></button>`);
  cards.push(`<button class="src add" data-act="newset"><span class="mosaic plus">+</span><b>Your people</b><span>Photos or names</span></button>`);
  const tags = S.src.kind === 'deck' ? FC.tagCounts(S.src.decks || []) : [];
  const pool = sourcePool();
  const n = Math.min(S.n, pool.ids.length);
  const online = S.mode === 'online';
  const name = S.name || (PF && PF.name) || '';
  el.innerHTML = `<div class="pane home">
    ${S.play && S.play.kind === 'local' ? '<div class="row"><button class="btn main grow" data-act="resume">Resume same-screen game</button></div>' : ''}
    <div class="seg modes"><button data-act="mode" data-v="online" class="${online ? 'on' : ''}">Online with a friend</button><button data-act="mode" data-v="local" class="${online ? '' : 'on'}">Same screen</button></div>
    <div class="lbl">Faces</div>
    <div class="srcs">${DECKS_READY ? cards.join('') : '<span class="muted small">Loading faces…</span>'}</div>
    ${tags.length > 1 ? `<div class="chips tags">${tags.slice(0, 14).map((t) => `<button class="chip${(S.src.tags || []).includes(t.tag) ? ' on' : ''}" data-act="tag" data-v="${esc(t.tag)}">${esc(KIT.tagLabel(t.tag))} <span>${t.n}</span></button>`).join('')}</div>` : ''}
    <div class="row sizes"><span class="lbl inl">Board</span><div class="seg">${[16, 24, 30].map((v) => `<button data-act="size" data-v="${v}" class="${S.n === v ? 'on' : ''}">${v}</button>`).join('')}</div>
      <span class="muted small grow right">${DECKS_READY ? (pool.ids.length < S.n ? `${pool.ids.length} faces` : `${n} of ${pool.ids.length}`) : ''}</span></div>
    ${online ? `<div class="online-box">
        <label class="field"><span class="small muted">Your name</span><input id="oname" maxlength="20" value="${esc(name)}" autocomplete="nickname" enterkeyhint="done"></label>
        <div class="row"><button class="btn main grow" data-act="create" data-coach-avoid>Create room</button></div>
        <div class="row joinrow"><input id="ocode" maxlength="5" placeholder="Code" value="${esc(U.joinCode)}" autocapitalize="characters" aria-label="Room code"><button class="btn${U.joinCode ? ' main' : ''}" data-act="join">Join</button></div>
      </div>`
      : `<div class="row"><button class="btn main grow big" data-act="startlocal" data-coach-avoid>Start</button></div>
         <p class="muted small center">Two players, one screen. Ask and answer out loud.</p>`}
  </div>`;
}
function deckMosaic(list) {
  return `<span class="mosaic">${list.slice(0, 4).map((f) => `<span class="mt">${FC.picHTML(f)}</span>`).join('')}${'<span class="mt empty"></span>'.repeat(Math.max(0, 4 - list.length))}</span>`;
}

// ---- Play: online lobby
function renderLobby(el, sn) {
  if (!sn || sn.status === 'joining' || sn.status === 'none') {
    el.innerHTML = `<div class="pane center-pane"><p><b>${sn && sn.askingHost ? 'Asking the host to let you in…' : 'Connecting…'}</b></p><button class="btn" data-act="leave">Cancel</button></div>`;
    return;
  }
  const friend = sn.seats[1 - sn.mySeat] || {};
  const here = friend.kind === 'human';
  const o = sn.options || {};
  el.innerHTML = `<div class="pane center-pane lobby">
    <span class="muted small">Room code</span>
    <div class="big-code">${esc(sn.code)}</div>
    <div class="row center"><button class="btn" data-act="sharelink">Share link</button></div>
    <div class="plates"><span class="plate"><i class="dot on"></i>${esc(sn.seats[sn.mySeat].name)} (you)</span><span class="plate${here ? '' : ' wait'}"><i class="dot${here && friend.online ? ' on' : ''}"></i>${here ? esc(friend.name) : 'Waiting for a friend…'}</span></div>
    <p class="muted small">${esc(o.custom ? o.custom.title : o.title || '')} · ${Math.min(o.n || 24, (o.pool || []).length)} faces${o.timer ? ` · ${o.timer}s turns` : ''}</p>
    <div class="row center">${sn.isHost ? `<button class="btn main" data-act="ostart" ${here ? '' : 'disabled'}>Start</button>` : '<span class="muted">Waiting for the host to start…</span>'}<button class="btn" data-act="leave">Leave</button></div>
  </div>`;
}

// ---- Play: the game
function renderPlay() {
  const el = $('#tab-play');
  if (S.tab !== 'play') return;
  const sn = U.snap;
  if (U.online && sn && sn.status !== 'playing' && sn.status !== 'finished') return renderLobby(el, sn);
  const g = G();
  if (!g || (g.kind === 'local' && U.home)) return renderHome(el);
  if (g.kind === 'online' && !g.pub) return renderLobby(el, sn);
  renderGame(el, g);
}

const ANS = { yes: 'Yes', no: 'No', unsure: 'Not sure' };
function lastQA(pub) {
  const e = [...pub.log].reverse().find((x) => !('guess' in x));
  return e;
}

/** What the page asks of whom right now: { who (seat acting), text, dock (html), board: seat whose board to show } */
function stepFor(g) {
  const p = g.pub, N = g.names;
  const L = g.kind === 'local';
  const meAct = (seat) => (L ? g.toAct.includes(seat) : g.toAct.includes(g.me) && seat === g.me);
  const nm = (s) => (L ? N[s] : s === g.me ? 'You' : N[s]);
  const opp = L ? null : other(g.me);
  const q = lastQA(p);
  const qtxt = q ? (q.q ? `“${esc(q.q)}”` : 'the question') : '';
  if (game.isOver(p) || p.phase === 'over') return { text: '', dock: '' };
  switch (p.phase) {
    case 'dunno': {
      const mine = L ? true : !p.ready[g.me];
      const nMarked = U.marks.size;
      const waitTxt = L ? '' : p.ready[opp] ? `${esc(N[opp])} is ready.` : `${esc(N[opp])} is looking…`;
      const fresh = mine && (p.fresh || []).length;
      return {
        text: mine ? (fresh ? `<b>New faces are lit up.</b> Don't know one? Tap it, then Swap.` : `<b>Don't know someone?</b> Tap them, then Swap.`) : `Waiting for ${esc(N[opp])}…`,
        sub: mine ? `${p.spare} spare face${p.spare === 1 ? '' : 's'} left. ${waitTxt}` : '',
        dock: mine ? `<button class="btn" data-act="swap" ${nMarked && p.spare ? '' : 'disabled'}>${nMarked ? `Swap ${nMarked} marked` : 'Swap marked'}</button><button class="btn main" data-act="ready">${L ? 'We know them all' : 'Ready'}</button>` : '',
      };
    }
    case 'pick': {
      if (L) {
        const who = S.play.pick;
        if (who === null || who === undefined) {
          const next = [0, 1].find((i) => !p.commits[i]);
          return { cover: { title: `${N[other(next)]}, look away`, text: `${N[next]} picks a mystery face.`, btn: `I'm ${N[next]}`, act: 'pickstart', v: next } };
        }
        return { text: `<b>${N[who]}:</b> tap your mystery face`, dock: `<button class="btn" data-act="random">Random</button><button class="btn main" data-act="lockin" ${U.pickSel >= 0 ? '' : 'disabled'}>Lock in${U.pickSel >= 0 ? ': ' + esc(FC.face(p.board[U.pickSel]).name) : ''}</button>`, picking: true };
      }
      if (p.commits[g.me]) return { text: `Locked in. Waiting for ${esc(N[opp])} to pick…` };
      return { text: '<b>Pick your mystery face</b>', sub: `${esc(N[opp])} has to guess it.`, dock: `<button class="btn" data-act="random">Random</button><button class="btn main" data-act="lockin" ${U.pickSel >= 0 ? '' : 'disabled'}>Lock in${U.pickSel >= 0 ? ': ' + esc(FC.face(p.board[U.pickSel]).name) : ''}</button>`, picking: true };
    }
    case 'ask': {
      const t = p.turn;
      if (U.guessing && meAct(t)) return guessStep(g, t);
      if (L) return { text: `<b>${N[t]}:</b> ask a yes/no question out loud`, dock: `<button class="btn" data-act="guess">Guess</button><button class="btn main" data-act="asked">Asked</button>`, board: t };
      if (t !== g.me) return { text: `${esc(N[t])} is asking…`, sub: q && q.a ? `Last: ${esc(nm(q.by))} asked ${qtxt}: ${ANS[q.a]}` : '' };
      return { text: '<b>Your turn:</b> ask a yes/no question', ask: true, dock: '' };
    }
    case 'answer': {
      const t = p.turn, ans = other(t);
      if (L) return { text: `<b>${N[ans]}:</b> answer out loud`, dock: `${answerBtns()}`, board: ans, peekSeat: ans };
      if (ans !== g.me) return { text: `You asked ${qtxt}`, sub: `Waiting for ${esc(N[ans])}'s answer…` };
      return { text: `<b>${esc(N[t])} asks:</b> ${qtxt}`, dock: answerBtns(), answering: true };
    }
    case 'flip': {
      const t = p.turn;
      const left = leftCount(g, t);
      if (U.guessing && meAct(t)) return guessStep(g, t);
      const said = q && q.a ? `${L ? N[other(t)] : esc(N[other(t)])} said <b>${ANS[q.a]}</b>${q.q ? ` to ${qtxt}` : ''}.` : '';
      if (L) return { text: `<b>${N[t]}:</b> flip faces down, then Next`, sub: said, dock: `<button class="btn main" data-act="done">Next · ${left} left</button>`, board: t, flipping: true };
      if (t !== g.me) return { text: `${esc(N[t])} is flipping faces…`, sub: q ? `You said ${ANS[q.a] || ''} to ${qtxt}` : '' };
      return { text: said || 'Flip faces down', sub: 'Tap faces it can\'t be, then Next.', dock: `<button class="btn main" data-act="done">Next · ${left} left</button>`, flipping: true };
    }
    case 'verdict': {
      const by = p.pending.by;
      const nmF = esc(FC.face(p.pending.face).name);
      if (!L && by !== g.me && !secretOf(g, g.me)) return { text: `${esc(N[by])} guesses <b>${nmF}</b>. Is that your face?`, dock: `<button class="btn" data-act="verdict" data-v="0">No</button><button class="btn main" data-act="verdict" data-v="1">Yes</button>` };
      return { text: `${by === g.me ? 'You guess' : esc(N[by]) + ' guesses'} <b>${nmF}</b>…`, sub: 'Checking…' };
    }
    case 'reveal': return { text: 'Showing both faces…' };
  }
  return { text: '' };
}
function guessStep(g, t) {
  const p = g.pub;
  return { text: '<b>Guess:</b> tap who you think it is', sub: 'Wrong: they get a red X and the turn passes.', dock: `<button class="btn" data-act="guessx">Cancel</button>`, guessing: true, board: t };
}
const answerBtns = () => `<button class="btn ans" data-act="answer" data-v="yes">Yes</button><button class="btn ans" data-act="answer" data-v="no">No</button><button class="btn ans" data-act="answer" data-v="unsure">Not sure</button>`;
function leftCount(g, seat) {
  const f = flipsOf(g, seat), b = g.pub.board, x = (g.pub.xed && g.pub.xed[seat]) || [];
  return b.filter((id, i) => f[i] === undefined && !x.includes(id)).length;
}

function renderGame(el, g) {
  const p = g.pub;
  FC.useCustom(g.custom);
  const st = stepFor(g);
  const L = g.kind === 'local';
  if (L && st.board !== undefined) S.play.view = st.board;
  const over = p.phase === 'over' || game.isOver(p);
  // which boards: online = mine; local = both (side by side on a laptop, one at a time on a phone)
  const playing = !['dunno', 'pick'].includes(p.phase);
  const seats = L ? [0, 1] : [g.me];
  const view = L ? (S.play.view ?? 0) : g.me;
  const timer = timerHTML(g);
  const opp = L ? null : other(g.me);
  const oppLine = !L && playing ? `<span class="oppline"><i class="dot${g.snap.seats[opp] && g.snap.seats[opp].online ? ' on' : ''}"></i>${esc(g.names[opp])} · ${p.left[opp]} left</span>` : '';
  const away = !L && g.snap.seats[opp] && g.snap.seats[opp].kind === 'human' && !g.snap.seats[opp].online && g.toAct.includes(opp);
  el.innerHTML = `<div class="game ${L ? 'local' : 'online'} ph-${p.phase}${over ? ' is-over' : ''}">
    <div class="prompt">
      ${!L && playing || (!L && p.phase === 'pick' && p.commits[g.me]) ? myFaceChip(g, g.me) : ''}
      <div class="ptext"><div class="pmain">${st.text || ''}</div>${st.sub || away ? `<div class="psub">${away ? `<b class="warn">${esc(g.names[opp])} seems away.</b> ` : ''}${st.sub || ''}</div>` : ''}</div>
      <div class="pside">${timer}${oppLine}<button class="btn small icon" data-act="log" aria-label="Question log"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M5 5h14M5 10h14M5 15h9M5 20h6"/></svg><span class="lc">${p.log.length}</span></button><button class="btn small icon" data-act="menu" aria-label="Game menu"><svg viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg></button></div>
    </div>
    ${L && playing ? `<div class="seg pswitch">${seats.map((s) => `<button data-act="view" data-v="${s}" class="${view === s ? 'on' : ''}${(st.board === s) ? ' act' : ''}">${g.names[s]} · ${leftCount(g, s)} left</button>`).join('')}</div>` : ''}
    <div class="boards${L && playing ? ' two' : ''}">${(L && playing ? seats : [L ? view : g.me]).map((s) => boardHTML(g, s, st, L && playing && s !== view)).join('')}</div>
    ${over ? '' : `<div class="dock${st.ask ? ' askdock' : ''}${st.dock || st.ask ? '' : ' quiet'}">${st.ask ? askDock(g) : st.dock || ''}</div>`}
    ${st.cover ? `<div class="cover"><div><svg viewBox="0 0 48 48" width="56" height="56" aria-hidden="true"><path d="M4 24s7-12 20-12 20 12 20 12-7 12-20 12S4 24 4 24z" fill="none" stroke="currentColor" stroke-width="2.5"/><circle cx="24" cy="24" r="6" fill="currentColor"/><path d="M8 40L40 8" stroke="currentColor" stroke-width="3"/></svg><h2>${esc(st.cover.title)}</h2><p>${esc(st.cover.text)}</p><button class="btn main big" data-act="${st.cover.act}" data-v="${st.cover.v}">${esc(st.cover.btn)}</button></div></div>` : ''}
    ${over ? overHTML(g) : ''}
  </div>`;
  requestAnimationFrame(fitBoards);
}

function myFaceChip(g, seat) {
  const sec = secretOf(g, seat);
  if (!sec) return `<button class="mychip none" data-act="nosecret"><span class="nt" style="--h:220">?</span><em>Your face</em></button>`;
  const f = FC.face(sec.face);
  return `<button class="mychip" data-act="zoomme" aria-label="Your face: ${esc(f.name)}"><span class="ph">${FC.picHTML(f)}</span><em>${esc(f.name)}</em></button>`;
}

function boardHTML(g, seat, st, dim) {
  const p = g.pub, L = g.kind === 'local';
  const playing = !['dunno', 'pick'].includes(p.phase);
  const flips = playing ? flipsOf(g, seat) : {};
  const sec = L ? secretOf(g, seat) : null;
  const guessing = st.guessing && (!L || st.board === seat);
  // after a swap: the new faces lit up, the rest dimmed, until Ready
  const fresh = p.phase === 'dunno' && (L || !p.ready[g.me]) && (p.fresh || []).length ? new Set(p.fresh) : null;
  const tiles = p.board.map((id, i) => {
    const f = FC.face(id);
    const down = flips[i] !== undefined;
    const cls = ['face'];
    if (playing && p.xed && p.xed[seat] && p.xed[seat].includes(id)) cls.push('wrong');
    else if (down) cls.push('down');
    if (p.phase === 'dunno' && U.marks.has(i)) cls.push('marked');
    if (fresh) cls.push(fresh.has(i) ? 'fresh' : 'stale');
    if (st.picking && U.pickSel === i) cls.push('sel');
    if (guessing && U.guessSel === i) cls.push('sel');
    if (!L && p.phase !== 'dunno' && lsGet(secKey(g.snap.code, p.round))?.face === id) cls.push('mine');
    return `<button class="${cls.join(' ')}" data-act="tile" data-seat="${seat}" data-i="${i}" aria-label="${esc(f.name)}${down ? ' (flipped down)' : ''}" aria-pressed="${down}">
      <span class="ph">${FC.picHTML(f)}<i class="xmark" aria-hidden="true"></i></span>${S.names ? `<span class="nm">${esc(f.name)}</span>` : ''}</button>`;
  }).join('');
  const peek = L && playing ? `<button class="peek" data-act="peek" data-seat="${seat}" aria-label="${esc(g.names[seat])}'s face: press and hold to peek"><span class="ph">${sec ? FC.picHTML(FC.face(sec.face)) : ''}</span><span class="pk-cover"><b>?</b></span><em>${esc(g.names[seat])}'s face <span>hold</span></em></button>` : '';
  return `<div class="boardbox${dim ? ' other' : ''}" data-seat="${seat}">${L && playing ? `<div class="bhead"><b>${esc(g.names[seat])}</b>${peek}</div>` : ''}<div class="board${S.names ? ' names' : ''}" style="--n:${p.board.length}">${tiles}</div></div>`;
}

function askDock(g) {
  const p = g.pub;
  const tags = FC.tagCounts([...new Set(p.board.filter((x) => !x.startsWith('c/')).map((x) => x.split('/')[0]))]);
  const onBoard = new Set();
  for (const id of p.board) for (const t of FC.face(id).tags) onBoard.add(t);
  const tagChips = tags.filter((t) => onBoard.has(t.tag)).slice(0, 8).map((t) => `<button class="chip" data-act="chip" data-tag="${esc(t.tag)}">${esc(KIT.tagQuestion(t.tag))}</button>`);
  const looks = p.custom && g.custom && g.custom.people.every((x) => !x.img) ? [] : KIT.LOOKS;
  return `<div class="askrow"><input id="qIn" maxlength="120" placeholder="Type a yes/no question" autocomplete="off" enterkeyhint="send" aria-label="Your question"><button class="btn main" data-act="ask">Ask</button></div>
    <div class="chips qchips">${tagChips.join('')}${looks.map((l) => `<button class="chip" data-act="chip">${esc(l)}</button>`).join('')}</div>
    <div class="row guessrow"><button class="btn small" data-act="guess">Guess instead</button></div>`;
}

// advisory turn timer (Settings): counts the current step on every phone; nothing happens at 0
function timerHTML(g) {
  const secs = g.kind === 'local' ? S.timer : (g.snap.options && g.snap.options.timer) || 0;
  const p = g.pub;
  if (!secs || !['ask', 'answer', 'flip'].includes(p.phase)) return '';
  const key = p.round + p.phase + p.log.length + p.turn;
  if (U.timerKey !== key) { U.timerKey = key; U.timerAt = Date.now(); U.timerRang = false; }
  const left = Math.max(0, secs - Math.floor((Date.now() - U.timerAt) / 1000));
  return `<span class="timer${left <= 10 ? ' low' : ''}" data-secs="${secs}">${left ? left + 's' : 'Time!'}</span>`;
}
setInterval(() => {
  const t = $('.timer'); if (!t) return;
  const secs = +t.dataset.secs;
  const left = Math.max(0, secs - Math.floor((Date.now() - U.timerAt) / 1000));
  t.textContent = left ? left + 's' : 'Time!';
  t.classList.toggle('low', left <= 10);
  if (!left && !U.timerRang) { U.timerRang = true; FX.play('alarm'); }
}, 1000);

function overHTML(g) {
  const p = g.pub, L = g.kind === 'local';
  const N = g.names;
  const faces = [0, 1].map((i) => (p.reveals && p.reveals[i] && p.reveals[i].face) || (L && S.play.secrets[i] ? S.play.secrets[i].face : null));
  const review = checkReview(p.log, faces, (id) => FC.face(id).tags);
  const flagFor = new Map(review.map((r) => [r.i, r.expect]));
  const vflags = new Map((p.flags || []).filter((f) => f.kind === 'verdict').map((f) => [f.i, f]));
  const lock = (p.flags || []).filter((f) => f.kind === 'lock');
  let head;
  if (p.reason === 'left') head = p.gone === g.me ? 'You left' : `${esc(N[p.gone])} left the game`;
  else if (L) head = `${N[p.winner]} wins!`;
  else head = p.winner === g.me ? 'You win!' : `${esc(N[p.winner])} wins`;
  const why = p.reason === 'guessed' ? `${L ? N[p.winner] : p.winner === g.me ? 'You' : esc(N[p.winner])} named the face.` : p.reason === 'wrong' ? `${L ? N[other(p.winner)] : other(p.winner) === g.me ? 'Your' : esc(N[other(p.winner)]) + "'s"}${L ? "'s" : ''} guess was wrong.` : '';
  // flips that hid the other player's face: "you flipped them down after question 3"
  const oops = [];
  for (const s of (L ? [0, 1] : [g.me])) {
    const fl = flipsOf(g, s); const fi = faces[other(s)] ? p.board.indexOf(faces[other(s)]) : -1;
    if (fi >= 0 && fl[fi] !== undefined) oops.push(`${L ? N[s] : 'You'} had flipped ${esc(FC.face(faces[other(s)]).name)} down${fl[fi] ? ` after question ${fl[fi]}` : ''}.`);
  }
  const card = (i) => {
    const f = faces[i] ? FC.face(faces[i]) : null;
    const r = p.reveals && p.reveals[i];
    const badge = r ? (r.ok ? '<span class="ok">✓ matches the lock</span>' : r.face ? '<span class="bad">✗ not the face locked in</span>' : '<span class="bad">not shown</span>') : '';
    return `<div class="rv"><span class="ph">${f ? FC.picHTML(f) : '<span class="nt" style="--h:220">?</span>'}</span><b>${f ? esc(f.name) : '?'}</b><span class="small muted">${!L && i === g.me ? 'Your face' : esc(N[i]) + "'s face"}</span>${L ? '' : badge}</div>`;
  };
  const rows = p.log.map((e, i) => {
    if ('guess' in e) return `<li class="${vflags.has(i) ? 'flag' : ''}"><b>${esc(N[e.by])}</b> guessed <b>${esc(FC.face(e.guess).name)}</b>: ${e.ok ? 'right' : 'wrong'}${vflags.has(i) ? ' <em>← the faces say otherwise</em>' : ''}</li>`;
    const fl = flagFor.get(i);
    return `<li class="${fl ? 'flag' : ''}"><b>${esc(N[e.by])}</b>: ${e.q ? esc(e.q) : '<i>asked out loud</i>'} <span class="a a-${e.a || 'x'}">${ANS[e.a] || '–'}</span>${fl ? ` <em>← ${esc(FC.face(faces[other(e.by)]).name)} looks like a ${fl === 'yes' ? 'Yes' : 'No'}</em>` : ''}</li>`;
  }).join('');
  const waiting = !L && p.again && p.again[g.me] && !p.again[other(g.me)] && !game.isOver(p);
  const canAgain = !game.isOver(p);
  return `<div class="over"><div class="ocard">
    <h2>${head}</h2>${why ? `<p class="muted">${why}</p>` : ''}
    <div class="reveal">${card(0)}${card(1)}</div>
    ${lock.length ? `<p class="bad small">${lock.map((f) => esc(N[f.seat]) + "'s face doesn't match the one locked in at the start.").join(' ')}</p>` : ''}
    ${oops.length ? `<p class="small muted">${oops.join(' ')}</p>` : ''}
    ${p.log.length ? `<details class="review"${review.length || vflags.size ? ' open' : ''}><summary>All questions (${p.log.length})${review.length || vflags.size ? ` · <b class="warn">${review.length + vflags.size} to check</b>` : ''}</summary><ol class="log">${rows}</ol></details>` : ''}
    <div class="row center">${canAgain ? `<button class="btn main" data-act="again" ${waiting ? 'disabled' : ''}>${waiting ? `Waiting for ${esc(N[other(g.me)])}…` : 'Play again'}</button>` : ''}<button class="btn" data-act="${L ? 'quitlocal' : 'leave'}">${L ? 'New game' : 'Leave'}</button></div>
  </div></div>`;
}

// size the board so the faces are as big as the space allows (no page scroll; 30 may scroll inside)
function fitBoards() {
  document.querySelectorAll('.boardbox').forEach((box) => {
    const b = box.querySelector('.board');
    if (!b) return;
    const n = b.children.length;
    const head = box.querySelector('.bhead');
    const cs = getComputedStyle(box);
    const padX = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight), padY = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
    const W = box.clientWidth - padX, H = box.clientHeight - padY - (head ? head.offsetHeight : 0);
    if (!W || !H) return;
    const gap = W < 500 ? 4 : 6;
    const nameH = S.names ? (W < 500 ? 14 : 17) : 0;
    let best = { s: 0, c: 1 };
    for (let c = 2; c <= Math.min(n, 12); c++) {
      const r = Math.ceil(n / c);
      const sw = (W - gap * (c - 1)) / c;
      const sh = (H - gap * (r - 1)) / r - nameH;
      const s = Math.min(sw, sh);
      if (s > best.s) best = { s, c };
    }
    const min = 46;  // below this, faces get too small: keep them readable and let the board scroll
    let s = best.s, c = best.c;
    if (s < min) { c = Math.max(2, Math.floor((W + gap) / (min + gap))); s = (W - gap * (c - 1)) / c; }
    b.style.setProperty('--cols', c);
    b.style.setProperty('--tile', Math.floor(s) + 'px');
    b.style.setProperty('--gap', gap + 'px');
    b.style.setProperty('--nameh', nameH + 'px');
  });
}
addEventListener('resize', () => requestAnimationFrame(fitBoards));

// ---- Settings
function renderSettings() {
  const el = $('#tab-settings');
  const u = ACCT.user();
  el.innerHTML = `<div class="pane settings">
    <h3>Game</h3>
    <div class="set-row"><span>Names under faces</span><label class="switch"><input type="checkbox" data-set="names" ${S.names ? 'checked' : ''}><span></span></label></div>
    <div class="set-row"><span>Turn timer <button class="q" data-act="help" data-v="timer" aria-label="About the timer">?</button></span><div class="seg">${[0, 60, 90, 120].map((v) => `<button data-act="timer" data-v="${v}" class="${S.timer === v ? 'on' : ''}">${v ? v + 's' : 'Off'}</button>`).join('')}</div></div>
    <div class="row wrap"><button class="btn" data-act="rules">Rules</button>${PF ? `<button class="btn pf-open" data-act="mystats">${PF.avatarSVG(PF.avatar, 20)}My stats</button>` : ''}<button class="btn" data-act="account">${u ? 'Account' : 'Sign in'}</button></div>
    <h3>Sound &amp; effects</h3><div id="fxSet"></div>
    <h3>About</h3>
    <p class="small muted">An original game with the classic ask-and-flip idea. Faces in the decks: <button class="link" data-act="credits">photo credits</button>. Your own people stay on your device or your account; in an online room they're shared only with your friend and deleted with the room. Build ${BUILD}.</p>
  </div>`;
  FX.renderSettings($('#fxSet'));
}

function creditsSheet() {
  const rows = [];
  for (const d of FC.deckIndex()) {
    const dk = FC.deck(d.id); if (!dk) continue;
    rows.push(`<h4>${esc(dk.title)}</h4><ul class="credits">${dk.people.filter((p) => p.img).map((p) => { const c = p.credit || {}; return `<li><b>${esc(p.name)}</b>: ${esc(c.author || 'unknown')}${c.license ? ', ' + esc(c.license) : ''}${c.source && /^https?:/.test(c.source) ? ` · <a href="${esc(c.source)}" target="_blank" rel="noopener">source</a>` : ''}</li>`; }).join('')}</ul>`);
  }
  sheet(`<h3>Photo credits</h3><div class="scrollbox">${rows.join('') || '<p class="muted">No decks loaded.</p>'}</div><div class="row end"><button class="btn main" data-act="sheetx">Close</button></div>`, { wide: true });
}

function logSheet() {
  const g = G(); if (!g) return;
  const p = g.pub, N = g.names;
  const rows = p.log.map((e) => ('guess' in e)
    ? `<li><b>${esc(N[e.by])}</b> guessed <b>${esc(FC.face(e.guess).name)}</b>: ${e.ok ? 'right' : 'wrong'}</li>`
    : `<li><b>${esc(N[e.by])}</b>: ${e.q ? esc(e.q) : '<i>asked out loud</i>'} <span class="a a-${e.a || 'x'}">${ANS[e.a] || '…'}</span></li>`).reverse().join('');
  sheet(`<h3>Questions</h3><ol class="log" reversed>${rows || '<p class="muted">No questions yet.</p>'}</ol><div class="row end"><button class="btn main" data-act="sheetx">Close</button></div>`);
}
function menuSheet() {
  const g = G(); if (!g) return;
  const L = g.kind === 'local';
  sheet(`<h3>${L ? 'Same-screen game' : 'Room ' + esc(g.snap.code)}</h3><div class="col">
    ${L ? '' : '<button class="btn" data-act="sharelink">Share room link</button>'}
    <button class="btn" data-act="rules">Rules</button>
    <button class="btn danger" data-act="${L ? 'quitask' : 'leaveask'}">${L ? 'End this game' : 'Leave the room'}</button>
    <button class="btn" data-act="sheetx">Close</button></div>`);
}

// ------------------------------------------------------------------ taps
document.addEventListener('click', async (ev) => {
  const b = ev.target.closest('[data-act],[data-pp],[data-tab]');
  if (!b || b.disabled) return;
  if (b.dataset.tab) { S.tab = b.dataset.tab; save(); closeSheet(); renderAll(); return; }
  if (b.dataset.pp) { await PPL.onClick(b); return; }
  const a = b.dataset.act, v = b.dataset.v;
  const g = G();
  if (g && g.kind === 'local' && LOCAL_SNAP_ACTS.has(a)) localSnap();
  switch (a) {
    case 'back': goBack(g); break;
    case 'resume': U.home = false; renderAll(); break;
    case 'sheetx': closeSheet(); break;
    case 'account': accountSheet('in'); break;
    case 'acct-in': accountSheet('in'); break;
    case 'acct-up': accountSheet('up'); break;
    case 'google': { const r = await ACCT.google({ inRoom: inRoom() }); if (r.ok) { if ($('#aEmail')) closeSheet(); toast('Signed in'); } else toast(r.message); break; }
    case 'emailin': case 'emailup': {
      const em = $('#aEmail').value, pw = $('#aPw').value;
      const r = a === 'emailup' ? await ACCT.emailSignUp(em, pw) : await ACCT.emailSignIn(em, pw, { inRoom: inRoom() });
      if (r.ok) { if ($('#aEmail')) closeSheet(); toast(a === 'emailup' ? 'Account made' : 'Signed in'); } else toast(r.message);
      break;
    }
    case 'reset': { const r = await ACCT.resetPassword($('#aEmail').value); toast(r.ok ? 'Check your email for a reset link' : r.message); break; }
    case 'signout': { const r = await ACCT.signOut({ inRoom: inRoom() }); if (r.ok) { closeSheet(); toast('Signed out'); } else toast(r.message); break; }
    case 'mode': S.mode = v; save(); renderAll(); break;
    case 'src':
      if (b.dataset.k === 'set') S.src = { kind: 'set', id: v, decks: S.src.decks, tags: [] };
      else if (b.dataset.k === 'mix') S.src = { kind: 'deck', decks: FC.deckIndex().filter((d) => FC.deck(d.id)).map((d) => d.id), tags: [] };
      else S.src = { kind: 'deck', decks: [v], tags: [] };
      save(); renderAll(); break;
    case 'newset': S.tab = 'people'; save(); await PPL.onClick(Object.assign(document.createElement('button'), { dataset: { pp: 'new' } })); break;
    case 'tag': { const t = S.src.tags || []; S.src.tags = t.includes(v) ? t.filter((x) => x !== v) : t.concat(v); save(); renderAll(); break; }
    case 'size': S.n = +v; save(); renderAll(); break;
    case 'startlocal': U.home = false; newLocal(); break;
    case 'create': createRoom(); break;
    case 'join': joinRoom(); break;
    case 'ostart': {
      if (U.busy) break; U.busy = true;
      const r = await U.online.start().finally(() => { U.busy = false; });
      if (!r.ok) toast(r.message);
      break;
    }
    case 'home':   // same screen: home with a Resume button; online: Home leaves the room (asks first mid-game)
      if (!U.online || !U.snap) { U.home = true; U.guessing = false; renderAll(); break; }
      // falls through
    case 'leave': case 'leaveask':
      if (!U.online) break;
      if (a === 'leaveask' || (g && g.pub && !['over'].includes(g.pub.phase) && !game.isOver(g.pub))) {
        sheet(`<h3>Leave the room?</h3><p class="muted">${g && g.pub && g.pub.phase !== 'over' ? 'The game ends and your friend wins this round.' : 'Your friend stays in the room.'}</p><div class="row end"><button class="btn" data-act="sheetx">Stay</button><button class="btn main danger" data-act="leave2">Leave</button></div>`);
      } else leaveRoom();
      break;
    case 'leave2': leaveRoom(); break;
    case 'quitask': sheet(`<h3>End this game?</h3><div class="row end"><button class="btn" data-act="sheetx">Keep playing</button><button class="btn main danger" data-act="quitlocal">End game</button></div>`); break;
    case 'quitlocal': closeSheet(); quitLocal(); break;
    case 'sharelink': shareLink(); break;
    case 'menu': menuSheet(); break;
    case 'log': logSheet(); break;
    case 'rules': closeSheet(); COACH.rules(KIT.rules()); break;
    case 'mystats': PF && PF.openPanel(); break;
    case 'credits': creditsSheet(); break;
    case 'help': toast('A countdown for each step, on both screens. Nothing happens at 0: it\'s a nudge.'); break;
    case 'timer': S.timer = +v; save(); renderAll(); break;
    case 'view': S.play.view = +v; save(); renderPlay(); break;
    case 'tile': onTile(g, +b.dataset.seat, +b.dataset.i, b); break;
    case 'swap': if (g) { const idx = [...U.marks]; U.marks.clear(); addDunno(idx.map((i) => g.pub.board[i])); if (await send(g.kind === 'local' ? g.toAct[0] : g.me, { t: 'swap', idx })) FX.play('shuffle'); renderAll(); } break;
    case 'ready':
      if (!g) break;
      U.marks.clear();
      if (g.kind === 'local') { for (const s of g.toAct) await send(s, { t: 'ready' }); S.play.pick = null; save(); renderAll(); }
      else send(g.me, { t: 'ready' });
      break;
    case 'pickstart': S.play.pick = +v; U.pickSel = -1; save(); renderAll(); break;
    case 'random': if (g) { U.pickSel = Math.floor(Math.random() * g.pub.board.length); renderAll(); } break;
    case 'lockin': lockIn(g); break;
    case 'asked': if (g) send(g.pub.turn, { t: 'ask', q: '', aloud: true }); break;
    case 'chip': { const inp = $('#qIn'); if (inp) { inp.value = b.textContent.trim(); inp.dataset.tag = b.dataset.tag || ''; inp.focus(); } break; }
    case 'ask': askNow(g); break;
    case 'answer': if (g) send(g.kind === 'local' ? other(g.pub.turn) : g.me, { t: 'answer', a: v }); break;
    case 'done': if (g) { const t = g.pub.turn; send(t, { t: 'done', left: leftCount(g, t) }); } break;
    case 'guess': U.guessing = true; U.guessSel = -1; renderPlay(); break;
    case 'guessx': U.guessing = false; renderPlay(); break;
    case 'verdict': if (g) send(g.me, { t: 'verdict', ok: v === '1' }); break;
    case 'again': if (g) { if (g.kind === 'local') { await send(0, { t: 'again' }); await send(1, { t: 'again' }); S.play.secrets = [null, null]; S.play.flips = [{}, {}]; S.play.pick = null; save(); FX.play('shuffle'); renderAll(); } else send(g.me, { t: 'again' }); } break;
    case 'zoomme': zoomMe(g); break;
    case 'nosecret': toast('Your pick was made on another device, so this phone can\'t show it.'); break;
  }
});
document.addEventListener('change', (e) => {
  const k = e.target && e.target.dataset && e.target.dataset.set;
  if (k === 'names') { S.names = e.target.checked; save(); renderAll(); }
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && e.target && e.target.id === 'qIn') { e.preventDefault(); askNow(G()); }
  if (e.key === 'Escape' && U.sheet) closeSheet();
});

function onTile(g, seat, i, el) {
  if (!g) return;
  const p = g.pub, L = g.kind === 'local';
  if (L) localSnap();
  if (p.phase === 'dunno') {
    if (!L && p.ready[g.me]) return;
    U.marks.has(i) ? U.marks.delete(i) : U.marks.add(i);
    FX.play('tap'); renderPlay(); return;
  }
  if (p.phase === 'pick') {
    if (L ? S.play.pick === null || S.play.pick === undefined : p.commits[g.me]) return;
    U.pickSel = U.pickSel === i ? -1 : i; FX.play('tap'); renderPlay(); return;
  }
  if (p.phase === 'over' || game.isOver(p)) return;
  const xed = (p.xed && p.xed[seat]) || [];
  if (U.guessing && (L ? seat === p.turn : true)) {
    // tap = the guess (no confirm step); crossed-out and flipped-down faces can't be guessed
    if (xed.includes(p.board[i])) return toast('Already guessed wrong');
    if (flipsOf(g, seat)[i] !== undefined) return toast('Flipped down: stand them back up to guess them');
    U.guessing = false; FX.play('drumroll');
    send(L ? p.turn : g.me, { t: 'guess', face: p.board[i] }).then(() => renderAll());
    return;
  }
  if (xed.includes(p.board[i])) return toast('Guessed wrong: they stay crossed out');
  // flipping: your own board, any time (it's private); same screen: only the board of the player who's flipping
  if (L && seat !== p.turn) { S.play.view = seat; return toast(`${g.names[p.turn]} is flipping now. Switch back to flip.`); }
  const f = Object.assign({}, flipsOf(g, seat));
  if (f[i] !== undefined) delete f[i]; else f[i] = turnNo(p);
  if (L) localSnap(); else U.oflips.push({ key: flipKey2(p), flips: flipsOf(g, seat) });
  setFlips(g, seat, f);
  FX.play('cardFlip');
  const btn = el.closest('.face');
  if (btn) {
    btn.classList.toggle('down', f[i] !== undefined);
    btn.setAttribute('aria-pressed', f[i] !== undefined);
    btn.classList.remove('flipping'); void btn.offsetWidth; btn.classList.add('flipping');
  }
  // update the counts without rebuilding the board
  const left = leftCount(g, seat);
  document.querySelectorAll('[data-act="done"]').forEach((d) => { d.textContent = `Next · ${left} left`; });
  renderTop();
  if (L) { const sw = document.querySelector(`.pswitch [data-v="${seat}"]`); if (sw) sw.textContent = sw.textContent.replace(/\d+ left/, left + ' left'); }
}

async function lockIn(g) {
  if (!g || U.pickSel < 0) return;
  const face = g.pub.board[U.pickSel];
  const salt = makeSalt();
  const hash = commitOf(face, salt);
  if (g.kind === 'local') {
    const seat = S.play.pick;
    S.play.secrets[seat] = { face, salt };
    U.pickSel = -1; S.play.pick = null;
    await send(seat, { t: 'commit', hash });
    FX.play('stamp');
    return;
  }
  lsSet(secKey(g.snap.code, g.pub.round), { face, salt });   // saved BEFORE it's sent: a reload keeps it
  U.pickSel = -1;
  if (await send(g.me, { t: 'commit', hash })) FX.play('stamp');
  renderAll();
}
function askNow(g) {
  if (!g) return;
  const inp = $('#qIn');
  const q = (inp?.value || '').replace(/[‘’]/g, "'").replace(/[“”]/g, '"').trim();
  if (!q) { toast('Type a question, or tap one'); inp?.focus(); return; }
  const chip = [...document.querySelectorAll('.qchips .chip')].find((c) => c.dataset.tag && c.textContent.trim() === q);
  send(g.me, chip ? { t: 'ask', q, tag: chip.dataset.tag } : { t: 'ask', q });
}
function zoomMe(g) {
  if (!g) return;
  const sec = secretOf(g, g.me); if (!sec) return;
  const f = FC.face(sec.face);
  sheet(`<div class="zoom"><span class="ph">${FC.picHTML(f)}</span><h3>${esc(f.name)}</h3><p class="muted small">Your mystery face</p></div><div class="row end"><button class="btn main" data-act="sheetx">Close</button></div>`);
}
async function shareLink() {
  const sn = U.snap; if (!sn || !sn.code) return;
  const url = location.origin + location.pathname + '?room=' + sn.code;
  const text = `Play Mystery Face with me: room ${sn.code}`;
  try {
    if (navigator.share && matchMedia('(pointer: coarse)').matches) { await navigator.share({ title: 'Mystery Face', text, url }); return; }
    await navigator.clipboard.writeText(url); toast('Link copied');
  } catch (e) { if (e && e.name !== 'AbortError') toast('Room code: ' + sn.code); }
}

// same screen: press and hold to peek at your face
function peekOn(e) {
  const b = e.target.closest('.peek'); if (!b) return;
  e.preventDefault(); b.classList.add('on');
  const off = () => { b.classList.remove('on'); removeEventListener('pointerup', off); removeEventListener('pointercancel', off); };
  addEventListener('pointerup', off); addEventListener('pointercancel', off);
}
document.addEventListener('pointerdown', peekOn);
document.addEventListener('contextmenu', (e) => { if (e.target.closest('.peek,.face')) e.preventDefault(); });

// ------------------------------------------------------------------ boot
renderAcctBtn();
$('#acctBtn').addEventListener('click', () => accountSheet('in'));
const qs = new URLSearchParams(location.search);
if (qs.get('room')) { U.joinCode = qs.get('room').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5); S.mode = 'online'; S.tab = 'play'; }
if (S.play && S.play.kind === 'local') FC.useCustom(S.play.custom || null);
if (S.play && S.play.kind === 'local' && S.play.state) FC.ensureFor(S.play.state.board).then(renderAll);
renderAll();
loadDecks();
if (ACCT.wasSignedIn()) ACCT.load().catch(() => {});
// back into an online room after a reload
try { if (localStorage.getItem('online.mystery-face')) ensureOnline().then((o) => o.resume()).then((ok) => { if (ok) { S.tab = 'play'; renderAll(); } }).catch(() => {}); } catch (e) {}
// first visit: offer the rules
setTimeout(() => {
  if (!COACH || S.play || U.snap || COACH.offered('mystery-face-first')) return;
  COACH.offer({ id: 'mystery-face-first', title: 'New to Mystery Face?', text: 'See how a turn works.', yes: 'Show me', no: 'No thanks', onYes: () => COACH.rules(KIT.rules()), place: 'auto', avoid: ['[data-act="create"]', '[data-act="startlocal"]', '.srcs', '.modes'] });
}, 900);
if (window.PWA) window.PWA.safeToReload = () => (S.tab !== 'play' || (!S.play && !U.snap)) && !inRoom() && !U.sheet && !(document.activeElement && /INPUT|TEXTAREA/.test(document.activeElement.tagName));
window.__mf = { S, U, G, game, build: BUILD };
