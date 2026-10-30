// LRC parsing kept pure so it can be regression tested without network access.
// Supports metadata headers, [offset:], multiple timestamps per line, word-level
// <mm:ss.xx> marks, and the common bilingual layout where two lines share one stamp.
const WORD_MARK = /<(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?>/g;
const METADATA = /^\[(ti|ar|al|by|re|ve|length|offset)\s*:.*\]$/i;

function stampToMs(minutes, seconds, fraction, offset) {
  if (!Number.isFinite(minutes) || !Number.isFinite(seconds) || seconds > 59) return null;
  const ms = Number((fraction ?? '').padEnd(3, '0') || '0');
  return Math.max(0, minutes * 60_000 + seconds * 1_000 + ms + offset);
}

function parseWordSegments(body, offset, fallbackTimeMs = null) {
  const marks = [...body.matchAll(WORD_MARK)];
  if (!marks.length) return null;
  const segments = [];
  const leading = body.slice(0, marks[0].index).trim();
  if (leading) segments.push({ timeMs: fallbackTimeMs, text: leading });
  for (let index = 0; index < marks.length; index += 1) {
    const mark = marks[index];
    const start = mark.index + mark[0].length;
    const end = index + 1 < marks.length ? marks[index + 1].index : body.length;
    const timeMs = stampToMs(Number(mark[1]), Number(mark[2]), mark[3], offset);
    const text = body.slice(start, end);
    if (timeMs === null || !text) continue;
    segments.push({ timeMs, text });
  }
  return segments.length ? segments : null;
}

function stripWordMarks(body) {
  return body.replace(WORD_MARK, '');
}

// A second line pinned to the exact same timestamp is treated as a translation rather
// than a duplicate row, which is how bilingual LRC files are usually authored.
function mergeTranslations(lines) {
  const merged = [];
  for (const line of lines) {
    const previous = merged[merged.length - 1];
    if (previous && previous.timeMs === line.timeMs && !line.segments && !previous.translation) {
      if (line.text && line.text !== previous.text) previous.translation = line.text;
      continue;
    }
    merged.push(line);
  }
  return merged;
}

export function parseLyrics(raw) {
  if (typeof raw !== 'string' || !raw.trim()) return { synced: false, lines: [] };
  let offset = 0;
  const timed = [];
  const plain = [];
  for (const rawLine of raw.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const offsetMatch = /^\[offset:\s*(-?\d+)\s*\]$/i.exec(line);
    if (offsetMatch) {
      const value = Number(offsetMatch[1]);
      if (Number.isFinite(value)) offset = value;
      continue;
    }
    if (METADATA.test(line)) continue;
    const stamps = [...line.matchAll(/\[(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g)];
    if (!stamps.length) {
      const segments = parseWordSegments(line, offset);
      if (segments) plain.push({ timeMs: null, text: stripWordMarks(line).trim(), segments });
      else plain.push({ timeMs: null, text: line });
      continue;
    }
    const last = stamps[stamps.length - 1];
    const body = line.slice(last.index + last[0].length).trim();
    const text = stripWordMarks(body).trim();
    for (const stamp of stamps) {
      const timeMs = stampToMs(Number(stamp[1]), Number(stamp[2]), stamp[3], offset);
      if (timeMs === null) continue;
      const entry = { timeMs, text };
      const segments = parseWordSegments(body, offset, timeMs);
      if (segments) entry.segments = segments;
      timed.push(entry);
    }
  }
  if (!timed.length) return { synced: false, lines: plain };
  timed.sort((a, b) => a.timeMs - b.timeMs);
  return { synced: true, lines: mergeTranslations(timed) };
}

export function activeLyricIndex(lines, positionMs) {
  if (!Array.isArray(lines) || !lines.length || !Number.isFinite(positionMs)) return -1;
  let index = -1;
  for (let i = 0; i < lines.length; i += 1) {
    const time = lines[i]?.timeMs;
    if (typeof time !== 'number') continue;
    if (time <= positionMs) index = i;
    else break;
  }
  return index;
}

/** Below this difference the two recordings are close enough that any shift would be guesswork. */
export const SUGGESTED_OFFSET_MIN_SECONDS = 6;
/** Never suggest more than the stage itself can apply. */
export const SUGGESTED_OFFSET_LIMIT_SECONDS = 60;

/**
 * How far a lyric sheet has to move to line up with this recording, in the same units and sign as
 * the corrections the stage dials in (a positive value shows the lyric earlier).
 *
 * Only the difference in length is known. The audio being 17 s longer could mean a longer intro
 * (shift everything earlier) or a longer outro (shift nothing at all), and the numbers cannot tell
 * the two apart, so this is a suggestion the user accepts and can undo - never an automatic fix.
 */
export function suggestedLyricOffset(audioSeconds, lyricSeconds) {
  const audio = Number(audioSeconds);
  const lyric = Number(lyricSeconds);
  // Both sides must look like real track lengths: a missing duration arrives as 0 or NaN, and a
  // ringtone-length value means the metadata is not describing the recording that is playing.
  if (!Number.isFinite(audio) || !Number.isFinite(lyric) || audio <= 30 || lyric <= 30) return null;
  const delta = Math.round((audio - lyric) * 10) / 10;
  if (Math.abs(delta) < SUGGESTED_OFFSET_MIN_SECONDS) return null;
  return Math.max(-SUGGESTED_OFFSET_LIMIT_SECONDS, Math.min(SUGGESTED_OFFSET_LIMIT_SECONDS, delta));
}
