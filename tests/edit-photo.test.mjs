// Editing a custom person's photo later: the kept original's size, and reopening the framer where it was left.
import test from 'node:test';
import assert from 'node:assert/strict';
import { cropStart, cropPan, cropZoom, cropRect, cropFromRect, originalSize, ORIGINAL_PX } from '../js/faces.js';

const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-6, `${msg}: ${a} vs ${b}`);

test('kept original: an iPhone photo shrinks to 1024 on the long side, small pictures stay as they are', () => {
  assert.equal(ORIGINAL_PX, 1024);
  assert.deepEqual(originalSize(4032, 3024), { w: 1024, h: 768, r: 1024 / 4032 });
  assert.deepEqual(originalSize(3024, 4032), { w: 768, h: 1024, r: 1024 / 4032 });
  assert.deepEqual(originalSize(640, 480), { w: 640, h: 480, r: 1 });
});

test('Edit reopens the framer exactly where the photo was framed', () => {
  const W = 1024, H = 768;
  for (const F of [280, 300, 233]) {
    let v = cropStart(W, H, F);
    v = cropZoom(v, 2.7, 80, 140, W, H, F);
    v = cropPan(v, -37, 22, W, H, F);
    const rect = cropRect(v, W, H, F);
    // the framer may be a different width next time (another phone): same square of the picture
    const F2 = F + 20;
    const back = cropRect(cropFromRect(rect, W, H, F2), W, H, F2);
    near(back.sx, rect.sx, 'sx'); near(back.sy, rect.sy, 'sy'); near(back.s, rect.s, 's');
  }
});

test('a stored square from a bigger picture is clamped back inside the kept original', () => {
  const v = cropFromRect({ sx: 900, sy: 700, s: 400 }, 1024, 768, 300);
  const r = cropRect(v, 1024, 768, 300);
  assert.ok(r.sx >= 0 && r.sy >= 0 && r.sx + r.s <= 1024 + 1e-6 && r.sy + r.s <= 768 + 1e-6, JSON.stringify(r));
  assert.equal(cropFromRect(null, 1024, 768, 300).z, cropStart(1024, 768, 300).z);   // nothing stored: the default
});
