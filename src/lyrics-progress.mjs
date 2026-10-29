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
      const ratio = segmentEnd > segment.timeMs
        ? clamp01((positionMs - segment.timeMs) / (segmentEnd - segment.timeMs))
        : (positionMs >= segment.timeMs ? 1 : 0);
      for (let at = 0; at < length; at += 1) fills.push(ratio);
    }
    // Word marks that do not line up with the plain text would colour the wrong syllables, so the
    // row falls back to the even spread rather than drifting.
    if (fills.length === chars.length) return fills;
  }
  const ratio = span > 0 ? clamp01((positionMs - startMs) / span) : (positionMs >= startMs ? 1 : 0);
  return chars.map(() => ratio);
}

/**
 * Turns per-character ratios into CSS gradient stops: each character is solid up to its own
 * progress and dim after it, which is what makes the fill read as one sweeping highlight.
 *
 * @param {number[]} fills
 * @param {string} sung
 * @param {string} pending
 * @returns {string | undefined} a `linear-gradient(...)` value, or undefined when nothing is sung
 */
export function fillGradient(fills, sung, pending) {
  if (!fills.length) return undefined;
  if (fills.every(value => value >= 1)) return undefined;
  const step = 100 / fills.length;
  const stops = [];
  fills.forEach((ratio, index) => {
    const from = index * step;
    const to = from + step;
    if (ratio <= 0) {
      stops.push(`${pending} ${from.toFixed(2)}%`, `${pending} ${to.toFixed(2)}%`);
      return;
    }
    if (ratio >= 1) {
      stops.push(`${sung} ${from.toFixed(2)}%`, `${sung} ${to.toFixed(2)}%`);
      return;
    }
    const edge = from + step * ratio;
    stops.push(`${sung} ${from.toFixed(2)}%`, `${sung} ${edge.toFixed(2)}%`, `${pending} ${edge.toFixed(2)}%`, `${pending} ${to.toFixed(2)}%`);
  });
  return `linear-gradient(90deg, ${stops.join(', ')})`;
}
