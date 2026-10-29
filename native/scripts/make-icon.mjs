// SVG artwork derived from Lucide Music2 (ISC), rasterized locally for desktop hosts.
// Run: node native/scripts/make-icon.mjs; HWMUSIC_CHROMIUM may select a local browser.
import { chromium } from 'playwright-core';
import { mkdir, writeFile, access } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const source = readFileSync(join(root, 'native/assets/lucide/music-2.mjs'), 'utf8');
const literal = /export default (\[[\s\S]*\]);/.exec(source)?.[1];
if (!literal) throw new Error('Pinned Lucide Music2 glyph missing');
const nodes = Function(`return ${literal}`)();
const glyph = nodes.map(([tag, attrs]) => `<${tag} ${Object.entries(attrs).filter(([key]) => key !== 'key').map(([key,value]) => `${key}="${value}"`).join(' ')}/>`).join('');
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 512 512" fill="none">
  <title>Ruby record — unofficial music client</title>
  <defs>
    <linearGradient id="body" x1="80" y1="24" x2="440" y2="500" gradientUnits="userSpaceOnUse">
      <stop stop-color="#f14855"/><stop offset=".48" stop-color="#cc203c"/><stop offset="1" stop-color="#8c1230"/>
    </linearGradient>
    <radialGradient id="record" cx="0" cy="0" r="1" gradientTransform="translate(184 140) rotate(55) scale(358)" gradientUnits="userSpaceOnUse">
      <stop stop-color="#7e233b"/><stop offset=".55" stop-color="#4b142b"/><stop offset="1" stop-color="#291122"/>
    </radialGradient>
    <linearGradient id="rim" x1="100" y1="60" x2="404" y2="462" gradientUnits="userSpaceOnUse">
      <stop stop-color="#fff4e5" stop-opacity=".55"/><stop offset=".45" stop-color="#fff4e5" stop-opacity=".06"/><stop offset="1" stop-color="#fff4e5" stop-opacity=".2"/>
    </linearGradient>
    <filter id="lift" x="-30%" y="-30%" width="160%" height="180%"><feDropShadow dx="0" dy="14" stdDeviation="14" flood-color="#390b20" flood-opacity=".3"/></filter>
  </defs>
  <rect x="24" y="24" width="464" height="464" rx="108" fill="url(#body)"/>
  <rect x="25" y="25" width="462" height="462" rx="107" stroke="url(#rim)" stroke-width="2"/>
  <circle cx="256" cy="256" r="163" fill="url(#record)" filter="url(#lift)"/>
  <circle cx="256" cy="256" r="162" stroke="url(#rim)" stroke-width="2"/>
  <circle cx="256" cy="256" r="143" stroke="#f9b6ad" stroke-opacity=".1"/>
  <circle cx="256" cy="256" r="130" stroke="#f9b6ad" stroke-opacity=".07"/>
  <path d="M125 232a133 133 0 0 1 101-106" stroke="#ffcdc1" stroke-opacity=".36" stroke-width="3" stroke-linecap="round"/>
  <path d="M386 284a133 133 0 0 1-91 99" stroke="#ffcdc1" stroke-opacity=".19" stroke-width="2" stroke-linecap="round"/>
  <g transform="translate(145 141) scale(10)" stroke="#fff3e6" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round">${glyph}</g>
</svg>\n`;
const artwork = svg;
const tray = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32" fill="none"><title>Music tray</title><circle cx="16" cy="16" r="13.5" stroke="#000" stroke-width="2"/><g transform="translate(7 6) scale(.85)" stroke="#000" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">${glyph}</g></svg>\n`;
await mkdir(join(root,'build'),{recursive:true});
await writeFile(join(root,'build/icon.svg'),artwork);
await writeFile(join(root,'build/tray.svg'),tray);
const candidates = [process.env.HWMUSIC_CHROMIUM, '/Applications/Helium.app/Contents/MacOS/Helium', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/chromium', '/usr/bin/google-chrome', process.env.PROGRAMFILES && join(process.env.PROGRAMFILES,'Google/Chrome/Application/chrome.exe')].filter(Boolean);
let executablePath;
for (const candidate of candidates) { try { await access(candidate); executablePath=candidate; break; } catch {} }
const browser=await chromium.launch({headless:true,args:["--disable-gpu"],...(executablePath?{executablePath}:{})});
try {
  const page=await browser.newPage({deviceScaleFactor:1});
  await page.route('**/*',route=>route.abort());
  for(const [name,art,size] of [['icon',artwork,512],['icon-1024',artwork,1024],['tray',tray,32]]){
    await page.setViewportSize({width:size,height:size});
    await page.setContent(`<style>html,body{margin:0;background:transparent}svg{display:block;width:100vw;height:100vh}</style>${art}`);
    const png=await page.screenshot({omitBackground:true});
    await writeFile(join(root,`build/${name}.png`),png);
  }
} finally {await browser.close();}
console.log('Generated SVG sources, 512/1024 app icons and monochrome tray icon.');
