// Captures the manifest/store screenshots from a running build.
// Usage: BASE=https://aurora-monitor.vercel.app PW_ROOT=$(npm root -g) node scripts/make-screenshots.mjs
import { createRequire } from 'module';
const require = createRequire(process.env.PW_ROOT ? process.env.PW_ROOT + '/' : import.meta.url);
const { chromium } = require('playwright');
const BASE = process.env.BASE ?? 'http://localhost:3000';
const out = new URL('../public/screenshots/', import.meta.url);
const home = { id: 'demo', name: 'Tromsø, Norway', lat: 69.65, lon: 18.96, source: 'manual', isHome: true, createdAt: new Date().toISOString() };

const b = await chromium.launch();
// 360×780 CSS px at 3x = 1080×2340 (narrow); 1280×720 at 1.5x = 1920×1080 (wide).
for (const [name, path, w, h, dpr, mobile] of [
  ['now-narrow', '/', 360, 780, 3, true], ['map-narrow', '/map', 360, 780, 3, true], ['now-wide', '/', 1280, 720, 1.5, false],
]) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: dpr, isMobile: mobile, hasTouch: mobile });
  await ctx.addInitScript(l => localStorage.setItem('oval.locations.v1', JSON.stringify([l])), home);
  const p = await ctx.newPage();
  await p.goto(BASE + path, { waitUntil: 'networkidle' });
  await p.waitForTimeout(2500);
  await p.screenshot({ path: new URL(`${name}.png`, out).pathname });
  await ctx.close();
}
await b.close();
console.log('screenshots written');
