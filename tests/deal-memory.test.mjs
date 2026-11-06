// Face memory + the smarter Mixed deal (2026-11-06). Tim: "We want to reuse the characters that are known,
// and not the charactors that are unknown, while still filling charactors that are unused ... prioritize
// charactors that haven't been used in a while more, while still getting the type distribution good."
// Only game + rng32 are imported, so on the old engine these fail on behaviour, not on a missing export.
import test from 'node:test';
import assert from 'node:assert/strict';
import { game, rng32 } from '../js/engine.js';

const ids = (pre, n) => Array.from({ length: n }, (_, i) => `${pre}/p${i}`);
const play = (s, seat, a, rng) => game.apply(JSON.parse(JSON.stringify(s)), seat, a, rng);

test('faces marked unknown are never dealt (while enough others exist)', () => {
  const pool = ids('movies', 80);
  const unknown = pool.slice(0, 40);
  for (let seed = 1; seed <= 40; seed++) {
    const s = game.setup(2, { pool, n: 24, mem: { k: [], u: unknown } }, rng32(seed));
    assert.equal(s.board.filter((id) => unknown.includes(id)).length, 0, `seed ${seed}`);
  }
});

test('long-unused known faces are chosen far more often than just-used ones', () => {
  const pool = ids('movies', 100);
  const recent = pool.slice(0, 50), old = pool.slice(50);
  const k = recent.map((id) => id + '~0').concat(old.map((id) => id + '~25'));
  let nr = 0, no = 0;
  for (let seed = 1; seed <= 100; seed++) {
    const s = game.setup(2, { pool, n: 24, mem: { k, u: [] } }, rng32(seed));
    for (const id of s.board) (recent.includes(id) ? nr++ : no++);
  }
  assert.ok(no > 3 * nr, `old ${no} vs recent ${nr}`);
});

test('about 30% of the board is unused (never-seen) faces when both kinds exist', () => {
  const pool = ids('movies', 120);
  const known = pool.slice(0, 60).map((id) => id + '~3');
  let fresh = 0, total = 0;
  for (let seed = 1; seed <= 60; seed++) {
    const s = game.setup(2, { pool, n: 24, mem: { k: known, u: [] } }, rng32(seed));
    fresh += s.board.filter((id) => +id.split('p')[1] >= 60).length; total += s.board.length;
  }
  const share = fresh / total;
  assert.ok(share > 0.22 && share < 0.4, `unused share ${share.toFixed(2)}`);
});

test('end of the "don\'t know" phase: marked faces become unknown, kept ones known (next round obeys it)', () => {
  const pool = ids('movies', 100);
  const rng = rng32(3);
  let s = game.setup(2, { pool, n: 24, mem: { k: [], u: [] } }, rng);
  const marked = s.board.slice(0, 3);
  s = play(s, 0, { t: 'swap', idx: [0, 1, 2] }, rng);
  s = play(s, 0, { t: 'ready' }, rng); s = play(s, 1, { t: 'ready' }, rng);
  assert.equal(s.phase, 'pick');
  for (const id of marked) assert.ok(s.mems[0].u.includes(id), 'marked = unknown');
  for (const id of s.board) assert.equal(s.mems[0].k[id], 0, 'kept on the board = known, 0 games ago');
});

// Mixed stars: a fake deck big enough to show the shares (meta = gender|kind|namekey|sub|franchise|actor)
function mixedDeck() {
  const pool = [], meta = {};
  const add = (kind, n, extra = () => '') => { for (let i = 0; i < n; i++) { const id = `mixed/${kind}${i}`; pool.push(id); meta[id] = `${i % 2 ? 'f' : 'm'}|${kind}|${kind}${i}${extra(i)}`; } };
  add('character', 60, (i) => `|${i % 2 ? 'animated' : 'live'}|fr${i % 12}|${i % 3 === 0 ? 'actor' + (i % 9) : ''}`);
  add('sports', 30); add('politics', 30); add('music', 30); add('history', 20); add('actor', 20); add('internet', 10);
  for (let i = 0; i < 10; i++) { const id = 'c/own' + i; pool.push(id); meta[id] = 'x|custom|own' + i; }
  return { pool, meta };
}

test('Mixed stars: characters ~40-45%, sports ~15-20%, politics ~10-15%, custom ~15-20%, about half women', () => {
  const { pool, meta } = mixedDeck();
  const c = {}; let f = 0, m = 0, total = 0;
  for (let seed = 1; seed <= 40; seed++) {
    const s = game.setup(2, { pool, n: 24, meta, mixed: true }, rng32(seed));
    for (const id of s.board) {
      const [g, k] = meta[id].split('|');
      const grp = ['character', 'sports', 'politics', 'custom'].includes(k) ? k : 'rest';
      c[grp] = (c[grp] || 0) + 1; total++;
      if (g === 'f') f++; if (g === 'm') m++;
    }
  }
  const sh = (k) => (c[k] || 0) / total;
  assert.ok(sh('character') >= 0.38 && sh('character') <= 0.47, 'characters ' + sh('character'));
  assert.ok(sh('sports') >= 0.13 && sh('sports') <= 0.22, 'sports ' + sh('sports'));
  assert.ok(sh('politics') >= 0.08 && sh('politics') <= 0.16, 'politics ' + sh('politics'));
  assert.ok(sh('custom') >= 0.13 && sh('custom') <= 0.22, 'custom ' + sh('custom'));
  assert.ok(Math.abs(f - m) / (f + m) < 0.12, `women ${f} men ${m}`);
});

test('Mixed stars: at most 1 card per franchise, never the same actor twice (deal and swaps)', () => {
  const { pool, meta } = mixedDeck();
  const check = (board, where) => {
    const fr = {}, ac = {};
    for (const id of board) {
      const p = meta[id].split('|');
      if (p[4]) fr[p[4]] = (fr[p[4]] || 0) + 1;
      if (p[5]) ac[p[5]] = (ac[p[5]] || 0) + 1;
    }
    assert.ok(Object.values(fr).every((x) => x <= 1), where + ' franchise ' + JSON.stringify(fr));
    assert.ok(Object.values(ac).every((x) => x <= 1), where + ' actor ' + JSON.stringify(ac));
  };
  for (let seed = 1; seed <= 30; seed++) {
    const rng = rng32(seed);
    let s = game.setup(2, { pool, n: 30, meta, mixed: true }, rng);
    check(s.board, `seed ${seed} deal`);
    for (let k = 0; k < 5; k++) { s = play(s, 0, { t: 'swap', idx: [Math.floor(rng() * 30), Math.floor(rng() * 30)] }, rng); check(s.board, `seed ${seed} swap ${k}`); }
  }
});

test('the hidden memory never reaches the public view', () => {
  const pool = ids('movies', 60);
  const s = game.setup(2, { pool, n: 24, mem: { k: pool.slice(0, 10).map((id) => id + '~2'), u: pool.slice(10, 20) } }, rng32(1));
  const pub = game.publicView(s);
  assert.ok(!('mems' in pub) && !('marks' in pub));
});
