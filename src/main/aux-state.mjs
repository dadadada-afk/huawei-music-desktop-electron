// Persisted geometry for the two helper windows. The lyrics overlay only needs a position (its height
// follows the type scale); the mini player is resizable, so its size is remembered as well.
export const MINI_DEFAULT_SIZE = Object.freeze({ width: 384, height: 96 });

const MINI_MIN = { width: 300, height: 96 };
const MINI_MAX = { width: 1400, height: 600 };
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
 * than repaired into a window parked off-screen.
 *
 * @param {unknown} raw
 * @returns {{ mini?: { x: number, y: number, width: number, height: number }, lyrics?: { x: number, y: number } }}
 */
export function sanitizeAuxState(raw) {
  const source = raw && typeof raw === 'object' ? raw : {};
  /** @type {{ mini?: { x: number, y: number, width: number, height: number }, lyrics?: { x: number, y: number } }} */
  const next = {};
  const mini = position(source.mini);
  if (mini) {
    const stored = source.mini;
    const width = finite(stored.width) ? Math.round(clamp(stored.width, MINI_MIN.width, MINI_MAX.width)) : MINI_DEFAULT_SIZE.width;
    const height = finite(stored.height) ? Math.round(clamp(stored.height, MINI_MIN.height, MINI_MAX.height)) : MINI_DEFAULT_SIZE.height;
    next.mini = { ...mini, width, height };
  }
  const lyrics = position(source.lyrics);
  if (lyrics) next.lyrics = lyrics;
  return next;
}
