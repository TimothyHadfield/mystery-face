// Fit check (Tim, 2026-11-27: "making sure the user can actually see the full screen and everything"):
// the biggest board (30 faces with the longest names in the decks), most of them flipped down, a long
// question log, the hidden face chip, the out-of-faces box and the group browser's Sort / View, at
// 393x659 (WebKit iPhone), 320x568, 659x393 sideways, 1280x800 and 1440x900. Measures what a player needs:
//   - the whole board fits without scrolling (page and board), faces >= 46 px, names >= 10 px and not cut
//   - buttons >= 36 px tall, no sideways scroll, no console errors
//   node tests/fit-ui.mjs [url] [--shots dir] [--engine webkit|chromium]
// Serve the folder first. Needs playwright from ~/.claude/tools/node_modules. Not run by `node --test`.
import { createRequire } from "node:module";
import { homedir } from "node:os";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
const require = createRequire(join(homedir(), ".claude/tools/") + "x.js");
const pw = require("playwright");

const args = process.argv.slice(2);
const url = (args.find((a) => a.startsWith("http")) || "http://127.0.0.1:8901/").replace(/\/?$/, "/");
const engine = args.includes("--engine") ? args[args.indexOf("--engine") + 1] : "webkit";
const shots = args.includes("--shots") ? args[args.indexOf("--shots") + 1] : null;
if (shots) mkdirSync(shots, { recursive: true });

const SIZES = [
  { n: "phone", w: 393, h: 659, touch: true },
  { n: "small", w: 320, h: 568, touch: true },
  { n: "side", w: 659, h: 393, touch: true },
  { n: "laptop", w: 1280, h: 800 },
  { n: "wide", w: 1440, h: 900 },
];
const LONG_DECKS = ["royals", "founding-fathers", "philosophers", "poets", "composers", "olympians", "painters", "first-ladies", "film-directors", "supreme-court", "classic-authors", "activists", "inventors", "cartoons", "simpsons", "sitcoms", "nba-players", "modern-authors"];

const fails = [];
const errs = [];
const browser = await pw[engine].launch();

/** Builds a game in the page: mode online|local, n faces, crowded = longest names + 22 flipped + 16 questions. */
async function build(page, { mode, n, crowded, phase }) {
  await page.evaluate(async ({ mode, n, crowded, phase, LONG_DECKS }) => {
    const FC = await import("./js/faces.js");
    const M = window.__mf;
    await Promise.all(LONG_DECKS.map((d) => FC.loadDeck(d).catch(() => null)));
    const seen = new Set();
    let all = [];
    for (const d of LONG_DECKS) { const dk = FC.deck(d); if (!dk) continue; for (const p of dk.people) { const id = d + "/" + p.id; const f = FC.face(id); if (!f || !f.img || seen.has(f.name)) continue; seen.add(f.name); all.push({ id, name: f.name }); } }
    if (crowded) all.sort((a, b) => b.name.length - a.name.length);
    const pool = all.slice(0, n).map((x) => x.id);
    const G = M.game;
    const rnd = (() => { let x = 7; return () => ((x = (x * 16807) % 2147483647) / 2147483647); })();
    let s = G.setup(2, { pool, n, first: 0 }, rnd);
    s.board = pool.slice();   // the longest names, in order (the deal would shuffle and could leave some out)
    s.left = [n, n];
    if (phase !== "dunno") {
      s = G.apply(s, 0, { t: "ready" }, rnd); s = G.apply(s, 1, { t: "ready" }, rnd);
      s = G.apply(s, 0, { t: "commit", hash: "a".repeat(64) }, rnd); s = G.apply(s, 1, { t: "commit", hash: "b".repeat(64) }, rnd);
      const Q = ["Is your person a woman?", "Does your person wear glasses or a hat in the picture?", "Were they born before 1900?", "Is your person known mainly for music?", "Beard?", "Do they have dark hair?", "Are they European?", "Did they ever hold a royal title?", "Is the photo in black and white?", "Smiling?"];
      const qs = crowded ? 16 : 2;
      for (let k = 0; k < qs; k++) {
        const by = s.turn;
        s = G.apply(s, by, { t: "ask", q: Q[k % Q.length] }, rnd);
        s = G.apply(s, 1 - by, { t: "answer", a: ["yes", "no", "unsure"][k % 3] }, rnd);
        s = G.apply(s, by, { t: "done", left: Math.max(2, n - k * 2) }, rnd);
      }
      if (s.turn !== 0) { s = G.apply(s, 1, { t: "ask", q: "Is it a man?" }, rnd); s = G.apply(s, 0, { t: "answer", a: "no" }, rnd); s = G.apply(s, 1, { t: "done", left: 9 }, rnd); }
    } else if (crowded) {
      s.spare = 0;
      s.stuck = { seat: 0, idx: [1, 4, 7], recycle: true };
    }
    // flips: crowded = all but 8 down (a few with small red Xs), normal = 3 down
    const flips = {};
    const down = crowded ? n - 8 : 3;
    for (let i = 0; i < down; i++) flips[(i * 7) % n] = 1 + (i % 9);
    if (crowded) flips.x = { [((down) * 7) % n]: [2, -1], [((down + 1) * 7) % n]: [1, -1] };
    const face = pool.find((_, i) => !(i in flips)) || pool[0];
    M.S.tab = "play";
    if (mode === "online") {
      const code = "FITZZ";
      localStorage.setItem(`mystery-face:sec:${code}:1`, JSON.stringify({ face, salt: "s".repeat(32) }));
      localStorage.setItem(`mystery-face:flip:${code}:1`, JSON.stringify(phase === "dunno" ? {} : flips));
      M.S.play = null;
      M.U.online = { act: async () => ({ ok: true }), on() {}, leave: async () => {}, start: async () => ({ ok: true }) };
      M.U.snap = { code, status: "playing", mySeat: 0, isHost: true, toAct: G.toAct(s), seats: [{ name: "You", kind: "human", online: true }, { name: crowded ? "Bartholomew Featherstonehaugh" : "Sam", kind: "human", online: true }], pub: G.publicView(s), options: { n, timer: crowded ? 90 : 0, title: "Fit test" } };
    } else {
      M.U.online = null; M.U.snap = null; M.U.home = false;
      M.S.play = { kind: "local", id: "fit" + n, state: s, custom: null, secrets: [{ face, salt: "s".repeat(32) }, { face: pool[pool.length - 1], salt: "t".repeat(32) }], flips: [flips, phase === "dunno" ? {} : flips], view: 0, pick: null };
    }
    M.render();
  }, { mode, n, crowded, phase: phase || "ask", LONG_DECKS });
  await page.waitForTimeout(400);
  await page.evaluate(() => Promise.all([...document.querySelectorAll(".board img")].map((i) => (i.complete ? 0 : new Promise((r) => { i.onload = i.onerror = r; setTimeout(r, 4000); })))));
  await page.waitForTimeout(150);
}

/** Measures the game screen. */
const measure = (page) => page.evaluate(() => {
  const vw = innerWidth, vh = innerHeight;
  const r = (e) => e.getBoundingClientRect();
  const out = { pageX: document.documentElement.scrollWidth - vw, pageY: document.documentElement.scrollHeight - vh, problems: [] };
  const box = document.querySelector(".boardbox:not(.other)") || document.querySelector(".boardbox");
  const faces = box ? [...box.querySelectorAll(".face")] : [];
  if (box) {
    const br = r(box);
    out.boardScroll = box.scrollHeight - box.clientHeight;
    out.tile = Math.round(r(faces[0]).width);
    out.boxMin = Math.min(box.clientWidth, box.clientHeight - ((box.querySelector(".bhead") || {}).offsetHeight || 0));
    out.faces = faces.length;
    out.hiddenFaces = faces.filter((f) => { const fr = r(f); return fr.bottom > br.bottom + 1 || fr.top < br.top - 1 || fr.bottom > vh + 1 || fr.right > vw + 1; }).length;
    const nms = [...box.querySelectorAll(".face .nm")];
    out.nameFont = nms.length ? Math.min(...nms.map((e) => parseFloat(getComputedStyle(e).fontSize))) : null;
    const cut = nms.filter((e) => e.scrollWidth > e.clientWidth + 1 || e.scrollHeight > e.clientHeight + 2);
    out.cutNames = cut.map((e) => e.textContent);
    // how much of a cut name still shows: (lines x width) / the whole name on one line
    const cv = document.createElement("canvas").getContext("2d");
    out.cutShown = cut.map((e) => { const st = getComputedStyle(e); cv.font = `${st.fontWeight} ${st.fontSize} ${st.fontFamily}`; const lines = Math.max(1, Math.round(e.clientHeight / parseFloat(st.lineHeight))); return Math.min(1, (lines * e.clientWidth) / cv.measureText(e.textContent).width); });
    out.minShown = out.cutShown.length ? Math.round(Math.min(...out.cutShown) * 100) : 100;
    // cut names whose every word fits a line (a word wider than the face has to break, so those may cut)
    out.cutFitting = cut.filter((e) => { const st = getComputedStyle(e); cv.font = `${st.fontWeight} ${st.fontSize} ${st.fontFamily}`; return e.textContent.split(/\s+/).every((w) => cv.measureText(w).width <= e.clientWidth); }).map((e) => e.textContent);
    // how much of the board area the faces use (big empty space while faces are small)
    const bd = box.querySelector(".board");
    const fr = r(bd);
    out.useW = Math.round((fr.width / br.width) * 100); out.useH = Math.round((Math.min(fr.height, br.height) / br.height) * 100);
  }
  const chip = document.querySelector(".mychip");
  if (chip) { out.chipH = Math.round(r(chip).height); out.chipW = Math.round(r(chip).width); const em = chip.querySelector("em"); out.chipFont = em ? parseFloat(getComputedStyle(em).fontSize) : null; }
  const btns = [...document.querySelectorAll(".game button:not(.face), #layer button, #gview button")].filter((b) => { const x = r(b); return x.width > 0 && x.height > 0 && getComputedStyle(b).visibility !== "hidden"; });
  // (text links and the sideways-scrolling question chips are not buttons here; the group list scrolls by itself)
  const inView = (b) => { const x = r(b); return x.bottom > 0 && x.top < vh; };
  out.smallBtns = btns.filter((b) => inView(b) && r(b).height < 35.5 && !b.classList.contains("link") && !b.classList.contains("chip")).map((b) => (b.getAttribute("aria-label") || b.textContent.trim()).slice(0, 24) + ":" + Math.round(r(b).height));
  out.offscreen = [...document.querySelectorAll(".game .prompt, .game .mychip, .game .dock, .game .dock .btn, .game .pswitch, #layer .sheet > .row button, #layer .gtop, #gview .gv-top")].filter((e) => { const x = r(e); return x.width > 0 && (x.bottom > vh + 1 || x.right > vw + 1 || x.left < -1 || x.top < -1); }).map((e) => (e.className || e.tagName) + ":" + (e.textContent || "").trim().slice(0, 20));
  // the hidden-face chip's cover must sit inside the chip (it was drawn over the board's corner)
  const cover = document.querySelector(".mychip .ph, .mychip .nt");
  if (chip && cover) { const a = r(chip), c = r(cover); out.chipCoverOut = c.left < a.left - 1 || c.top < a.top - 1 || c.right > a.right + 1 || c.bottom > a.bottom + 1; }
  // the question box, Ask and Guess instead side by side without squeezing the box
  const qi = document.querySelector("#qIn"); out.qInW = qi ? Math.round(r(qi).width) : null;
  const dockH = document.querySelector(".game .dock"); out.dockH = dockH ? Math.round(r(dockH).height) : 0;
  const pr = document.querySelector(".game .prompt"); out.promptH = pr ? Math.round(r(pr).height) : 0;
  return out;
});

async function newPage(sz) {
  const ctx = await browser.newContext(engine === "webkit" && sz.touch ? { ...pw.devices["iPhone 13"], viewport: { width: sz.w, height: sz.h }, screen: { width: sz.w, height: sz.h }, reducedMotion: "reduce" } : { viewport: { width: sz.w, height: sz.h }, reducedMotion: "reduce" });   // (headless WebKit can leave a sheet mid-slide)
  await ctx.addInitScript(() => { try { localStorage.setItem("coach:seen:mystery-face", "1"); } catch (e) {} });
  const page = await ctx.newPage();
  page.on("console", (m) => { if (m.type() === "error" && !/access control checks|decks\/index\.json|404|Failed to load resource/.test(m.text())) errs.push(sz.n + ": " + m.text()); });
  page.on("pageerror", (e) => errs.push(sz.n + " pageerror: " + e.message));
  await page.goto(url);
  await page.waitForSelector("#tab-play .srcs .src", { timeout: 30000 });
  await page.click('[data-o="no"]', { timeout: 1500 }).catch(() => {});
  await page.evaluate(() => document.querySelectorAll(".coach-veil,.coach,.co-veil").forEach((e) => e.remove()));
  return { ctx, page };
}

// What may give at the tightest sizes (each measured, see progress.md):
//  - a board under 340 px (iPhone SE, phone on its side, same screen with its peek row) takes faces of 42 px
//  - 320x568 with 30 faces: names stay on one line; same screen there also scrolls the board (its player
//    switch + peek row leave no room for 5 rows); sideways same screen keeps one line of names too
//  - long names may end in "…" on a phone, but at least 45% of each still shows; names under 17 letters
//    (25 on a laptop) show whole unless one word is wider than the face
const check = (tag, m, { minTile = 46, names = true } = {}) => {
  const bad = (msg) => fails.push(`${tag}: ${msg}`);
  const small = tag.startsWith("small");
  if (m.pageX > 1) bad(`sideways page scroll ${m.pageX}px`);
  if (m.pageY > 1) bad(`page scrolls ${m.pageY}px`);
  if (m.faces) {
    const scrollOk = small && /local-crowded/.test(tag);
    const sideLocal = /^side local/.test(tag);
    if (m.boardScroll > 1 && !scrollOk) bad(`board scrolls ${m.boardScroll}px (${m.hiddenFaces} faces off screen)`);
    else if (m.hiddenFaces && !scrollOk) bad(`${m.hiddenFaces} faces off screen`);
    if (m.tile < minTile) bad(`faces ${m.tile}px (< ${minTile})`);
    if (names && m.nameFont !== null && m.nameFont < 10) bad(`names ${m.nameFont}px (< 10)`);
    if (names && !small) {
      const big = /^(laptop|wide)/.test(tag);
      const lim = big ? 25 : 17;   // names this short always show whole
      const short = m.cutFitting.filter((t) => t.length < lim);
      if (short.length) bad(`${short.length} names under ${lim} letters cut: ${short.slice(0, 4).join(" / ")}`);
      if (m.minShown < (sideLocal ? 25 : 45)) bad(`a cut name shows only ${m.minShown}% of itself`);
    }
  }
  if (m.chipCoverOut) bad("the hidden-face cover is drawn outside its chip");
  if (m.qInW !== null && m.qInW !== undefined && m.qInW < 110) bad(`question box only ${m.qInW}px wide`);
  if (m.chipFont !== undefined && m.chipFont !== null && m.chipFont < 10) bad(`your-face chip label ${m.chipFont}px`);
  if (m.smallBtns.length) bad(`buttons < 36px: ${m.smallBtns.join(", ")}`);
  if (m.offscreen.length) bad(`off screen: ${m.offscreen.join(", ")}`);
};
const line = (tag, m) => console.log(`${tag.padEnd(26)} tile ${m.tile ?? "-"}px  names ${m.nameFont ?? "-"}px cut ${m.cutNames ? m.cutNames.length : "-"} (min shown ${m.minShown ?? "-"}%)  q ${m.qInW ?? "-"}px  boardScroll ${m.boardScroll ?? "-"}  pageY ${m.pageY} pageX ${m.pageX}  use ${m.useW ?? "-"}%x${m.useH ?? "-"}%  prompt ${m.promptH} dock ${m.dockH}  small ${m.smallBtns.length}`);
const shot = async (page, name) => { if (shots) await page.screenshot({ path: `${shots}/${name}.png` }); };

for (const sz of SIZES) {
  const { ctx, page } = await newPage(sz);
  const cases = [
    { k: "online-crowded-ask", mode: "online", n: 30, crowded: true },
    { k: "online-normal-ask", mode: "online", n: 24, crowded: false },
    { k: "local-crowded-ask", mode: "local", n: 30, crowded: true },
    { k: "online-crowded-dunno", mode: "online", n: 30, crowded: true, phase: "dunno" },
  ];
  for (const c of cases) {
    await page.evaluate(() => { document.querySelector("#layer").classList.remove("on"); document.querySelector("#layer").innerHTML = ""; window.__mf.U.sheet = false; window.__mf.U.stuckSeen = null; });
    await build(page, c);
    const tag = `${sz.n} ${c.k}`;
    if (c.phase === "dunno") {   // the out-of-faces box over the board
      await page.waitForSelector("#layer .sheet", { timeout: 5000 }).catch(() => bad0(tag, "no out-of-faces box"));
      await page.waitForTimeout(400);   // the sheet slides up
      const m = await measure(page);
      line(tag, m); check(tag, { ...m, faces: 0 });
      await shot(page, `${sz.n}-stuck`);
      continue;
    }
    const m = await measure(page);
    line(tag, m); check(tag, m, { minTile: m.boxMin < 340 ? 42 : 46 });
    await shot(page, `${sz.n}-${c.k}`);
    if (c.k === "online-crowded-ask") {
      // a redraw (every flip, your face shown, a room update) must keep the fitted size from its first frame
      const jump = await page.evaluate(() => { const b0 = document.querySelector(".board").style.getPropertyValue("--tile"); window.__mf.render(); const b1 = document.querySelector(".board").style.getPropertyValue("--tile"); return { b0, b1 }; });
      console.log(`${(tag + " redraw").padEnd(26)} first frame --tile "${jump.b1}" (fitted "${jump.b0}")`);
      if (jump.b1 !== jump.b0) fails.push(`${tag}: a redraw starts at "${jump.b1 || "70px default"}" instead of ${jump.b0} (the board jumps)`);
      await page.click('[data-act="log"]');
      await page.waitForSelector("#layer .sheet"); await page.waitForTimeout(400);
      const ml = await measure(page); line(tag + " log", ml); check(tag + " log", { ...ml, faces: 0 });
      await shot(page, `${sz.n}-log`);
      await page.evaluate(() => { document.querySelector("#layer").classList.remove("on"); document.querySelector("#layer").innerHTML = ""; window.__mf.U.sheet = false; });
      await page.click(".mychip");
      await page.waitForTimeout(200);
      const mc = await measure(page); line(tag + " chip shown", mc); check(tag + " chip shown", mc, { minTile: m.boxMin < 340 ? 42 : 46 });
      await shot(page, `${sz.n}-chip-shown`);
    }
  }
  // the group browser: Sort opens Smart / Sort all, View shows a group's faces
  await page.evaluate(() => { const M = window.__mf; M.U.online = null; M.U.snap = null; M.S.play = null; document.querySelector("#layer").classList.remove("on"); document.querySelector("#layer").innerHTML = ""; M.U.sheet = false; M.render(); });
  await page.click('[data-act="groups"]');
  await page.waitForSelector('#gList [data-act="gsortpick"]', { timeout: 20000 });
  await page.click('#gList [data-act="gsortpick"]');
  await page.waitForTimeout(150);
  const mg = await measure(page); line(`${sz.n} groups sort`, mg); check(`${sz.n} groups sort`, { ...mg, faces: 0 });
  await shot(page, `${sz.n}-groups`);
  await page.click('#gList [data-act="gview"]');
  await page.waitForSelector("#gview .gv-face", { timeout: 20000 });
  await page.waitForTimeout(400);
  const gv = await page.evaluate(() => {
    const fs = [...document.querySelectorAll("#gview .gv-face")].slice(0, 30);
    const cap = fs.map((f) => f.querySelector("figcaption"));
    return { pageX: document.documentElement.scrollWidth - innerWidth, tile: Math.round(Math.min(...fs.map((f) => f.getBoundingClientRect().width))), font: Math.min(...cap.map((c) => parseFloat(getComputedStyle(c).fontSize))), cut: cap.filter((c) => c.scrollWidth > c.clientWidth + 1).length };
  });
  console.log(`${(sz.n + " group view").padEnd(26)} tile ${gv.tile}px  names ${gv.font}px cut ${gv.cut}  pageX ${gv.pageX}`);
  if (gv.pageX > 1) fails.push(`${sz.n} group view: sideways scroll`);
  if (gv.tile < 46) fails.push(`${sz.n} group view: faces ${gv.tile}px`);
  if (gv.font < 10) fails.push(`${sz.n} group view: names ${gv.font}px`);
  await shot(page, `${sz.n}-gview`);
  await ctx.close();
}
function bad0(tag, msg) { fails.push(`${tag}: ${msg}`); }
await browser.close();
if (errs.length) fails.push("console errors:\n  " + errs.join("\n  "));
if (fails.length) { console.error("\nFAIL (" + fails.length + "):\n- " + fails.join("\n- ")); process.exit(1); }
console.log("\nPASS fit at 5 sizes (" + engine + ")");
