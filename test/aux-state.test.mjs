import assert from 'node:assert/strict';
import { test } from 'node:test';
import { LYRICS_MIN_SIZE, MINI_DEFAULT_SIZE, sanitizeAuxState } from '../src/main/aux-state.mjs';

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

test('remembers the lyrics overlay size, clamped into the resizable range', () => {
  const kept = sanitizeAuxState({ lyrics: { x: 10, y: 20, width: 900.4, height: 400.6 } });
  assert.deepEqual(kept.lyrics, { x: 10, y: 20, width: 900, height: 401 });
  const tiny = sanitizeAuxState({ lyrics: { x: 10, y: 20, width: 12, height: 12 } });
  assert.equal(tiny.lyrics.width, LYRICS_MIN_SIZE.width);
  assert.equal(tiny.lyrics.height, LYRICS_MIN_SIZE.height);
  const huge = sanitizeAuxState({ lyrics: { x: 10, y: 20, width: 99999, height: 99999 } });
  assert.deepEqual(huge.lyrics, { x: 10, y: 20, width: 3000, height: 1200 });
});

test('remembers the overlay switch only as a real boolean', () => {
  assert.equal(sanitizeAuxState({ lyricsOpen: true }).lyricsOpen, true);
  assert.equal(sanitizeAuxState({ lyricsOpen: false }).lyricsOpen, false);
  assert.deepEqual(sanitizeAuxState({ lyricsOpen: 'yes' }), {});
});
