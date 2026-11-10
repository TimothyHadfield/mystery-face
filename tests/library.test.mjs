// The library expansion (2026-11-09): many groups, lazy decks, assumed marks feeding the deal, fewer repeats,
// one copy of a person per pool, "Sort every face", and old saved memory still loading.
// A synthetic library (no dependence on the real decks, which are being rebuilt in parallel).
import test from 'node:test';
import assert from 'node:assert/strict';
import * as FC from '../js/faces.js';
import * as SO from '../js/sorter.js';
import { game, rng32, memClean, memRecord, memMarkKnown, memMarkUnknown, memForDeal, memMerge } from '../js/engine.js';

const fame = (i, n) => Math.round(1 + 99 * (n - 1 - i) / (n - 1));
function lib() {
  FC.setIndex([
    { id: 'mixed', title: 'Mixed stars', cat: 'mix', count: 3, broad: true },
    { id: 'nba', title: 'NBA Players', cat: 'sports', count: 40, broad: false, preview: ['img/p0.webp'] },
    { id: 'nfl', title: 'NFL Players', cat: 'sports', count: 30, broad: false },
    { id: 'pixar', title: 'Pixar', cat: 'animated', count: 36, broad: false },
    { id: 'old', title: 'Old deck', cat: 'film', count: 20, broad: true },
  ]);
  const ppl = (pre, n, extra = () => ({})) => Array.from({ length: n }, (_, i) => Object.assign({ id: `${pre}${i}`, name: `${pre} Person ${i}`, gender: i % 2 ? 'f' : 'm', kind: 'sports', fame: fame(i, n), img: `img/${pre}${i}.webp` }, extra(i)));
  FC.addDeck('nba', { id: 'nba', cat: 'sports', title: 'NBA Players', people: ppl('nba', 40) });
  // NFL shares two people with the NBA (same names): one answer carries over
  const nfl = ppl('nfl', 30); nfl[0].name = 'nba Person 0'; nfl[5].name = 'nba Person 35';
  FC.addDeck('nfl', { id: 'nfl', cat: 'sports', title: 'NFL Players', people: nfl });
  FC.addDeck('pixar', { id: 'pixar', cat: 'animated', title: 'Pixar', people: ppl('px', 36, (i) => ({ kind: 'character', franchise: 'Film ' + (i % 9), sub: 'animated' })) });
  FC.addDeck('old', { title: 'Old deck', people: ppl('old', 20).map((p) => Object.assign(p, { fame: undefined })) });   // no fame yet
  FC.addDeck('mixed', { title: 'Mixed stars', people: [{ id: 'a', name: 'nba Person 1', gender: 'm', kind: 'sports' }, { id: 'b', name: 'old Person 3', gender: 'f', kind: 'actor' }, { id: 'c', name: 'Someone Else', gender: 'f', kind: 'actor' }] });
}

test('broad groups: one per category with 2+ decks, holding every deck of that category', () => {
  lib();
  const g = FC.group('cat:sports');
  assert.deepEqual(g.decks, ['nba', 'nfl']);
  assert.equal(g.count, 70);
  assert.equal(FC.group('cat:animated'), null, 'only one animated deck: no broad group');
  assert.deepEqual(FC.groupDecks('nba'), ['nba']);
  assert.equal(FC.indexOf('nba').preview[0], 'decks/nba/img/p0.webp');
});

test('a deck with no fame yet: deck order stands in (first = best known)', () => {
  lib();
  const d = FC.deck('old');
  assert.equal(d.people[0].fame, 100); assert.equal(d.people[19].fame, 1);
});

test('the pool holds each person once, even when two picked groups both have them', () => {
  lib();
  const pool = FC.poolFor(['nba', 'nfl', 'mixed'], []);
  const names = pool.map((id) => FC.face(id).name);
  assert.equal(new Set(names).size, names.length, 'no name twice');
  assert.ok(pool.includes('nba/nba0') && !pool.includes('nfl/nfl0') && !pool.includes('mixed/a'));
  assert.equal(pool.length, 40 + 28 + 2);
});

test('shared people: a Know in one group counts in every group that has them', () => {
  lib();
  let m = SO.answerMem(memClean(null), 'nba/nba35', true);   // a deep cut in the NBA
  assert.ok('nfl/nfl5' in m.k, 'the NFL copy is marked too');
  // even an answer stored under a deck that is not loaded is found by its name
  m = memMarkKnown(memClean(null), ['nba/nba35']);
  const v = SO.viewOf(m, 'nfl');
  assert.equal(v.marks.get('nfl/nfl5'), 'k');
  assert.ok(v.real.has('nfl/nfl5'));
});

test('assumed marks reach the deal: assumed don\'t-knows are never dealt, assumed knows count as known', () => {
  lib();
  // the user knows the top 10 of the NBA: answers at the cut only
  let m = memClean(null);
  for (;;) {
    const v = SO.viewOf(m, 'nba');
    if (!v.next) break;
    const i = +v.next.id.split('nba')[2];
    m = SO.answerMem(m, v.next.id, i < 10);
  }
  const real = Object.keys(m.k).length + Object.keys(m.u).length;
  assert.ok(real <= 6, 'few cards: ' + real);
  const pool = FC.poolFor(['nba'], []);
  const dm = memForDeal(SO.withAssumed(m, pool), pool);
  assert.ok(dm.u.length >= 28 && dm.k.length >= 9, `assumed: ${dm.k.length} known, ${dm.u.length} unknown`);
  for (let seed = 1; seed <= 10; seed++) {
    const s = game.setup(2, { pool, n: 16, mem: dm }, rng32(seed));
    const deep = s.board.filter((id) => +id.split('nba')[2] >= 14).length;
    assert.ok(deep <= 6, 'mostly known faces on the board, deep cuts only to fill: ' + deep);
  }
});

test('"Sort every face": every person of the group, and those real answers beat the assumptions', () => {
  lib();
  let m = SO.answerMem(memClean(null), 'nba/nba20', true);   // Know #20 -> 0..19 assumed known
  assert.equal(SO.viewOf(m, 'nba').marks.get('nba/nba3'), 'k', 'assumed');
  const list = SO.everyFace(m, ['nba']);
  assert.equal(list.length, 39, 'everyone not answered for real, assumed ones included');
  assert.ok(list.includes('nba/nba3'));
  for (const id of list) m = SO.answerMem(m, id, id === 'nba/nba0');   // the user only knows #0 (and #20)
  const v = SO.viewOf(m, 'nba');
  assert.equal(v.marks.get('nba/nba3'), 'u', 'the real answer wins over "assumed known"');
  assert.equal(v.marks.get('nba/nba20'), 'k');
  assert.equal(v.real.size, 40);
  assert.equal(SO.everyFace(m, ['nba']).length, 40, 'all answered: a second pass offers everyone again');
});

test('old saved memory still loads and still works (v1 and v2), with the account merge', () => {
  lib();
  const v1 = memClean({ v: 1, g: 3, k: { 'nba/nba5': 2, 'old/old0': 0 }, u: { 'nba/nba30': 1 } });
  assert.deepEqual(Object.keys(v1).sort(), ['g', 'k', 'l', 'u', 'v'], 'same stored shape as before');
  const a = SO.withAssumed(v1, FC.poolFor(['nba'], []));
  assert.equal(a.k['nba/nba5'], 0); assert.equal(a.u['nba/nba30'], 1, 'real answers kept as they were');
  const v = SO.viewOf(v1, 'nba');
  assert.equal(v.marks.get('nba/nba2'), 'k', 'better known than a Know: assumed known');
  assert.equal(v.marks.get('nba/nba39'), 'u', 'less known than a Don\'t know: assumed unknown');
  // assumptions are never stored: the memory itself (and what syncs to the account) is unchanged
  assert.deepEqual(v1, memClean({ v: 1, g: 3, k: { 'nba/nba5': 2, 'old/old0': 0 }, u: { 'nba/nba30': 1 } }));
  const merged = memMerge(v1, memMarkUnknown(memClean(null), ['nba/nba5']));
  assert.ok('nba/nba5' in merged.u, 'merge rules as before: unknown wins');
});

test('repeats: two games in a row share few faces, even when the player knows only ~half the deck', () => {
  // Tim: "Right now when I play nearly all the characters that are shown were in the last game I played too"
  const pool = Array.from({ length: 90 }, (_, i) => 'characters/p' + i);
  const meta = Object.fromEntries(pool.map((id, i) => [id, `${i % 2 ? 'f' : 'm'}|character|p${i}|animated|fr${i % 50}|`]));
  let total = 0, games = 0;
  for (const known of [50, 60, 90]) {
    let m = memMarkKnown(memClean(null), pool.slice(0, known));
    if (known < 90) m = memMarkUnknown(m, pool.slice(known));
    let prev = null;
    for (let g = 0; g < 8; g++) {
      const s = game.setup(2, { pool, n: 24, meta, mem: memForDeal(m, pool) }, rng32(50 + g + known));
      if (prev) { total += s.board.filter((id) => prev.includes(id)).length; games++; }
      prev = s.board; m = memRecord(m, s.board);
    }
  }
  const avg = total / games;
  assert.ok(avg <= 3, 'faces also on the last board, average of 24: ' + avg.toFixed(1));
});

test('a broad group ("All Sports") gets one share of the board, like any one picked group', () => {
  lib();
  const pool = FC.poolFor(['nba', 'nfl', 'old'], []);
  const meta = FC.metaFor(pool, null);
  let sports = 0, total = 0;
  for (let seed = 1; seed <= 20; seed++) {
    const s = game.setup(2, { pool, n: 16, meta, byDeck: true, deckGroups: { nba: 'cat:sports', nfl: 'cat:sports' } }, rng32(seed));
    sports += s.board.filter((id) => !id.startsWith('old/')).length; total += s.board.length;
  }
  assert.equal(sports / total, 0.5, 'half the board from All Sports, half from the other group');
});
