// Two separate headless phones play Mystery Face online against the REAL th-board-games project,
// with a custom set of 24 photo people (one of them unnamed) made on Alice's phone.
//   node tests/two-browsers.mjs [url] [--engine webkit|chromium] [--shots dir]
// Proves: room create + join by link, the custom set travels with the room, secrets stay on each phone
// (only hashes in the room), strict turn order (ask -> answer -> flip -> other player asks), a right
// guess wins, both locks check out at the reveal, rematch swaps who starts, host leaving deletes the room.
// Not run by `node --test` (it needs the network). Needs playwright from ~/.claude/tools/node_modules.
import { createRequire } from "node:module";
import { homedir } from "node:os";
import { join } from "node:path";
const require = createRequire(join(homedir(), ".claude/tools/") + "x.js");
const pw = require("playwright");

const args = process.argv.slice(2);
const url = (args.find((a) => a.startsWith("http")) || "http://127.0.0.1:8765/").replace(/\/?$/, "/");
const engine = args.includes("--engine") ? args[args.indexOf("--engine") + 1] : "webkit";
const DECK = args.includes("--deck");   // play a deck board instead: covers the "don't know" swap phase
const shots = args.includes("--shots") ? args[args.indexOf("--shots") + 1] : null;
const fail = (m) => { console.error("FAIL: " + m); process.exit(1); };
const T = { timeout: 30000 };

const iphone = { ...pw.devices["iPhone 13"], viewport: { width: 393, height: 659 } };
const opts = engine === "webkit" ? iphone : { viewport: { width: 393, height: 659 } };
const bA = await pw[engine].launch(), bB = await pw[engine].launch();   // two browsers = two anonymous logins
const A = await (await bA.newContext(opts)).newPage(), B = await (await bB.newContext(opts)).newPage();
const errs = [];
for (const [n, p] of [["A", A], ["B", B]]) {
  p.on("console", (m) => { if (m.type() === "error" && !/BloomFilter|decks\/index\.json|404/.test(m.text())) errs.push(n + ": " + m.text()); });
  p.on("pageerror", (e) => errs.push(n + " pageerror: " + e.message));
}
const snap = (p) => p.evaluate(() => { const s = window.__mf.U.snap; return s && JSON.parse(JSON.stringify({ code: s.code, status: s.status, mySeat: s.mySeat, toAct: s.toAct, pub: s.pub, options: s.options })); });
const until = (p, fn, arg) => p.waitForFunction(fn, arg, T);
const phaseIs = (p, ph) => until(p, (ph) => { const s = window.__mf.U.snap; return !!(s && s.pub && s.pub.phase === ph); }, ph);
const shot = async (p, n) => { if (shots) await p.screenshot({ path: `${shots}/${n}.png` }); };

// ---- Alice makes a set of 24 photo people on her phone (photos drawn + shrunk the app's way)
await A.goto(url);
await A.waitForSelector("#tab-play .srcs .src");
const setInfo = await A.evaluate(async () => {
  const FC = await import("./js/faces.js");
  const people = [];
  for (let i = 0; i < 24; i++) {
    const c = document.createElement("canvas"); c.width = c.height = 600;
    const g = c.getContext("2d");
    // a busy "photo": gradients + noise so the JPEG/WebP size is like a real face photo
    const gr = g.createLinearGradient(0, 0, 600, 600); gr.addColorStop(0, `hsl(${i * 15} 60% 50%)`); gr.addColorStop(1, `hsl(${i * 15 + 90} 50% 30%)`);
    g.fillStyle = gr; g.fillRect(0, 0, 600, 600);
    const im = g.getImageData(0, 0, 600, 600);
    for (let k = 0; k < im.data.length; k += 4) { const n = (Math.random() - 0.5) * 70; im.data[k] += n; im.data[k + 1] += n; im.data[k + 2] += n; }
    g.putImageData(im, 0, 0);
    g.fillStyle = "#f2c9a0"; g.beginPath(); g.arc(300, 260, 150, 0, 7); g.fill();
    const blob = await new Promise((r) => c.toBlob(r, "image/jpeg", 0.92));
    const img = await FC.shrinkPhoto(new File([blob], `p${i}.jpg`, { type: "image/jpeg" }));
    people.push({ id: "t" + i, name: i === 5 ? "" : "Friend " + (i + 1), img });
  }
  const set = FC.cleanSet({ id: "settest", title: "Test friends", people, updatedAt: Date.now() });
  localStorage.setItem("mystery-face:sets", JSON.stringify([set]));
  const sizes = people.map((p) => p.img.length);
  return { n: set.people.length, avg: Math.round(sizes.reduce((a, b) => a + b) / sizes.length), max: Math.max(...sizes), kind: people[0].img.slice(5, 15), total: JSON.stringify(set).length };
});
console.log(`custom set: ${setInfo.n} people, photo ${setInfo.kind} avg ${setInfo.avg} chars, max ${setInfo.max}, whole set ${setInfo.total} chars`);
await A.reload();
await A.click('[data-o="no"]').catch(() => {});
if (!DECK) await A.click('[data-act="src"][data-k="set"]');
await A.fill("#oname", "Alice");
await A.click('[data-act="create"]');
await A.waitForSelector(".big-code", T);
const code = (await A.textContent(".big-code")).trim();
console.log("room", code);
await shot(A, "online-lobby");

// ---- Bob opens the link
await B.goto(url + "?room=" + code);
await B.waitForSelector("#ocode");
if ((await B.inputValue("#ocode")) !== code) fail("the room link didn't fill the code");
await B.click('[data-o="no"]').catch(() => {});
await B.fill("#oname", "Bob");
await B.click('[data-act="join"]');
await A.waitForSelector('[data-act="ostart"]:not([disabled])', T);
await A.click('[data-act="ostart"]');
if (DECK) {
  await phaseIs(A, "dunno"); await phaseIs(B, "dunno");
  const before = (await snap(A)).pub.board;
  await B.click('.face[data-i="0"]'); await B.click('.face[data-i="5"]'); await B.click('[data-act="swap"]');
  await until(A, (f) => window.__mf.U.snap.pub.board[0] !== f, before[0]);
  const after = (await snap(A)).pub.board;
  if (after[5] === before[5] || after.filter((f, i) => f !== before[i]).length !== 2) fail("swap didn't replace exactly the 2 marked faces");
  await A.click('[data-act="ready"]'); await B.click('[data-act="ready"]');
  await phaseIs(A, "pick"); await phaseIs(B, "pick");
  console.log("PASS don't-know phase: Bob swapped 2 faces on the shared board, both pressed Ready");
}
await phaseIs(A, "pick"); await phaseIs(B, "pick");
const s0 = await snap(A);
if (!DECK && (!s0.options.custom || s0.options.custom.people.length !== 24)) fail("custom set did not travel with the room");
const roomChars = JSON.stringify({ options: s0.options, pub: s0.pub }).length;
console.log(`PASS custom set in the room (dunno skipped for custom). Room options+state ≈ ${roomChars} chars (limit 1,048,576)`);
const unnamed = await B.evaluate(() => [...document.querySelectorAll(".face .nm")].map((e) => e.textContent).filter((t) => /Unnamed/.test(t)));
console.log("Bob sees the nameless person as:", unnamed.join(", ") || "(not on this board)");

// ---- both pick
await A.click('.face[data-i="3"]'); await A.click('[data-act="lockin"]');
await B.click('.face[data-i="7"]'); await B.click('[data-act="lockin"]');
await phaseIs(A, "ask"); await phaseIs(B, "ask");
const secA = await A.evaluate((c) => JSON.parse(localStorage.getItem(`mystery-face:sec:${c}:1`)), code);
const secB = await B.evaluate((c) => JSON.parse(localStorage.getItem(`mystery-face:sec:${c}:1`)), code);
const s1 = await snap(B);
const pubText = JSON.stringify(s1.pub);
if (pubText.includes(secA.salt) || pubText.includes(secB.salt)) fail("a salt is in the shared state");
if (!s1.pub.commits[0] || !s1.pub.commits[1] || s1.pub.commits[0].length !== 64) fail("missing hash commits");
if (await B.evaluate((c) => JSON.stringify(localStorage).includes(c), secA.salt)) fail("Bob's phone holds Alice's secret");
console.log("PASS secrets stay on each phone; the room holds only the two sha256 locks");
await shot(A, "online-ask-alice"); await shot(B, "online-ask-bob");

// ---- strict turns: asker asks, other answers, asker flips + Done, then the other player asks
const P = [A, B];
for (let k = 0; k < 3; k++) {
  const s = await snap(A);
  const asker = P[s.pub.turn], answerer = P[1 - s.pub.turn];
  if ((await answerer.$("#qIn"))) fail("the non-asker has a question box");
  await asker.fill("#qIn", "Glasses?"); await asker.click('[data-act="ask"]');
  await phaseIs(answerer, "answer");
  if (await asker.$('[data-act="answer"]')) fail("the asker can answer their own question");
  if (k === 0) await shot(answerer, "online-answer");
  await answerer.click('[data-act="answer"][data-v="no"]');
  await phaseIs(asker, "flip");
  // flip two faces that are not the other player's face
  const theirs = s.pub.turn === 0 ? secB.face : secA.face;
  const idx = s.pub.board.map((f, i) => [f, i]).filter(([f]) => f !== theirs).slice(k * 2, k * 2 + 2).map(([, i]) => i);
  for (const i of idx) await asker.click(`.face[data-i="${i}"]`);
  if (k === 0) await shot(asker, "online-flip");
  await asker.click('[data-act="done"]');
  await until(answerer, (t) => { const s = window.__mf.U.snap; return s.pub.phase === "ask" && s.pub.turn === t; }, 1 - s.pub.turn);
}
const s2 = await snap(A);
console.log(`PASS 3 turns in strict order; log has ${s2.pub.log.length} entries; left = ${s2.pub.left.join("/")}`);

// ---- refresh mid-game (Tim, 2026-11-06): both phones reload and carry on where they were
const flipsBefore = await A.evaluate((c) => localStorage.getItem(`mystery-face:flip:${c}:1`), code);
await A.reload(); await B.reload();
await phaseIs(A, "ask"); await phaseIs(B, "ask");
const s2r = await snap(A);
if (JSON.stringify(s2r.pub.board) !== JSON.stringify(s2.pub.board) || s2r.pub.log.length !== s2.pub.log.length || s2r.pub.turn !== s2.pub.turn) fail("the game changed after a refresh");
if ((await A.evaluate((c) => localStorage.getItem(`mystery-face:flip:${c}:1`), code)) !== flipsBefore) fail("Alice's flips were lost on refresh");
if (!(await A.$('.face.down, .face .pmarks'))) fail("Alice's marked faces don't show after refresh");
console.log("PASS refresh mid-game: both phones back in the same game, same turn, flips kept");

// ---- a wrong guess: red X on the guesser's board, no loss, the turn passes (tap = guess, no confirm)
const g = s2.pub.turn, gp = P[g], op = P[1 - g];
const target = g === 0 ? secB.face : secA.face;
const wrongI = await gp.evaluate((t) => [...document.querySelectorAll('.face:not(.down)')].map((e) => +e.dataset.i).find((i) => window.__mf.U.snap.pub.board[i] !== t), target);
await gp.click('[data-act="guess"]');
await gp.click(`.face[data-i="${wrongI}"]`);
await until(gp, (t) => { const s = window.__mf.U.snap; return s.pub.phase === "ask" && s.pub.turn === t; }, 1 - g);
await gp.waitForSelector(`.face.wrong[data-i="${wrongI}"]`, T);
const sw = await snap(gp);
if (sw.pub.winner !== null || sw.pub.xed[g][0] !== sw.pub.board[wrongI]) fail("wrong guess didn't just X the face: " + JSON.stringify(sw.pub.xed));
console.log("PASS wrong guess: red X on that face, nobody lost, turn passed");
await shot(gp, "online-wrong-x");
// ---- Back: the other player asks, the answerer presses Back -> the question is undone on both phones
const logN = sw.pub.log.length;
await op.fill("#qIn", "Hat?"); await op.click('[data-act="ask"]');
await phaseIs(gp, "answer");
await gp.click('[data-act="back"]');
await until(op, (n) => { const s = window.__mf.U.snap; return s.pub.phase === "ask" && s.pub.log.length === n; }, logN);
console.log("PASS Back undid the question on both phones");
await op.fill("#qIn", "Hat?"); await op.click('[data-act="ask"]');
await phaseIs(gp, "answer"); await gp.click('[data-act="answer"][data-v="no"]');
await phaseIs(op, "flip"); await op.click('[data-act="done"]');
await until(gp, (t) => { const s = window.__mf.U.snap; return s.pub.phase === "ask" && s.pub.turn === t; }, g);
// ---- right guess: one tap
await gp.click('[data-act="guess"]');
await gp.click(`.face[data-i="${s2.pub.board.indexOf(target)}"]`);
await phaseIs(A, "over"); await phaseIs(B, "over");
const s3 = await snap(B);
if (s3.pub.winner !== g) fail("wrong winner " + s3.pub.winner);
if (!s3.pub.reveals.every((r) => r && r.ok)) fail("a reveal didn't match its lock: " + JSON.stringify(s3.pub.reveals));
if ((s3.pub.flags || []).length) fail("unexpected cheat flags " + JSON.stringify(s3.pub.flags));
console.log(`PASS ${g === 0 ? "Alice" : "Bob"} guessed right and won; both reveals match their locks, no flags`);
await shot(A, "online-over-alice"); await shot(B, "online-over-bob");

// ---- rematch: same deck, the other player starts
const first1 = s3.pub.first;
await A.click('[data-act="again"]'); await B.click('[data-act="again"]');
await until(A, () => { const s = window.__mf.U.snap; return s.pub.round === 2 && (s.pub.phase === "pick" || s.pub.phase === "dunno"); });
const s4 = await snap(A);
if (s4.pub.first === first1) fail("rematch didn't swap who starts");
console.log(`PASS rematch: round 2, score ${s4.pub.score.join("-")}, ${s4.pub.first === 0 ? "Alice" : "Bob"} starts now`);

// ---- host leaves: the room is closed for Bob
await A.click('[data-act="menu"]'); await A.click('[data-act="leaveask"]'); await A.click('[data-act="leave2"]');
await until(B, () => !window.__mf.U.snap || window.__mf.U.snap.status !== "playing");
console.log("PASS host left; Bob's room closed");
if (errs.length) fail("console errors:\n" + errs.join("\n"));
console.log("PASS no console errors (" + engine + ")");
await bA.close(); await bB.close();
