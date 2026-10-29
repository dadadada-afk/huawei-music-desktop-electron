import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fillGradient, lineFill } from '../src/lyrics-progress.mjs';

test('without word marks the line still fills one character at a time', () => {
  const line = { text: 'abcd' };
  assert.deepEqual(lineFill(line, 0, 4000, 0), [0, 0, 0, 0]);
  // Half way through a four-character line: the first two characters are done, the third is on its
  // way. Handing all four the same 0.5 is what made the whole row flip colour at once.
  assert.deepEqual(lineFill(line, 0, 4000, 2000), [1, 1, 0, 0]);
  assert.deepEqual(lineFill(line, 0, 4000, 1000), [1, 0, 0, 0]);
  assert.deepEqual(lineFill(line, 0, 4000, 3000), [1, 1, 1, 0]);
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
  // Falls back to the unsegmented spread, which walks the characters rather than lighting them all.
  assert.deepEqual(fills, [1, 1, 0, 0]);
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

test('a partly sung character is split inside the glyph, not snapped to one colour', () => {
  // The fill has to sweep across a character, the way karaoke lines do; snapping each character to
  // whole-colour made the row jump a syllable at a time.
  const stops = fillGradient([0.4, 0.6], '#fff', '#888');
  // Character 1: sung for its first 40% of a 50% wide cell, then pending.
  assert.ok(stops?.includes('#fff 0.00%, #fff 20.00%, #888 20.00%, #888 50.00%'));
  // Character 2: sung for its first 60% of the second cell.
  assert.ok(stops?.includes('#fff 50.00%, #fff 80.00%, #888 80.00%, #888 100.00%'));
});

test('an unsung line still gets a gradient so the row keeps the pending colour', () => {
  // Both characters share one colour, so the runs collapse into a single pair covering the row.
  const stops = fillGradient([0, 0], '#fff', '#888');
  assert.ok(stops?.includes('#888 0.00%, #888 100.00%'));
  assert.ok(!stops?.includes('#fff'));
});

test('identical neighbouring colours collapse into one run', () => {
  // The gradient is rebuilt on every animation frame, so three sung characters must not cost six
  // stops when one pair says the same thing.
  const stops = fillGradient([1, 1, 1, 0], '#fff', '#888');
  const colours = stops?.match(/#[0-9a-f]{3} /gi) ?? [];
  assert.equal(colours.length, 4); // two runs, each written as "<colour> <from>, <colour> <to>"
});

test('gradient stops cover every character and end with the pending colour', () => {
  const stops = fillGradient([1, 0], '#fff', '#888');
  assert.ok(stops?.startsWith('linear-gradient(90deg,'));
  assert.ok(stops?.includes('#fff 0.00%'));
  assert.ok(stops?.includes('#888 50.00%'));
  // Total coverage: the last stop sits at 100%.
  assert.ok(stops?.includes('#888 100.00%'));
});
