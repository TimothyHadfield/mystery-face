// The stored face memory (this device + the account): known / unknown / unused + games since last seen.
import test from 'node:test';
import assert from 'node:assert/strict';
import { memRecord, memMarkUnknown, memMerge, memForDeal, memClean } from '../js/engine.js';

test('a game updates the memory: dealt and kept = known, marked = unknown, the rest stay unused', () => {
  let m = memClean(null);
  m = memMarkUnknown(m, ['movies/a', 'c/own1']);            // custom people are never unknown
  m = memRecord(m, ['movies/b', 'movies/c', 'c/own1']);
  assert.equal(m.g, 1);
  assert.deepEqual(Object.keys(m.u), ['movies/a']);
  assert.deepEqual(Object.keys(m.k).sort(), ['c/own1', 'movies/b', 'movies/c']);
  m = memRecord(m, ['movies/c']);
  m = memRecord(m, ['movies/d']);
  const d = memForDeal(m, null);
  assert.ok(d.k.includes('movies/b~2') && d.k.includes('movies/c~1') && d.k.includes('movies/d~0'));
  assert.deepEqual(d.u, ['movies/a']);
  assert.ok(!d.k.some((x) => x.startsWith('movies/zz')), 'unused faces are in neither list');
});

test('merge on sign-in: union, unknown wins over known, most recent sighting kept', () => {
  let a = memRecord(memRecord(memClean(null), ['movies/a', 'movies/b']), ['movies/x']);   // a: g2, a/b seen 1 game ago
  let b = memMarkUnknown(memRecord(memClean(null), ['movies/c']), ['movies/a']);         // b: g1, a unknown
  const m = memMerge(a, b);
  assert.equal(m.g, 2);
  assert.ok('movies/a' in m.u && !('movies/a' in m.k), 'unknown wins');
  assert.deepEqual(Object.keys(m.k).sort(), ['movies/b', 'movies/c', 'movies/x']);
  assert.equal(m.g - m.k['movies/c'], 0);
  assert.equal(m.g - m.k['movies/b'], 1);
});

test('stored memory stays small: 5000 faces is far under the 1 MiB Firestore doc limit', () => {
  let m = memClean(null);
  m = memRecord(m, Array.from({ length: 5200 }, (_, i) => 'characters/person-name-' + i));
  assert.ok(Object.keys(m.k).length <= 5000);
  assert.ok(JSON.stringify(m).length < 250000, 'size ' + JSON.stringify(m).length);
});
