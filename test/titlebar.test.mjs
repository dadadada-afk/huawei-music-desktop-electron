import test from 'node:test';
import assert from 'node:assert/strict';
import { TITLEBAR_DARK, TITLEBAR_LIGHT, titleBarColors } from '../src/main/titlebar.mjs';

test('title bar palette follows the stored theme, not just the OS', () => {
  // Explicit values win over the desktop: that is the whole point of the three-way setting.
  assert.deepEqual(titleBarColors('dark', false), TITLEBAR_DARK);
  assert.deepEqual(titleBarColors('light', true), TITLEBAR_LIGHT);
  // 'system' defers to the OS.
  assert.deepEqual(titleBarColors('system', true), TITLEBAR_DARK);
  assert.deepEqual(titleBarColors('system', false), TITLEBAR_LIGHT);
  // A corrupt file must not paint a dark title bar over a light page.
  assert.deepEqual(titleBarColors('midnight', false), TITLEBAR_LIGHT);
});
