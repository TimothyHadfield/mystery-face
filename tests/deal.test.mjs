// Deal checks (2026-11-06). Tim: "the mixed set also has a chance of giving you the same person twice
// when you reshuffle. don't allow this." Uses the real decks: the Mix of every deck holds the same
// person under two ids (mixed/x and music/x).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { game, rng32 } from '../js/engine.js';

const root = new URL('../decks/', import.meta.url);
const index = JSON.parse(fs.readFileSync(new URL('index.json', root)));
const ids = [], meta = {}, nameOf = {};
const key = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
for (const d of index) {
  for (const p of JSON.parse(fs.readFileSync(new URL(d.id + '/deck.json', root))).people) {
    const id = d.id + '/' + p.id;
    ids.push(id); nameOf[id] = key(p.name);
    meta[id] = (p.gender || 'x') + '|' + (p.kind || '') + '|' + key(p.name);
  }
}
const dupes = (board) => board.length - new Set(board.map((id) => nameOf[id])).size;

test('the decks really share people (else this test proves nothing)', () => {
  assert.ok(ids.length - new Set(ids.map((id) => nameOf[id])).size > 0);
});

test('Mix of all decks: deal + 10 swaps never shows the same person twice', () => {
  for (let seed = 1; seed <= 40; seed++) {
    const rng = rng32(seed);
    const s = game.setup(2, { pool: ids, n: 30, meta }, rng);
    assert.equal(dupes(s.board), 0, `seed ${seed} deal`);
    for (let k = 0; k < 10; k++) {
      const idx = [Math.floor(rng() * 30), Math.floor(rng() * 30), Math.floor(rng() * 30)];
      game.apply(s, 0, { t: 'swap', idx }, rng);
      assert.equal(dupes(s.board), 0, `seed ${seed} swap ${k}`);
    }
  }
});
