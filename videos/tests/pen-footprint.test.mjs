import test from 'node:test';
import assert from 'node:assert/strict';
import { paths } from '../scenarios/pen.mjs';

// Independently traced dark shoreline in the pinned 510 x 510 scene. Each row
// contains one inclusive water interval. This is the acceptance boundary, not
// an expected copy of the drawn strokes. Check camera alignment in live recordings too.
const shoreline = [
  [310, 299, 302], [311, 297, 304], [312, 296, 305], [313, 295, 307],
  [314, 294, 307], [315, 294, 308], [316, 293, 309], [317, 293, 310],
  [318, 293, 310], [319, 293, 311], [320, 293, 311], [321, 294, 311],
  [322, 294, 312], [323, 295, 312], [324, 297, 312], [325, 298, 312],
  [326, 304, 313], [327, 305, 313], [328, 306, 313], [329, 306, 313],
  [330, 307, 313], [331, 307, 314], [332, 307, 313], [333, 306, 314],
  [334, 306, 314], [335, 306, 313], [336, 306, 313], [337, 306, 313],
  [338, 306, 312], [339, 306, 312], [340, 307, 311], [341, 308, 309],
];
const key = (x, y) => y * 512 + x;

// The native round brush covers whole pixel centres in its floor-aligned square.
// Sample more densely than pointer events so segment corners are checked too.
function coverage(points, size) {
  const pixels = new Set();
  for (let i = 1; i < points.length; i++) {
    const [ax, ay] = points[i - 1], [bx, by] = points[i];
    const steps = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) * 16));
    for (let step = 0; step <= steps; step++) {
      const ox = Math.floor(ax + (bx - ax) * step / steps) - Math.floor(size / 2);
      const oy = Math.floor(ay + (by - ay) * step / steps) - Math.floor(size / 2);
      for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
        if ((x + 0.5 - size / 2) ** 2 + (y + 0.5 - size / 2) ** 2 <= (size / 2) ** 2) {
          pixels.add(key(ox + x, oy + y));
        }
      }
    }
  }
  return pixels;
}

test('Pen strokes leave the traced water clear of yellow and enclose the entire blue fill', () => {
  const yellow = new Set([...coverage(paths.broadYellow, 4), ...coverage(paths.fineYellow, 2)]);
  const blue = coverage(paths.blue, 8);
  // Fill gaps retains the existing yellow pixels touched by the blue brush.
  for (const pixel of yellow) blue.delete(pixel);
  for (const [y, left, right] of shoreline) for (let x = left; x <= right; x++) {
    assert.ok(!yellow.has(key(x, y)), `Yellow overlaps water at ${x},${y}`);
    assert.ok(blue.has(key(x, y)), `Water remains unfilled at ${x},${y}`);
  }
  const queue = [[284, 301]], outside = new Set([key(284, 301)]);
  for (let i = 0; i < queue.length; i++) {
    const [x, y] = queue[i];
    for (const [nx, ny] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]) {
      const pixel = key(nx, ny);
      if (nx < 284 || nx > 324 || ny < 301 || ny > 352 || outside.has(pixel) || yellow.has(pixel)) continue;
      outside.add(pixel); queue.push([nx, ny]);
    }
  }
  for (const pixel of blue) assert.ok(!outside.has(pixel), 'Blue escapes the closed yellow outline');
  // The presentation needs a solid fill all the way to yellow, including the
  // few shore pixels between the traced dark water and the drawn boundary.
  for (let y = 301; y <= 352; y++) for (let x = 284; x <= 324; x++) {
    const pixel = key(x, y);
    if (!outside.has(pixel) && !yellow.has(pixel)) {
      assert.ok(blue.has(pixel), `An unpainted gap remains inside yellow at ${x},${y}`);
    }
  }
});
