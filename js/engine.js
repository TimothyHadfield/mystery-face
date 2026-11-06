// Mystery Face: the pure rules (no page, no network). Used by js/app.js for same-screen play and,
// through the shared js/online.js, for online rooms (the host's browser runs apply()).
//
// Turn order (Tim, 2026-11-06): "user 1 asks a question, user 2 answers, user 1 flips people,
// user 2 asks a question, and continue." A final guess replaces asking (or ends a turn after flipping).
//
// SECRETS NEVER ENTER THE STATE. Each player locks in their face with commitOf(face, salt) (SHA-256)
// at the pick; the face and salt stay on that player's phone. When someone guesses, the guessed
// player's phone answers right/wrong; at the end both reveal and the lock is checked, so a changed
// pick or a false "wrong" shows up in the review (state.flags). The host's browser holds the full
// state, but the full state holds no secret.
//
// Phases: dunno (both mark faces they don't know -> swapped; both press Ready) -> pick (both lock in)
//   -> ask -> answer -> flip -> ask ... ; guess -> verdict -> (reveal -> over) or (lives left: next turn)
//   over: both press Play again -> a new round, the other player starts. quit: a player left.

export const VERSION = 1;
export const Q_MAX = 120;
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
function shuffle(a, rng) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

function deal(s, rng) {
  const ids = shuffle(s.pool.slice(), rng);
  const n = Math.min(s.n, ids.length);
  s.board = ids.slice(0, n);
  s.spareIds = ids.slice(n);
  s.spare = s.spareIds.length;
  s.ready = [false, false];
  s.commits = [null, null];
  s.reveals = [null, null];
  s.again = [false, false];
  s.log = [];
  s.left = [n, n];
  s.lives = [s.maxLives, s.maxLives];
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

  /** options: { pool: [faceId...], n: 16|24|30, lives: 1|3, first: 0|1, custom: bool } */
  setup(nSeats, options, rng) {
    const o = options || {};
    const pool = Array.from(new Set((o.pool || []).map(String))).slice(0, 2000);
    if (pool.length < 2) fail('Not enough faces.');
    const s = {
      v: VERSION, round: 1, n: Math.max(2, Math.min(40, o.n | 0 || 24)),
      maxLives: o.lives === 3 ? 3 : 1, first: o.first === 1 ? 1 : 0, custom: !!o.custom,
      pool, score: [0, 0], gone: null, reason: '',
    };
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
    if (a.t === 'quit') {
      s.gone = seat; s.reason = 'left';
      if (s.winner === null && s.phase !== 'over') s.winner = other(seat);
      if (s.phase !== 'over' && s.phase !== 'reveal') s.score[other(seat)]++;
      s.phase = 'over';
      return s;
    }
    switch (s.phase) {
      case 'dunno': {
        if (a.t === 'ready') { s.ready[seat] = true; if (s.ready[0] && s.ready[1]) s.phase = 'pick'; break; }
        if (a.t !== 'swap' || !Array.isArray(a.idx)) fail('Pick faces to swap, or Ready.');
        const idx = Array.from(new Set(a.idx.map(Number))).filter((i) => Number.isInteger(i) && i >= 0 && i < s.board.length);
        for (const i of idx) { if (!s.spareIds.length) break; s.board[i] = s.spareIds.shift(); }
        s.spare = s.spareIds.length;
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
        if (a.t === 'guess') return guess(s, seat, a);
        if (a.t !== 'done') fail('Flip faces, then Done.');
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
        else {
          s.lives[p.by]--;
          if (s.lives[p.by] <= 0) { s.winner = other(p.by); s.reason = 'wrong'; }
        }
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
    const { pool, spareIds, ...pub } = s;
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
