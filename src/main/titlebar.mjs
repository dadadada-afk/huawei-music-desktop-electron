// Native window chrome cannot read CSS variables, so the two title-bar colours live here instead of
// in styles.css. Pure so it can be unit tested and called from both the window factory and the
// settings handler without dragging Electron into the test.
export const TITLEBAR_LIGHT = Object.freeze({ background: '#f1f0ed', symbol: '#3a3f47' });
export const TITLEBAR_DARK = Object.freeze({ background: '#14151a', symbol: '#eceef3' });

/**
 * Resolves the title-bar palette for the stored theme.
 *
 * @param {'system' | 'light' | 'dark'} theme
 * @param {boolean} systemPrefersDark  nativeTheme.shouldUseDarkColors
 * @returns {{ background: string, symbol: string }}
 */
export function titleBarColors(theme, systemPrefersDark) {
  const dark = theme === 'dark' || (theme !== 'light' && systemPrefersDark);
  return dark ? TITLEBAR_DARK : TITLEBAR_LIGHT;
}
