// Native window chrome cannot read CSS variables, so the title-bar colours live here instead of
// in styles.css. Pure so it can be unit tested and called from both the window factory and the
// settings handler without dragging Electron into the test.
export const TITLEBAR_LIGHT = Object.freeze({ background: '#f1f0ed', symbol: '#2a2f36' });
// Pure white, not the panel ink: the OS draws these glyphs antialiased over the strip, and a near-white
// grey lost enough contrast on the darkest theme that close read as a different weight from the other two.
export const TITLEBAR_DARK = Object.freeze({ background: '#14151a', symbol: '#ffffff' });
export const TITLEBAR_NOIR = Object.freeze({ background: '#151310', symbol: '#f0e9da' });
export const TITLEBAR_PAPER = Object.freeze({ background: '#f4f0e6', symbol: '#24211b' });
export const TITLEBAR_GLASS = Object.freeze({ background: '#101426', symbol: '#edf0fa' });

/** Palettes that repaint the window themselves instead of following the OS preference. */
export const CUSTOM_THEMES = Object.freeze({
  noir: { titlebar: TITLEBAR_NOIR, dark: true },
  paper: { titlebar: TITLEBAR_PAPER, dark: false },
  glass: { titlebar: TITLEBAR_GLASS, dark: true },
});

/**
 * Resolves the title-bar palette for the stored theme.
 *
 * @param {'system' | 'light' | 'dark' | 'noir' | 'paper' | 'glass'} theme
 * @param {boolean} systemPrefersDark  nativeTheme.shouldUseDarkColors
 * @returns {{ background: string, symbol: string }}
 */
export function titleBarColors(theme, systemPrefersDark) {
  const custom = CUSTOM_THEMES[theme];
  if (custom) return custom.titlebar;
  const dark = theme === 'dark' || (theme !== 'light' && systemPrefersDark);
  return dark ? TITLEBAR_DARK : TITLEBAR_LIGHT;
}

/**
 * nativeTheme only understands system/light/dark, so a custom palette has to be projected onto one
 * of them: the native scrollbars, menus and dialogs follow this value.
 *
 * @param {'system' | 'light' | 'dark' | 'noir' | 'paper' | 'glass'} theme
 * @returns {'system' | 'light' | 'dark'}
 */
export function nativeThemeSource(theme) {
  const custom = CUSTOM_THEMES[theme];
  if (custom) return custom.dark ? 'dark' : 'light';
  return theme === 'dark' || theme === 'light' ? theme : 'system';
}
