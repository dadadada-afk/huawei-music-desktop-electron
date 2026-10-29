import { readFile, readdir, lstat } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
const root=fileURLToPath(new URL('../../',import.meta.url));
const dir=join(root,'out/native/tinglan',`${process.platform}-${process.arch}`);
const binary=process.platform==='win32'?'tinglan.exe':'tinglan';
const expected=[binary,'LICENSE','THIRD_PARTY_NOTICES.txt','icon.LICENSE.txt','NOTICE.txt','SHA256SUMS'].sort();
assert.deepEqual((await readdir(dir)).sort(),expected,'Unexpected payload file');
for(const name of expected){assert.ok((await lstat(join(dir,name))).isFile(),'No links or directories in payload');}
const bytes=await readFile(join(dir,binary));
const hash=createHash('sha256').update(bytes).digest('hex');
assert.equal(await readFile(join(dir,'SHA256SUMS'),'utf8'),`${hash}  ${binary}\n`);
assert.ok(bytes.length>1000000,'Missing native binary');
const licenses=await readFile(join(dir,'THIRD_PARTY_NOTICES.txt'),'utf8');
for(const name of ['vivaui/viva','godbus/dbus','gorilla/websocket','media-winrt-go','go-ole'])assert.ok(licenses.includes(name),`Missing license ${name}`);
assert.ok((await readFile(join(dir,'NOTICE.txt'),'utf8')).includes('OAuth'));
console.log('Native payload allowlist, licenses and SHA256 verified');
