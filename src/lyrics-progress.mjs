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
export function lineFill(line, startMs, endMs, positionMs) {
  const text = line?.text ?? '';
  const chars = [...text];
  if (!chars.length) return [];
  const span = endMs > startMs ? endMs - startMs : 0;
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
  const ratio = span > 0 ? clamp01((positionMs - startMs) / span) : (positionMs >= startMs ? 1 : 0);
  return chars.map(() => ratio);
}

/**
 * Turns per-character ratios into CSS gradient stops. Every character is one solid block in either
 * colour — a character that is more than half sung counts as sung. Splitting a single glyph between
 * the two colours made the row look smudged at ordinary font sizes, so the switch happens per
 * character, the way the karaoke rows in desktop players do it.
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
  if (fills.every(value => value >= 1)) return undefined;
  const step = 100 / fills.length;
  const stops = [];
  fills.forEach((ratio, index) => {
    const from = index * step;
    const to = from + step;
    const color = ratio >= 0.5 ? sungColor : pendingColor;
    stops.push(`${color} ${from.toFixed(2)}%`, `${color} ${to.toFixed(2)}%`);
  });
  return `linear-gradient(90deg, ${stops.join(', ')})`;
}
