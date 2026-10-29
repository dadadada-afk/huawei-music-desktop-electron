import test from 'node:test';
import assert from 'node:assert/strict';
import { TITLEBAR_DARK, TITLEBAR_GLASS, TITLEBAR_LIGHT, TITLEBAR_NOIR, TITLEBAR_PAPER, nativeThemeSource, titleBarColors } from '../src/main/titlebar.mjs';

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

test('each custom palette paints its own title bar regardless of the OS preference', () => {
  assert.deepEqual(titleBarColors('noir', false), TITLEBAR_NOIR);
  assert.deepEqual(titleBarColors('paper', true), TITLEBAR_PAPER);
  assert.deepEqual(titleBarColors('glass', false), TITLEBAR_GLASS);
});

test('custom palettes collapse onto a native theme source', () => {
  // nativeTheme only knows system/light/dark; scrollbars and dialogs read this projection.
  assert.equal(nativeThemeSource('noir'), 'dark');
  assert.equal(nativeThemeSource('glass'), 'dark');
  assert.equal(nativeThemeSource('paper'), 'light');
  assert.equal(nativeThemeSource('dark'), 'dark');
  assert.equal(nativeThemeSource('light'), 'light');
  assert.equal(nativeThemeSource('system'), 'system');
  assert.equal(nativeThemeSource('midnight'), 'system');
});
