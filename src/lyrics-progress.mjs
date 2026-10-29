// Karaoke fill for one lyric line: how much of each character has been sung, as 0..1.
// Word marks (<mm:ss.xx>) are exact; without them the line is spread evenly between its own stamp
// and the next line's, which is the best available guess and still better than a per-row highlight.

const clamp01 = value => Math.min(1, Math.max(0, value));

/**
 * @param {{ text: string, segments?: { timeMs: number | null, text: string }[] }} line
 * @param {number} startMs the line's own timestamp
 * @param {number} endMs when the next line starts (the line is assumed over by then)
 * @param {number} positionMs current playback position
 * @returns {number[]} one 0..1 ratio per character, in text order
 */
/**
 * Slowest believable syllable when the file gives no word marks. This is deliberately far above the
 * 250 ms a mid-tempo line actually averages: the estimate only decides whether a gap is long enough
 * to be accompaniment rather than singing, and guessing low would cut a slow ballad off mid-line.
 */
const MS_PER_CHAR = 800;
/** Shortest believable sung run, so a two-or-three character line is not over within 300 ms. */
const MIN_SUNG_MS = 1200;
/**
 * A line is assumed to finish when the next one starts, which is wrong whenever the accompaniment
 * runs long between two lines: the read then trails the voice and only catches up as the next line
 * arrives. When the gap is clearly wider than the text can fill, the run is capped at that estimate
 * instead, so the row completes with the voice and stays complete through the instrumental.
 */
const LONG_GAP_FACTOR = 1.3;

function sungSpan(charCount, startMs, endMs) {
  const span = endMs > startMs ? endMs - startMs : 0;
  const estimate = Math.max(charCount * MS_PER_CHAR, MIN_SUNG_MS);
  return span > estimate * LONG_GAP_FACTOR ? estimate : span;
}

export function lineFill(line, startMs, endMs, positionMs) {
  const text = line?.text ?? '';
  const chars = [...text];
  if (!chars.length) return [];
  const span = sungSpan(chars.length, startMs, endMs);
  const segments = line?.segments;
  if (segments && segments.length) {
    const fills = [];
    for (let index = 0; index < segments.length; index += 1) {
      const segment = segments[index];
      const next = segments[index + 1];
      if (typeof segment.timeMs !== 'number') { fills.push(0); continue; }
      const segmentEnd = next && typeof next.timeMs === 'number' ? next.timeMs : startMs + span;
      const length = [...(segment.text ?? '')].length;
      const duration = segmentEnd > segment.timeMs ? segmentEnd - segment.timeMs : 0;
      // A segment stamp only marks where the run starts, so its characters share the run's time
      // evenly. Giving them one ratio for the whole run lit up three syllables at once and the row
      // moved in jumps the size of a word instead of a character.
      const perChar = length ? duration / length : duration;
      for (let at = 0; at < length; at += 1) {
        fills.push(perChar > 0
          ? clamp01((positionMs - (segment.timeMs + perChar * at)) / perChar)
          : (positionMs >= segment.timeMs ? 1 : 0));
      }
    }
    // Word marks that do not line up with the plain text would colour the wrong syllables, so the
    // row falls back to the even spread rather than drifting.
    if (fills.length === chars.length) return fills;
  }
  // No word marks: the line is one run, but the characters still light up one at a time. Handing
  // every character the same ratio was what made the whole row switch colour in one step.
  const ratio = span > 0 ? clamp01((positionMs - startMs) / span) : (positionMs >= startMs ? 1 : 0);
  const cursor = ratio * chars.length;
  return chars.map((_, index) => clamp01(cursor - index));
}

/**
 * Turns per-character ratios into CSS gradient stops. A character is split inside itself at its own
 * ratio, so the row fills left to right the way a karaoke line does; snapping each character to
 * whole-colour made the fill jump a syllable at a time instead of sweeping.
 *
 * @param {number[]} fills
 * @param {string} sung
 * @param {string} pending
 * @returns {string | undefined} a `linear-gradient(...)` value, or undefined when nothing is sung
 */
export function fillGradient(fills, sung, pending) {
  if (!fills.length) return undefined;
  // A missing colour would turn into the literal string "undefined" inside the gradient and the
  // whole declaration is then dropped, leaving the row with no fill at all.
  const sungColor = typeof sung === 'string' && sung ? sung : '#ffe9eb';
  const pendingColor = typeof pending === 'string' && pending ? pending : '#8b9099';
  // Fully sung means "no gradient" — the element's own colour is already the sung colour, and a
  // gradient made of one stop pair costs a repaint on every frame for no visual change. Everything
  // unsung still needs a gradient, otherwise the row would fall back to the sung colour.
  if (fills.every(value => value >= 1)) return undefined;
  const step = 100 / fills.length;
  // Built as colour runs first so neighbouring characters of the same colour collapse into one pair
  // of stops. The gradient is rebuilt on every animation frame, and an unsimplified line costs about
  // twice the string length for an identical picture.
  const runs = [];
  const push = (from, to, color) => {
    const last = runs[runs.length - 1];
    if (last && last.color === color && Math.abs(last.to - from) < 0.01) { last.to = to; return; }
    runs.push({ from, to, color });
  };
  fills.forEach((ratio, index) => {
    const from = index * step;
    const to = from + step;
    const clamped = clamp01(ratio);
    if (clamped <= 0) { push(from, to, pendingColor); return; }
    if (clamped >= 1) { push(from, to, sungColor); return; }
    const cut = from + step * clamped;
    push(from, cut, sungColor);
    push(cut, to, pendingColor);
  });
  const stops = runs.map(run => `${run.color} ${run.from.toFixed(2)}%, ${run.color} ${run.to.toFixed(2)}%`);
  return `linear-gradient(90deg, ${stops.join(', ')})`;
}
