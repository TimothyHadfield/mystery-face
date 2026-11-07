// Framing a custom person's photo: the maths behind drag / pinch / zoom and the square that gets saved.
import test from 'node:test';
import assert from 'node:assert/strict';
import { cropStart, cropPan, cropZoom, cropRect, CROP_ZMAX } from '../js/faces.js';

const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-6, `${msg}: ${a} vs ${b}`);

test('start: a landscape iPhone photo is centred and covers the frame', () => {
  const v = cropStart(4032, 3024, 300);
  assert.equal(v.z, 1);
  const r = cropRect(v, 4032, 3024, 300);
  near(r.s, 3024, 'square side = short side');
  near(r.sx, (4032 - 3024) / 2, 'centred across');
  near(r.sy, 0, 'top');
});

test('start: a portrait photo keeps the old upper-part default (faces sit high)', () => {
  const r = cropRect(cropStart(3024, 4032, 300), 3024, 4032, 300);
  near(r.s, 3024, 'side'); near(r.sx, 0, 'left'); near(r.sy, (4032 - 3024) * 0.25, 'upper part');
});

test('drag never shows an empty edge: the picture always covers the frame', () => {
  let v = cropStart(4032, 3024, 300);
  v = cropPan(v, 5000, 5000, 4032, 3024, 300);   // far right/down
  let r = cropRect(v, 4032, 3024, 300);
  near(r.sx, 0, 'stops at left edge'); near(r.sy, 0, 'stops at top edge');
  v = cropPan(v, -99999, -99999, 4032, 3024, 300);
  r = cropRect(v, 4032, 3024, 300);
  near(r.sx + r.s, 4032, 'stops at right edge'); near(r.sy + r.s, 3024, 'stops at bottom edge');
});

test('zoom keeps the point under the fingers still and stays between 1x and the max', () => {
  const W = 1000, H = 800, F = 320;
  const v = cropStart(W, H, F);
  const before = cropRect(v, W, H, F);
  // image point under frame pixel (100, 60) before zooming
  const k1 = F / before.s, ix = before.sx + 100 / k1, iy = before.sy + 60 / k1;
  const z = cropZoom(v, 2.5, 100, 60, W, H, F);
  assert.equal(z.z, 2.5);
  const after = cropRect(z, W, H, F);
  const k2 = F / after.s;
  near(after.sx + 100 / k2, ix, 'x under finger'); near(after.sy + 60 / k2, iy, 'y under finger');
  near(after.s, H / 2.5, 'square shrinks with zoom (face gets larger)');
  assert.equal(cropZoom(v, 0.2, 0, 0, W, H, F).z, 1);
  assert.equal(cropZoom(v, 99, 0, 0, W, H, F).z, CROP_ZMAX);
});

test('the saved square is always inside the photo', () => {
  const W = 640, H = 480, F = 293;
  let v = cropStart(W, H, F);
  for (let i = 0; i < 200; i++) {
    v = i % 3 ? cropPan(v, Math.sin(i) * 90, Math.cos(i * 1.7) * 90, W, H, F) : cropZoom(v, 1 + (i % 11) * 0.5, (i * 37) % F, (i * 53) % F, W, H, F);
    const r = cropRect(v, W, H, F);
    assert.ok(r.sx >= -1e-9 && r.sy >= -1e-9 && r.sx + r.s <= W + 1e-6 && r.sy + r.s <= H + 1e-6, JSON.stringify(r));
  }
});
