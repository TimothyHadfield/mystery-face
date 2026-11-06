// Mystery Face: who's who. Decks (decks/index.json + decks/<id>/deck.json, built by tools in decks/),
// custom people (photos or names only), face ids, tile html, and photo shrinking for custom people.
//
// Face ids: "<deckId>/<personId>" for deck people, "c/<personId>" for custom people (the custom set
// travels with the game: the room's options.custom online, the saved game on this device).

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ------------------------------------------------------------------ decks
let INDEX = null;            // [{ id, title, count }]
const DECKS = new Map();     // id -> { id, title, people: [...], byId: Map }
const loading = new Map();

export async function loadIndex() {
  if (INDEX) return INDEX;
  try {
    const r = await fetch('decks/index.json', { cache: 'no-cache' });
    if (!r.ok) throw new Error(r.status);
    const j = await r.json();
    INDEX = Array.isArray(j) ? j.filter((d) => d && /^[a-z0-9_-]{1,40}$/i.test(d.id)) : [];
  } catch (e) { INDEX = []; }
  // the placeholder deck is only offered while no real deck exists
  if (!INDEX.length) INDEX = [{ id: 'sample', title: 'Sample shapes', count: 40 }];
  return INDEX;
}
export const deckIndex = () => INDEX || [];

export function loadDeck(id) {
  if (DECKS.has(id)) return Promise.resolve(DECKS.get(id));
  if (loading.has(id)) return loading.get(id);
  const p = fetch(`decks/${encodeURIComponent(id)}/deck.json`, { cache: 'no-cache' }).then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); }).then((j) => {
    const people = (j.people || []).filter((p) => p && p.id && p.name).map((p) => ({
      id: String(p.id), name: String(p.name), img: p.img ? `decks/${id}/${p.img}` : null,
      tags: Array.isArray(p.tags) ? p.tags.map((t) => String(t).toLowerCase()) : [], credit: p.credit || null,
      from: p.from ? String(p.from).slice(0, 40) : '',
      gender: /^[fmx]$/.test(p.gender) ? p.gender : 'x', kind: /^[a-z0-9-]{1,24}$/.test(p.kind) ? p.kind : '',
    }));
    const d = { id, title: j.title || id, people, byId: new Map(people.map((p) => [p.id, p])) };
    DECKS.set(id, d); loading.delete(id);
    return d;
  }).catch((e) => { loading.delete(id); throw e; });
  loading.set(id, p);
  return p;
}
export const deck = (id) => DECKS.get(id) || null;

/** Load every deck a list of face ids needs. */
export async function ensureFor(ids) {
  const need = new Set(ids.filter((x) => !x.startsWith('c/')).map((x) => x.split('/')[0]));
  await Promise.all([...need].map((d) => loadDeck(d).catch(() => null)));
}

/** Tags across decks, most common first: [{ tag, n }] */
export function tagCounts(deckIds) {
  const m = new Map();
  for (const id of deckIds) { const d = deck(id); if (!d) continue; for (const p of d.people) for (const t of p.tags) m.set(t, (m.get(t) || 0) + 1); }
  return [...m].map(([tag, n]) => ({ tag, n })).sort((a, b) => b.n - a.n);
}

/** The ids a board may draw from: chosen decks, then (if any) only people with one of the tags. */
export function poolFor(deckIds, tags) {
  const out = [];
  for (const id of deckIds) {
    const d = deck(id); if (!d) continue;
    for (const p of d.people) if (!tags || !tags.length || p.tags.some((t) => tags.includes(t))) out.push(id + '/' + p.id);
  }
  return out;
}

// Balanced dealing needs each deck person's gender + kind. Decks without the fields yet: kind from the
// tags (else the deck), gender unknown ('x').
const TAG_KIND = { actor: 'actor', movie: 'actor', music: 'music', sports: 'sports', politics: 'politics', president: 'politics',
  history: 'history', science: 'history', book: 'history', tv: 'tv', internet: 'internet', cartoon: 'character', character: 'character', art: 'art' };
/** One person, whatever deck: lower case, no accents, letters and digits only ("Beyoncé" = "beyonce"). */
export const nameKey = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 60);
/** { faceId: "gender|kind|namekey" } for the engine's balanced, one-copy-per-person deal. */
export function metaFor(ids, custom) {
  const out = {};
  for (const id of ids) {
    if (id.startsWith('c/')) {   // the player's own people, mixed into a deck
      const cp = custom && custom.people.find((p) => 'c/' + p.id === id);
      const nm = cp ? cp.name || '' : face(id).name;
      out[id] = 'x|custom' + (!nm || /^Unnamed \d+$/.test(nm) ? '' : '|' + nameKey(nm));
      continue;
    }
    const [d, pid] = id.split('/');
    const x = deck(d) && deck(d).byId.get(pid);
    if (!x) continue;
    const k = x.kind || (x.tags.map((t) => TAG_KIND[t]).find(Boolean)) || d.toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 24);
    out[id] = x.gender + '|' + k + '|' + nameKey(x.name);
  }
  return out;
}

// ------------------------------------------------------------------ custom people
let CUSTOM = null;   // the current game's custom set: { title, people: [{ id, name, img }] }
export function useCustom(set) { CUSTOM = set || null; }
export const currentCustom = () => CUSTOM;

/** "Unnamed 3" for a person with no name (number = their place in the set). Duplicate names get " (2)". */
export function displayNames(people) {
  const seen = new Map();
  return people.map((p, i) => {
    const base = (p.name || '').trim() || `Unnamed ${i + 1}`;
    const k = base.toLowerCase();
    const n = (seen.get(k) || 0) + 1; seen.set(k, n);
    return n > 1 ? `${base} (${n})` : base;
  });
}

// ------------------------------------------------------------------ one face
/** { id, name, img, tags, kind: 'deck'|'custom' } or a stand-in when the deck didn't load */
export function face(id) {
  if (!id) return { id, name: '?', img: null, tags: [] };
  if (id.startsWith('c/')) {
    const ppl = CUSTOM ? CUSTOM.people : [];
    const i = ppl.findIndex((p) => 'c/' + p.id === id);
    if (i < 0) return { id, name: '?', img: null, tags: [], kind: 'custom' };
    return { id, name: displayNames(ppl)[i], img: ppl[i].img || null, tags: [], kind: 'custom' };
  }
  const [d, p] = id.split('/');
  const x = deck(d) && deck(d).byId.get(p);
  return x ? { id, name: x.name, img: x.img, tags: x.tags, credit: x.credit, from: x.from, kind: 'deck' } : { id, name: '…', img: null, tags: [], kind: 'deck' };
}

export function initials(name) {
  const w = String(name || '?').replace(/\(\d+\)$/, '').trim().split(/\s+/).filter(Boolean);
  if (!w.length) return '?';
  return ((w[0][0] || '') + (w.length > 1 ? w[w.length - 1][0] : (w[0][1] || ''))).toUpperCase();
}
export function hue(name) {
  let h = 0; for (const c of String(name)) h = (h * 31 + c.codePointAt(0)) >>> 0;
  return h % 360;
}
/** The picture part of a tile: the photo, or a name tile (initials on a colour) when there is none / it fails. */
export function picHTML(f) {
  const ini = esc(initials(f.name));
  // deck people with no picture (name-only decks): the full name, plus where they're from
  if (!f.img && typeof f.from === 'string') return `<span class="nt full" style="--h:${hue(f.name)}"><b>${esc(f.name)}</b>${f.from ? `<small>${esc(f.from)}</small>` : ''}</span>`;
  const nt = `<span class="nt" style="--h:${hue(f.name)}">${ini}</span>`;
  if (!f.img) return nt;
  return `${nt}<img src="${esc(f.img)}" alt="" draggable="false" decoding="async" onerror="this.remove()">`;
}

// ------------------------------------------------------------------ photos: crop square, shrink, compress
export const PHOTO_PX = 128;
export const PHOTO_MAX_CHARS = 14000;   // ~10 KB of image as a data URL
export const UPLOAD_MAX_BYTES = 20 * 1024 * 1024;

/** File -> small square data URL (WebP where the browser can make it, else JPEG). Throws a plain message. */
export async function shrinkPhoto(file) {
  if (!file || !/^image\//.test(file.type || 'image/')) throw new Error('That isn\'t a picture.');
  if (file.size > UPLOAD_MAX_BYTES) throw new Error('That picture is too big (over 20 MB).');
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('That picture couldn\'t be opened.')); i.src = url; });
    return squareDataURL(img, img.naturalWidth, img.naturalHeight);
  } finally { URL.revokeObjectURL(url); }
}
export function squareDataURL(img, w, h) {
  const s = Math.min(w, h);
  const sx = (w - s) / 2;
  const sy = h > w ? (h - s) * 0.25 : 0;   // portrait photos: faces sit in the upper part
  const c = document.createElement('canvas'); c.width = c.height = PHOTO_PX;
  const g = c.getContext('2d');
  g.imageSmoothingQuality = 'high';
  g.drawImage(img, sx, sy, s, s, 0, 0, PHOTO_PX, PHOTO_PX);
  let out = '';
  for (const q of [0.78, 0.65, 0.5, 0.38]) {
    out = c.toDataURL('image/webp', q);
    if (!out.startsWith('data:image/webp')) out = c.toDataURL('image/jpeg', q); // Safari can't write WebP
    if (out.length <= PHOTO_MAX_CHARS) break;
  }
  return out;
}

// ------------------------------------------------------------------ sets: checks shared by import, account and rooms
export const SET_MAX_PEOPLE = 40;
const rid = () => Math.random().toString(36).slice(2, 10);
export const newId = (p) => p + rid() + rid().slice(0, 4);
/** Clean anything that claims to be a set (imports, account docs, room options). Never throws. */
export function cleanSet(x) {
  const o = x && typeof x === 'object' ? x : {};
  const people = (Array.isArray(o.people) ? o.people : []).slice(0, SET_MAX_PEOPLE).map((p) => ({
    id: /^[A-Za-z0-9_-]{1,24}$/.test(p && p.id) ? p.id : newId('p'),
    name: String((p && p.name) || '').replace(/\s+/g, ' ').trim().slice(0, 40),
    img: p && typeof p.img === 'string' && /^data:image\/(webp|jpeg|png);base64,[A-Za-z0-9+/=]+$/.test(p.img) && p.img.length <= PHOTO_MAX_CHARS * 2 ? p.img : null,
  }));
  const ids = new Set();
  for (const p of people) { while (ids.has(p.id)) p.id = newId('p'); ids.add(p.id); }
  return { id: /^[A-Za-z0-9_-]{1,40}$/.test(o.id) ? o.id : newId('s'), title: String(o.title || 'My people').trim().slice(0, 40) || 'My people', people, updatedAt: Number(o.updatedAt) || Date.now() };
}
