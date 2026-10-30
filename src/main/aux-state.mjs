// Persisted geometry for the two helper windows. Both remember where they were put, and both are
// resizable, so both remember their size as well. The lyrics overlay additionally remembers whether
// it was open: a user who turned the overlay on expects it back on the next launch, and one who
// turned it off does not want it reappearing.
export const MINI_DEFAULT_SIZE = Object.freeze({ width: 384, height: 96 });
export const MINI_MIN_SIZE = Object.freeze({ width: 300, height: 96 });
/** Fallback overlay width; its height follows the type size until the user resizes the frame. */
export const LYRICS_DEFAULT_WIDTH = 760;
export const LYRICS_MIN_SIZE = Object.freeze({ width: 320, height: 120 });

const MINI_MAX = { width: 1400, height: 600 };
const LYRICS_MAX = { width: 3000, height: 1200 };
const COORDINATE_LIMIT = 20000;

const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
const finite = value => typeof value === 'number' && Number.isFinite(value);

function position(value) {
  if (!value || typeof value !== 'object') return null;
  const { x, y } = value;
  if (!finite(x) || !finite(y)) return null;
  if (Math.abs(x) > COORDINATE_LIMIT || Math.abs(y) > COORDINATE_LIMIT) return null;
  return { x: Math.round(x), y: Math.round(y) };
}

/**
 * Keeps whatever is still usable in a stored aux-state blob. Anything malformed is dropped rather
 * than repaired into a window parked off-screen. The overlay size stays optional: a file written
 * before the overlay remembered its size has only a position, and the height then follows the type
 * size again.
 *
 * @param {unknown} raw
 * @returns {{ mini?: { x: number, y: number, width: number, height: number }, lyrics?: { x: number, y: number, width?: number, height?: number }, lyricsOpen?: boolean }}
 */
export function sanitizeAuxState(raw) {
  const source = raw && typeof raw === 'object' ? raw : {};
  /** @type {{ mini?: { x: number, y: number, width: number, height: number }, lyrics?: { x: number, y: number, width?: number, height?: number }, lyricsOpen?: boolean }} */
  const next = {};
  const mini = position(source.mini);
  if (mini) {
    const stored = source.mini;
    const width = finite(stored.width) ? Math.round(clamp(stored.width, MINI_MIN_SIZE.width, MINI_MAX.width)) : MINI_DEFAULT_SIZE.width;
    const height = finite(stored.height) ? Math.round(clamp(stored.height, MINI_MIN_SIZE.height, MINI_MAX.height)) : MINI_DEFAULT_SIZE.height;
    next.mini = { ...mini, width, height };
  }
  const lyrics = position(source.lyrics);
  if (lyrics) {
    const stored = source.lyrics;
    next.lyrics = { ...lyrics };
    // Clamped to the same floor the window itself enforces, so a remembered size can never be
    // smaller than what the window manager would accept.
    if (finite(stored.width)) next.lyrics.width = Math.round(clamp(stored.width, LYRICS_MIN_SIZE.width, LYRICS_MAX.width));
    if (finite(stored.height)) next.lyrics.height = Math.round(clamp(stored.height, LYRICS_MIN_SIZE.height, LYRICS_MAX.height));
  }
  if (typeof source.lyricsOpen === 'boolean') next.lyricsOpen = source.lyricsOpen;
  return next;
}
