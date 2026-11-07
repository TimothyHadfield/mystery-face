// Mystery Face: the pure rules (no page, no network). Used by js/app.js for same-screen play and,
// through the shared js/online.js, for online rooms (the host's browser runs apply()).
//
// Turn order (Tim, 2026-11-06): "user 1 asks a question, user 2 answers, user 1 flips people,
// user 2 asks a question, and continue." On your turn you ask OR guess (Tim, 2026-11-06). A wrong guess
// doesn't lose: that face gets a red X on the guesser's board (s.xed[seat]), can't be guessed again,
// and the turn passes.
//
// SECRETS NEVER ENTER THE STATE. Each player locks in their face with commitOf(face, salt) (SHA-256)
// at the pick; the face and salt stay on that player's phone. When someone guesses, the guessed
// player's phone answers right/wrong; at the end both reveal and the lock is checked, so a changed
// pick or a false "wrong" shows up in the review (state.flags). The host's browser holds the full
// state, but the full state holds no secret.
//
// Phases: dunno (both mark faces they don't know -> swapped; both press Ready) -> pick (both lock in)
//   -> ask -> answer -> flip -> ask ... ; ask: guess -> verdict -> right: reveal -> over / wrong: X, next turn
//   over: both press Play again -> a new round, the other player starts. quit: a player left.

export const VERSION = 1;
export const Q_MAX = 120;
const HIST_MAX = 40;   // Back steps kept in the state (each ~1-3 KB; the room doc stays far under 1 MiB)
export const ANSWERS = ['yes', 'no', 'unsure'];

// ------------------------------------------------------------------ SHA-256 (sync, UTF-8)
const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
  0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
  0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
  0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2]);
export function sha256(str) {
  const msg = new TextEncoder().encode(String(str));
  const len = msg.length, total = Math.ceil((len + 9) / 64) * 64;
  const buf = new Uint8Array(total); buf.set(msg); buf[len] = 0x80;
  const dv = new DataView(buf.buffer);
  dv.setUint32(total - 4, (len * 8) >>> 0); dv.setUint32(total - 8, Math.floor(len / 0x20000000));
  const H = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);
  const W = new Uint32Array(64);
  const ror = (x, n) => (x >>> n) | (x << (32 - n));
  for (let o = 0; o < total; o += 64) {
    for (let i = 0; i < 16; i++) W[i] = dv.getUint32(o + i * 4);
    for (let i = 16; i < 64; i++) {
      const s0 = ror(W[i - 15], 7) ^ ror(W[i - 15], 18) ^ (W[i - 15] >>> 3);
      const s1 = ror(W[i - 2], 17) ^ ror(W[i - 2], 19) ^ (W[i - 2] >>> 10);
      W[i] = (W[i - 16] + s0 + W[i - 7] + s1) >>> 0;
    }
    let [a, b, c, d, e, f, g, h] = H;
    for (let i = 0; i < 64; i++) {
      const t1 = (h + (ror(e, 6) ^ ror(e, 11) ^ ror(e, 25)) + ((e & f) ^ (~e & g)) + K[i] + W[i]) >>> 0;
      const t2 = ((ror(a, 2) ^ ror(a, 13) ^ ror(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) >>> 0;
      h = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0;
    }
    H[0] += a; H[1] += b; H[2] += c; H[3] += d; H[4] += e; H[5] += f; H[6] += g; H[7] += h;
  }
  return Array.from(H, (x) => x.toString(16).padStart(8, '0')).join('');
}
export const commitOf = (face, salt) => sha256('mf1|' + face + '|' + salt);
/** 32 hex characters (128 bits). Pass crypto-backed randomness in the page; tests pass a seeded rng. */
export function makeSalt(rnd) {
  if (!rnd && globalThis.crypto && crypto.getRandomValues) {
    const a = crypto.getRandomValues(new Uint8Array(16));
    return Array.from(a, (x) => x.toString(16).padStart(2, '0')).join('');
  }
  let s = '';
  for (let i = 0; i < 32; i++) s += Math.floor((rnd || Math.random)() * 16).toString(16);
  return s;
}
/** Seeded random numbers (mulberry32), for tests and tools. */
export function rng32(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// ------------------------------------------------------------------ helpers
const other = (seat) => 1 - seat;
const fail = (m) => { throw new Error(m); };
const ID_RE = /^[A-Za-z0-9_.-]{1,40}\/[A-Za-z0-9_.-]{1,60}$/;
function cleanIds(a) { return Array.isArray(a) ? Array.from(new Set(a.map(String).filter((x) => ID_RE.test(x)))).slice(-600) : []; }
// meta = "gender|kind|namekey|sub|franchise|actor" (the last three optional; older pages send only 2-3 parts)
const META_RE = /^[fmx]\|[a-z0-9-]{0,24}(\|[a-z0-9-]{0,60}){0,4}$/;
function cleanMeta(m, pool) {
  if (!m || typeof m !== 'object') return null;
  const out = {};
  for (const id of pool) if (typeof m[id] === 'string' && META_RE.test(m[id])) out[id] = m[id];
  return Object.keys(out).length ? out : null;
}
function shuffle(a, rng) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

// ------------------------------------------------------------------ face memory
// Tim, 2026-11-06: "Remember all charactors on a users account as either known, don't know, or unused. We
// want to reuse the characters that are known, and not the charactors that are unknown, while still filling
// charactors that are unused ... Also remember how many games it's been since a charactor has been used".
// Tim, 2026-11-07: "Reshuffling someone doesn't make them not be selected in future rounds, it just makes them
// reshuffle. All the don't know or know considerations are outside of the actual games." So only Sort faces
// sets known / don't-know; a game only records when a face was last on a board.
// Stored (localStorage + the account): { v: 2, g: games so far, k: { faceId: 0 } known (Sort faces),
// u: { faceId: game no. } don't-know (Sort faces), l: { faceId: game no. last on a board } }.
// A face in neither k nor u is unsorted. gamesSince = g - l[id] (never on a board: SORTED_AGE).
// v1 (games marked kept faces known, k = game no.): k stays known, and its game no. becomes l.
// For a deal the page sends the short form { k: ["faceId~gamesSince"], u: [faceId], l: ["faceId~gamesSince"] }.
export const MEM_MAX = 5000;
const MEM_ID = /^(c|[A-Za-z0-9_.-]{1,40})\/[A-Za-z0-9_.-]{1,60}$/;
function memTrim(m) {   // over MEM_MAX: forget the oldest sightings, then the known faces seen longest ago (unknown ones are kept)
  const ls = Object.keys(m.l);
  if (ls.length > MEM_MAX) ls.sort((a, b) => m.l[a] - m.l[b]).slice(0, ls.length - MEM_MAX).forEach((id) => delete m.l[id]);
  const ks = Object.keys(m.k);
  const over = ks.length + Object.keys(m.u).length - MEM_MAX;
  if (over > 0) ks.sort((a, b) => (m.l[a] || 0) - (m.l[b] || 0)).slice(0, over).forEach((id) => delete m.k[id]);
  return m;
}
export function memClean(x) {
  const o = x && typeof x === 'object' ? x : {};
  const g = Math.max(0, Math.min(1e7, Math.floor(Number(o.g)) || 0));
  const part = (p) => { const out = {}; if (p && typeof p === 'object') for (const [id, v] of Object.entries(p)) { const n = Math.floor(Number(v)); if (MEM_ID.test(id) && n >= 0 && n <= g) out[id] = n; } return out; };
  const k = part(o.k), u = part(o.u);
  let l = part(o.l);
  if (!(o.v >= 2)) { l = {}; for (const id in k) if (k[id] > 0) l[id] = k[id]; }   // v1: k held the last sighting
  for (const id in k) k[id] = 0;
  for (const id in u) delete k[id];
  return memTrim({ v: 2, g, k, u, l });
}
/** The player marked these as don't-know (custom people never are: they made them). */
export function memMarkUnknown(m, ids) {
  const x = memClean(m);
  for (const id of ids || []) if (MEM_ID.test(id) && !id.startsWith('c/')) { x.u[id] = x.g; delete x.k[id]; }
  return memTrim(x);
}
/** "Sort faces" Know. A face never on a board counts as long unused (SORTED_AGE) in the deal. */
export const SORTED_AGE = 20;
export function memMarkKnown(m, ids) {
  const x = memClean(m);
  for (const id of ids || []) if (MEM_ID.test(id) && !id.startsWith('c/')) { delete x.u[id]; x.k[id] = 0; }
  return memTrim(x);
}
/** One more game: every face on the board was used now. Known / don't-know stay as they are. */
export function memRecord(m, board) {
  const x = memClean(m);
  x.g++;
  for (const id of board || []) if (MEM_ID.test(id)) x.l[id] = x.g;
  return memTrim(x);
}
/** Device + account memory: union; unknown wins over known; the most recent sighting is kept. */
export function memMerge(a, b) {
  const A = memClean(a), B = memClean(b), g = Math.max(A.g, B.g);
  const out = { v: 2, g, k: {}, u: {}, l: {} };
  for (const M of [A, B]) for (const id in M.u) out.u[id] = Math.max(out.u[id] ?? 0, g - (M.g - M.u[id]));
  for (const M of [A, B]) for (const id in M.k) if (!(id in out.u)) out.k[id] = 0;
  for (const M of [A, B]) for (const id in M.l) out.l[id] = Math.max(out.l[id] ?? 0, g - (M.g - M.l[id]));
  return memTrim(out);
}
/** The short form a deal needs, only for the faces in `ids` (all when null). */
export function memForDeal(m, ids) {
  const x = memClean(m), want = ids ? new Set(ids) : null;
  const age = (id) => (id in x.l ? x.g - x.l[id] : Math.max(x.g, SORTED_AGE));
  const k = [], u = [], l = [];
  for (const id in x.k) if (!want || want.has(id)) k.push(id + '~' + age(id));
  for (const id in x.u) if (!want || want.has(id)) u.push(id);
  for (const id in x.l) if (!(id in x.k) && !(id in x.u) && (!want || want.has(id))) l.push(id + '~' + age(id));
  return { k, u, l };
}
// In the state: s.mems[seat] = { k: { faceId: gamesSince }, u: [faceId] } (seat 0 from the options, each
// seat's own from its first swap of a round), s.marks[seat] = faces that seat swapped out this round.
function cleanDM(dm, pool) {
  if (!dm || typeof dm !== 'object') return null;
  const k = {}, u = [], l = {};
  const ages = (list, into) => { for (const e of Array.isArray(list) ? list.slice(0, MEM_MAX) : []) { const r = /^(.{3,101})~(\d{1,7})$/.exec(String(e)); if (r && pool.has(r[1])) into[r[1]] = +r[2]; } };
  ages(dm.k, k); ages(dm.l, l);
  for (const x of Array.isArray(dm.u) ? dm.u.slice(0, MEM_MAX) : []) { const id = String(x); if (pool.has(id) && !id.startsWith('c/')) { u.push(id); delete k[id]; delete l[id]; } }
  for (const id in k) delete l[id];
  return { k, u, l };
}
/** Both players' memories as one: unknown to either = left out; known = known to both. age = games since
 *  either last saw it on a board (never: SORTED_AGE). */
function dealMem(s) {
  const ms = (s.mems || []).filter(Boolean);
  if (!ms.length) return null;
  const unknown = new Set(ms.flatMap((m) => m.u));
  const known = new Map(), age = new Map();
  for (const m of ms) for (const part of [m.k, m.l || {}]) for (const id in part) age.set(id, Math.min(age.get(id) ?? Infinity, part[id]));
  for (const id in ms[0].k) if (!unknown.has(id) && ms.every((m) => id in m.k)) known.set(id, age.get(id));
  return { unknown, known, age };
}
/** A new round (once): every face on this board was just used. Known / don't-know never change in a game. */
function ageMems(s) {
  if (!s.mems || s.memRound === s.round) return;
  s.memRound = s.round;
  s.mems.forEach((m) => {
    if (!m) return;
    m.l = m.l || {};
    for (const id in m.k) m.k[id]++;
    for (const id in m.l) m.l[id]++;
    for (const id of s.board) { if (id in m.k) m.k[id] = 0; else if (!m.u.includes(id)) m.l[id] = 0; }
  });
}

// ------------------------------------------------------------------ balanced dealing
// s.meta = { faceId: "g|kind|namekey|sub|franchise|actor" } when the page knows it; s.avoid = face ids a
// player said they don't know this game. Tim, 2026-11-06: "I want the characters to be a better
// distribution ... Track the people that user clicks I don't know and don't give it to them again."
// And (Mixed stars): "make sure the mixed game has a good distribution of movie characters, actors,
// athletes, polititians, and custom characters while avoiding anyone too similar."
const KIND_CAP = 0.3, CUSTOM_SHARE = 0.35, NEW_SHARE = 0.3;
// Mixed stars, by share of the board; everything else (actors, music, history, TV, internet, art) is "rest"
const MIX_SHARE = { character: 0.42, sports: 0.17, politics: 0.12, custom: 0.17 };
const MIX_SHARE_SOLO = { character: 0.45, sports: 0.2, politics: 0.13 };   // no custom people
// namekey (normalised name) stops the same person showing twice when two decks both hold them (Mixed
// stars copies people from the others; custom people can share a name). actor: a character played by
// someone (that someone's namekey), so neither a second role nor the actor's own card joins them.
const metaOf = (s, id) => {
  const m = s.meta && s.meta[id];
  const [g, k, nk, sub, fr, ac] = String(m || 'x|').split('|');
  return { g: g || 'x', k: k || '', nk: nk || id, sub: sub || '', fr: fr || '', ac: ac || '' };
};
const personOf = (s, id) => metaOf(s, id).nk;
/** Shuffled ids with each person kept once (the first copy). */
function onePerPerson(s, ids) { const seen = new Set(); return ids.filter((id) => { const p = personOf(s, id); if (seen.has(p)) return false; seen.add(p); return true; }); }
function pickW(list, w, rng) {
  let tot = 0; for (const id of list) tot += w(id);
  let r = rng() * tot;
  for (const id of list) { r -= w(id); if (r < 0) return id; }
  return list[list.length - 1];
}
/**
 * From shuffled ids, take n: spread over kinds (Mixed stars: by MIX_SHARE; else no kind over ~30%, the
 * player's own people up to ~35%), about even women/men, ~30% never-seen faces when a memory is given
 * (known ones weighted by games since last seen), at most 1 per franchise and never the same actor twice.
 * opt: { mixed, mem: { known: Map(id -> gamesSince), unknown: Set }, rng }
 */
export function pickBalanced(ids, n, meta, opt = {}) {
  if (!meta && !opt.mem) return { board: ids.slice(0, n), rest: ids.slice(n) };
  const s = { meta }, rng = opt.rng || Math.random, mem = opt.mem || null, mixed = !!opt.mixed && !!meta;
  const M = new Map(ids.map((id) => [id, metaOf(s, id)]));
  const groupOf = (m) => (!meta ? '' : mixed ? (m.k in MIX_SHARE ? m.k : 'rest') : m.k);
  const groups = new Map();
  for (const id of ids) { const gk = groupOf(M.get(id)); if (!groups.has(gk)) groups.set(gk, []); groups.get(gk).push(id); }
  const target = new Map();
  if (mixed) {
    const share = groups.has('custom') ? MIX_SHARE : MIX_SHARE_SOLO;
    const rest = 1 - Object.values(share).reduce((a, b) => a + b, 0);
    for (const gk of groups.keys()) target.set(gk, Math.max(1, Math.round(n * (gk === 'rest' ? rest : share[gk] || 0))));
  } else {
    for (const gk of groups.keys()) target.set(gk, Math.max(1, Math.ceil(n * (gk === 'custom' ? CUSTOM_SHARE : KIND_CAP))));
  }
  const isNew = (id) => !!mem && !mem.known.has(id);
  // games since last on a board: longer ago = likelier (unsorted faces too, so a game doesn't repeat them)
  const ageOf = (id) => (mem.age && mem.age.has(id) ? mem.age.get(id) : mem.known.has(id) ? mem.known.get(id) : SORTED_AGE);
  const w = (id) => (mem ? Math.pow(1 + ageOf(id), 1.5) : 1) * (M.get(id).k === 'custom' ? 1.5 : 1);
  const board = [], taken = new Set(), used = new Set(), fr = new Map(), have = new Map(), gc = { f: 0, m: 0, x: 0 }, spread = new Map();
  let fresh = 0;
  const spreadKey = (m) => (mixed ? (m.k === 'character' ? 'c:' + m.sub : 'k:' + m.k) : '');
  const take = (id) => {
    const m = M.get(id);
    board.push(id); taken.add(id); used.add(m.nk); if (m.ac) used.add(m.ac);
    if (m.fr) fr.set(m.fr, (fr.get(m.fr) || 0) + 1);
    const gk = groupOf(m); have.set(gk, (have.get(gk) || 0) + 1);
    gc[m.g in gc ? m.g : 'x']++; if (isNew(id)) fresh++;
    const sk = spreadKey(m); spread.set(sk, (spread.get(sk) || 0) + 1);
  };
  const free = (id, frMax) => {
    if (taken.has(id)) return false;
    const m = M.get(id);
    if (used.has(m.nk) || (m.ac && used.has(m.ac))) return false;
    return !m.fr || (fr.get(m.fr) || 0) < frMax;
  };
  // one face from a list: soft wishes dropped one by one (gender, then known/new), then weighted
  const choose = (list, frMax) => {
    let c = list.filter((id) => free(id, frMax));
    if (!c.length) return null;
    const wantG = gc.f <= gc.m ? 'f' : 'm';
    const wantNew = mem ? fresh < NEW_SHARE * (board.length + 1) : null;
    const tiers = [
      (id) => (wantNew === null || isNew(id) === wantNew) && M.get(id).g === wantG,
      (id) => wantNew === null || isNew(id) === wantNew,
      (id) => M.get(id).g === wantG,
    ];
    for (const t of tiers) { const x = c.filter(t); if (x.length) { c = x; break; } }
    if (mixed) {   // spread inside a group: animated/live characters, and the kinds in "rest"
      const lo = Math.min(...c.map((id) => spread.get(spreadKey(M.get(id))) || 0));
      c = c.filter((id) => (spread.get(spreadKey(M.get(id))) || 0) === lo);
    }
    return pickW(c, w, rng);
  };
  // fill the group furthest below its share first
  const done = new Set();
  while (board.length < n) {
    const order = [...groups.keys()].filter((gk) => !done.has(gk)).sort((a, b) => {
      const fa = (have.get(a) || 0) / target.get(a), fb = (have.get(b) || 0) / target.get(b);
      return (fa >= 1) - (fb >= 1) || fa - fb;
    });
    if (!order.length) break;
    const gk = order[0];
    if (!mixed && (have.get(gk) || 0) >= target.get(gk)) break;   // every kind at its cap: fill below
    const id = choose(groups.get(gk), 1);
    if (id) take(id); else done.add(gk);
  }
  // too few to keep every rule: a 2nd card of a franchise, then anything not the same person/actor
  for (const frMax of [1, 2, Infinity]) while (board.length < n) { const id = choose(ids, frMax); if (!id) break; take(id); }
  for (const id of ids) { if (board.length >= n) break; if (!taken.has(id) && !used.has(M.get(id).nk)) take(id); }
  return { board, rest: ids.filter((id) => !taken.has(id)) };
}
/** Faces this deal must not use: either player's don't-knows (Sort faces), plus faces reshuffled away this round. */
function avoidOf(s, dm) {
  const avoid = new Set((s.avoid || []).concat(...(s.marks || [])));
  if (dm) for (const id of dm.unknown) avoid.add(id);
  return { avoid, avoidP: new Set([...avoid].map((id) => personOf(s, id))) };
}
/** The spare that best replaces a face: no look-alike, same gender + kind, then same gender, then same kind, then any; known first. */
function bestSpare(s, out) {
  const dm = dealMem(s);
  const { avoid, avoidP } = avoidOf(s, dm);
  const used = new Set();   // never a second copy of anyone showing, nor a second role of an actor
  const frOn = new Set();
  for (const id of s.board) { const m = metaOf(s, id); used.add(m.nk); if (m.ac) used.add(m.ac); if (id !== out && m.fr) frOn.add(m.fr); }
  const ok = s.spareIds.map((id, j) => [id, j]).filter(([id]) => {
    const m = metaOf(s, id);
    return !avoid.has(id) && !avoidP.has(m.nk) && !used.has(m.nk) && !(m.ac && used.has(m.ac));
  });
  if (!ok.length) return -1;
  if (!s.meta && !dm) return ok[0][1];
  const score = ([id]) => (dm && dm.known.has(id) ? 1 + dm.known.get(id) : 0);
  const best = (list) => list.reduce((a, b) => (score(b) > score(a) ? b : a))[1];
  const noFr = ok.filter(([id]) => !frOn.has(metaOf(s, id).fr));
  const m = metaOf(s, out);
  const tests = [(x) => x.g === m.g && x.k === m.k, (x) => x.g === m.g && m.g !== 'x', (x) => x.k === m.k, () => true];
  for (const list of [noFr, ok]) for (const t of tests) { const hit = list.filter(([id]) => t(metaOf(s, id))); if (hit.length) return best(hit); }
  return ok[0][1];
}

/**
 * Several decks picked (Tim, 2026-11-06: "allow the user to select multiple categories ... then give an equal
 * distribution of charactors from each selected category"): an equal share of the board per deck, each share
 * balanced inside its deck as usual; no person, actor or (where possible) franchise twice across decks.
 * Custom people ("c/...") go with Mixed stars. A deck too small for its share leaves the rest to the others.
 */
export function pickByDeck(ids, n, meta, opt = {}) {
  // opt.groups: { faceId: 'set:<id>' } puts a "Your people" set in its own category (Tim, 2026-11-06)
  const g = opt.groups || {};
  const deckOf = (id) => g[id] || (id.startsWith('c/') ? 'mixed' : id.split('/')[0]);
  const decks = [...new Set(ids.map(deckOf))];
  if (decks.length < 2) return pickBalanced(ids, n, meta, opt);
  const rng = opt.rng || Math.random, s = { meta };
  const order = shuffle(decks.slice(), rng);   // who gets the odd extra cards
  const share = new Map(order.map((d, i) => [d, Math.floor(n / decks.length) + (i < n % decks.length ? 1 : 0)]));
  const board = [], usedP = new Set(), usedFr = new Set();
  const clash = (id, fr) => { const m = metaOf(s, id); return usedP.has(m.nk) || (m.ac && usedP.has(m.ac)) || (fr && m.fr && usedFr.has(m.fr)); };
  const take = (list) => { for (const id of list) { const m = metaOf(s, id); board.push(id); usedP.add(m.nk); if (m.ac) usedP.add(m.ac); if (m.fr) usedFr.add(m.fr); } };
  for (const d of order) {
    const mine = ids.filter((id) => deckOf(id) === d && !board.includes(id));
    let list = mine.filter((id) => !clash(id, true));
    if (list.length < share.get(d)) list = mine.filter((id) => !clash(id, false));
    const want = Math.min(share.get(d), n - board.length);
    if (want > 0) take(pickBalanced(list, want, meta, Object.assign({}, opt, { mixed: opt.mixed && d === 'mixed' })).board);
  }
  // short decks: fill from whatever is left, still one per person
  for (const fr of [true, false]) for (const id of ids) { if (board.length >= n) break; if (!board.includes(id) && !clash(id, fr)) take([id]); }
  const taken = new Set(board);
  return { board, rest: ids.filter((id) => !taken.has(id)) };
}

function deal(s, rng) {
  s.marks = [[], []];   // last round's reshuffles may come back
  const dm = dealMem(s);
  const { avoid, avoidP } = avoidOf(s, dm);
  const ok = s.pool.filter((id) => !avoid.has(id) && !avoidP.has(personOf(s, id)));
  const ids = onePerPerson(s, shuffle(ok.slice(), rng));
  const pick = (s.byDeck ? pickByDeck : pickBalanced)(ids, s.n, s.meta, { mixed: s.mixed, mem: dm, rng, groups: s.groups });
  // too few faces they know: top up from the avoided ones (only when the board can't be filled otherwise)
  if (pick.board.length < s.n) {
    const have = new Set(pick.board.concat(pick.rest).map((id) => personOf(s, id)));
    const extra = onePerPerson(s, shuffle(s.pool.filter((id) => !have.has(personOf(s, id))), rng));
    pick.board.push(...extra.splice(0, s.n - pick.board.length));
    pick.rest.push(...extra);
  }
  const n = pick.board.length;
  s.board = shuffle(pick.board, rng);   // picked in kind order: mix the seats
  s.spareIds = pick.rest;
  s.spare = s.spareIds.length;
  s.fresh = [];
  s.marks = [[], []];
  s.ready = [false, false];
  s.commits = [null, null];
  s.reveals = [null, null];
  s.again = [false, false];
  s.log = [];
  s.left = [n, n];
  s.xed = [[], []];
  s.turn = s.first;
  s.pending = null;
  s.winner = null;
  s.flags = [];
  s.phase = s.custom ? 'pick' : 'dunno';
}

// ------------------------------------------------------------------ the game object (online.js contract)
export const game = {
  id: 'mystery-face',
  minSeats: 2, maxSeats: 2,

  /** options: { pool: [faceId...], n: 16|24|30, first: 0|1, custom: bool } */
  setup(nSeats, options, rng) {
    const o = options || {};
    const pool = Array.from(new Set((o.pool || []).map(String))).slice(0, 2000);
    if (pool.length < 2) fail('Not enough faces.');
    const s = {
      v: VERSION, round: 1, n: Math.max(2, Math.min(40, o.n | 0 || 24)),
      first: o.first === 1 ? 1 : 0, custom: !!o.custom,
      pool, score: [0, 0], gone: null, reason: '',
      meta: cleanMeta(o.meta, pool), avoid: cleanIds(o.avoid), mixed: !!o.mixed,
    };
    if (o.byDeck) s.byDeck = true;
    if (o.groups && typeof o.groups === 'object') {   // { 'c/<id>': 'set:<id>' }: each picked set is its own category
      const gr = {};
      for (const id of pool) if (id.startsWith('c/') && /^set:[\w-]{1,40}$/.test(String(o.groups[id] || ''))) gr[id] = o.groups[id];
      if (Object.keys(gr).length) s.groups = gr;
    }
    // o.mem: the starting player's face memory (memForDeal); the other seat's arrives with its first swap
    const dm = cleanDM(o.mem, new Set(pool));
    if (dm) s.mems = [dm, null];
    deal(s, rng);
    return s;
  },

  toAct(s) {
    if (s.gone !== null && s.gone !== undefined) return [];
    switch (s.phase) {
      case 'dunno': return [0, 1].filter((i) => !s.ready[i]);
      case 'pick': return [0, 1].filter((i) => !s.commits[i]);
      case 'ask': case 'flip': return [s.turn];
      case 'answer': return [other(s.turn)];
      case 'verdict': return [other(s.pending.by)];
      case 'reveal': return [0, 1].filter((i) => !s.reveals[i]);
      case 'over': return [0, 1].filter((i) => !s.again[i]);
    }
    return [];
  },

  apply(s, seat, a, rng) {
    if (!a || typeof a !== 'object') fail('No move.');
    // Back (Tim, 2026-11-06: "goes back to the previous action no matter what it is"): any seat that may act
    // can roll the shared state back one move. Automatic steps (verdict, reveal) are skipped over.
    if (a.t === 'undo') {
      const h = s.hist || [];
      let prev = h.pop();
      while (prev && (prev.phase === 'verdict' || prev.phase === 'reveal') && h.length) prev = h.pop();
      if (!prev || prev.phase === 'verdict' || prev.phase === 'reveal') fail('Nothing to undo.');
      const back = Object.assign(prev, { pool: s.pool, meta: s.meta, hist: h, spareIds: prev.spareIds || s.spareIds });
      if (s.mems) Object.assign(back, { mems: s.mems, memRound: s.memRound });   // memory only moves forward
      return back;
    }
    if (a.t !== 'quit') {
      // meta never changes, and the memories only move forward: keep them out of the copies
      const { pool, hist, spareIds, meta, mems, memRound, ...snap } = s;
      if (s.phase === 'dunno') snap.spareIds = spareIds;   // only swaps use the spares
      s.hist = (hist || []).concat([JSON.parse(JSON.stringify(snap))]).slice(-HIST_MAX);
      if (snap.spareIds) while (s.hist.length > 1 && JSON.stringify(s.hist).length > 300000) s.hist.shift();
    }
    if (a.t === 'quit') {
      s.gone = seat; s.reason = 'left';
      if (s.winner === null && s.phase !== 'over') s.winner = other(seat);
      if (s.phase !== 'over' && s.phase !== 'reveal') s.score[other(seat)]++;
      s.phase = 'over';
      return s;
    }
    switch (s.phase) {
      case 'dunno': {
        // both ready: the round's faces count as used (memories only age, nothing becomes known/unknown)
        const toPick = () => { if (s.ready[0] && s.ready[1]) { ageMems(s); s.phase = 'pick'; } };
        if (a.t === 'ready') { s.ready[seat] = true; toPick(); break; }
        if (a.t !== 'swap' || !Array.isArray(a.idx)) fail('Pick faces to swap, or Ready.');
        // a.avoid: this player's remembered don't-knows (sent once a round); a.quiet: no highlight;
        // a.seen: this player's face memory (memForDeal), used from the next deal on
        if (a.avoid) s.avoid = cleanIds((s.avoid || []).concat(cleanIds(a.avoid)));
        if (a.seen && seat >= 0 && seat <= 1) {
          const dm = cleanDM(a.seen, new Set(s.pool));
          if (dm) { s.mems = s.mems || [null, null]; s.mems[seat] = dm; }
        }
        const idx = Array.from(new Set(a.idx.map(Number))).filter((i) => Number.isInteger(i) && i >= 0 && i < s.board.length);
        const swapped = [];
        // reshuffled = "don't want this time": gone for this round only, not remembered (Tim, 2026-11-07)
        s.marks = s.marks || [[], []];
        if (seat >= 0 && seat <= 1) s.marks[seat] = Array.from(new Set(s.marks[seat].concat(idx.map((i) => s.board[i])))).slice(-200);
        for (const i of idx) {
          const j = bestSpare(s, s.board[i]);
          if (j < 0) break;
          s.board[i] = s.spareIds.splice(j, 1)[0]; swapped.push(i);
        }
        s.spare = s.spareIds.length;
        if (!swapped.length) { if (a.ready) { s.ready[seat] = true; toPick(); } break; }
        if (!a.quiet) s.fresh = swapped;
        s.ready = [false, false]; // new faces: both look again
        if (a.ready) s.ready[seat] = true;
        break;
      }
      case 'pick': {
        if (a.t !== 'commit' || typeof a.hash !== 'string' || !/^[0-9a-f]{64}$/.test(a.hash)) fail('Lock in a face.');
        s.commits[seat] = a.hash;
        if (s.commits[0] && s.commits[1]) { s.phase = 'ask'; s.turn = s.first; }
        break;
      }
      case 'ask': {
        if (a.t === 'guess') return guess(s, seat, a);
        if (a.t !== 'ask') fail('Ask a question or make a guess.');
        const q = String(a.q || '').replace(/\s+/g, ' ').trim();
        if (!q && !a.aloud) fail('Type a question.');
        if (q.length > Q_MAX) fail('That question is too long.');
        const e = { by: seat, q };
        if (a.tag && typeof a.tag === 'string' && /^[a-z0-9-]{1,24}$/.test(a.tag)) e.tag = a.tag;
        s.log.push(e);
        // Same screen (Tim, 2026-11-06): asked and answered out loud, the asker flips, then "Asked" passes the turn
        if (a.aloud && a.pass) {
          const left = Number(a.left);
          if (Number.isInteger(left) && left >= 0 && left <= s.board.length) s.left[seat] = left;
          s.turn = other(seat);
          break;
        }
        s.phase = 'answer';
        break;
      }
      case 'answer': {
        if (a.t !== 'answer' || !ANSWERS.includes(a.a)) fail('Answer Yes, No or Not sure.');
        s.log[s.log.length - 1].a = a.a;
        s.phase = 'flip';
        break;
      }
      case 'flip': {
        if (a.t !== 'done') fail('Flip faces, then Next.');
        const left = Number(a.left);
        if (Number.isInteger(left) && left >= 0 && left <= s.board.length) s.left[seat] = left;
        s.turn = other(seat); s.phase = 'ask';
        break;
      }
      case 'verdict': {
        if (a.t !== 'verdict' || typeof a.ok !== 'boolean') fail('Say right or wrong.');
        const p = s.pending;
        s.log.push({ by: p.by, guess: p.face, ok: a.ok });
        s.pending = null;
        if (a.ok) { s.winner = p.by; s.reason = 'guessed'; }
        else s.xed[p.by].push(p.face);   // wrong: a red X on the guesser's board, the game goes on
        if (s.winner !== null) { s.score[s.winner]++; s.phase = 'reveal'; }
        else { s.turn = other(p.by); s.phase = 'ask'; }
        break;
      }
      case 'reveal': {
        if (a.t !== 'reveal') fail('Show your face.');
        const face = String(a.face || ''), salt = String(a.salt || '');
        s.reveals[seat] = { face, ok: !!face && s.board.includes(face) && commitOf(face, salt) === s.commits[seat] };
        if (s.reveals[0] && s.reveals[1]) finish(s);
        break;
      }
      case 'over': {
        if (a.t !== 'again') fail('The round is over.');
        s.again[seat] = true;
        if (s.again[0] && s.again[1]) {
          s.round++; s.first = other(s.first);
          // a new board from the faces not on this one (whole pool again if it is too small)
          const fresh = s.pool.filter((id) => !s.board.includes(id));
          const keep = s.pool;
          if (fresh.length >= s.n && !s.custom) s.pool = fresh;
          deal(s, rng);
          s.pool = keep;
        }
        break;
      }
      default: fail('Unknown phase.');
    }
    return s;
  },

  publicView(s) {
    const { pool, spareIds, meta, avoid, hist, mems, memRound, marks, ...pub } = s;
    pub.undo = (hist || []).filter((h) => h.phase !== 'verdict' && h.phase !== 'reveal').length;
    return pub;
  },
  privateView() { return null; },
  // A computer only ever sits in a seat whose player left the room: it ends the game.
  bot() { return { t: 'quit' }; },
  isOver(s) { return s.gone !== null && s.gone !== undefined; },
};

function guess(s, seat, a) {
  const face = String(a.face || '');
  if (!s.board.includes(face)) fail('Guess a face on the board.');
  if (s.xed[seat].includes(face)) fail('You already guessed them.');
  s.pending = { by: seat, face };
  s.phase = 'verdict';
  return s;
}

// Both faces are shown: check every lock and every right/wrong answer against them.
function finish(s) {
  s.phase = 'over';
  s.flags = [];
  for (const i of [0, 1]) if (!s.reveals[i].ok) s.flags.push({ kind: 'lock', seat: i });
  for (let k = 0; k < s.log.length; k++) {
    const e = s.log[k];
    if (!('guess' in e)) continue;
    const r = s.reveals[other(e.by)];
    if (!r.ok) continue;
    if ((r.face === e.guess) !== e.ok) s.flags.push({ kind: 'verdict', seat: other(e.by), i: k });
  }
}

/**
 * End-of-round review: questions asked from a tag chip ("Are they an actor?") can be checked against
 * the face that was revealed. Returns [{ i: logIndex, expect: 'yes'|'no' }] for answers that disagree.
 * faces[seat] = that seat's revealed face id (or null); tagsOf(faceId) -> [tags]. Free-typed questions
 * and "Not sure" are never flagged (no way to know).
 */
export function checkReview(log, faces, tagsOf) {
  const out = [];
  log.forEach((e, i) => {
    if (!e.tag || !e.a || e.a === 'unsure') return;
    const face = faces[other(e.by)];
    if (!face) return;
    const tags = tagsOf(face);
    if (!tags || !tags.length) return;
    const expect = tags.includes(e.tag) ? 'yes' : 'no';
    if (expect !== e.a) out.push({ i, expect });
  });
  return out;
}
