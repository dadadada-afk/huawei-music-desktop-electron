import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fillGradient, lineFill } from '../src/lyrics-progress.mjs';

test('spreads a line evenly when it has no word marks', () => {
  const line = { text: 'abcd' };
  assert.deepEqual(lineFill(line, 0, 4000, 0), [0, 0, 0, 0]);
  assert.deepEqual(lineFill(line, 0, 4000, 2000), [0.5, 0.5, 0.5, 0.5]);
  assert.deepEqual(lineFill(line, 0, 4000, 9999), [1, 1, 1, 1]);
});

test('follows word marks character by character when they line up', () => {
  const line = { text: 'ab', segments: [{ timeMs: 0, text: 'a' }, { timeMs: 1000, text: 'b' }] };
  // First syllable done, second not started.
  assert.deepEqual(lineFill(line, 0, 2000, 1000), [1, 0]);
  // Halfway through the second.
  assert.deepEqual(lineFill(line, 0, 2000, 1500), [1, 0.5]);
});

test('ignores word marks whose text does not match the line', () => {
  const line = { text: 'abcd', segments: [{ timeMs: 0, text: 'ab' }] };
  const fills = lineFill(line, 0, 4000, 2000);
  assert.equal(fills.length, 4);
  assert.ok(fills.every(value => value === 0.5));
});

test('characters inside one timed segment advance one at a time', () => {
  const line = { text: '只为了红几年', segments: [
    { timeMs: 2000, text: '只为了' }, { timeMs: 3200, text: '红几年' },
  ] };
  // 2500 ms is 100 ms into the second character of a 400 ms-per-character run.
  const fills = lineFill(line, 2000, 5000, 2500);
  assert.deepEqual(fills.map(value => Number(value.toFixed(2))), [1, 0.25, 0, 0, 0, 0]);
});

test('an empty line produces no stops', () => {
  assert.deepEqual(lineFill({ text: '' }, 0, 1000, 500), []);
  assert.equal(fillGradient([], '#fff', '#888'), undefined);
});

test('a fully sung line needs no gradient', () => {
  assert.equal(fillGradient([1, 1], '#fff', '#888'), undefined);
});

test('a half-sung character switches colour once instead of fading inside the glyph', () => {
  // Splitting one glyph between two colours smudged the row at normal font sizes; only the majority
  // state is allowed to reach the gradient.
  assert.ok(fillGradient([0.4, 0.6], '#fff', '#888')?.includes('#888 0.00%, #888 50.00%, #fff 50.00%, #fff 100.00%'));
});

test('gradient stops cover every character and end with the pending colour', () => {
  const stops = fillGradient([1, 0], '#fff', '#888');
  assert.ok(stops?.startsWith('linear-gradient(90deg,'));
  assert.ok(stops?.includes('#fff 0.00%'));
  assert.ok(stops?.includes('#888 50.00%'));
  // Total coverage: the last stop sits at 100%.
  assert.ok(stops?.includes('#888 100.00%'));
});
