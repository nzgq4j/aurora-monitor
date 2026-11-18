import { describe, expect, it, vi } from 'vitest';
import { cameraById } from './skycams';
import { MAX_FRAME_BYTES, fetchFrame } from './skycamFetch';
import { GET } from '../app/api/skycam/[id]/route';

const kiruna = cameraById('irf-kiruna')!;
const NOW = Date.parse('2026-12-21T21:15:00Z');
const jpeg = (n = 1000, headers: Record<string, string> = {}) =>
  new Response(new Uint8Array(n).fill(7), { headers: { 'content-type': 'image/jpeg', 'last-modified': 'Mon, 21 Dec 2026 21:14:00 GMT', ...headers } });

describe('fetchFrame', () => {
  it('returns the bytes unaltered with the Last-Modified capture time, cached per cadence', async () => {
    const f = vi.fn(async () => jpeg(1234));
    const r = await fetchFrame(kiruna, NOW, f as unknown as typeof fetch);
    expect(r.ok && r.frame.bytes.length).toBe(1234);
    expect(r.ok && r.frame.capturedAt).toBe(Date.parse('2026-12-21T21:14:00Z'));
    expect(f).toHaveBeenCalledTimes(1);
    const [url, init] = f.mock.calls[0] as unknown as [string, { next: { revalidate: number } }];
    expect(url).toBe(kiruna.imageUrl);
    expect(init.next.revalidate).toBe(60);
  });

  it('rejects non-images, oversize, empty and failed responses', async () => {
    const run = (res: Response) => fetchFrame(kiruna, NOW, (async () => res) as unknown as typeof fetch);
    expect(await run(new Response('<html>', { headers: { 'content-type': 'text/html' } }))).toEqual({ ok: false, error: 'not_image' });
    expect(await run(jpeg(MAX_FRAME_BYTES + 1))).toEqual({ ok: false, error: 'too_large' });
    expect(await run(jpeg(0))).toEqual({ ok: false, error: 'empty' });
    expect(await run(new Response('x', { status: 503 }))).toEqual({ ok: false, error: 'bad_status' });
    expect(await fetchFrame(kiruna, NOW, (async () => { throw new Error('timeout'); }) as unknown as typeof fetch)).toEqual({ ok: false, error: 'unreachable' });
  });

  it('never fetches a camera that is not cleared', async () => {
    const f = vi.fn();
    expect(await fetchFrame(cameraById('sgo-sodankyla')!, NOW, f as unknown as typeof fetch)).toEqual({ ok: false, error: 'not_cleared' });
    expect(f).not.toHaveBeenCalled();
  });

  it('without Last-Modified, the capture time is when the content last changed', async () => {
    const cam = { ...kiruna, id: 'no-lm' };
    const res = (etag: string) => (async () => new Response(new Uint8Array(10).fill(1), { headers: { 'content-type': 'image/jpeg', etag } })) as unknown as typeof fetch;
    const a = await fetchFrame(cam, NOW, res('"a"'));
    const b = await fetchFrame(cam, NOW + 60_000, res('"a"'));
    const c = await fetchFrame(cam, NOW + 120_000, res('"b"'));
    expect(a.ok && a.frame.capturedAt).toBe(NOW);
    expect(b.ok && b.frame.capturedAt).toBe(NOW);
    expect(c.ok && c.frame.capturedAt).toBe(NOW + 120_000);
  });
});

describe('GET /api/skycam/:id', () => {
  const call = (id: string) => GET(new Request(`https://x/api/skycam/${id}`), { params: Promise.resolve({ id }) });
  it('404 for unknown ids, URLs and cameras that are not cleared', async () => {
    for (const id of ['nope', 'https://evil.example/x.jpg', 'sgo-sodankyla', 'uit-bacc-skibotn']) expect((await call(id)).status).toBe(404);
  });
  it('serves a cleared camera with cache headers and the capture time', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jpeg(500));
    const res = await call('irf-kiruna');
    spy.mockRestore();
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/jpeg');
    expect(res.headers.get('cache-control')).toBe('public, s-maxage=60, stale-while-revalidate=30');
    expect(res.headers.get('x-skycam-captured')).toBe('2026-12-21T21:14:00.000Z');
    expect((await res.arrayBuffer()).byteLength).toBe(500);
  });
});
