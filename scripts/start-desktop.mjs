import electron from 'electron';
import { spawn } from 'node:child_process';
const args = [...(process.getuid?.() === 0 ? ['--no-sandbox'] : []), 'out/main/index.js'];
if (process.getuid?.() === 0) console.error('Root development process: host --no-sandbox is required. BrowserWindow sandbox remains enabled. Use a normal desktop user for acceptance.');
// Electron itself documents this mode for using electron.exe as Node. It is useful to the harness but
// fatal to the desktop app, so the launcher owns the boundary instead of asking every caller to unset it.
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const child = spawn(electron, args, { stdio: 'inherit', env });
child.once('error', error => { console.error(error.message); process.exitCode = 1; });
child.once('exit', code => { process.exitCode = code ?? 1; });
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => child.kill(signal));
