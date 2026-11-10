// Mystery Face: "Sort faces". Tim, 2026-11-06: "let's do the know/don't know thing with the account, but
// make it right arrow left arrow for know and don't know so you can quickly go through them."
// One face at a time, full screen. Right (→ key, Know button, swipe right) = Know; left = Don't know.
//
// Smart sorting (Tim, 2026-11-09, docs/library-plan.md): "rate every character on how well known they are
// within that specific group and then assume that the user knows any character that much more well known
// than them, and then keep giving characters to the player until the game finds the mark". Per group, the
// people (or, for character groups, the franchises: "if a user is familiar with a character from a specific
// game/TV show/movie/book, then they'll very likely know all the characters") are ranked by fame; each
// answer moves the cut between "known" and "not known", and the next card is the middle of what's still open.
// Only real answers are stored (memory k / u, as before); everything else is ASSUMED from them each time it's
// needed, so a real answer always wins and a contradicting one simply re-opens the search. The same person
// in several groups (same name key) carries one answer everywhere.
// "Sort every face" (Tim, 2026-11-09: "also allow the user to sort every single character from a specific
// group if they want to do that"): the plain one-by-one pass over a group; every answer there is real.
import { memMarkKnown, memMarkUnknown, memClean } from './engine.js';
import * as FC from './faces.js';

const esc = FC.esc;

// ------------------------------------------------------------------ the search (pure)
export const GAP = 3;      // stop when at most this many people are left between known and unknown
export const GAP_FR = 1;   // ... franchises, in a character group
export const MAXQ = 6;     // never more answered cards than this per group

/** people [{ id, key, fame, fr }] -> units ranked best-known first: [{ members, top, fame }]. */
export function unitsOf(people, franchised) {
  const units = [];
  const by = new Map();
  for (const p of people) {
    const k = franchised && p.fr ? 'f:' + FC.nameKey(p.fr) : 'p:' + p.id;
    let u = by.get(k);
    if (!u) { u = { members: [], i: units.length }; by.set(k, u); units.push(u); }
    u.members.push(p);
  }
  for (const u of units) { u.top = u.members.reduce((a, b) => (b.fame > a.fame ? b : a)); u.fame = u.top.fame; }
  return units.sort((a, b) => b.fame - a.fame || a.i - b.i);
}

/**
 * One group, given the answers so far (ansOf(person) -> 'k' | 'u' | null).
 * Returns { marks: Map(personId -> 'k'|'u'|null), real: Set(personId answered), known, unknown, unsure, n,
 *   answered (units with an answer), done, next (person to show, or null), remaining (cards still expected) }.
 */
export function groupView(people, franchised, ansOf) {
  const units = unitsOf(people, franchised);
  const n = units.length;
  const st = units.map((u) => {
    if (u.members.some((p) => ansOf(p) === 'k')) return 'k';
    if (ansOf(u.top) === 'u' || u.members.every((p) => ansOf(p) === 'u')) return 'u';
    return null;
  });
  // the cut c (ranks < c known) that disagrees with the fewest answers; [cLo, cHi] = every best cut
  let e = st.filter((s) => s === 'k').length, best = e, cLo = 0, cHi = 0;
  for (let c = 1; c <= n; c++) {
    const s = st[c - 1];
    if (s === 'k') e--; else if (s === 'u') e++;
    if (e < best) { best = e; cLo = c; cHi = c; } else if (e === best) cHi = c;
  }
  const answered = st.filter(Boolean).length;
  const open = [];
  for (let r = cLo; r < cHi; r++) if (!st[r]) open.push(r);
  const gap = franchised ? GAP_FR : GAP;
  // a small gap is good enough, except at the very top or bottom (all / none known is worth one more card)
  const edge = cLo === 0 || cHi === n;
  const done = !open.length || answered >= MAXQ || (open.length <= gap && !edge);
  // next: the open unit at the middle of the open people (franchises count by their size)
  let next = null;
  if (!done) {
    const tot = open.reduce((a, r) => a + units[r].members.length, 0);
    let acc = 0, pick = open[open.length - 1];
    for (const r of open) { acc += units[r].members.length; if (acc * 2 >= tot) { pick = r; break; } }
    if (open.length <= gap) pick = cLo === 0 ? open[0] : open[open.length - 1];   // the edge itself
    next = units[pick].top;
  }
  const mid = (cLo + cHi) / 2;
  const marks = new Map(), real = new Set();
  let known = 0, unknown = 0, unsure = 0;
  units.forEach((u, r) => {
    const um = st[r] || (r < cLo ? 'k' : r >= cHi ? 'u' : done ? (r < mid ? 'k' : 'u') : null);
    for (const p of u.members) {
      const a = ansOf(p);
      if (a) real.add(p.id);
      const m = a || um;
      marks.set(p.id, m);
      if (m === 'k') known++; else if (m === 'u') unknown++; else unsure++;
    }
  });
  const remaining = done ? 0 : Math.max(1, Math.min(MAXQ - answered, Math.ceil(Math.log2(Math.max(2, open.length / gap)))));
  return { marks, real, known, unknown, unsure, n: people.length, answered, done, next, remaining };
}

// ------------------------------------------------------------------ the loaded decks + this player's memory
export function peopleOf(deckId) {
  const d = FC.deck(deckId);
  return d ? d.people.map((p) => ({ id: deckId + '/' + p.id, key: FC.nameKey(p.name) || deckId + '/' + p.id, fame: p.fame ?? 50, fr: p.franchise || '' })) : [];
}
export function franchisedDeck(deckId, ppl) {
  const d = FC.deck(deckId);
  if (!d) return false;
  const withFr = ppl.filter((p) => p.fr).length;
  return withFr > 0 && (FC.CHARACTER_CATS.has(d.cat) || withFr * 2 >= ppl.length);
}
// answers by face id, then by name (one answer for the same person everywhere; don't-know wins)
const ANS = new WeakMap();
function ansFn(mem) {
  const c = ANS.get(mem);
  if (c && c.n === FC.loadedCount()) return c;
  const byKey = new Map();
  const keyOf = (id) => { const [d, pid] = id.split('/'); const x = FC.deck(d) && FC.deck(d).byId.get(pid); return x ? FC.nameKey(x.name) : FC.nameKey(pid); };
  for (const id in mem.k) { const k = keyOf(id); if (k && !byKey.has(k)) byKey.set(k, 'k'); }
  for (const id in mem.u) { const k = keyOf(id); if (k) byKey.set(k, 'u'); }
  const f = (p) => (p.id in mem.u ? 'u' : p.id in mem.k ? 'k' : byKey.get(p.key) || null);
  const out = { n: FC.loadedCount(), f, views: new Map() };
  ANS.set(mem, out);
  return out;
}
/** groupView of one loaded deck for this memory (cached per memory object). */
export function viewOf(mem, deckId) {
  const a = ansFn(mem);
  if (a.views.has(deckId)) return a.views.get(deckId);
  const ppl = peopleOf(deckId);
  const v = groupView(ppl, franchisedDeck(deckId, ppl), a.f);
  a.views.set(deckId, v);
  return v;
}
/** How well this player knows a group: { pct (0-1), sorted (any answer in it), n } or null (not loaded). */
export function familiarity(mem, gid) {
  const decks = FC.groupDecks(gid).filter((d) => FC.deck(d));
  if (!decks.length) return null;
  const seen = new Map();
  let sorted = false, done = true;
  for (const d of decks) {
    const v = viewOf(mem, d);
    if (v.answered) sorted = true;
    if (!v.done) done = false;
    for (const p of peopleOf(d)) if (!seen.has(p.key) || seen.get(p.key) === null) seen.set(p.key, v.marks.get(p.id));
  }
  let k = 0, s = 0;
  for (const m of seen.values()) { if (m === 'k') k++; else if (m === null) s++; }
  return { pct: seen.size ? (k + s / 2) / seen.size : 0, sorted, done, n: seen.size };
}
/** The memory a deal reads: the real answers plus every assumed mark (Know -> known, never seen; Don't know -> left out). */
export function withAssumed(mem, ids) {
  const m = memClean(mem);
  const x = { v: 2, g: m.g, k: Object.assign({}, m.k), u: Object.assign({}, m.u), l: m.l };
  const decks = new Set((ids || []).filter((id) => !id.startsWith('c/')).map((id) => id.split('/')[0]));
  for (const d of decks) {
    if (!FC.deck(d)) continue;
    for (const [id, mk] of viewOf(m, d).marks) {
      if (id in x.k || id in x.u) continue;
      if (mk === 'k') x.k[id] = 0; else if (mk === 'u') x.u[id] = x.g;
    }
  }
  return x;
}
/** People in these groups with no answer and nothing assumed yet (0 until their decks are loaded). */
export function newCount(mem, gids) {
  const m = memClean(mem);
  const keys = new Set();
  for (const d of new Set((gids || []).flatMap((g) => FC.groupDecks(g)))) {
    if (!FC.deck(d) || d === 'sample') continue;
    const v = viewOf(m, d);
    for (const p of peopleOf(d)) if (v.marks.get(p.id) === null) keys.add(p.key);
  }
  return keys.size;
}
/** Every copy of these people (same name) in the loaded decks. */
function copiesOf(faceIds) {
  const keys = new Set(faceIds.map((id) => { const [d, pid] = id.split('/'); const x = FC.deck(d) && FC.deck(d).byId.get(pid); return x ? FC.nameKey(x.name) : FC.nameKey(pid); }));
  const out = new Set(faceIds);
  for (const d of FC.deckIndex()) { const dk = FC.deck(d.id); if (!dk) continue; for (const p of dk.people) if (keys.has(FC.nameKey(p.name))) out.add(d.id + '/' + p.id); }
  return [...out];
}
/** A real answer for one person, everywhere they appear. */
export function answerMem(mem, faceId, know) {
  const ids = copiesOf([faceId]);
  return know ? memMarkKnown(mem, ids) : memMarkUnknown(mem, ids);
}
/** "Sort every face": every person in the decks not answered for real yet (best known first, one per name);
 *  everyone when all are answered (a second pass). */
export function everyFace(mem, deckIds) {
  const m = memClean(mem), a = ansFn(m), seen = new Set(), all = [], open = [];
  for (const d of deckIds) {
    if (!FC.deck(d)) continue;
    for (const p of peopleOf(d).sort((x, y) => y.fame - x.fame)) {
      if (seen.has(p.key)) continue;
      seen.add(p.key); all.push(p.id);
      if (!a.f(p)) open.push(p.id);
    }
  }
  return open.length ? open : all;
}

// ------------------------------------------------------------------ the screen
let X = null;          // { getMem, setMem, flushMem, FX, onClose, groups: [gid], all: bool }
let DECKS = [];        // deck ids this session sorts
let MODE = 'smart';    // 'smart' | 'all'
let LIST = [], I = 0;  // 'all' mode: the faces, and where we are
let SHOWN = new Map(); // smart mode: cards shown per deck this session
let CUR = null;        // { deck, face } showing now (null = finished)
let UNDO = [], el = null;

const titleOf = (d) => (FC.deck(d) ? FC.deck(d).title : d);

/** Open the sorter. ctx.groups: group ids (decks or "cat:<cat>"); ctx.all: sort every face one by one. */
export async function openSorter(ctx) {
  X = ctx;
  DECKS = [...new Set((ctx.groups || []).flatMap((g) => FC.groupDecks(g)))].filter((d) => d !== 'sample');
  await Promise.all(DECKS.map((d) => FC.loadDeck(d).catch(() => null)));
  DECKS = DECKS.filter((d) => FC.deck(d));
  MODE = ctx.all ? 'all' : 'smart';
  SHOWN = new Map(); UNDO = [];
  if (MODE === 'all') { LIST = everyFace(X.getMem(), DECKS); I = 0; }
  el = document.createElement('div');
  el.id = 'sorter'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-label', 'Sort faces');
  document.body.appendChild(el);
  el.innerHTML = `<div class="so-top"><span class="so-count" id="soCount"></span><span class="grow"></span>
      <button class="btn small icon" data-so="undo" aria-label="Undo the last one"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 14L4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 010 11H11"/></svg></button>
      <button class="btn small" data-so="close">Done</button></div>
    <div class="so-stage" id="soStage"></div>
    <div class="so-btns" id="soBtns"><button class="btn big" data-so="no">← Don't know</button><button class="btn big main" data-so="yes">Know →</button></div>`;
  el.addEventListener('click', onClick);
  el.addEventListener('pointerdown', onDown);
  document.addEventListener('keydown', onKey, true);
  show(0);
}

/** What to show now: { deck, face, text } or null when this session is finished. */
function current() {
  const m = X.getMem();
  if (MODE === 'all') {
    if (I >= LIST.length) return null;
    const d = LIST[I].split('/')[0];
    return { deck: d, face: LIST[I], text: `${esc(titleOf(d))} · <b>${I + 1}</b> of ${LIST.length}` };
  }
  for (const d of DECKS) {
    const v = viewOf(m, d);
    if (!v.next) continue;
    const s = SHOWN.get(d) || 0;
    return { deck: d, face: v.next.id, text: `${esc(titleOf(d))} · <b>${s + 1}</b> of ~${s + v.remaining}` };
  }
  return null;
}

function close() {
  if (!el) return;
  document.removeEventListener('keydown', onKey, true);
  el.remove(); el = null;
  X.flushMem();
  X.onClose();
}

function onKey(e) {
  if (!el) return;
  if (e.key === 'ArrowRight') { e.preventDefault(); answer(true); }
  else if (e.key === 'ArrowLeft') { e.preventDefault(); answer(false); }
  else if (e.key === 'Escape') { e.preventDefault(); close(); }
  else if ((e.key === 'z' && (e.ctrlKey || e.metaKey)) || e.key === 'Backspace') { e.preventDefault(); undo(); }
  else return;
  e.stopPropagation();
}

function onClick(e) {
  const b = e.target.closest('[data-so]');
  if (!b || b.disabled) return;
  const a = b.dataset.so;
  if (a === 'yes') answer(true, true);
  else if (a === 'no') answer(false, true);
  else if (a === 'undo') undo();
  else if (a === 'close') close();
  else if (a === 'every') { MODE = 'all'; LIST = everyFace(X.getMem(), DECKS); I = 0; show(0); }
}

function cardHTML(faceId) {
  const f = FC.face(faceId);
  return `<div class="so-card"><span class="ph">${FC.picHTML(f)}</span><b class="so-name">${esc(f.name)}</b><span class="so-from muted">${esc(f.from || '')}&nbsp;</span></div>`;
}
function preload(cur) {
  // the next few: 'all' mode knows them; smart mode can only guess (either answer's next card)
  const ids = MODE === 'all' ? LIST.slice(I + 1, I + 4) : [];
  if (MODE === 'smart' && cur) {
    const m = memClean(X.getMem());
    for (const know of [true, false]) { const v = viewOf(answerMem(m, cur.face, know), cur.deck); if (v.next) ids.push(v.next.id); }
  }
  for (const id of ids) { const f = FC.face(id); if (f.img) { const im = new Image(); im.decoding = 'async'; im.src = f.img; } }
}

/** Show the current face (dir: -1/1 = the old card flies off that way; 0 = none). */
function show(dir, back) {
  const st = el.querySelector('#soStage');
  const old = st.querySelector('.so-card:not(.gone)');
  const cur = current();
  el.querySelector('#soCount').innerHTML = cur ? cur.text : '';
  el.querySelector('#soBtns').style.visibility = cur ? '' : 'hidden';
  el.querySelector('[data-so="undo"]').disabled = !UNDO.length;
  const next = document.createElement('div');
  if (!cur) {
    const m = memClean(X.getMem());
    let k = 0, n = 0;
    for (const d of DECKS) { const v = viewOf(m, d); k += v.known; n += v.n; }
    const every = everyFace(m, DECKS);
    const open = every.filter((id) => !viewOf(m, id.split('/')[0]).real.has(id)).length;
    const name = DECKS.length === 1 ? esc(titleOf(DECKS[0])) : `${DECKS.length} groups`;
    next.innerHTML = `<div class="so-card so-end"><h3>All sorted</h3><p class="muted">${name}${n ? ` · you know ~${Math.round((100 * k) / n)}%` : ''}</p>
      <div class="col">${MODE === 'smart' && open ? `<button class="btn" data-so="every">Sort every face (${open})</button>` : ''}<button class="btn main" data-so="close">Done</button></div></div>`;
  } else next.innerHTML = cardHTML(cur.face);
  const card = next.firstElementChild;
  if (back) card.classList.add(back > 0 ? 'in-r' : 'in-l');
  if (old) {
    if (dir) {
      old.classList.add('gone', dir > 0 ? 'fly-r' : 'fly-l');
      old.style.transform = '';
      setTimeout(() => old.remove(), 260);
      st.insertBefore(card, old);
    } else { old.remove(); st.appendChild(card); }
  } else st.appendChild(card);
  if (cur) preload(cur);
}

function answer(know, quiet) {
  if (!el) return;
  const cur = current();
  if (!cur) return;
  const m = memClean(X.getMem());
  const ids = copiesOf([cur.face]);
  UNDO.push({ mode: MODE, list: LIST, i: I, deck: cur.deck, dir: know ? 1 : -1, prev: ids.map((id) => [id, id in m.k ? m.k[id] : null, id in m.u ? m.u[id] : null]) });
  if (UNDO.length > 200) UNDO.shift();
  X.setMem(know ? memMarkKnown(m, ids) : memMarkUnknown(m, ids));
  if (!quiet && X.FX) X.FX.play('tap');   // buttons already click
  if (MODE === 'all') I++;
  else SHOWN.set(cur.deck, (SHOWN.get(cur.deck) || 0) + 1);
  show(know ? 1 : -1);
}

function undo() {
  if (!el || !UNDO.length) return;
  const u = UNDO.pop();
  const m = memClean(X.getMem());
  for (const [id, k, uu] of u.prev) {
    if (k === null) delete m.k[id]; else m.k[id] = k;
    if (uu === null) delete m.u[id]; else m.u[id] = uu;
  }
  X.setMem(memClean(m));
  MODE = u.mode; LIST = u.list; I = u.i;
  if (MODE === 'smart') SHOWN.set(u.deck, Math.max(0, (SHOWN.get(u.deck) || 0) - 1));
  show(0, u.dir);
}

// ---- swipe: the card follows the finger; past ~1/4 of its width (or a flick) it goes
let drag = null;
function onDown(e) {
  const card = e.target.closest('.so-card:not(.gone):not(.so-end)');
  if (!card || e.button > 0) return;
  drag = { card, x: e.clientX, y: e.clientY, t: performance.now(), dx: 0, id: e.pointerId, live: false };
  try { card.setPointerCapture(e.pointerId); } catch (err) { /* moves still arrive while over the card */ }
  card.addEventListener('pointermove', onMove);
  card.addEventListener('pointerup', onUp);
  card.addEventListener('pointercancel', onUp);
}
function onMove(e) {
  if (!drag || e.pointerId !== drag.id) return;
  drag.dx = e.clientX - drag.x;
  if (!drag.live && Math.abs(drag.dx) < 6) return;
  drag.live = true;
  drag.card.classList.add('drag');
  drag.card.style.transform = `translateX(${drag.dx}px) rotate(${drag.dx / 22}deg)`;
  drag.card.dataset.lean = drag.dx > 30 ? 'yes' : drag.dx < -30 ? 'no' : '';
}
function onUp(e) {
  if (!drag || e.pointerId !== drag.id) return;
  const { card, dx, t } = drag;
  drag = null;
  card.removeEventListener('pointermove', onMove); card.removeEventListener('pointerup', onUp); card.removeEventListener('pointercancel', onUp);
  card.classList.remove('drag'); card.dataset.lean = '';
  const fast = Math.abs(dx) > 40 && Math.abs(dx) / Math.max(1, performance.now() - t) > 0.5;
  if (Math.abs(dx) > card.offsetWidth / 4 || fast) {
    card.style.transform = `translateX(${dx}px) rotate(${dx / 22}deg)`;
    answer(dx > 0);
  } else card.style.transform = '';
}
