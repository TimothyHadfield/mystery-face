// Draws the placeholder deck decks/sample/ (40 made-up shape faces, no real people) as 256x256 WebP,
// so the game works before the real decks land. Run once: node tools/make-sample-deck.mjs
// Needs Playwright in ~/.claude/tools (Chromium encodes WebP in canvas.toDataURL).
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';

const require = createRequire(join(homedir(), '.claude', 'tools', 'x.js'));
const pw = require('playwright');
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'decks', 'sample');
fs.mkdirSync(join(OUT, 'img'), { recursive: true });

const NAMES = ['Blip', 'Zorg', 'Mabel', 'Quill', 'Nimbus', 'Pip', 'Torva', 'Ozzy', 'Fennel', 'Rook', 'Juniper', 'Sprocket', 'Dot', 'Wexley', 'Bramble', 'Kip',
  'Lumen', 'Gus', 'Tansy', 'Orbit', 'Pell', 'Cobble', 'Wren', 'Doodle', 'Mortimer', 'Zinnia', 'Biscuit', 'Flint', 'Hazel', 'Pogo', 'Rumi', 'Sable',
  'Tock', 'Umber', 'Vale', 'Widget', 'Yarrow', 'Ziggy', 'Moss', 'Echo'];
const KINDS = ['robot', 'monster', 'alien', 'blob'];

const browser = await pw.chromium.launch();
const page = await browser.newPage();
const people = [];
for (let i = 0; i < NAMES.length; i++) {
  const id = 's' + String(i + 1).padStart(2, '0');
  const kind = KINDS[i % 4];
  const url = await page.evaluate(({ i, kind }) => {
    let a = i * 2654435761 >>> 0;
    const r = () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d');
    const hue = Math.floor(r() * 360);
    g.fillStyle = `hsl(${(hue + 180) % 360} 35% 78%)`; g.fillRect(0, 0, 256, 256);
    const skin = `hsl(${hue} ${45 + r() * 30}% ${50 + r() * 20}%)`;
    g.fillStyle = skin;
    g.beginPath();
    if (kind === 'robot') g.roundRect(58, 62, 140, 150, 18); else if (kind === 'blob') g.ellipse(128, 140, 80, 88, 0, 0, 7); else g.ellipse(128, 136, 70 + r() * 12, 82, 0, 0, 7);
    g.fill();
    if (kind === 'alien') { g.strokeStyle = skin; g.lineWidth = 6; g.beginPath(); g.moveTo(100, 60); g.lineTo(84, 22); g.moveTo(156, 60); g.lineTo(172, 22); g.stroke(); g.fillStyle = '#ffe36e'; g.beginPath(); g.arc(84, 20, 9, 0, 7); g.arc(172, 20, 9, 0, 7); g.fill(); }
    if (kind === 'monster') { g.fillStyle = `hsl(${hue} 40% 30%)`; g.beginPath(); g.moveTo(70, 80); g.lineTo(60, 36); g.lineTo(96, 66); g.moveTo(186, 80); g.lineTo(196, 36); g.lineTo(160, 66); g.fill(); }
    const hair = r();
    if (hair < 0.5 && kind !== 'robot') { g.fillStyle = `hsl(${Math.floor(r() * 360)} 50% ${20 + r() * 40}%)`; g.beginPath(); g.ellipse(128, 70, 72, 30, 0, Math.PI, 0); g.fill(); }
    const eyes = kind === 'alien' && r() < 0.5 ? 1 : 2;
    for (let e = 0; e < eyes; e++) {
      const x = eyes === 1 ? 128 : 100 + e * 56;
      g.fillStyle = '#fff'; g.beginPath(); g.arc(x, 124, 16, 0, 7); g.fill();
      g.fillStyle = '#222'; g.beginPath(); g.arc(x + (r() - 0.5) * 8, 126, 7, 0, 7); g.fill();
    }
    if (r() < 0.35) { g.strokeStyle = '#222'; g.lineWidth = 5; g.beginPath(); g.arc(100, 124, 22, 0, 7); g.moveTo(150, 124); g.arc(156, 124, 22, Math.PI, 3 * Math.PI); g.moveTo(122, 124); g.lineTo(134, 124); g.stroke(); }
    g.strokeStyle = '#3a1f1f'; g.lineWidth = 6; g.lineCap = 'round'; g.beginPath();
    if (r() < 0.6) g.arc(128, 168, 26, 0.15 * Math.PI, 0.85 * Math.PI); else { g.moveTo(104, 180); g.lineTo(152, 180); }
    g.stroke();
    if (r() < 0.3) { g.fillStyle = `hsl(${Math.floor(r() * 360)} 60% 40%)`; g.fillRect(70, 40, 116, 18); g.fillRect(92, 6, 72, 40); }
    return c.toDataURL('image/webp', 0.8);
  }, { i, kind });
  const buf = Buffer.from(url.split(',')[1], 'base64');
  fs.writeFileSync(join(OUT, 'img', id + '.webp'), buf);
  people.push({ id, name: NAMES[i], img: `img/${id}.webp`, tags: [kind], credit: { author: 'Mystery Face (generated shapes)', license: 'CC0', source: 'tools/make-sample-deck.mjs' } });
}
await browser.close();
fs.writeFileSync(join(OUT, 'deck.json'), JSON.stringify({ id: 'sample', title: 'Sample shapes', people }, null, 1) + '\n');
console.log('wrote', people.length, 'faces to', OUT);
