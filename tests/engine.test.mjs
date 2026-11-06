// Rules, secret lock (hash), swaps, turn order. Run: node --test (from the project folder).
import test from 'node:test';
import assert from 'node:assert/strict';
import { game, sha256, commitOf, makeSalt, checkReview, rng32 } from '../js/engine.js';

const pool = Array.from({ length: 60 }, (_, i) => 'sample/p' + i);
const opts = (o = {}) => Object.assign({ pool, n: 24, lives: 1, first: 0 }, o);
const R = (seed = 7) => rng32(seed);
const act = (s, seat, a, r = R()) => {
  assert.ok(game.toAct(s).includes(seat), `seat ${seat} may not act in ${s.phase} (toAct ${game.toAct(s)})`);
  const n = game.apply(JSON.parse(JSON.stringify(s)), seat, a, r);
  JSON.parse(JSON.stringify(n)); // JSON-safe
  return n;
};
const secrets = (s) => [0, 1].map((i) => ({ face: s.board[i * 3], salt: makeSalt(() => 0.3 + i / 10) }));
function toPlay(o) {
  let s = game.setup(2, opts(o), R(), [{ kind: 'human' }, { kind: 'human' }]);
  s = act(s, 0, { t: 'ready' }); s = act(s, 1, { t: 'ready' });
  const sec = secrets(s);
  s = act(s, 0, { t: 'commit', hash: commitOf(sec[0].face, sec[0].salt) });
  s = act(s, 1, { t: 'commit', hash: commitOf(sec[1].face, sec[1].salt) });
  return { s, sec };
}

test('sha256 matches known vectors', () => {
  assert.equal(sha256(''), 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  assert.equal(sha256('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  assert.equal(sha256('a'.repeat(1000)), '41edece42d63e8d9bf515a9ba6932e1c20cbc9f5a5d134645adb5db1b9737ea3');
  assert.equal(sha256('Zoë'), sha256('Zoë')); // utf-8
});

test('setup deals n distinct faces from the pool, starts in the "don\'t know" phase', () => {
  const s = game.setup(2, opts(), R(), []);
  assert.equal(s.board.length, 24);
  assert.equal(new Set(s.board).size, 24);
  assert.ok(s.board.every((f) => pool.includes(f)));
  assert.equal(s.phase, 'dunno');
  assert.deepEqual(game.toAct(s).sort(), [0, 1]);
});

test('custom sets skip the "don\'t know" phase and use the whole set', () => {
  const s = game.setup(2, opts({ pool: pool.slice(0, 10), n: 24, custom: true }), R(), []);
  assert.equal(s.board.length, 10);
  assert.equal(s.phase, 'pick');
});

test('swap replaces only the marked faces with unused ones and un-readies the other player', () => {
  let s = game.setup(2, opts(), R(), []);
  s = act(s, 1, { t: 'ready' });
  const before = s.board.slice();
  s = act(s, 0, { t: 'swap', idx: [0, 5] });
  assert.notEqual(s.board[0], before[0]);
  assert.notEqual(s.board[5], before[5]);
  for (let i = 0; i < 24; i++) if (i !== 0 && i !== 5) assert.equal(s.board[i], before[i]);
  assert.ok(!before.includes(s.board[0]) && !before.includes(s.board[5]), 'a swapped-out face never comes back');
  assert.equal(new Set(s.board).size, 24);
  assert.deepEqual(game.toAct(s).sort(), [0, 1], 'the other player must look again');
});

test('swaps stop when the pool runs out (no loop, no duplicates)', () => {
  let s = game.setup(2, opts({ pool: pool.slice(0, 26) }), R(), []);
  s = act(s, 0, { t: 'swap', idx: [0, 1, 2, 3] });
  assert.equal(new Set(s.board).size, 24);
  assert.equal(s.spare, 0);
  const b = s.board.slice();
  s = act(s, 1, { t: 'swap', idx: [4] });
  assert.deepEqual(s.board, b, 'nothing left to swap in');
});

test('strict turn order: P1 asks, P2 answers, P1 flips then Done, P2 asks, P1 answers', () => {
  let { s } = toPlay();
  assert.equal(s.phase, 'ask'); assert.deepEqual(game.toAct(s), [0]);
  assert.throws(() => game.apply(s, 0, { t: 'answer', a: 'yes' }));
  s = act(s, 0, { t: 'ask', q: 'Glasses?' });
  assert.equal(s.phase, 'answer'); assert.deepEqual(game.toAct(s), [1]);
  s = act(s, 1, { t: 'answer', a: 'no' });
  assert.equal(s.phase, 'flip'); assert.deepEqual(game.toAct(s), [0]);
  s = act(s, 0, { t: 'done', left: 15 });
  assert.equal(s.phase, 'ask'); assert.deepEqual(game.toAct(s), [1]);
  s = act(s, 1, { t: 'ask', q: 'Hat?', tag: 'hat' });
  assert.deepEqual(game.toAct(s), [0]);
  s = act(s, 0, { t: 'answer', a: 'unsure' });
  assert.deepEqual(game.toAct(s), [1]);
  assert.equal(s.log.length, 2);
  assert.deepEqual(s.left, [15, 24]);
  assert.equal(s.log[0].a, 'no'); assert.equal(s.log[1].tag, 'hat');
});

test('bad input is refused: empty / huge question, unknown answer, guess off the board', () => {
  const { s } = toPlay();
  assert.throws(() => game.apply(s, 0, { t: 'ask', q: '   ' }));
  assert.throws(() => game.apply(s, 0, { t: 'ask', q: 'x'.repeat(500) }));
  assert.throws(() => game.apply(s, 0, { t: 'guess', face: 'nobody' }));
  const s2 = game.apply(JSON.parse(JSON.stringify(s)), 0, { t: 'ask', q: 'Glasses?' }, R());
  assert.throws(() => game.apply(s2, 1, { t: 'answer', a: 'maybe' }));
  assert.throws(() => game.apply(s, 0, { t: 'commit', hash: 'x' }));
});

test('a right guess wins; both reveal; the locks are checked', () => {
  let { s, sec } = toPlay();
  s = act(s, 0, { t: 'guess', face: sec[1].face });
  assert.equal(s.phase, 'verdict'); assert.deepEqual(game.toAct(s), [1]);
  s = act(s, 1, { t: 'verdict', ok: true });
  assert.equal(s.winner, 0); assert.equal(s.phase, 'reveal');
  s = act(s, 1, { t: 'reveal', face: sec[1].face, salt: sec[1].salt });
  s = act(s, 0, { t: 'reveal', face: sec[0].face, salt: sec[0].salt });
  assert.equal(s.phase, 'over');
  assert.deepEqual(s.reveals.map((r) => r.ok), [true, true]);
  assert.deepEqual(s.score, [1, 0]);
  assert.deepEqual(s.flags, []);
});

test('a wrong guess does not lose: that face gets a red X for the guesser, the turn passes', () => {
  const { s, sec } = toPlay();
  const wrong = s.board.find((f) => f !== sec[1].face && f !== sec[0].face);
  let a = act(s, 0, { t: 'guess', face: wrong });
  a = act(a, 1, { t: 'verdict', ok: false });
  assert.equal(a.winner, null); assert.equal(a.phase, 'ask'); assert.deepEqual(game.toAct(a), [1]);
  assert.deepEqual(a.xed, [[wrong], []]);
  assert.ok(!('lives' in a));
  // the crossed-out face can't be guessed again by that player; the other player still can
  a = act(a, 1, { t: 'ask', q: 'Glasses?' }); a = act(a, 0, { t: 'answer', a: 'no' }); a = act(a, 1, { t: 'done' });
  assert.throws(() => game.apply(JSON.parse(JSON.stringify(a)), 0, { t: 'guess', face: wrong }));
  // Ask OR guess: no guessing after asking (flip phase only passes the turn)
  let b = act(s, 0, { t: 'ask', q: 'Hat?' }); b = act(b, 1, { t: 'answer', a: 'yes' });
  assert.throws(() => game.apply(JSON.parse(JSON.stringify(b)), 0, { t: 'guess', face: sec[1].face }));
});

test('cheating shows up at the reveal: a changed pick, and a lie about a guess', () => {
  let { s, sec } = toPlay();
  let a = act(s, 0, { t: 'guess', face: sec[1].face });
  a = act(a, 1, { t: 'verdict', ok: false }); // a lie: the guess was right
  a = act(a, 1, { t: 'guess', face: sec[0].face }); a = act(a, 0, { t: 'verdict', ok: true });
  a = act(a, 0, { t: 'reveal', face: sec[0].face, salt: sec[0].salt });
  a = act(a, 1, { t: 'reveal', face: sec[1].face, salt: sec[1].salt });
  assert.ok(a.flags.some((f) => f.kind === 'verdict' && f.seat === 1));
  // a reveal that doesn't match the lock
  ({ s, sec } = toPlay());
  let b = act(s, 0, { t: 'guess', face: sec[1].face });
  b = act(b, 1, { t: 'verdict', ok: true });
  b = act(b, 1, { t: 'reveal', face: s.board.find((f) => f !== sec[1].face), salt: sec[1].salt });
  b = act(b, 0, { t: 'reveal', face: sec[0].face, salt: sec[0].salt });
  assert.equal(b.reveals[1].ok, false);
  assert.ok(b.flags.some((f) => f.kind === 'lock' && f.seat === 1));
});

test('Back (undo) rolls the shared state back one move, skipping the automatic verdict', () => {
  const { s, sec } = toPlay();
  let a = act(s, 0, { t: 'ask', q: 'Hat?' });
  assert.equal(game.publicView(a).undo > 0, true);
  a = act(a, 1, { t: 'undo' });
  assert.equal(a.phase, 'ask'); assert.equal(a.log.length, 0); assert.deepEqual(game.toAct(a), [0]);
  const wrong = s.board.find((f) => f !== sec[1].face && f !== sec[0].face);
  a = act(a, 0, { t: 'guess', face: wrong }); a = act(a, 1, { t: 'verdict', ok: false });
  assert.deepEqual(a.xed, [[wrong], []]);
  a = act(a, 1, { t: 'undo' });
  assert.equal(a.phase, 'ask'); assert.equal(a.turn, 0); assert.deepEqual(a.xed, [[], []]); assert.equal(a.pending, null);
  assert.ok(a.pool.length > 0);
  // back through the pick and the don't-know phase too
  for (let k = 0; k < 4; k++) a = act(a, game.toAct(a)[0], { t: 'undo' });
  assert.equal(a.phase, 'dunno');
});

test('both may pick the same face', () => {
  let s = game.setup(2, opts(), R(), []);
  s = act(s, 0, { t: 'ready' }); s = act(s, 1, { t: 'ready' });
  const f = s.board[4];
  s = act(s, 0, { t: 'commit', hash: commitOf(f, 'aa') });
  s = act(s, 1, { t: 'commit', hash: commitOf(f, 'bb') });
  s = act(s, 0, { t: 'guess', face: f });
  s = act(s, 1, { t: 'verdict', ok: true });
  assert.equal(s.winner, 0);
});

test('rematch: both press Play again, new board, the other player starts, score kept', () => {
  let { s, sec } = toPlay();
  s = act(s, 0, { t: 'guess', face: sec[1].face });
  s = act(s, 1, { t: 'verdict', ok: true });
  s = act(s, 0, { t: 'reveal', face: sec[0].face, salt: sec[0].salt });
  s = act(s, 1, { t: 'reveal', face: sec[1].face, salt: sec[1].salt });
  const b = s.board.slice();
  s = act(s, 0, { t: 'again' });
  assert.equal(s.phase, 'over'); assert.deepEqual(game.toAct(s), [1]);
  s = act(s, 1, { t: 'again' });
  assert.equal(s.round, 2); assert.equal(s.first, 1); assert.equal(s.phase, 'dunno');
  assert.notDeepEqual(s.board, b); assert.deepEqual(s.score, [1, 0]); assert.equal(s.log.length, 0);
});

test('a player who leaves ends the game (isOver), the other wins if undecided', () => {
  const { s } = toPlay();
  const q = act(s, 0, { t: 'quit' });
  assert.ok(game.isOver(q)); assert.equal(q.winner, 1); assert.deepEqual(game.toAct(q), []);
  assert.deepEqual(game.bot({ pub: game.publicView(s), state: s }, 1, R()), { t: 'quit' });
});

test('the public view never holds a secret and is small', () => {
  const { s, sec } = toPlay();
  const pub = JSON.stringify(game.publicView(s));
  for (const x of sec) assert.ok(!pub.includes(x.salt));
  assert.ok(!('pool' in game.publicView(s)));
  assert.equal(game.privateView(s, 0), null);
});

test('review: a tagged chip answered against the revealed face is pointed out', () => {
  const log = [{ by: 0, q: 'Are they an actor?', tag: 'actor', a: 'no' }, { by: 1, q: 'Glasses?', a: 'yes' }, { by: 0, q: 'Musician?', tag: 'music', a: 'no' }];
  const tagsOf = (id) => (id === 'B' ? ['actor'] : []);
  const r = checkReview(log, ['A', 'B'], tagsOf);
  assert.deepEqual(r, [{ i: 0, expect: 'yes' }]);
});

test('random self-play never throws and always reaches a result', () => {
  for (let g = 0; g < 100; g++) {
    const r = R(g + 1);
    let s = game.setup(2, opts({ lives: g % 2 ? 3 : 1, first: g % 2 }), r, []);
    const sec = [null, null];
    for (let steps = 0; steps < 2000 &&s.phase !== 'over'; steps++) {
      const seat = game.toAct(s)[0];
      let a;
      if (s.phase === 'dunno') a = r() < 0.3 ? { t: 'swap', idx: [Math.floor(r() * s.board.length)] } : { t: 'ready' };
      else if (s.phase === 'pick') { sec[seat] = { face: s.board[Math.floor(r() * s.board.length)], salt: makeSalt(r) }; a = { t: 'commit', hash: commitOf(sec[seat].face, sec[seat].salt) }; }
      else if (s.phase === 'ask') a = r() < 0.35 ? { t: 'guess', face: ((b) => b[Math.floor(r() * b.length)])(s.board.filter((f) => !s.xed[seat].includes(f))) } :{ t: 'ask', q: 'Q' + steps };
      else if (s.phase === 'answer') a = { t: 'answer', a: ['yes', 'no', 'unsure'][Math.floor(r() * 3)] };
      else if (s.phase === 'flip') a = { t: 'done', left: 3 };
      else if (s.phase === 'verdict') a = { t: 'verdict', ok: s.pending.face === sec[seat].face };
      else if (s.phase === 'reveal') a = { t: 'reveal', face: sec[seat].face, salt: sec[seat].salt };
      s = act(s, seat, a, r);
    }
    assert.equal(s.phase, 'over', 'game ' + g + ' ended');
    assert.deepEqual(s.flags, []);
    assert.ok(s.winner === 0 || s.winner === 1);
  }
});
