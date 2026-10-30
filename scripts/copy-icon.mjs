import { copyFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// The window and taskbar icon is read at runtime from out/, so every build has to carry a copy next
// to the bundle; the packaged app ships out/** and would otherwise find nothing.
//
// Windows takes the taskbar glyph from an ICO, not a PNG: a PNG window icon leaves the small icon
// empty and Windows falls back to the Electron default atom. Both are copied so the tray can keep
// using whatever it prefers.
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
await copyFile(join(root, 'build/icon.png'), join(root, 'out/icon.png'));
await copyFile(join(root, 'build/headphones.ico'), join(root, 'out/icon.ico'));
