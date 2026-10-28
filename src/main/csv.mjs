// Pure helpers for "export my list" so the escaping rules are unit-testable without Electron.

/** Characters Excel and every CSV reader agree on: quote when any of them is present. */
const NEEDS_QUOTING = /[",\r\n]/;

/**
 * Escapes one field. Quotes are doubled rather than dropped so a title like `他说"嗨"` survives.
 *
 * @param {unknown} value
 * @returns {string}
 */
export function csvCell(value) {
  const text = value === null || value === undefined ? '' : String(value);
  return NEEDS_QUOTING.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

/** Formats seconds as m:ss; unknown durations stay empty instead of pretending to be 0:00. */
export function formatDuration(seconds) {
  if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds < 0) return '';
  const total = Math.round(seconds);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

/**
 * Builds the whole document. CRLF + a BOM are deliberate: Windows Excel opens a bare UTF-8 CSV as
 * mojibake, and that is the only reader this export is realistically opened in.
 *
 * @param {string[]} headers
 * @param {unknown[][]} rows
 */
export function toCsv(headers, rows) {
  const lines = [headers.map(csvCell).join(','), ...rows.map(row => row.map(csvCell).join(','))];
  return `\uFEFF${lines.join('\r\n')}\r\n`;
}

/** Strips characters Windows forbids in a file name, and never returns an empty stem. */
export function safeFileName(name, fallback = 'export') {
  const cleaned = String(name ?? '').replace(/[\/:*?"<>|\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().replace(/\.$/, '');
  return cleaned.slice(0, 60) || fallback;
}
