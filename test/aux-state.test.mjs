import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MINI_DEFAULT_SIZE, sanitizeAuxState } from '../src/main/aux-state.mjs';

test('drops anything that is not a finite coordinate pair', () => {
  assert.deepEqual(sanitizeAuxState(null), {});
  assert.deepEqual(sanitizeAuxState([]), {});
  assert.deepEqual(sanitizeAuxState({ mini: { x: 10 } }), {});
  assert.deepEqual(sanitizeAuxState({ lyrics: { x: Number.NaN, y: 4 } }), {});
  // A window parked beyond any real desktop is worse than no memory at all.
  assert.deepEqual(sanitizeAuxState({ lyrics: { x: 99999, y: 0 } }), {});
});

test('keeps the lyrics overlay position without inventing a size', () => {
  assert.deepEqual(sanitizeAuxState({ lyrics: { x: 120.4, y: -30.6 } }), { lyrics: { x: 120, y: -31 } });
});

test('clamps the mini player size into the resizable range', () => {
  const tiny = sanitizeAuxState({ mini: { x: 0, y: 0, width: 10, height: 10 } });
  assert.equal(tiny.mini.width, 300);
  assert.equal(tiny.mini.height, 96);
  const huge = sanitizeAuxState({ mini: { x: 0, y: 0, width: 9999, height: 9999 } });
  assert.equal(huge.mini.width, 1400);
  assert.equal(huge.mini.height, 600);
});

test('fills a missing mini size from the default rather than dropping the position', () => {
  const kept = sanitizeAuxState({ mini: { x: 40, y: 50 } });
  assert.deepEqual(kept.mini, { x: 40, y: 50, width: MINI_DEFAULT_SIZE.width, height: MINI_DEFAULT_SIZE.height });
});

test('ignores unknown keys instead of carrying them forward', () => {
  const cleaned = sanitizeAuxState({ mini: { x: 1, y: 2, width: 384, height: 96 }, extra: { x: 1, y: 1 } });
  assert.deepEqual(Object.keys(cleaned), ['mini']);
});
