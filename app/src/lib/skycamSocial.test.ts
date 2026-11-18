// The sky camera gate for Bluesky "visible now" posts, end to end through runViewingFeed with a mocked
// Bluesky client (fetch stubbed) and a mocked camera fetch. No operator or Bluesky host is contacted.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import sharp from 'sharp';
import { MAX_IMAGE_BYTES, graphemes } from './bluesky';
import { cameraById, type SkyCamera } from './skycams';
import type { FrameResult } from './skycamFetch';
import { skycamAttachment, socialPermitted, withCredit } from './skycamSocial';
import { memoryStore } from './socialStore';
import { runViewingFeed, type SiteOutlook, type ViewingDeps } from './socialViewing';
import type { HourScore } from './tonight';

const NOW = Date.parse('2026-11-19T03:00:00Z'); // dark at Kiruna
const SITE = { id: 'a-ornes', name: 'Ørnes, Nordland', lat: 66.869, lon: 13.706, tags: '#nordlys' };
const kiruna = cameraById('irf-kiruna')!;
const granted: SkyCamera = { ...kiruna, socialPermission: { status: 'granted', grantedBy: 'IRF (test fixture)', grantedOn: '2026-11-18', evidence: 'test fixture' } };

const solid = (v: number, side = 480) => sharp({ create: { width: side, height: side, channels: 3, background: { r: v, g: v, b: v } } }).jpeg().toBuffer().then(b => new Uint8Array(b));
const frameOf = (bytes: Uint8Array, capturedAt = NOW - 60_000): FrameResult => ({ ok: true, frame: { bytes, type: 'image/jpeg', capturedAt } });

const hours = (score: number): HourScore[] => [{ t: NOW, score, kp: 4.33, cloud: 10, sunAlt: -30, moonUp: false, f: { aurora: 1, dark: 1, cloud: 1, moon: 1 } }];
const outlook = (): SiteOutlook => {
  const h = hours(70);
  return { site: SITE, hours: h, need: 1, tz: 'Europe/Oslo', verdict: { level: 'goNow', score: 70, best: h[0], subject: h[0], window: { from: NOW, to: NOW + 2 * 36e5 }, limit: null, look: 'high' } };
};

describe('skycam on "visible now" posts', () => {
  let uploads: string[] = [];
  let records: { text: string; embed?: { images: { alt: string }[] }; facets?: { features: { uri?: string }[] }[] }[] = [];
  beforeEach(() => {
    uploads = []; records = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit = {}) => {
      const method = new URL(url).pathname.replace('/xrpc/', '');
      if (method === 'com.atproto.repo.uploadBlob') uploads.push(String((init.headers as Record<string, string>)['Content-Type'] ?? ''));
      if (method === 'com.atproto.repo.createRecord') records.push(JSON.parse(String(init.body)).record);
      const reply = method === 'com.atproto.repo.uploadBlob' ? { blob: { ref: `b${uploads.length}` } } : { uri: 'at://did:plc:pl/app.bsky.feed.post/3v' };
      return new Response(JSON.stringify(reply), { status: 200 });
    }));
  });
  afterEach(() => vi.unstubAllGlobals());

  const session = { service: 'https://pds.test', did: 'did:plc:pl', handle: 'polarlights.io', accessJwt: 'a', refreshJwt: 'r' };
  const run = (skycam: ViewingDeps['skycam']) => runViewingFeed(memoryStore({ settings: { viewing_enabled: true }, sites: [SITE] }), {
    now: () => NOW,
    auth: async () => session,
    render: async () => ({ bytes: new Uint8Array([137, 80, 78, 71]), type: 'image/png', width: 1080, height: 1350, alt: 'Polar Lights card.' }),
    outlooks: async () => ({ outlooks: [outlook()], card: {} }),
    skycam,
  });

  it('flag off: posts exactly as today and never fetches a camera', async () => {
    const cam = vi.fn();
    const r = await run({ enabled: () => false, cams: [granted], fetch: cam });
    expect(r.skycam).toBe('flag_off');
    expect(cam).not.toHaveBeenCalled();
    expect(records[0].embed?.images).toHaveLength(1);
    expect(records[0].text).not.toContain('Sky cam');
  });

  it('the shipped registry has no permission, so nothing is fetched or attached', async () => {
    const cam = vi.fn();
    const r = await run({ enabled: () => true, fetch: cam });
    expect(r.skycam).toBe('no_permission');
    expect(cam).not.toHaveBeenCalled();
    expect(records[0].embed?.images).toHaveLength(1);
    expect(socialPermitted(kiruna)).toBe(false);
  });

  it('a stale frame is not attached', async () => {
    const bytes = await solid(90);
    const r = await run({ enabled: () => true, cams: [granted], fetch: async () => frameOf(bytes, NOW - 3 * 36e5) });
    expect(r.skycam).toBe('stale');
    expect(records[0].embed?.images).toHaveLength(1);
    expect(records[0].text).not.toContain('Sky cam');
  });

  it('a near-black frame is not attached', async () => {
    const bytes = await solid(2);
    const r = await run({ enabled: () => true, cams: [granted], fetch: async () => frameOf(bytes) });
    expect(r.skycam).toBe('too_dark');
    expect(records[0].embed?.images).toHaveLength(1);
  });

  it('granted, fresh and bright: attaches the frame unaltered with credit, link facet and alt text', async () => {
    const bytes = await solid(90);
    const r = await run({ enabled: () => true, cams: [granted], fetch: async () => frameOf(bytes) });
    expect(r.skycam).toBe('irf-kiruna');
    expect(r.outcome).toMatchObject({ status: 'posted' });
    expect(uploads).toEqual(['image/png', 'image/jpeg']);
    const rec = records[0];
    expect(rec.embed?.images).toHaveLength(2);
    expect(rec.text).toContain('Sky cam: IRF / KAGO, Kiruna, CC BY 4.0 https://irf.se/alis/allsky/krn/t.html');
    expect(rec.text).not.toContain('resized');
    expect(graphemes(rec.text)).toBeLessThanOrEqual(300);
    expect(rec.facets?.some(f => f.features.some(x => x.uri === 'https://irf.se/alis/allsky/krn/t.html'))).toBe(true);
    expect(rec.embed?.images[1].alt).toBe('All-sky camera image from Kiruna, Sweden, captured 02:59 UTC. Image: IRF / KAGO, Kiruna, CC BY 4.0.');
  });
});

describe('skycamAttachment', () => {
  it('passes bytes through unchanged when under the blob limit', async () => {
    const bytes = await solid(90);
    const a = await skycamAttachment(SITE, 'Hello', NOW, { enabled: () => true, cams: [granted], fetch: async () => frameOf(bytes) });
    expect(a.ok && a.image.bytes).toBe(bytes);
  });

  it('recompresses an oversize frame and says "resized" in the credit', async () => {
    const side = 2600;
    const noise = Buffer.alloc(side * side * 3);
    for (let i = 0; i < noise.length; i++) noise[i] = (i * 2654435761) >>> 24;
    const big = new Uint8Array(await sharp(noise, { raw: { width: side, height: side, channels: 3 } }).jpeg({ quality: 100 }).toBuffer());
    expect(big.length).toBeGreaterThan(MAX_IMAGE_BYTES);
    const a = await skycamAttachment(SITE, 'Hello', NOW, { enabled: () => true, cams: [granted], fetch: async () => frameOf(big) });
    expect(a.ok).toBe(true);
    if (!a.ok) return;
    expect(a.image.bytes.length).toBeLessThanOrEqual(MAX_IMAGE_BYTES);
    expect(a.text).toContain('CC BY 4.0, resized');
    expect(a.image.alt).toContain('resized');
  });

  it('puts the credit before the hashtags, dropping them only when it would not fit', () => {
    const line = 'Sky cam: IRF / KAGO, Kiruna, CC BY 4.0 https://irf.se/alis/allsky/krn/t.html';
    expect(withCredit('Head\nBody\n#aurora #nordlys', line)).toBe(`Head\nBody\n${line}\n#aurora #nordlys`);
    const long = `${'y'.repeat(200)}\n#aurora #NorthernLights #nordlys #Norway`;
    expect(withCredit(long, line)).toBe(`${'y'.repeat(200)}\n${line}`);
    expect(withCredit('z'.repeat(250), line)).toBeNull();
  });

  it('skips when the credit would push the post past 300 graphemes', async () => {
    const bytes = await solid(90);
    const a = await skycamAttachment(SITE, 'x'.repeat(260), NOW, { enabled: () => true, cams: [granted], fetch: async () => frameOf(bytes) });
    expect(a).toMatchObject({ ok: false, reason: 'too_long' });
  });

  it('no camera in range or in darkness', async () => {
    const opts = { enabled: () => true, cams: [granted], fetch: vi.fn() };
    expect(await skycamAttachment({ lat: 71.776, lon: 139.848 }, 'x', NOW, opts)).toEqual({ ok: false, reason: 'no_camera' });
    expect(await skycamAttachment(SITE, 'x', Date.parse('2026-06-21T12:00:00Z'), opts)).toEqual({ ok: false, reason: 'no_camera' });
    expect(opts.fetch).not.toHaveBeenCalled();
  });
});
