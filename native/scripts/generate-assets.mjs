import { mkdtemp, readFile, writeFile, rm, copyFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { APP_DISPLAY_NAME, APP_BRAND_LABEL } from '../app-name.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const scratch = await mkdtemp(join(tmpdir(), 'hwmusic-native-icons-'));
const names = ['heart', 'headphones', 'music-2', 'search', 'list-music', 'history', 'settings', 'play', 'pause', 'skip-back', 'skip-forward', 'volume-2', 'volume-x', 'x', 'log-in', 'log-out', 'repeat', 'shuffle', 'chevron-up', 'disc-3', 'minimize-2'];
try {
  for (const name of names) {
    const source = await readFile(join(root, `native/assets/lucide/${name}.mjs`), 'utf8');
    const literal = /export default (\[[\s\S]*\]);/.exec(source)?.[1];
    if (!literal) throw new Error(`Missing pinned Lucide icon: ${name}`);
    // Same trusted, locked dependency literal used by native/scripts/make-icon.mjs.
    const nodes = Function(`return ${literal}`)();
    const body = nodes.map(([tag, attributes]) => `<${tag} ${Object.entries(attributes).filter(([key]) => key !== 'key').map(([key, value]) => `${key}="${value}"`).join(' ')}/>`).join('');
    await writeFile(join(scratch, `${name}.svg`), `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`);
    if (name === 'heart' || name === 'play') await writeFile(join(scratch, `${name}-filled.svg`), `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`);
  }
  execFileSync(process.env.HWMUSIC_GO || 'go', ['run', './tools/icons', scratch, 'internal/icons/icons.go'], { cwd: join(root, 'native'), stdio: 'inherit' });
  await writeFile(join(root, 'native/cmd/music/app_name.go'), `// Code generated from native/app-name.mjs. DO NOT EDIT.\npackage main\n\nconst appDisplayName = ${JSON.stringify(APP_DISPLAY_NAME)}\nconst appBrandLabel = ${JSON.stringify(APP_BRAND_LABEL)}\n`);
  for (const name of ['icon.png', 'tray.png', 'icon.LICENSE.txt']) await copyFile(join(root, 'build', name), join(root, 'native/internal/icons', name));
} finally {
  await rm(scratch, { recursive: true, force: true });
}
