/**
 * The event feed end to end against a fake Bluesky server (fetch is replaced: nothing reaches bsky.social)
 * and the in-memory store. Asserts on what would have been sent.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runEventFeed, type FeedDeps } from './socialFeed';
import { memoryStore } from './socialStore';
import type { Session } from './bluesky';
import type { EventInputs } from './socialEvents';

const NOW = Date.parse('2026-11-18T14:30:00Z');
const jwt = (exp: number) => `h.${Buffer.from(JSON.stringify({ exp })).toString('base64url')}.s`;
const session = (expS = NOW / 1000 + 3600): Session => ({ service: 'https://pds.test', did: 'did:plc:pl', handle: 'polarlights.io', accessJwt: jwt(expS), refreshJwt: 'refresh-1' });

interface Call { method: string; headers: Record<string, string>; body: unknown; bytes?: number }
let calls: Call[] = [];
let fail: Record<string, { status: number; error: string }> = {};

beforeEach(() => {
  calls = []; fail = {};
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit = {}) => {
    const method = new URL(url).pathname.replace('/xrpc/', '');
    const headers = (init.headers ?? {}) as Record<string, string>;
    const isBytes = init.body instanceof Uint8Array;
    calls.push({ method, headers, body: isBytes ? null : init.body ? JSON.parse(String(init.body)) : null, bytes: isBytes ? (init.body as Uint8Array).length : undefined });
    if (!url.startsWith('https://pds.test/xrpc/')) throw new Error(`unexpected fetch ${url}`);
    const f = fail[method];
    if (f) return new Response(JSON.stringify({ error: f.error, message: f.error }), { status: f.status });
    const reply: Record<string, unknown> = {
      'com.atproto.server.refreshSession': { did: 'did:plc:pl', handle: 'polarlights.io', accessJwt: jwt(NOW / 1000 + 7200), refreshJwt: 'refresh-2' },
      'com.atproto.repo.uploadBlob': { blob: { $type: 'blob', ref: { $link: 'bafy' }, mimeType: 'image/png', size: 4 } },
      'com.atproto.repo.createRecord': { uri: `at://did:plc:pl/app.bsky.feed.post/3k${calls.length}`, cid: 'c' },
    };
    return new Response(JSON.stringify(reply[method] ?? {}), { status: 200 });
  }));
});
afterEach(() => vi.unstubAllGlobals());

const storm: EventInputs = { kp: [], hp30: [{ t: NOW - 20 * 6e4, hp: 7 }], xrays: [], wind: [], power: [] };
const deps = (over: Partial<FeedDeps> = {}, now = NOW): FeedDeps => ({
  inputs: async () => storm,
  cardData: async () => ({}),
  render: async ev => ({ bytes: new Uint8Array([137, 80, 78, 71]), type: 'image/png', width: 1080, height: 1350, alt: `Polar Lights card for ${ev.kind}, a map of the aurora oval with Kp bars. Not an official warning service.` }),
  now: () => now,
  ...over,
});
const posts = () => calls.filter(c => c.method === 'com.atproto.repo.createRecord');

describe('runEventFeed', () => {
  it('does nothing while switched off', async () => {
    const st = memoryStore({ session: session() });
    expect(await runEventFeed(st, deps())).toEqual({ ok: true, skipped: 'off' });
    expect(calls).toEqual([]);
  });

  it('waits when no account is connected', async () => {
    const st = memoryStore({ settings: { events_enabled: true } });
    expect((await runEventFeed(st, deps())).skipped).toBe('not_connected');
    expect(st.rows).toEqual([]);
  });

  it('posts a storm once with its card, alt text, facets and language', async () => {
    const st = memoryStore({ settings: { events_enabled: true }, session: session() });
    const r = await runEventFeed(st, deps());
    expect(r.outcomes).toEqual([expect.objectContaining({ status: 'posted', url: expect.stringMatching(/^https:\/\/bsky\.app\/profile\/polarlights\.io\/post\//) })]);
    const up = calls.find(c => c.method === 'com.atproto.repo.uploadBlob')!;
    expect(up.headers['Content-Type']).toBe('image/png');
    expect(up.bytes).toBe(4);
    const rec = (posts()[0].body as { repo: string; record: { text: string; langs: string[]; facets: unknown[]; embed: { images: { alt: string; aspectRatio: object }[] } } });
    expect(rec.repo).toBe('did:plc:pl');
    expect(rec.record.langs).toEqual(['en']);
    expect(rec.record.text.split('\n')[0]).toContain('G3 (strong)');
    expect(rec.record.facets.length).toBeGreaterThanOrEqual(2);
    expect(rec.record.embed.images[0].aspectRatio).toEqual({ width: 1080, height: 1350 });
    expect(rec.record.embed.images[0].alt.length).toBeGreaterThan(40);
    expect(st.rows[0]).toMatchObject({ status: 'posted', image: true, kind: 'storm' });
    // The next minute: already posted, nothing sent.
    await runEventFeed(st, deps({}, NOW + 6e4));
    expect(posts()).toHaveLength(1);
  });

  it('never double-posts when two runs overlap', async () => {
    const st = memoryStore({ settings: { events_enabled: true }, session: session() });
    await Promise.all([runEventFeed(st, deps()), runEventFeed(st, deps())]);
    expect(posts()).toHaveLength(1);
  });

  it('waits for the card, then posts text only after 15 minutes', async () => {
    const st = memoryStore({ settings: { events_enabled: true }, session: session() });
    const broken = { render: async () => { throw new Error('fonts'); } };
    const fresh: EventInputs = { ...storm, hp30: [{ t: NOW - 2 * 6e4, hp: 7 }] };
    const r = await runEventFeed(st, deps({ ...broken, inputs: async () => fresh }));
    expect(r.outcomes).toEqual([{ key: expect.any(String), status: 'waiting' }]);
    expect(st.rows).toEqual([]);
    const late = await runEventFeed(st, deps({ ...broken, inputs: async () => fresh }, NOW + 16 * 6e4));
    expect(late.outcomes?.[0].status).toBe('posted');
    expect((posts()[0].body as { record: { embed?: unknown } }).record.embed).toBeUndefined();
  });

  it('refreshes an expiring session and keeps the rotated tokens', async () => {
    const st = memoryStore({ settings: { events_enabled: true }, session: session(NOW / 1000 + 60) });
    await runEventFeed(st, deps());
    expect(calls[0].method).toBe('com.atproto.server.refreshSession');
    expect(calls[0].headers.Authorization).toBe('Bearer refresh-1');
    expect(st.sess?.refreshJwt).toBe('refresh-2');
    expect(posts()).toHaveLength(1);
  });

  it('records a refused refresh so the admin page asks to sign in again', async () => {
    const st = memoryStore({ settings: { events_enabled: true }, session: session(NOW / 1000 + 60) });
    fail['com.atproto.server.refreshSession'] = { status: 400, error: 'ExpiredToken' };
    const r = await runEventFeed(st, deps());
    expect(r.skipped).toBe('not_connected');
    expect(st.raw.last_error).toBe('session_expired:ExpiredToken');
  });

  it('marks a failed post failed and does not retry it automatically', async () => {
    const st = memoryStore({ settings: { events_enabled: true }, session: session() });
    fail['com.atproto.repo.createRecord'] = { status: 429, error: 'RateLimitExceeded' };
    const r = await runEventFeed(st, deps());
    expect(r.outcomes).toEqual([expect.objectContaining({ status: 'failed', error: 'RateLimitExceeded' })]);
    delete fail['com.atproto.repo.createRecord'];
    await runEventFeed(st, deps({}, NOW + 6e4));
    expect(posts()).toHaveLength(1);
    expect(st.rows[0].status).toBe('failed');
  });

  it('reports a feed error instead of throwing', async () => {
    const st = memoryStore({ settings: { events_enabled: true }, session: session() });
    const r = await runEventFeed(st, deps({ inputs: async () => { throw new Error('NOAA down'); } }));
    expect(r).toEqual({ ok: false, error: 'NOAA down' });
  });
});
