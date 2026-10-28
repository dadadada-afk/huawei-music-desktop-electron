/**
 * Which global chords the main process actually owns. Another app can steal an accelerator, and
 * only the OS knows which one lost, so the registration pass records both lists here and the
 * renderer reads them back through app.shortcuts().
 *
 * @type {{ registered: string[], failed: string[] }}
 */
export const shortcutStatus = { registered: [], failed: [] };
