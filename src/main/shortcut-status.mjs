/**
 * Which global chords the main process actually owns. Another app can steal an accelerator, and
 * only the OS knows which one lost, so the registration pass records both lists here and the
 * renderer reads them back through app.shortcuts().
 *
 * @type {{ registered: string[], failed: string[], lockAccelerator: string | null }}
 */
export const shortcutStatus = {
  registered: [],
  failed: [],
  /**
   * The chord actually owned for toggling the lyric lock. Alt+L is a popular binding for other
   * software, so registration falls back; the UI reads this instead of hard-coding the chord it
   * asked for, which is how "全局" could be shown for a shortcut nobody held.
   */
  lockAccelerator: null,
};
