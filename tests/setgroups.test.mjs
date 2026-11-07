// "make my people a chategory you can mix with other categories aswell" (Tim, 2026-11-06):
// each picked "Your people" set is its own category, with an equal share like a deck.
import test from 'node:test';
import assert from 'node:assert/strict';
import { game, rng32 } from '../js/engine.js';

const deck = Array.from({ length: 70 }, (_, i) => `music/p${i}`);
const fam = Array.from({ length: 12 }, (_, i) => `c/fam${i}`);
const work = Array.from({ length: 12 }, (_, i) => `c/work${i}`);
const pool = [...deck, ...fam, ...work];
const meta = Object.fromEntries(pool.map((id, i) => [id, id.startsWith('c/') ? `x|custom|${id.slice(2)}` : `${i % 2 ? 'f' : 'm'}|music|${id.replace('/', '-')}`]));
const groups = Object.fromEntries([...fam.map((id) => [id, 'set:fam']), ...work.map((id) => [id, 'set:work'])]);

test('one deck + two of your sets: 24 faces split 8 / 8 / 8', () => {
  for (let seed = 1; seed <= 20; seed++) {
    const s = game.setup(2, { pool, n: 24, first: 0, meta, byDeck: true, groups }, rng32(seed));
    const c = { music: 0, fam: 0, work: 0 };
    for (const id of s.board) c[id.startsWith('c/fam') ? 'fam' : id.startsWith('c/work') ? 'work' : 'music']++;
    assert.deepEqual(c, { music: 8, fam: 8, work: 8 }, `seed ${seed}: ${JSON.stringify(c)}`);
  }
});

test('one deck + one set: half and half', () => {
  const p = [...deck, ...fam];
  const s = game.setup(2, { pool: p, n: 16, first: 0, meta, byDeck: true, groups }, rng32(5));
  assert.equal(s.board.filter((id) => id.startsWith('c/')).length, 8);
});

test('a new round keeps the split', () => {
  let s = game.setup(2, { pool, n: 24, first: 0, meta, byDeck: true, groups }, rng32(9));
  s = JSON.parse(JSON.stringify(s));
  assert.equal(s.board.filter((id) => id.startsWith('c/work')).length, 8);
});
