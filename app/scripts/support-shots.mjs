// Help-centre screenshots (public/support/shots/{lang}/{name}.webp), in every language, from a local build
// running on sample data and signed in as a sample Chaser member (nothing reaches a real account).
// The part an article talks about gets a green ring.
//
// Usage, from app/: build and start a local server with mock feeds (see docs/support-content.md), then
//   PW_ROOT=$(npm root -g) node scripts/support-shots.mjs [en,de,...] [name,name,...]
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';

const require = createRequire(process.env.PW_ROOT ? process.env.PW_ROOT + '/' : import.meta.url);
const { chromium } = require('playwright');
const sharp = createRequire(import.meta.url)('sharp');

const BASE = process.env.BASE ?? 'http://localhost:3000';
const ROOT = new URL('..', import.meta.url).pathname;
const OUT = path.join(ROOT, 'public/support/shots');
const LANGS = (process.argv[2] || 'en,es,fr,de,nl,nb,da,sv,fi,ru').split(',');
const ONLY = process.argv[3] ? process.argv[3].split(',') : null;
const WIDTH = 720;

/** A message from the app's own files, so labels match the language. */
const msg = (lang, key) => {
  const src = fs.readFileSync(path.join(ROOT, `src/i18n/messages/${lang}.ts`), 'utf8');
  const m = src.match(new RegExp(`^  '${key.replace(/\./g, '\\.')}': (['"])(.*?)\\1,`, 'm'));
  return m ? m[2] : key;
};

// The sample member: signed in (the mock Supabase project 'mockref'), on Chaser through Google Play.
const UID = '11111111-2222-3333-4444-555555555555';
const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
const exp = Math.floor(Date.now() / 1000) + 86400 * 3;
const jwt = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: UID, exp, role: 'authenticated', email: 'member@example.com', aud: 'authenticated' })}.sig`;
const user = { id: UID, aud: 'authenticated', role: 'authenticated', email: 'member@example.com', app_metadata: { provider: 'email', providers: ['email'] }, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' };
const session = { access_token: jwt, refresh_token: 'r', expires_at: exp, expires_in: 86400, token_type: 'bearer', user };
const LOCS = [
  { id: 'l1', user_id: UID, name: 'Tromsø, Troms, Norway', lat: 69.65, lon: 18.96, source: 'manual', is_home: true, created_at: '2026-10-01T00:00:00Z' },
  { id: 'l2', user_id: UID, name: 'Abisko, Norrbotten, Sweden', lat: 68.35, lon: 18.83, source: 'manual', is_home: false, created_at: '2026-10-02T00:00:00Z' },
];
const ach = (kind, ref, days, value = null) => ({ kind, ref, at: new Date(Date.now() - days * 864e5).toISOString(), value, points: 10 });
const ACHIEVEMENTS = [
  ...Array.from({ length: 12 }, (_, i) => ach('report', `r${i}`, 40 - i * 3, 5)),
  ...Array.from({ length: 4 }, (_, i) => ach('corroborate', `c${i}`, 30 - i * 5)),
  ach('kp5', 'once', 20, 5.33), ach('first_light', 'f1', 18), ach('south', 'best', 12, 65.8),
  ...Array.from({ length: 6 }, (_, i) => ach('place', `p${i}`, 30 - i)), ach('road_trip', 't1', 9, 180),
  ...Array.from({ length: 11 }, (_, i) => ach('night', `n${i}`, 40 - i * 3)), ach('season', 'autumn', 10), ach('equinox', '2026-autumn', 30),
];

/** Each picture: the page, what to capture (an element, or the screen) and what to ring. */
const SHOTS = [
  { name: 'tonight-card', path: '', target: 'section.tonight' },
  { name: 'tonight-saw-it', path: '', target: 'section.tonight', ring: '.sighting-btn', crop: '.sighting' },
  { name: 'badges', path: '/badges' },
  { name: 'you-billing', path: '/dashboard', ring: l => `button:has-text("${msg(l, 'billing.playManage')}")`,
    setup: async (p, l) => { await p.locator('.you-row', { hasText: msg(l, 'you.plan') }).first().click(); await p.waitForTimeout(1200); } },
  { name: 'you-delete', path: '/dashboard', ring: l => `.you-row:has-text("${msg(l, 'footer.deleteAccount')}")`, scrollTo: l => `.you-row:has-text("${msg(l, 'footer.deleteAccount')}")` },
];

const b = await chromium.launch();
for (const lang of LANGS) {
  fs.mkdirSync(path.join(OUT, lang), { recursive: true });
  const profile = { id: UID, display_name: 'Aurora', plan: 'chaser', billing_cycle: 'annual', trial_ends_at: null, created_at: '2026-01-01T00:00:00Z', locale: lang,
    stripe_customer_id: null, subscription_status: 'active', current_period_end: '2027-10-01T00:00:00Z', cancel_at_period_end: false, billing_source: 'play', play_purchase_token: 'sample' };
  for (const s of SHOTS) {
    if (ONLY && !ONLY.includes(s.name)) continue;
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, serviceWorkers: 'block', locale: lang });
    await ctx.addCookies([{ name: 'pl.lang', value: lang, url: BASE }]);
    await ctx.addInitScript(([sess, locs]) => {
      localStorage.setItem('sb-mockref-auth-token', sess);
      localStorage.setItem('oval.locations.v1', JSON.stringify(locs.map(l => ({ id: l.id, name: l.name, lat: l.lat, lon: l.lon, source: 'search', isHome: l.is_home, createdAt: l.created_at }))));
      localStorage.setItem('pl.a2hs.dismissed', '1');
    }, [JSON.stringify(session), LOCS]);
    await ctx.route('**/mockref.supabase.co/**', async route => {
      const r = route.request(), u = new URL(r.url());
      const obj = (r.headers()['accept'] || '').includes('vnd.pgrst.object');
      const json = d => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(d) });
      if (u.pathname === '/auth/v1/user') return json(user);
      if (u.pathname.endsWith('/profiles')) return json(obj ? profile : [profile]);
      if (u.pathname.endsWith('/locations')) return json(LOCS);
      if (u.pathname.endsWith('/achievements')) return json(ACHIEVEMENTS);
      if (u.pathname.endsWith('/rpc/my_member')) return json([{ handle: 'aurora_tromso', points: 640, helpful: 12, is_admin: false }]);
      return json(obj ? null : []);
    });
    // Every picture at midday today in Tromsø, so each language shows the same thing (daylight: "Too light",
    // and "I saw it" waiting for dark, as the articles describe).
    const noon = new Date(); noon.setUTCHours(11, 0, 0, 0);
    await ctx.clock.install({ time: noon });
    const p = await ctx.newPage();
    await p.goto(`${BASE}/${lang}${s.path}`, { waitUntil: 'load', timeout: 60000 });
    await p.waitForTimeout(2500);
    if (s.setup) await s.setup(p, lang);
    const scroll = typeof s.scrollTo === 'function' ? s.scrollTo(lang) : s.scrollTo;
    if (scroll) await p.locator(scroll).first().evaluate(el => window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 360));
    if (s.target) await p.locator(s.target).first().scrollIntoViewIfNeeded();
    // Let sheets and sub-screens finish sliding in before anything is measured.
    await p.waitForTimeout(1500);
    const ring = typeof s.ring === 'function' ? s.ring(lang) : s.ring;
    // A rounded ring on a layer over the screen, drawn last: with room around a bare text button, and just inside
    // anything with its own padding, like a list row (whose rounded list would otherwise cut it off). Nothing moves.
    if (ring) await p.locator(ring).first().evaluate(el => {
      // A bare text button (no padding of its own) is ringed around its text with room to spare.
      const box = el.getBoundingClientRect(), small = parseFloat(getComputedStyle(el).paddingLeft) < 4;
      const range = document.createRange(); range.selectNodeContents(el);
      const r = small ? range.getBoundingClientRect() : box, pad = small ? 10 : -1;
      const d = document.createElement('div');
      Object.assign(d.style, { position: 'fixed', left: `${r.left - pad}px`, top: `${r.top - pad}px`, width: `${r.width + pad * 2}px`, height: `${r.height + pad * 2}px`,
        border: '3px solid #6CFF2B', borderRadius: '14px', boxSizing: 'border-box', pointerEvents: 'none', zIndex: 2147483647 });
      document.body.appendChild(d);
    }).catch(() => console.warn(lang, s.name, 'no ring target'));
    let png;
    if (s.target) {
      const el = p.locator(s.target).first();
      if (s.crop) {
        // Just the part around one control, with a margin.
        const box = await p.locator(s.crop).first().boundingBox();
        const card = await el.boundingBox();
        png = await p.screenshot({ clip: { x: card.x, y: box.y - 16, width: card.width, height: box.height + 32 } });
      } else png = await el.screenshot();
    } else {
      // The screen as the user sees it, without the tab bar.
      await p.addStyleTag({ content: '.tabbar { display: none !important; }' });
      // Stop below the last thing on screen rather than showing empty space.
      const vh = p.viewportSize().height;
      const bottom = await p.evaluate(() => Math.max(...[...document.querySelectorAll('main *')].map(e => e.getBoundingClientRect().bottom).filter(b => b > 0 && b <= innerHeight)));
      png = await p.screenshot({ clip: { x: 0, y: 0, width: p.viewportSize().width, height: Math.min(vh, Math.ceil(bottom) + 24) } });
    }
    await sharp(png).resize({ width: WIDTH, withoutEnlargement: true }).webp({ quality: 82 }).toFile(path.join(OUT, lang, `${s.name}.webp`));
    await ctx.close();
  }
  console.log(lang, 'done');
}
await b.close();
