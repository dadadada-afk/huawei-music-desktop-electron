// Pure settings/queue sanitation so persisted JSON can never widen the IPC contract.
/** @type {import('../shared/types').AppSettings} */
export const DEFAULT_SETTINGS = Object.freeze({
  // A music player is expected to keep playing when the window is closed, which is how every
  // mainstream desktop player behaves; minimizing stays a plain minimize, and quitting is one
  // setting away.
  closeBehavior: 'tray',
  quality: 'standard',
  volume: 0.85,
  repeatMode: 'off',
  shuffle: false,
  syncHistory: true,
  thirdPartyLyrics: true,
  sidebarCollapsed: false,
  lyricsOpacity: 1,
  lyricsLocked: false,
  lyricsFontSize: 30,
  lyricsColor: '#ffe9eb',
  lyricsPendingColor: '#8b9099',
  lyricsAlign: 'center',
  lyricsTransition: 'slide',
  // Newest first, capped so the store cannot grow without bound.
  searchHistory: [],
  playbackRate: 1,
  // 'system' follows the OS; the two explicit values pin the app regardless of the desktop.
  theme: 'system',
  launchAtLogin: false,
  appearance: Object.freeze({
    accent: 'theme',
    panelOpacity: 1,
    cornerRadius: 11,
    fontScale: 1,
    fontFamily: 'sans',
    customAccent: '#c8202e',
    customFont: '',
  }),
});

import { isSafeResourceUrl } from '../safe-media-url.mjs';
const CLOSE_BEHAVIORS = new Set(['quit', 'tray']);
const QUALITIES = new Set(['standard', 'lossless']);
const REPEAT_MODES = new Set(['off', 'all', 'one']);
// The menu offers exactly these steps, so a stored value outside the set is a corrupted file, not a
// new preference: snap it back instead of honouring an arbitrary speed.
const PLAYBACK_RATES = [0.75, 1, 1.25, 1.5, 2];
const ACCENTS = new Set(['theme', 'red', 'blue', 'green', 'amber', 'violet', 'custom']);
const FONT_CHOICES = new Set(['sans', 'serif', 'mono', 'custom']);
// The three custom palettes repaint the whole window from CSS tokens; system/light/dark still
// follow the OS preference.
const THEMES = new Set(['system', 'light', 'dark', 'noir', 'paper', 'glass']);
const HEX_COLOR = /^#[0-9a-f]{6}$/i;
const LYRICS_ALIGNS = ['left', 'center', 'right'];
const LYRICS_TRANSITIONS = ['none', 'fade', 'slide'];

function clampNumber(value, min, max, fallback) {
  return typeof value === 'number' && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
}

/** @returns {import('../shared/types').AppearanceSettings} */
export function sanitizeAppearance(input, fallback = DEFAULT_SETTINGS.appearance) {
  const base = { ...DEFAULT_SETTINGS.appearance, ...(fallback ?? {}) };
  if (!input || typeof input !== 'object') return base;
  const raw = /** @type {Record<string, unknown>} */ (input);
  return {
    accent: ACCENTS.has(raw.accent) ? /** @type {import('../shared/types').AccentName} */ (raw.accent) : base.accent,
    panelOpacity: clampNumber(raw.panelOpacity, 0.55, 1, base.panelOpacity),
    cornerRadius: clampNumber(raw.cornerRadius, 0, 18, base.cornerRadius),
    fontScale: clampNumber(raw.fontScale, 0.85, 1.2, base.fontScale),
    fontFamily: FONT_CHOICES.has(raw.fontFamily) ? /** @type {import('../shared/types').FontChoice} */ (raw.fontFamily) : base.fontFamily,
    customAccent: typeof raw.customAccent === 'string' && HEX_COLOR.test(raw.customAccent) ? raw.customAccent.toLowerCase() : base.customAccent,
    // A font family name is only ever injected into a CSS font-family list, so strip anything that
    // could break out of the quoted string and cap the length.
    customFont: typeof raw.customFont === 'string'
      ? raw.customFont.replace(/["'\\;{}<>]/g, '').trim().slice(0, 80)
      : base.customFont,
  };
}

/**
 * @template {import('../shared/types').AppSettings} T
 * @param {unknown} input
 * @param {T} [fallback]
 * @returns {T}
 */
export function sanitizeSettings(input, fallback = DEFAULT_SETTINGS) {
  const base = { ...DEFAULT_SETTINGS, ...(fallback ?? {}) };
  if (!input || typeof input !== 'object') return base;
  const raw = /** @type {Record<string, unknown>} */ (input);
  const next = { ...base };
  if (CLOSE_BEHAVIORS.has(raw.closeBehavior)) next.closeBehavior = /** @type {'quit' | 'tray'} */ (raw.closeBehavior);
  if (QUALITIES.has(raw.quality)) next.quality = /** @type {'standard' | 'lossless'} */ (raw.quality);
  if (REPEAT_MODES.has(raw.repeatMode)) next.repeatMode = /** @type {'off' | 'all' | 'one'} */ (raw.repeatMode);
  if (typeof raw.shuffle === 'boolean') next.shuffle = raw.shuffle;
  if (typeof raw.syncHistory === 'boolean') next.syncHistory = raw.syncHistory;
  if (typeof raw.thirdPartyLyrics === 'boolean') next.thirdPartyLyrics = raw.thirdPartyLyrics;
  if (typeof raw.sidebarCollapsed === 'boolean') next.sidebarCollapsed = raw.sidebarCollapsed;
  if (typeof raw.lyricsLocked === 'boolean') next.lyricsLocked = raw.lyricsLocked;
  // Below 0.3 the overlay text stops being legible over a bright desktop, so the floor is a
  // usability bound rather than an arbitrary clamp.
  next.lyricsOpacity = clampNumber(raw.lyricsOpacity, 0.3, 1, base.lyricsOpacity);
  // The overlay is read from across a desk, so the floor keeps it legible and the ceiling keeps a
  // single line from wrapping into the line below it.
  next.lyricsFontSize = clampNumber(raw.lyricsFontSize, 18, 64, base.lyricsFontSize);
  // Only a plain #rrggbb reaches the stylesheet; anything else falls back instead of being injected.
  if (typeof raw.lyricsColor === 'string' && HEX_COLOR.test(raw.lyricsColor)) next.lyricsColor = raw.lyricsColor.toLowerCase();
  if (typeof raw.lyricsPendingColor === 'string' && HEX_COLOR.test(raw.lyricsPendingColor)) next.lyricsPendingColor = raw.lyricsPendingColor.toLowerCase();
  if (LYRICS_ALIGNS.includes(raw.lyricsAlign)) next.lyricsAlign = raw.lyricsAlign;
  if (LYRICS_TRANSITIONS.includes(raw.lyricsTransition)) next.lyricsTransition = raw.lyricsTransition;
  if (Array.isArray(raw.searchHistory)) {
    next.searchHistory = raw.searchHistory
      .filter(entry => typeof entry === 'string' && entry.trim().length > 0 && entry.length <= 80)
      .slice(0, 8)
      .map(entry => entry.trim());
  }
  if (typeof raw.volume === 'number' && Number.isFinite(raw.volume)) {
    next.volume = Math.min(1, Math.max(0, raw.volume));
  }
  if (typeof raw.playbackRate === 'number' && PLAYBACK_RATES.includes(raw.playbackRate)) next.playbackRate = raw.playbackRate;
  if (typeof raw.launchAtLogin === 'boolean') next.launchAtLogin = raw.launchAtLogin;
  if (THEMES.has(raw.theme)) next.theme = /** @type {'system' | 'light' | 'dark' | 'noir' | 'paper' | 'glass'} */ (raw.theme);
  if (raw.appearance && typeof raw.appearance === 'object') {
    next.appearance = sanitizeAppearance(raw.appearance, base.appearance);
  }
  return next;
}

const MAX_QUEUE_TRACKS = 10000;

function sanitizeTrack(value) {
  if (!value || typeof value !== 'object') return null;
  const id = typeof value.id === 'string' ? value.id : '';
  const title = typeof value.title === 'string' ? value.title : '';
  if (!id || !title || id.length > 200) return null;
  const artists = Array.isArray(value.artists)
    ? value.artists.map(artist => {
      const name = typeof artist?.name === 'string' ? artist.name : '';
      if (!name) return null;
      return typeof artist?.id === 'string' ? { id: artist.id, name } : { name };
    }).filter(artist => !!artist).slice(0, 10)
    : [];
  const album = value.album && typeof value.album.id === 'string' && typeof value.album.title === 'string'
    ? { id: value.album.id, title: value.album.title } : undefined;
  return {
    id, title, artists, album,
    coverUrl: typeof value.coverUrl === 'string' && isSafeResourceUrl(value.coverUrl) ? value.coverUrl : undefined,
    durationSeconds: typeof value.durationSeconds === 'number' && Number.isFinite(value.durationSeconds)
      ? value.durationSeconds : undefined,
    available: value.available !== false,
  };
}

/** @returns {import('../shared/types').SavedQueue | null} */
export function sanitizeQueue(input) {
  if (!input || typeof input !== 'object' || !Array.isArray(input.tracks)) return null;
  const tracks = input.tracks.map(sanitizeTrack).filter(track => !!track).slice(0, MAX_QUEUE_TRACKS);
  if (!tracks.length) return null;
  const index = Number.isInteger(input.index) && input.index >= 0 && input.index < tracks.length ? input.index : 0;
  const positionSeconds = typeof input.positionSeconds === 'number' && Number.isFinite(input.positionSeconds) && input.positionSeconds >= 0
    ? input.positionSeconds : 0;
  return { tracks, index, positionSeconds };
}
