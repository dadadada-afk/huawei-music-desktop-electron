import test from 'node:test';
import assert from 'node:assert/strict';
import { maskAccountId } from '../src/main/account-label.mjs';
import { DEFAULT_SETTINGS, sanitizeAppearance, sanitizeQueue, sanitizeSettings } from '../src/main/settings.mjs';

test('settings keep only known enum values and clamp volume', () => {
  assert.deepEqual(sanitizeSettings({ closeBehavior: 'tray', quality: 'lossless', volume: 5, repeatMode: 'one', shuffle: true, syncHistory: false }), {
    closeBehavior: 'tray', quality: 'lossless', volume: 1, repeatMode: 'one', shuffle: true, syncHistory: false,
    thirdPartyLyrics: true,
    sidebarCollapsed: false, lyricsOpacity: 1, lyricsLocked: false, lyricsFontSize: 30, lyricsColor: '#ffe9eb',
    searchHistory: [],
    playbackRate: 1, theme: 'system', launchAtLogin: false,
    appearance: DEFAULT_SETTINGS.appearance,
  });
  assert.deepEqual(sanitizeSettings({ closeBehavior: 'evil', quality: 'hires', volume: -3, repeatMode: 'loop', shuffle: 'yes', syncHistory: 'yes' }), {
    ...DEFAULT_SETTINGS, volume: 0,
  });
  assert.equal(DEFAULT_SETTINGS.syncHistory, true, 'history sync is on by default');
  assert.equal(sanitizeSettings({ syncHistory: false }).syncHistory, false);
  assert.deepEqual(sanitizeSettings(null), { ...DEFAULT_SETTINGS });
  assert.deepEqual(sanitizeSettings({ volume: Number.NaN }).volume, DEFAULT_SETTINGS.volume);
  // The overlay size is user-editable, so it has to be clamped on the way in and back out.
  assert.equal(sanitizeSettings({ lyricsFontSize: 12 }).lyricsFontSize, 18);
  assert.equal(sanitizeSettings({ lyricsFontSize: 999 }).lyricsFontSize, 64);
  assert.equal(sanitizeSettings({ lyricsFontSize: 40 }).lyricsFontSize, 40);
  assert.equal(sanitizeSettings({ lyricsFontSize: 'big' }).lyricsFontSize, DEFAULT_SETTINGS.lyricsFontSize);
  // The overlay colour reaches a stylesheet, so only a plain #rrggbb survives sanitizing.
  assert.equal(sanitizeSettings({ lyricsColor: '#3B82F6' }).lyricsColor, '#3b82f6');
  assert.equal(sanitizeSettings({ lyricsColor: 'red' }).lyricsColor, DEFAULT_SETTINGS.lyricsColor);
  assert.equal(sanitizeSettings({ lyricsColor: '#fff' }).lyricsColor, DEFAULT_SETTINGS.lyricsColor);
  assert.equal(sanitizeSettings({ lyricsColor: 'url(x)' }).lyricsColor, DEFAULT_SETTINGS.lyricsColor);
  // Playback speed is one of five offered steps; anything else is a corrupt file, not a preference.
  assert.equal(sanitizeSettings({ playbackRate: 1.5 }).playbackRate, 1.5);
  assert.equal(sanitizeSettings({ playbackRate: 0.1 }).playbackRate, DEFAULT_SETTINGS.playbackRate);
  assert.equal(sanitizeSettings({ playbackRate: 'fast' }).playbackRate, DEFAULT_SETTINGS.playbackRate);
  // Theme is a three-way enum; an unknown value falls back to following the OS.
  assert.equal(sanitizeSettings({ theme: 'dark' }).theme, 'dark');
  assert.equal(sanitizeSettings({ theme: 'light' }).theme, 'light');
  assert.equal(sanitizeSettings({ theme: 'midnight' }).theme, DEFAULT_SETTINGS.theme);
  // A JSON string or number must not silently enable a login item.
  assert.equal(sanitizeSettings({ launchAtLogin: true }).launchAtLogin, true);
  assert.equal(sanitizeSettings({ launchAtLogin: 'yes' }).launchAtLogin, DEFAULT_SETTINGS.launchAtLogin);
  assert.equal(sanitizeSettings({ playbackRate: Number.NaN }).playbackRate, DEFAULT_SETTINGS.playbackRate);
});

test('account labels expose only the account id tail', () => {
  assert.equal(maskAccountId(' 1234567890 '), '****7890');
  assert.equal(maskAccountId('123'), '****123');
  assert.equal(maskAccountId('   '), undefined);
  assert.equal(maskAccountId(null), undefined);
});

test('queue sanitation drops malformed rows and clamps the index', () => {
  const queue = sanitizeQueue({ tracks: [
    { id: 'a', title: 'A', artists: [{ name: '甲' }, { name: '' }, { id: 'x' }], album: { id: 'al', title: 'AL' }, durationSeconds: 12 },
    { title: '无 ID' },
    null,
  ], index: 9, positionSeconds: 12.5 });
  assert.equal(queue.tracks.length, 1);
  assert.deepEqual(queue.tracks[0].artists, [{ name: '甲' }]);
  assert.deepEqual(queue.tracks[0].album, { id: 'al', title: 'AL' });
  assert.equal(queue.index, 0);
  assert.equal(queue.positionSeconds, 12.5);
});

test('queue sanitation rejects empty or non object payloads', () => {
  assert.equal(sanitizeQueue(null), null);
  assert.equal(sanitizeQueue({ tracks: [] }), null);
  assert.equal(sanitizeQueue({ tracks: [{ title: 'no id' }] }), null);
});

test('queue sanitation caps the number of persisted tracks', () => {
  const tracks = Array.from({ length: 10001 }, (_, index) => ({ id: `id-${index}`, title: `t${index}` }));
  assert.equal(sanitizeQueue({ tracks, index: 0, positionSeconds: 0 }).tracks.length, 10000);
  assert.equal(sanitizeQueue({ tracks: tracks.slice(0, 965), index: 964, positionSeconds: 0 }).index, 964);
});

test('saved queue never persists playback urls', () => {
  const queue = sanitizeQueue({ tracks: [{ id: 'a', title: 'A', url: 'https://x.dbankcdn.cn/secret.mp3', fileURL: 'https://x.dbankcdn.cn/secret.mp3' }], index: 0, positionSeconds: 0 });
  assert.equal(JSON.stringify(queue).includes('dbankcdn'), false);
  assert.equal(JSON.stringify(queue).includes('secret.mp3'), false);
});

test('appearance settings clamp ranges and reject unknown values', () => {
  assert.deepEqual(sanitizeAppearance({ accent: 'blue', panelOpacity: 0.7, cornerRadius: 18, fontScale: 1.15, fontFamily: 'serif' }),
    { accent: 'blue', panelOpacity: 0.7, cornerRadius: 18, fontScale: 1.15, fontFamily: 'serif', customAccent: '#c8202e', customFont: '' });
  assert.deepEqual(sanitizeAppearance({ accent: 'pink', panelOpacity: 9, cornerRadius: -4, fontScale: 0.1, fontFamily: 'comic' }),
    { accent: 'red', panelOpacity: 1, cornerRadius: 0, fontScale: 0.85, fontFamily: 'sans', customAccent: '#c8202e', customFont: '' });
  // A partial patch keeps every other stored field.
  assert.deepEqual(sanitizeAppearance({ accent: 'green' }, { accent: 'blue', panelOpacity: 0.8, cornerRadius: 4, fontScale: 1.1, fontFamily: 'mono' }),
    { accent: 'green', panelOpacity: 0.8, cornerRadius: 4, fontScale: 1.1, fontFamily: 'mono', customAccent: '#c8202e', customFont: '' });
  assert.deepEqual(sanitizeAppearance(null), DEFAULT_SETTINGS.appearance);
});

test('a partial appearance patch never resets unrelated settings', () => {
  const next = sanitizeSettings({ appearance: { fontScale: 1.2 } }, sanitizeSettings({ quality: 'lossless' }));
  assert.equal(next.quality, 'lossless');
  assert.equal(next.appearance.fontScale, 1.2);
  assert.equal(next.appearance.accent, 'red');
});

test('a custom accent colour and font family are validated, not trusted', () => {
  assert.equal(sanitizeAppearance({ accent: 'custom', customAccent: '#AbC123' }).customAccent, '#abc123');
  assert.equal(sanitizeAppearance({ accent: 'custom', customAccent: 'javascript:alert(1)' }).customAccent, '#c8202e');
  assert.equal(sanitizeAppearance({ accent: 'custom', customAccent: 'rgb(1,2,3)' }).customAccent, '#c8202e');
  assert.equal(sanitizeAppearance({ fontFamily: 'custom', customFont: 'Source Han Sans SC' }).customFont, 'Source Han Sans SC');
  // Quotes/braces are stripped so the family can only ever be a quoted CSS identifier.
  const cleaned = sanitizeAppearance({ fontFamily: 'custom', customFont: 'Bad"; } body { color: red' }).customFont;
  assert.equal(/["'\\;{}<>]/.test(cleaned), false);
  assert.match(cleaned, /^Bad/);
  assert.equal(sanitizeAppearance({ fontFamily: 'custom', customFont: 'x'.repeat(200) }).customFont.length, 80);
});
