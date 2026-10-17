// Renders scripts/icon.svg to the PNG icons the web manifest and Android need.
// Usage: PW_ROOT=$(npm root -g) node scripts/make-icons.mjs   (or with a local playwright install)
import { createRequire } from 'module';
import { readFileSync, writeFileSync } from 'fs';
const require = createRequire(process.env.PW_ROOT ? process.env.PW_ROOT + '/' : import.meta.url);
const { chromium } = require('playwright');
const svg = readFileSync(new URL('./icon.svg', import.meta.url), 'utf8');
// Monochrome (Android themed icons): white shapes on transparent, no glow.
const mono = svg.replace('fill="#000"', 'fill="none"').replace(/stroke="url\(#ring\)"/, 'stroke="#fff"')
  .replace(/<ellipse class="glow"[^>]*\/>/, '').replace(/<circle class="halo"[^>]*\/>/, '<circle cx="256" cy="256" r="44" fill="#fff"/>');
const out = new URL('../public/icons/', import.meta.url);
const jobs = [
  // The art sits inside the maskable safe zone, so the same PNGs serve as 'any' and 'maskable'.
  ['icon-192.png', 192, svg], ['icon-512.png', 512, svg],
  ['icon-monochrome-512.png', 512, mono], ['apple-touch-icon.png', 180, svg],
];
const b = await chromium.launch();
const p = await b.newPage();
for (const [name, size, src] of jobs) {
  await p.setViewportSize({ width: size, height: size });
  await p.setContent(`<html><body style="margin:0;background:transparent">${src.replace('<svg ', `<svg width="${size}" height="${size}" `)}</body></html>`);
  writeFileSync(new URL(name, out), await p.screenshot({ omitBackground: true }));
}
await b.close();
writeFileSync(new URL('icon.svg', out), svg);
console.log('icons written');
