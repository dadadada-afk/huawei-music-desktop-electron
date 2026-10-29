// Appearance tokens shared by every window that paints them: the main window, the mini player and the
// desktop-lyric overlay. Keeping the mapping here is what stops the helper windows from drifting
// back to the hardcoded red they used to fall back on.
import { fontStackFor, tintFromHex } from './theme.mjs';
import type { AccentName, AppearanceSettings } from '../shared/types';

// Runtime tint map: the CSS keeps red as its default so the first paint is already correct.
// 'theme' has no entry on purpose — it means "leave the palette's own accent alone".
export const ACCENTS: Record<Exclude<AccentName, 'custom' | 'theme'>, { accent: string; light: string; deep: string; soft: string; line: string; shadow: string }> = {
  red: { accent: '#c8202e', light: '#e0364a', deep: '#a51724', soft: 'rgba(200, 32, 46, 0.09)', line: 'rgba(200, 32, 46, 0.28)', shadow: 'rgba(200, 32, 46, 0.28)' },
  blue: { accent: '#2563eb', light: '#3b82f6', deep: '#1d4ed8', soft: 'rgba(37, 99, 235, 0.10)', line: 'rgba(37, 99, 235, 0.30)', shadow: 'rgba(37, 99, 235, 0.26)' },
  green: { accent: '#15803d', light: '#22a05a', deep: '#166534', soft: 'rgba(21, 128, 61, 0.10)', line: 'rgba(21, 128, 61, 0.28)', shadow: 'rgba(21, 128, 61, 0.24)' },
  amber: { accent: '#b45309', light: '#d97706', deep: '#92400e', soft: 'rgba(180, 83, 9, 0.11)', line: 'rgba(180, 83, 9, 0.30)', shadow: 'rgba(180, 83, 9, 0.24)' },
  violet: { accent: '#6d28d9', light: '#8b5cf6', deep: '#5b21b6', soft: 'rgba(109, 40, 217, 0.10)', line: 'rgba(109, 40, 217, 0.28)', shadow: 'rgba(109, 40, 217, 0.24)' },
};

export const FONT_STACKS: Record<Exclude<'sans' | 'serif' | 'mono', never> | 'sans' | 'serif' | 'mono', string> = {
  sans: "'Inter', 'Noto Sans CJK SC', 'Noto Sans SC', 'Source Han Sans SC', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', 'Segoe UI', Arial, sans-serif",
  serif: "'Noto Serif CJK SC', 'Noto Serif SC', 'Source Han Serif SC', 'AR PL UMing CN', 'Songti SC', STSong, SimSun, Georgia, serif",
  mono: "ui-monospace, 'JetBrains Mono', 'Noto Sans Mono CJK SC', 'Sarasa Mono SC', Consolas, monospace",
};

const ACCENT_KEYS = ['--accent', '--accent-light', '--accent-deep', '--accent-soft', '--accent-line', '--accent-shadow'] as const;

/** Writes the whole appearance token set onto :root. Safe to call from any window. */
export function applyAppearance(appearance: AppearanceSettings | undefined): void {
  if (!appearance) return;
  const root = document.documentElement.style;
  if (appearance.accent === 'theme') {
    // Inline properties beat the palette blocks in styles.css, so "follow the palette" has to
    // remove them rather than write the palette's own colour back.
    for (const key of ACCENT_KEYS) root.removeProperty(key);
  } else {
    const tint = appearance.accent === 'custom'
      ? tintFromHex(appearance.customAccent)
      : ACCENTS[appearance.accent] ?? ACCENTS.red;
    root.setProperty('--accent', tint.accent);
    root.setProperty('--accent-light', tint.light);
    root.setProperty('--accent-deep', tint.deep);
    root.setProperty('--accent-soft', tint.soft);
    root.setProperty('--accent-line', tint.line);
    root.setProperty('--accent-shadow', tint.shadow);
  }
  root.setProperty('--panel-alpha', String(appearance.panelOpacity));
  root.setProperty('--radius-unit', `${appearance.cornerRadius}px`);
  root.setProperty('--fs-scale', String(appearance.fontScale));
  root.setProperty('--font-ui', appearance.fontFamily === 'custom'
    ? fontStackFor(appearance.customFont, FONT_STACKS.sans)
    : FONT_STACKS[appearance.fontFamily] ?? FONT_STACKS.sans);
}

/**
 * The three custom palettes are plain CSS token overrides keyed off this attribute, so switching a
 * theme never re-mounts a component or touches playback state.
 */
export function applyThemeAttribute(theme: string | undefined): void {
  const root = document.documentElement;
  if (theme === 'noir' || theme === 'paper' || theme === 'glass') root.dataset.theme = theme;
  else delete root.dataset.theme;
}

/**
 * Pulls settings once and applies them. The helper windows own no settings state of their own, so
 * one read at start-up is enough to line their accent up with the main window.
 */
export async function syncAppearanceFromSettings(): Promise<void> {
  const result = await window.desktop.settings.get().catch(() => null);
  if (!result?.ok) return;
  applyThemeAttribute(result.data.theme);
  applyAppearance(result.data.appearance);
}
