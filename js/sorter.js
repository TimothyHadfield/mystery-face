// Mystery Face: "Sort faces". Tim, 2026-11-06: "let's do the know/don't know thing with the account, but
// make it right arrow left arrow for know and don't know so you can quickly go through them."
// One face at a time, full screen. Right (→ key, Know button, swipe right) = Know; left = Don't know.
// Unused people first (never on a board, never sorted), one card per person across every deck (all copies
// are marked), shuffled with the kinds mixed. Then "All sorted" offers to re-check the don't-knows.
// Memory: Know = engine memMarkKnown (counts as long unused, so it's dealt soon); Don't know = memMarkUnknown.
import { memMarkKnown, memMarkUnknown, memClean } from './engine.js';
import * as FC from './faces.js';

const esc = FC.esc;
let X = null;          // { getMem, setMem, flushMem, FX, onClose }
let PEOPLE = null;     // [{ key, ids: [faceId], show: faceId, kind }]
let Q = [], I = 0, UNDO = [], el = null, recheck = false;

/** Every deck person once (by name), in deck order. Built once the decks are loaded. */
function people() {
  if (PEOPLE) return PEOPLE;
  const by = new Map();
  for (const d of FC.deckIndex()) {
    const dk = FC.deck(d.id);
    if (!dk || d.id === 'sample') continue;
    const meta = FC.metaFor(dk.people.map((p) => d.id + '/' + p.id), null);
    for (const p of dk.people) {
      const id = d.id + '/' + p.id;
      const key = FC.nameKey(p.name) || id;
      let e = by.get(key);
      if (!e) { e = { key, ids: [], show: id, kind: (meta[id] || '').split('|')[1] || d.id }; by.set(key, e); }
      e.ids.push(id);
      // show the copy from a deck of its own (not Mixed stars) with a picture
      const cur = FC.deck(e.show.split('/')[0]).byId.get(e.show.split('/')[1]);
      if ((e.show.startsWith('mixed/') && !id.startsWith('mixed/')) || (!cur.img && p.img)) { e.show = id; if (!id.startsWith('mixed/')) e.kind = (meta[id] || '').split('|')[1] || e.kind; }
    }
  }
  PEOPLE = [...by.values()];
  return PEOPLE;
}
const stateOf = (m, e) => (e.ids.some((id) => id in m.u) ? 'u' : e.ids.some((id) => id in m.k) ? 'k' : 'new');

/** How many people have never been seen or sorted (0 until the decks are loaded). */
export function newCount(mem) {
  if (!FC.deckIndex().length || !FC.deckIndex().some((d) => FC.deck(d.id))) return 0;
  const m = memClean(mem);
  return people().filter((e) => stateOf(m, e) === 'new').length;
}

/** Shuffled, with the kinds spread out: each step draws a kind by how many it has left, never the same twice in a row when another is left. */
function mixed(list) {
  const groups = new Map();
  for (const e of list) { if (!groups.has(e.kind)) groups.set(e.kind, []); groups.get(e.kind).push(e); }
  for (const g of groups.values()) for (let i = g.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [g[i], g[j]] = [g[j], g[i]]; }
  const out = []; let last = null;
  while (out.length < list.length) {
    let ks = [...groups.keys()].filter((k) => groups.get(k).length);
    if (ks.length > 1) ks = ks.filter((k) => k !== last);
    let r = Math.random() * ks.reduce((a, k) => a + groups.get(k).length, 0);
    let k = ks[ks.length - 1];
    for (const x of ks) { r -= groups.get(x).length; if (r < 0) { k = x; break; } }
    out.push(groups.get(k).pop()); last = k;
  }
  return out;
}

export function openSorter(ctx) {
  X = ctx;
  const m = memClean(X.getMem());
  Q = mixed(people().filter((e) => stateOf(m, e) === 'new'));
  I = 0; UNDO = []; recheck = false;
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
  else if (a === 'recheck') {
    const m = memClean(X.getMem());
    Q = mixed(people().filter((e2) => stateOf(m, e2) === 'u'));
    I = 0; recheck = true; show(0);
  }
}

function cardHTML(e) {
  const f = FC.face(e.show);
  const sub = f.from || '';
  return `<div class="so-card"><span class="ph">${FC.picHTML(f)}</span><b class="so-name">${esc(f.name)}</b><span class="so-from muted">${esc(sub)}&nbsp;</span></div>`;
}
function preload() {
  for (const e of Q.slice(I + 1, I + 4)) { const f = FC.face(e.show); if (f.img) { const im = new Image(); im.decoding = 'async'; im.src = f.img; } }
}

/** Show face I (dir: -1/1 = the old card flies off that way; 0 = none). */
function show(dir, back) {
  const st = el.querySelector('#soStage');
  const old = st.querySelector('.so-card:not(.gone)');
  const done = I >= Q.length;
  el.querySelector('#soCount').innerHTML = done ? '' : `<b>${I + 1}</b> / ${Q.length}${recheck ? ' <span class="muted">· don\'t knows</span>' : ''}`;
  el.querySelector('#soBtns').style.visibility = done ? 'hidden' : '';
  el.querySelector('[data-so="undo"]').disabled = !UNDO.length;
  const next = document.createElement('div');
  if (done) {
    const m = memClean(X.getMem());
    const nU = people().filter((e) => stateOf(m, e) === 'u').length;
    const nK = people().filter((e) => stateOf(m, e) === 'k').length;
    next.innerHTML = `<div class="so-card so-end"><h3>All sorted</h3><p class="muted">${nK} know · ${nU} don't know</p>
      <div class="col">${nU ? `<button class="btn" data-so="recheck">Re-check don't knows (${nU})</button>` : ''}<button class="btn main" data-so="close">Done</button></div></div>`;
  } else next.innerHTML = cardHTML(Q[I]);
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
  if (!done) preload();
}

function answer(know, quiet) {
  if (!el || I >= Q.length) return;
  const e = Q[I];
  const m = memClean(X.getMem());
  UNDO.push({ q: Q, i: I, recheck, dir: know ? 1 : -1, prev: e.ids.map((id) => [id, id in m.k ? m.k[id] : null, id in m.u ? m.u[id] : null]) });
  if (UNDO.length > 200) UNDO.shift();
  X.setMem(know ? memMarkKnown(m, e.ids) : memMarkUnknown(m, e.ids));
  if (!quiet && X.FX) X.FX.play('tap');   // buttons already click
  I++;
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
  Q = u.q; I = u.i; recheck = u.recheck;
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
