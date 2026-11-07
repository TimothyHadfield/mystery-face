// "Sort faces" (2026-11-06). Tim: "let's do the know/don't know thing with the account, but make it right
// arrow left arrow for know and don't know so you can quickly go through them." A face sorted Know has never
// been on a board, so it must count as long unused and get dealt soon; Don't know is never dealt.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../js/engine.js';

const { game, rng32, memClean, memRecord, memMarkUnknown, memMerge, memForDeal } = E;
const ids = (pre, n) => Array.from({ length: n }, (_, i) => `${pre}/p${i}`);
// a face sorted Know is stored as k[id] = 0 (a real sighting is always game 1 or later)
const sortKnown = (m, list) => (E.memMarkKnown ? E.memMarkKnown(m, list) : memClean(Object.assign({}, m, { k: Object.assign({}, m.k, Object.fromEntries(list.map((id) => [id, 0]))) })));

test('sorted Know faces are dealt far before the faces just played (even after only 1 game)', () => {
  const pool = ids('movies', 150);
  const played = pool.slice(0, 50), sorted = pool.slice(50, 100);   // the rest: unsorted, never on a board
  let m = memRecord(memClean(null), played);   // 1 game: these were on the board (still unsorted)
  m = sortKnown(m, sorted);
  let np = 0, ns = 0, nu = 0;
  for (let seed = 1; seed <= 60; seed++) {
    const s = game.setup(2, { pool, n: 24, mem: memForDeal(m, pool) }, rng32(seed));
    for (const id of s.board) (sorted.includes(id) ? ns++ : played.includes(id) ? np++ : nu++);
  }
  assert.ok(ns > 8 * np, `sorted ${ns} vs just played ${np}`);
  assert.ok(nu > 3 * np, `never seen ${nu} vs just played ${np}`);
});

test('a new player who sorted Know on some faces: ~70% of the board comes from them', () => {
  const pool = ids('movies', 120);
  const sorted = pool.slice(0, 60);
  const m = sortKnown(memClean(null), sorted);
  let k = 0, total = 0;
  for (let seed = 1; seed <= 40; seed++) {
    const s = game.setup(2, { pool, n: 24, mem: memForDeal(m, pool) }, rng32(seed));
    k += s.board.filter((id) => sorted.includes(id)).length; total += s.board.length;
  }
  assert.ok(k / total > 0.6 && k / total < 0.8, 'known share ' + (k / total).toFixed(2));
});

test('Don\'t know in the sorter: never dealt; Know later (re-check) brings it back', () => {
  const pool = ids('movies', 80);
  const no = pool.slice(0, 40);
  let m = memMarkUnknown(memClean(null), no);
  for (let seed = 1; seed <= 20; seed++) {
    const s = game.setup(2, { pool, n: 24, mem: memForDeal(m, pool) }, rng32(seed));
    assert.equal(s.board.filter((id) => no.includes(id)).length, 0);
  }
  m = sortKnown(m, no.slice(0, 5));
  assert.ok(!('movies/p0' in m.u) && m.k['movies/p0'] === 0, 'known again, never on a board');
});

test('memMarkKnown keeps a real sighting, and a sync merge keeps "never on a board"', () => {
  assert.equal(typeof E.memMarkKnown, 'function');
  let m = memRecord(memRecord(memClean(null), ['movies/a']), ['movies/b']);   // g2: a seen 1 game ago
  m = E.memMarkKnown(m, ['movies/a', 'movies/c', 'c/own']);
  assert.equal(m.l['movies/a'], 1, 'a real sighting is kept');
  assert.ok('movies/c' in m.k && !('movies/c' in m.l));
  assert.ok(!('c/own' in m.k), 'custom people are not sorted');
  const acct = memRecord(memRecord(memRecord(memRecord(memClean(null), ['movies/x']), []), []), []);   // g4
  const merged = memMerge(m, acct);
  assert.ok('movies/c' in merged.k && !('movies/c' in merged.l), 'still never on a board after the merge');
  assert.equal(merged.g - merged.l['movies/a'], 1, 'real sightings still line up');
});
