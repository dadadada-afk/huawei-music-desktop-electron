import { copyFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// The window and taskbar icon is read at runtime from out/icon.png, so every build has to carry a
// copy next to the bundle; the packaged app ships out/** and would otherwise find nothing.
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
await copyFile(join(root, 'build/icon.png'), join(root, 'out/icon.png'));
