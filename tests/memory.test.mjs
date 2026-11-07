// The stored face memory (this device + the account): known / unknown / unused + games since last seen.
import test from 'node:test';
import assert from 'node:assert/strict';
import { memRecord, memMarkUnknown, memMarkKnown, memMerge, memForDeal, memClean } from '../js/engine.js';

// Tim, 2026-11-07: "All the don't know or know considerations are outside of the actual games."
test('a game only records when faces were used: known / don\'t-know come from Sort faces alone', () => {
  let m = memClean(null);
  m = memMarkUnknown(m, ['movies/a', 'c/own1']);            // custom people are never unknown
  m = memMarkKnown(m, ['movies/b']);
  m = memRecord(m, ['movies/a', 'movies/b', 'movies/c', 'c/own1']);
  assert.equal(m.g, 1);
  assert.deepEqual(Object.keys(m.u), ['movies/a'], 'a game never changes don\'t-knows');
  assert.deepEqual(Object.keys(m.k), ['movies/b'], 'a game never makes anyone known');
  m = memRecord(m, ['movies/c']);
  m = memRecord(m, ['movies/d']);
  const d = memForDeal(m, null);
  assert.ok(d.k.includes('movies/b~2'), 'known, with games since used');
  assert.ok(d.l.includes('movies/c~1') && d.l.includes('movies/d~0'), 'unsorted, with games since used');
  assert.deepEqual(d.u, ['movies/a']);
});

test('old memory (games marked kept faces known) keeps them known, with their last sighting', () => {
  const m = memClean({ v: 1, g: 3, k: { 'movies/a': 2, 'movies/s': 0 }, u: { 'movies/z': 1 } });
  assert.deepEqual(Object.keys(m.k).sort(), ['movies/a', 'movies/s']);
  assert.equal(m.l['movies/a'], 2);
  assert.ok(!('movies/s' in m.l), 'sorted, never on a board');
  assert.ok(memForDeal(m, null).k.includes('movies/a~1'));
});

test('merge on sign-in: union, unknown wins over known, most recent sighting kept', () => {
  let a = memMarkKnown(memRecord(memRecord(memClean(null), ['movies/a', 'movies/b']), ['movies/x']), ['movies/a', 'movies/b']);   // a: g2
  let b = memMarkUnknown(memMarkKnown(memRecord(memClean(null), ['movies/c']), ['movies/c']), ['movies/a']);   // b: g1, a unknown
  const m = memMerge(a, b);
  assert.equal(m.g, 2);
  assert.ok('movies/a' in m.u && !('movies/a' in m.k), 'unknown wins');
  assert.deepEqual(Object.keys(m.k).sort(), ['movies/b', 'movies/c']);
  assert.equal(m.g - m.l['movies/c'], 0);
  assert.equal(m.g - m.l['movies/b'], 1);
});

test('stored memory stays small: 5000 faces is far under the 1 MiB Firestore doc limit', () => {
  let m = memClean(null);
  m = memRecord(m, Array.from({ length: 5200 }, (_, i) => 'characters/person-name-' + i));
  assert.ok(Object.keys(m.l).length <= 5000);
  assert.ok(JSON.stringify(m).length < 250000, 'size ' + JSON.stringify(m).length);
});
