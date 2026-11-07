// Several decks picked: an equal share of the board from each (Tim, 2026-11-06).
import test from 'node:test';
import assert from 'node:assert/strict';
import { game, rng32 } from '../js/engine.js';

const mk = (deck, n, g) => Array.from({ length: n }, (_, i) => `${deck}/p${i}`);
const pool = [...mk('music', 70), ...mk('sports', 64), ...mk('cartoons', 31)];
const meta = Object.fromEntries(pool.map((id, i) => [id, `${i % 2 ? 'f' : 'm'}|actor|${id.replace('/', '-')}`]));

test('three decks picked: 24 faces split 8 / 8 / 8', () => {
  for (let seed = 1; seed <= 20; seed++) {
    const s = game.setup(2, { pool, n: 24, first: 0, meta, byDeck: true }, rng32(seed));
    const c = {};
    for (const id of s.board) c[id.split('/')[0]] = (c[id.split('/')[0]] || 0) + 1;
    assert.deepEqual(c, { music: 8, sports: 8, cartoons: 8 }, `seed ${seed}: ${JSON.stringify(c)}`);
    assert.equal(new Set(s.board).size, 24);
  }
});

test('a deck too small for its share: the others fill the board', () => {
  const p = [...mk('music', 70), ...mk('tiny', 3)];
  const m = Object.fromEntries(p.map((id, i) => [id, `${i % 2 ? 'f' : 'm'}|actor|${id.replace('/', '-')}`]));
  const s = game.setup(2, { pool: p, n: 24, first: 0, meta: m, byDeck: true }, rng32(3));
  assert.equal(s.board.length, 24);
  assert.equal(s.board.filter((id) => id.startsWith('tiny/')).length, 3);
});
