// Mobile / PWA validation for Polar Lights. Runs Chromium as an Android phone against a running build and checks:
//   1. Web app manifest: required fields, icons and screenshots load at their declared sizes.
//   2. Installability as reported by Chrome itself (DevTools Page.getInstallabilityErrors).
//   3. Service worker: registers, controls the page, and serves cached pages and /offline with no network.
//   4. Every page at 360 px and 412 px: no sideways scrolling, no page errors, touch-target sizes.
// Usage: BASE=http://localhost:3000 PW_ROOT=$(npm root -g) node scripts/validate-mobile.mjs   (exit code 1 on failure)
import { createRequire } from 'module';
// Lets context.route() see the service worker's own requests, so 'offline' really is offline.
process.env.PW_EXPERIMENTAL_SERVICE_WORKER_NETWORK_EVENTS = '1';
const require = createRequire(process.env.PW_ROOT ? process.env.PW_ROOT + '/' : import.meta.url);
const { chromium, devices } = require('playwright');
const BASE = process.env.BASE ?? 'http://localhost:3000';
const ROUTES = ['/', '/map', '/plans', '/checkout', '/signin', '/dashboard', '/reset-password', '/offline'];
const MIN_TAP = 44; // CSS px; Android's guideline is 48 dp, Apple's 44 pt.

const fails = [], warns = [];
const fail = m => fails.push(m), warn = m => warns.push(m);
const b = await chromium.launch();

// ---- 1 + 2. Manifest and installability -----------------------------------------------------
{
  const ctx = await b.newContext({ ...devices['Pixel 7'] });
  const p = await ctx.newPage();
  await p.goto(BASE + '/', { waitUntil: 'networkidle' });
  const href = await p.getAttribute('link[rel=manifest]', 'href');
  if (!href) fail('No <link rel="manifest"> on the page');
  const m = await (await p.request.get(new URL(href ?? '/manifest.webmanifest', BASE).href)).json();
  for (const k of ['name', 'short_name', 'start_url', 'display', 'background_color', 'theme_color', 'icons']) if (!m[k]) fail(`Manifest missing ${k}`);
  if (!['standalone', 'fullscreen'].includes(m.display)) fail(`Manifest display is ${m.display}; Play (TWA) needs standalone or fullscreen`);
  const has = (size, purpose) => m.icons.some(i => i.sizes === size && (i.purpose ?? 'any').split(' ').includes(purpose));
  for (const [s, pu] of [['192x192', 'any'], ['512x512', 'any'], ['512x512', 'maskable']]) if (!has(s, pu)) fail(`Manifest needs a ${s} ${pu} icon`);
  const images = [...m.icons, ...(m.screenshots ?? [])];
  for (const img of images) {
    const dims = await p.evaluate(src => new Promise(res => { const i = new Image(); i.onload = () => res(`${i.naturalWidth}x${i.naturalHeight}`); i.onerror = () => res(null); i.src = src; }), img.src);
    if (dims !== img.sizes) fail(`${img.src}: declared ${img.sizes}, got ${dims ?? 'load error'}`);
  }
  if (!(m.screenshots ?? []).some(s => s.form_factor === 'wide')) warn('No wide screenshot (desktop install dialog)');
  const cdp = await ctx.newCDPSession(p);
  const { errors: manifestErrors } = await cdp.send('Page.getAppManifest');
  for (const e of manifestErrors ?? []) (e.critical ? fail : warn)(`Chrome manifest: ${e.message}`);
  // Give the service worker time to activate; Chrome's check can depend on it.
  await p.evaluate(() => navigator.serviceWorker?.ready);
  const { installabilityErrors } = await cdp.send('Page.getInstallabilityErrors');
  for (const e of installabilityErrors) fail(`Chrome installability: ${e.errorId} ${JSON.stringify(e.errorArguments)}`);
  console.log(`manifest: ${m.name} · ${m.icons.length} icons · ${(m.screenshots ?? []).length} screenshots · installable: ${installabilityErrors.length === 0}`);
  await ctx.close();
}

// ---- 3. Service worker and offline -----------------------------------------------------------
{
  const ctx = await b.newContext({ ...devices['Pixel 7'] });
  const p = await ctx.newPage();
  await p.goto(BASE + '/', { waitUntil: 'networkidle' });
  const scope = await p.evaluate(async () => (await navigator.serviceWorker.ready).scope).catch(() => null);
  if (!scope) fail('Service worker did not register');
  await p.reload({ waitUntil: 'networkidle' });
  if (!(await p.evaluate(() => !!navigator.serviceWorker.controller))) fail('Service worker does not control the page after reload');
  await p.goto(BASE + '/plans', { waitUntil: 'networkidle' });
  await ctx.setOffline(true);
  await ctx.route('**/*', r => r.abort('internetdisconnected'));
  const cached = await p.goto(BASE + '/plans').then(r => r?.status()).catch(() => null);
  const cachedOk = cached === 200 && (await p.getByText('Choose your').count()) > 0;
  if (!cachedOk) fail('Offline: a previously viewed page (/plans) did not load from cache');
  await p.goto(BASE + '/signin').catch(() => null);
  const offlineOk = (await p.getByRole('heading', { name: /offline/i }).count()) > 0 && p.url().includes('/offline?from=%2Fsignin');
  if (!offlineOk) fail('Offline: an unvisited page did not fall back to /offline');
  console.log(`service worker: ${scope ? 'registered' : 'missing'} · offline cached page: ${cachedOk} · offline fallback: ${offlineOk}`);
  await ctx.close();
}

// ---- 4. Layout and touch targets on phone widths ---------------------------------------------
for (const [label, vp] of [['360', { width: 360, height: 780 }], ['412 (Pixel 7)', null]]) {
  const ctx = await b.newContext({ ...devices['Pixel 7'], ...(vp ? { viewport: vp } : {}) });
  for (const route of ROUTES) {
    const p = await ctx.newPage();
    const errs = []; p.on('pageerror', e => errs.push(String(e)));
    await p.goto(BASE + route, { waitUntil: 'networkidle' });
    await p.waitForTimeout(600);
    const r = await p.evaluate(min => {
      const overflow = document.documentElement.scrollWidth - innerWidth;
      const small = [...document.querySelectorAll('a, button, input, select, textarea, summary, [role=button]')]
        .filter(el => { const s = getComputedStyle(el); const b = el.getBoundingClientRect(); return b.width > 0 && b.height > 0 && s.visibility !== 'hidden' && !el.closest('.leaflet-control-attribution') && (b.height < min || b.width < min); })
        .map(el => `${(el.getAttribute('aria-label') || el.textContent || el.getAttribute('placeholder') || el.tagName).trim().slice(0, 24)} (${Math.round(el.getBoundingClientRect().width)}×${Math.round(el.getBoundingClientRect().height)})`);
      return { overflow, small };
    }, MIN_TAP);
    if (r.overflow > 1) fail(`${route} @${label}: page scrolls sideways by ${r.overflow}px`);
    for (const e of errs) fail(`${route} @${label}: ${e}`);
    if (r.small.length) warn(`${route} @${label}: ${r.small.length} touch targets under ${MIN_TAP}px: ${[...new Set(r.small)].slice(0, 8).join(', ')}`);
    await p.close();
  }
  await ctx.close();
}

await b.close();
for (const w of warns) console.log('WARN', w);
for (const f of fails) console.log('FAIL', f);
console.log(fails.length ? `\n${fails.length} failure(s), ${warns.length} warning(s)` : `\nAll checks passed (${warns.length} warning(s))`);
process.exit(fails.length ? 1 : 0);
