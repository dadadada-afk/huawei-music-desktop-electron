import { execFileSync } from 'node:child_process';
import { mkdir, copyFile, writeFile, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { writeNotices } from './licenses.mjs';
import { signMacOS } from './sign-macos.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const output = join(root, 'out/native/tinglan', `${process.platform}-${process.arch}`);
await mkdir(output, { recursive: true });
const binary = join(output, process.platform === 'win32' ? 'tinglan.exe' : 'tinglan');
execFileSync(process.env.HWMUSIC_GO || 'go', ['build', '-trimpath', '-ldflags=-s -w', '-o', binary, './cmd/music'], {
  cwd: join(root, 'native'), stdio: 'inherit',
});
const signed = signMacOS(binary);
await copyFile(join(root, 'LICENSE'), join(output, 'LICENSE'));
await writeNotices(join(output,'THIRD_PARTY_NOTICES.txt'));
await copyFile(join(root, 'build/icon.LICENSE.txt'), join(output, 'icon.LICENSE.txt'));
await writeFile(join(output, 'NOTICE.txt'), `${signed ? '本地证书签名、未公证测试构建' : '未签名测试构建'}；非官方项目；OAuth 身份不属于本项目。\nWindows/Linux 的真实登录、音频输出和 UI 尚未实机验收。\n不得将合成夹具当作私人账号证据。仅通过 GitHub Release 分发二进制。\n`);
await writeFile(join(output, 'SHA256SUMS'), `${createHash('sha256').update(await readFile(binary)).digest('hex')}  ${binary.split(/[\\/]/).at(-1)}\n`);
console.log(`Built local ${signed ? 'signed, not notarized' : 'unsigned'} native binary: ${output}`);
