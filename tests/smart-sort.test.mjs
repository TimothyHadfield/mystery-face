// Smart sorting (2026-11-09, docs/library-plan.md). Tim: "rate every character on how well known they are within
// that specific group and then assume that the user knows any character that much more well known than them,
// and then keep giving characters to the player until the game finds the mark ... if a user is familiar with a
// character from a specific game/TV show/movie/book, then they'll very likely know all the characters from that
// movie or book ... try to minimize the number of characters it shows the user as much as possible while still
// being good at predicting who that user knows."
// A simulated user per group (a random threshold; character groups: known franchises, some at random) answers
// the cards; we count cards and check every prediction against what that user really knows.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as SO from '../js/sorter.js';
import { rng32 } from '../js/engine.js';

const N = 40;
const fameOf = (i, n) => Math.round(1 + 99 * (n - 1 - i) / (n - 1));

function peopleGroup() { return Array.from({ length: N }, (_, i) => ({ id: `g/p${i}`, key: `p${i}`, fame: fameOf(i, N), fr: '' })); }
/** 40 characters in franchises of 1-6; fame spread over everyone */
function charGroup(rnd) {
  const ppl = []; let f = 0;
  while (ppl.length < N) { const size = Math.min(N - ppl.length, 1 + Math.floor(rnd() * 6)); for (let k = 0; k < size; k++) ppl.push({ fr: 'Franchise ' + f }); f++; }
  // shuffle who gets which fame, so a franchise's members spread over the ranks
  const order = ppl.map((_, i) => i).sort(() => rnd() - 0.5);
  return ppl.map((p, i) => ({ id: `c/x${i}`.replace('c/', 'g/'), key: 'x' + i, fame: fameOf(order[i], N), fr: p.fr }));
}

/** Run the sorter on one group against a simulated user (truth: Set of known ids). */
function run(people, franchised, truth) {
  const ans = new Map();
  let cards = 0, v;
  for (;;) {
    v = SO.groupView(people, franchised, (p) => ans.get(p.id) || null);
    if (!v.next) break;
    ans.set(v.next.id, truth.has(v.next.id) ? 'k' : 'u');
    cards++;
    if (cards > 100) throw new Error('never stops');
  }
  let right = 0;
  for (const p of people) if ((v.marks.get(p.id) === 'k') === truth.has(p.id) && v.marks.get(p.id) !== null) right++;
  return { cards, acc: right / people.length };
}

function simulate(kind, users, seed, noise) {
  const rnd = rng32(seed);
  let cards = 0, acc = 0;
  for (let u = 0; u < users; u++) {
    if (kind === 'people') {
      const ppl = peopleGroup();
      const T = Math.floor(rnd() * (N + 1));   // knows the T best-known
      const truth = new Set(ppl.filter((p, i) => (i < T) !== (rnd() < noise)).map((p) => p.id));
      const r = run(ppl, false, truth); cards += r.cards; acc += r.acc;
    } else {
      const ppl = charGroup(rnd);
      const units = SO.unitsOf(ppl, true);
      const T = Math.floor(rnd() * (units.length + 1));
      // knows the T best-known franchises, but `noise` of the franchises are known (or not) at random
      const knownFr = new Set(units.filter((un, r) => (rnd() < noise ? rnd() < 0.5 : r < T)).map((un) => un.members[0].fr));
      const truth = new Set(ppl.filter((p) => knownFr.has(p.fr)).map((p) => p.id));
      const r = run(ppl, true, truth); cards += r.cards; acc += r.acc;
    }
  }
  return { cards: cards / users, acc: acc / users };
}

test('simulated users: real-people groups of 40 need <= 6 cards and are >= 90% right', (t) => {
  const clean = simulate('people', 400, 1, 0);
  const noisy = simulate('people', 400, 2, 0.05);
  t.diagnostic(`people, perfect threshold: ${clean.cards.toFixed(2)} cards, ${(clean.acc * 100).toFixed(1)}% right`);
  t.diagnostic(`people, 5% exceptions: ${noisy.cards.toFixed(2)} cards, ${(noisy.acc * 100).toFixed(1)}% right`);
  assert.ok(clean.cards <= 6 && clean.acc >= 0.9, JSON.stringify(clean));
  assert.ok(noisy.cards <= 6 && noisy.acc >= 0.88, JSON.stringify(noisy));
});

test('simulated users: character groups (franchises) need <= 6 cards and are >= 90% right', (t) => {
  const clean = simulate('chars', 400, 3, 0);
  const noisy = simulate('chars', 400, 4, 0.15);
  t.diagnostic(`characters, franchises by fame: ${clean.cards.toFixed(2)} cards, ${(clean.acc * 100).toFixed(1)}% right`);
  t.diagnostic(`characters, 15% of franchises known at random: ${noisy.cards.toFixed(2)} cards, ${(noisy.acc * 100).toFixed(1)}% right`);
  assert.ok(clean.cards <= 6 && clean.acc >= 0.9, JSON.stringify(clean));
  assert.ok(noisy.cards <= 6 && noisy.acc >= 0.85, JSON.stringify(noisy));
});

test('knows nobody / everybody in a group: found exactly, in a few cards', () => {
  const ppl = peopleGroup();
  const r = run(ppl, false, new Set());
  assert.ok(r.cards <= 6 && r.acc === 1, JSON.stringify(r));
  const all = run(ppl, false, new Set(ppl.map((p) => p.id)));
  assert.ok(all.cards <= 6 && all.acc === 1, JSON.stringify(all));
});

test('franchise shortcut: a Know on any character marks the whole franchise known', () => {
  const ppl = [
    { id: 'g/a', key: 'a', fame: 100, fr: 'Toy Story' }, { id: 'g/b', key: 'b', fame: 20, fr: 'Toy Story' }, { id: 'g/c', key: 'c', fame: 5, fr: 'Toy Story' },
    { id: 'g/d', key: 'd', fame: 90, fr: 'Shrek' }, { id: 'g/e', key: 'e', fame: 60, fr: 'Shrek' },
  ];
  const v = SO.groupView(ppl, true, (p) => (p.id === 'g/c' ? 'k' : null));
  assert.equal(v.marks.get('g/a'), 'k'); assert.equal(v.marks.get('g/b'), 'k');
  assert.ok(v.real.has('g/c') && !v.real.has('g/a'), 'only g/c was answered; the rest are assumed');
  const u = SO.groupView(ppl, true, (p) => (p.id === 'g/d' ? 'u' : null));
  assert.equal(u.marks.get('g/e'), 'u', "Don't know on Shrek's best-known face: Shrek unknown");
});

test('an answer always wins over the assumption, and a contradiction re-opens the search', () => {
  const ppl = peopleGroup();
  // Know p30 -> p0..p29 assumed known; but p10 was answered Don't know
  const ans = { 'g/p30': 'k', 'g/p10': 'u' };
  const v = SO.groupView(ppl, false, (p) => ans[p.id] || null);
  assert.equal(v.marks.get('g/p10'), 'u', 'the real answer stays');
  assert.equal(v.marks.get('g/p30'), 'k');
  assert.ok(v.next, 'the contradiction re-opens the search (another card is asked)');
});
