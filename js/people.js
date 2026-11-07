// Mystery Face: custom people. Sets live on this device (localStorage) and, once signed in, on the
// player's account (js/account.js -> Firestore), so they show up on any device.
// Tim, 2026-11-06: "If the user makes a custome person without a name then also allow them to add
// their name in later if they need." A nameless person shows as "Unnamed <n>" until named.
import { esc, face, picHTML, displayNames, loadPhoto, squareDataURL, cropStart, cropPan, cropZoom, cropRect, CROP_ZMAX, cleanSet, newId, SET_MAX_PEOPLE } from './faces.js';

const LOCAL = 'mystery-face:sets';
const cacheKey = (uid) => 'mystery-face:acct-sets:' + uid;
const read = (k) => { try { return JSON.parse(localStorage.getItem(k)) || []; } catch (e) { return []; } };
const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } };

let X = null;            // app context: { $, toast, sheet, closeSheet, confirm, acct, render, playWithSet, FX }
let acctSets = [];        // the signed-in account's sets (cached on this device)
let uid = null;
let view = { set: null }; // People tab: list, or one set open
const saveTimers = new Map();

export function initPeople(ctx) { X = ctx; }

// ------------------------------------------------------------------ store
export function localSets() { return read(LOCAL).map(cleanSet); }
export function allSets() {
  const loc = localSets().map((s) => Object.assign(s, { where: 'device' }));
  if (!uid) return loc;
  return acctSets.map((s) => Object.assign(s, { where: 'account' })).concat(loc);
}
export const getSet = (id) => allSets().find((s) => s.id === id) || null;

/** Called by the app when the account changes (signed in: load its sets; offer to move this device's). */
export async function onAccount(u) {
  uid = u ? u.uid : null;
  if (!uid) { acctSets = []; X.render(); return; }
  acctSets = read(cacheKey(uid)).map(cleanSet);
  X.render();
  const r = await X.acct.listSets();
  if (r.ok) { acctSets = r.sets.sort((a, b) => b.updatedAt - a.updatedAt); write(cacheKey(uid), acctSets); X.render(); }
  const loc = localSets();
  if (loc.length) offerMove(loc);
}

function offerMove(loc) {
  X.sheet(`<h3>Move your people to your account?</h3>
    <p class="muted">${loc.length === 1 ? '1 set is' : loc.length + ' sets are'} saved only on this device. On your account they show up on any device.</p>
    <div class="row end"><button class="btn" data-pp="close">Not now</button><button class="btn main" data-pp="moveall">Move</button></div>`);
}
async function moveAll() {
  const loc = localSets();
  let moved = 0;
  for (const s of loc) {
    const r = await X.acct.saveSet(s);
    if (!r.ok) { X.toast(r.message); break; }
    acctSets.unshift(s); moved++;
    write(LOCAL, localSets().filter((x) => x.id !== s.id));
  }
  write(cacheKey(uid), acctSets);
  X.closeSheet();
  if (moved) X.toast(moved === 1 ? 'Moved 1 set' : `Moved ${moved} sets`);
  X.render();
}

function putSet(set, { now = false } = {}) {
  set.updatedAt = Date.now();
  const clean = cleanSet(set);
  const where = set.where || (uid ? 'account' : 'device');
  if (where === 'account' && uid) {
    const i = acctSets.findIndex((s) => s.id === clean.id);
    if (i >= 0) acctSets[i] = clean; else acctSets.unshift(clean);
    write(cacheKey(uid), acctSets);
    clearTimeout(saveTimers.get(clean.id));
    const go = () => X.acct.saveSet(clean).then((r) => { if (!r.ok) X.toast(r.message); });
    if (now) go(); else saveTimers.set(clean.id, setTimeout(go, 900));
  } else {
    const loc = localSets();
    const i = loc.findIndex((s) => s.id === clean.id);
    if (i >= 0) loc[i] = clean; else loc.unshift(clean);
    if (!write(LOCAL, loc)) X.toast('This device\'s storage is full. Remove some photos or sign in.');
  }
  return Object.assign(clean, { where });
}
async function removeSet(set) {
  if (set.where === 'account' && uid) {
    const r = await X.acct.deleteSet(set.id);
    if (!r.ok) return X.toast(r.message);
    acctSets = acctSets.filter((s) => s.id !== set.id); write(cacheKey(uid), acctSets);
  } else write(LOCAL, localSets().filter((s) => s.id !== set.id));
}

// ------------------------------------------------------------------ People tab
const mosaic = (set) => {
  const ppl = set.people.slice(0, 4);
  const names = displayNames(set.people);
  return `<span class="mosaic">${ppl.map((p, i) => `<span class="mt">${picHTML({ name: names[i], img: p.img })}</span>`).join('')}${ppl.length < 4 ? '<span class="mt empty"></span>'.repeat(4 - ppl.length) : ''}</span>`;
};

export function renderPeople(el) {
  if (view.set) { const s = getSet(view.set); if (s) return renderEditor(el, s); view.set = null; }
  const sets = allSets();
  const u = X.acct.user();
  el.innerHTML = `<div class="pane people">
    <div class="phead"><h2>Your people</h2><button class="btn small" data-pp="import">Import</button><button class="btn main small" data-pp="new">New set</button></div>
    <p class="muted small acctline">${u ? `Saved on your account (${esc(u.email || u.name || 'signed in')}).` : `On this device only. <button class="link" data-act="account">Sign in</button> to keep them on every device.`}</p>
    <div class="setlist">${sets.length ? sets.map((s) => `<div class="setrow" data-pp="open" data-id="${esc(s.id)}" role="button" tabindex="0">${mosaic(s)}
      <span class="si"><b>${esc(s.title)}</b><span class="muted small">${s.people.length} ${s.people.length === 1 ? 'person' : 'people'}${s.where === 'device' && u ? ' · this device' : ''}</span></span>
      <button class="btn small" data-pp="play" data-id="${esc(s.id)}" ${s.people.length < 2 ? 'disabled' : ''}>Play</button></div>`).join('')
      : `<div class="empty-note"><p>Make a board of your own friends, family or anyone: photos, or just names.</p><button class="btn main" data-pp="new">New set</button></div>`}</div>
  </div>`;
}

function renderEditor(el, set) {
  const names = displayNames(set.people);
  el.innerHTML = `<div class="pane people editor">
    <div class="phead"><button class="btn small icon" data-pp="back" aria-label="Back"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 5l-7 7 7 7"/></svg></button>
      <input class="title-in" id="setTitle" value="${esc(set.title)}" maxlength="40" aria-label="Set name">
      <button class="btn small" data-pp="more" aria-label="More">⋯</button></div>
    <div class="row addrow"><button class="btn" data-pp="addphotos" ${set.people.length >= SET_MAX_PEOPLE ? 'disabled' : ''}>Add photos</button><button class="btn" data-pp="addnames" ${set.people.length >= SET_MAX_PEOPLE ? 'disabled' : ''}>Add names</button>
      <span class="muted small grow right">${set.people.length} of ${SET_MAX_PEOPLE}</span></div>
    <div class="pgrid">${set.people.map((p, i) => `<button class="pcard${p.name ? '' : ' unnamed'}" data-pp="person" data-i="${i}"><span class="ph">${picHTML({ name: names[i], img: p.img })}</span><span class="nm">${esc(names[i])}</span></button>`).join('')}
      ${set.people.length ? '' : '<p class="muted empty-note">Add photos or names. A set needs at least 2 people to play (24 fill a normal board).</p>'}</div>
    <div class="row end playrow"><button class="btn main" data-pp="play" data-id="${esc(set.id)}" ${set.people.length < 2 ? 'disabled' : ''}>Play with this set</button></div>
  </div>`;
  const t = el.querySelector('#setTitle');
  t.addEventListener('change', () => { const s = getSet(set.id); if (!s) return; s.title = t.value.trim() || 'My people'; putSet(s); });
}

function personSheet(set, i) {
  const p = set.people[i];
  const nm = displayNames(set.people)[i];
  X.sheet(`<div class="person">
    <div class="bigpic">${picHTML({ name: nm, img: p.img })}</div>
    <label class="field"><span class="small muted">Name</span><input id="pName" value="${esc(p.name)}" maxlength="40" placeholder="${esc(nm)}" autocomplete="off" enterkeyhint="done"></label>
    <div class="row"><button class="btn small" data-pp="photo1" data-i="${i}">${p.img ? 'Change photo' : 'Add photo'}</button>${p.img ? `<button class="btn small" data-pp="nophoto" data-i="${i}">Remove photo</button>` : ''}<button class="btn small danger" data-pp="delperson" data-i="${i}">Delete</button></div>
    <div class="row end"><button class="btn main" data-pp="savename" data-i="${i}">Done</button></div></div>`);
}

// ------------------------------------------------------------------ framing a photo
// Tim, 2026-11-06: "when you set a picture for a custom character, allow the user to adjust the picture
// so their face is centered and large in the picture." Drag to move, pinch / slider / wheel to zoom.
let framing = null;   // { done(result) } while the framing sheet is open
/** Show the framing sheet for one picture. Resolves { sx, sy, s } (picture px) or null (cancelled). */
function framePhoto(img, step) {
  const w = img.naturalWidth, h = img.naturalHeight;
  return new Promise((resolve) => {
    X.sheet(`<div class="framer">
      <h3>Centre the face${step ? ` <span class="muted small">${step}</span>` : ''}</h3>
      <div class="frame" id="frame"><span class="guide"></span></div>
      <input type="range" id="frameZoom" min="1" max="${CROP_ZMAX}" step="0.01" value="1" aria-label="Zoom">
      <div class="row end"><button class="btn" data-pp="framecancel">Cancel</button><button class="btn main" data-pp="frameok">Use photo</button></div></div>`);
    const fr = document.getElementById('frame'), zs = document.getElementById('frameZoom');
    const veil = document.querySelector('#layer .veil');
    if (veil) { delete veil.dataset.act; veil.dataset.pp = 'framecancel'; }
    const im = img;   // the decoded picture itself (its blob URL is already released)
    im.alt = ''; im.draggable = false; im.id = 'frameImg';
    fr.prepend(im);
    let F = fr.clientWidth || 280, v = cropStart(w, h, F);
    const draw = () => {
      const k = F / Math.min(w, h) * v.z;
      im.style.width = w * k + 'px'; im.style.height = h * k + 'px';
      im.style.transform = `translate(${v.x}px, ${v.y}px)`;
      zs.value = v.z;
    };
    draw();
    const pts = new Map();
    let last = null;   // { x, y, d } midpoint + finger distance of the previous move
    const local = (e) => { const r = fr.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
    const gesture = () => {
      const p = [...pts.values()];
      if (p.length === 1) return { x: p[0].x, y: p[0].y, d: 0 };
      return { x: (p[0].x + p[1].x) / 2, y: (p[0].y + p[1].y) / 2, d: Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y) };
    };
    fr.addEventListener('pointerdown', (e) => { e.preventDefault(); try { fr.setPointerCapture(e.pointerId); } catch (x) { /* not a live pointer */ } pts.set(e.pointerId, local(e)); last = gesture(); });
    fr.addEventListener('pointermove', (e) => {
      if (!pts.has(e.pointerId)) return;
      pts.set(e.pointerId, local(e));
      const g = gesture();
      if (last && g.d && last.d) v = cropZoom(v, v.z * g.d / last.d, g.x, g.y, w, h, F);
      if (last) v = cropPan(v, g.x - last.x, g.y - last.y, w, h, F);
      last = g; draw();
    });
    const up = (e) => { pts.delete(e.pointerId); last = pts.size ? gesture() : null; };
    fr.addEventListener('pointerup', up); fr.addEventListener('pointercancel', up);
    fr.addEventListener('wheel', (e) => { e.preventDefault(); const p = local(e); v = cropZoom(v, v.z * Math.exp(-e.deltaY / 400), p.x, p.y, w, h, F); draw(); }, { passive: false });
    fr.addEventListener('gesturestart', (e) => e.preventDefault());   // Safari: no page zoom on pinch
    zs.addEventListener('input', () => { v = cropZoom(v, +zs.value, F / 2, F / 2, w, h, F); draw(); });
    // the sheet closed some other way (Esc, a tab tap): count it as Cancel
    const layer = document.getElementById('layer');
    const mo = new MutationObserver(() => { if (!fr.isConnected) done(null); });
    mo.observe(layer, { childList: true });
    const done = (ok) => {
      if (!framing) return;
      framing = null; mo.disconnect();
      const F2 = fr.clientWidth || F;   // frame resized (phone turned): same view, rescaled
      if (ok && F2 !== F) { const r = F2 / F; v = { z: v.z, x: v.x * r, y: v.y * r }; F = F2; }
      resolve(ok ? cropRect(v, w, h, F) : null);
    };
    framing = { done };
  });
}

let pending = null;   // what the file picker is for: { kind: 'add' } | { kind: 'one', i }
/** Load, frame and shrink one picked file: data URL, null (cancelled), or throws a plain message. */
async function framedPhoto(file, step) {
  const img = await loadPhoto(file);
  const rect = await framePhoto(img, step);
  return rect ? squareDataURL(img, img.naturalWidth, img.naturalHeight, rect) : null;
}
async function onFiles(files) {
  const set = getSet(view.set);
  if (!set || !files.length) return;
  const job = pending; pending = null;
  let added = 0, bad = '';
  if (job && job.kind === 'one') {
    try { const d = await framedPhoto(files[0]); if (d) { set.people[job.i].img = d; added = 1; } } catch (e) { bad = e.message; }
  } else {
    const list = files.slice(0, Math.max(0, SET_MAX_PEOPLE - set.people.length));
    if (list.length < files.length) bad = `A set holds up to ${SET_MAX_PEOPLE} people.`;
    for (let n = 0; n < list.length; n++) {
      try { const d = await framedPhoto(list[n], list.length > 1 ? `${n + 1} of ${list.length}` : ''); if (d) { set.people.push({ id: newId('p'), name: '', img: d }); added++; } }
      catch (e) { bad = e.message; }
    }
  }
  if (added) putSet(set);
  X.closeSheet();
  X.render();
  if (bad) X.toast(bad);
  else if (added && (!job || job.kind !== 'one')) X.toast(added === 1 ? 'Added. Tap them to add a name.' : `Added ${added}. Tap each to add a name.`);
}

function download(name, text) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  a.download = name; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

async function onImport(file) {
  try {
    const text = await file.text();
    const j = JSON.parse(text);
    const list = Array.isArray(j) ? j : [j];
    let n = 0;
    for (const x of list.slice(0, 20)) {
      const s = cleanSet(x);
      if (!s.people.length) continue;
      s.id = newId('s');
      putSet(Object.assign(s, { where: uid ? 'account' : 'device' }), { now: true });
      n++;
    }
    X.toast(n ? `Imported ${n} set${n > 1 ? 's' : ''}` : 'No people found in that file.');
  } catch (e) { X.toast('That file isn\'t a Mystery Face set.'); }
  X.render();
}

/** Click handler for [data-pp] buttons (People tab + its sheets). Returns true if handled. */
export async function onClick(b) {
  const a = b.dataset.pp;
  const set = view.set ? getSet(view.set) : null;
  switch (a) {
    case 'close': X.closeSheet(); return true;
    case 'frameok': case 'framecancel': if (framing) framing.done(a === 'frameok'); return true;
    case 'moveall': await moveAll(); return true;
    case 'new': {
      const s = putSet({ id: newId('s'), title: 'My people', people: [], where: uid ? 'account' : 'device' }, { now: true });
      view.set = s.id; X.render(); return true;
    }
    case 'open': view.set = b.dataset.id; X.render(); return true;
    case 'back': view.set = null; X.render(); return true;
    case 'play': X.playWithSet(b.dataset.id); return true;
    case 'import': { const inp = document.getElementById('jsonPick'); inp.value = ''; inp.onchange = () => inp.files[0] && onImport(inp.files[0]); inp.click(); return true; }
    case 'addphotos': { pending = { kind: 'add' }; const inp = document.getElementById('filePick'); inp.multiple = true; inp.value = ''; inp.onchange = () => onFiles([...inp.files]); inp.click(); return true; }
    case 'photo1': { pending = { kind: 'one', i: +b.dataset.i }; const inp = document.getElementById('filePick'); inp.multiple = false; inp.value = ''; inp.onchange = () => onFiles([...inp.files]); inp.click(); return true; }
    case 'addnames':
      X.sheet(`<h3>Add names</h3><p class="muted small">One name per line. They show as name tiles; you can add photos later.</p>
        <textarea id="namesIn" rows="7" placeholder="Grandma&#10;Uncle Joe&#10;Sam"></textarea>
        <div class="row end"><button class="btn" data-pp="close">Cancel</button><button class="btn main" data-pp="addnames2">Add</button></div>`);
      setTimeout(() => document.getElementById('namesIn')?.focus(), 50);
      return true;
    case 'addnames2': {
      if (!set) return true;
      const lines = (document.getElementById('namesIn')?.value || '').split(/\n/).map((x) => x.replace(/\s+/g, ' ').trim().slice(0, 40)).filter(Boolean);
      const room = SET_MAX_PEOPLE - set.people.length;
      for (const n of lines.slice(0, room)) set.people.push({ id: newId('p'), name: n, img: null });
      if (lines.length) putSet(set);
      X.closeSheet(); X.render();
      if (lines.length > room) X.toast(`A set holds up to ${SET_MAX_PEOPLE} people.`);
      const dup = new Set(), seen = new Set();
      for (const p of set.people) { const k = p.name.toLowerCase(); if (k && seen.has(k)) dup.add(p.name); seen.add(k); }
      if (dup.size) X.toast(`Two people called ${[...dup][0]}: they'll show as "${[...dup][0]} (2)".`);
      return true;
    }
    case 'person': if (set) personSheet(set, +b.dataset.i); return true;
    case 'savename': {
      if (!set) return true;
      const i = +b.dataset.i;
      set.people[i].name = (document.getElementById('pName')?.value || '').replace(/\s+/g, ' ').trim().slice(0, 40);
      putSet(set); X.closeSheet(); X.render(); return true;
    }
    case 'nophoto': if (set) { set.people[+b.dataset.i].img = null; putSet(set); X.closeSheet(); X.render(); } return true;
    case 'delperson': if (set) { set.people.splice(+b.dataset.i, 1); putSet(set); X.closeSheet(); X.render(); } return true;
    case 'more':
      if (!set) return true;
      X.sheet(`<h3>${esc(set.title)}</h3><div class="col">
        <button class="btn" data-pp="export">Export (file)</button>
        ${set.where === 'device' && uid ? '<button class="btn" data-pp="toacct">Move to my account</button>' : ''}
        <button class="btn danger" data-pp="delset">Delete set</button>
        <button class="btn" data-pp="close">Close</button></div>`);
      return true;
    case 'export': if (set) { download((set.title || 'people').replace(/[^\w -]+/g, '').trim().replace(/\s+/g, '-') + '.mysteryface.json', JSON.stringify({ title: set.title, people: set.people }, null, 1)); X.closeSheet(); } return true;
    case 'toacct': {
      if (!set) return true;
      const r = await X.acct.saveSet(set);
      if (!r.ok) { X.toast(r.message); return true; }
      write(LOCAL, localSets().filter((s) => s.id !== set.id));
      acctSets.unshift(cleanSet(set)); write(cacheKey(uid), acctSets);
      X.closeSheet(); X.render(); X.toast('Moved to your account'); return true;
    }
    case 'delset':
      X.sheet(`<h3>Delete "${esc(set.title)}"?</h3><p class="muted">${set.people.length} people${set.where === 'account' ? ', from your account on every device' : ''}. This can't be undone.</p>
        <div class="row end"><button class="btn" data-pp="close">Keep</button><button class="btn main danger" data-pp="delset2">Delete</button></div>`);
      return true;
    case 'delset2': if (set) { await removeSet(set); view.set = null; X.closeSheet(); X.render(); } return true;
  }
  return false;
}
export const peopleBack = () => { if (view.set) { view.set = null; return true; } return false; };
export const peopleView = () => view;
export { face };
