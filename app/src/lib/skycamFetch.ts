/**
 * Fetching a cleared camera's latest frame (server only). Shared by GET /api/skycam/:id and the Bluesky
 * attachment gate. Only registry entries are fetched: nothing here accepts a URL from a client.
 *
 * Load on the operator: the upstream request goes through Next's fetch cache with revalidate = the camera's
 * cadence. On Vercel that is the Runtime Cache, which is regional, and the app's functions run in one region
 * (iad1), so the operator sees at most one request per camera per cadence interval however many people look.
 * The route's own Cache-Control (s-maxage) adds the CDN cache in front.
 */

import type { SkyCamera } from './skycams';

export const MAX_FRAME_BYTES = 2 * 1024 * 1024;
const TIMEOUT_MS = 5000;

export interface Frame {
  bytes: Uint8Array;
  type: string;
  /** Capture time (ms): upstream Last-Modified, else the time the content was first seen changing. Null if unknown. */
  capturedAt: number | null;
}

export type FrameResult = { ok: true; frame: Frame } | { ok: false; error: 'not_cleared' | 'no_image' | 'unreachable' | 'bad_status' | 'not_image' | 'too_large' | 'empty' };

// Without Last-Modified, a frame's age is the time since its ETag (or content hash) last changed. Kept per
// server instance; a cold start forgets it, which only makes a frame look newer until it next changes.
const lastChange = new Map<string, { tag: string; at: number }>();

function contentTag(bytes: Uint8Array, etag: string | null): string {
  if (etag) return etag;
  let h = 2166136261;
  for (let i = 0; i < bytes.length; i += 61) h = Math.imul(h ^ bytes[i], 16777619);
  return `${bytes.length}:${(h >>> 0).toString(16)}`;
}

export async function fetchFrame(cam: SkyCamera, now = Date.now(), fetchImpl: typeof fetch = fetch): Promise<FrameResult> {
  if (cam.license.status !== 'cleared') return { ok: false, error: 'not_cleared' };
  if (!cam.imageUrl) return { ok: false, error: 'no_image' };
  let res: Response;
  try {
    res = await fetchImpl(cam.imageUrl, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { 'User-Agent': 'polarlights.io live sky cams (https://www.polarlights.io)' },
      // One upstream request per cadence interval (see above).
      next: { revalidate: Math.max(30, cam.cadenceSeconds ?? 300) },
    } as RequestInit);
  } catch {
    return { ok: false, error: 'unreachable' };
  }
  if (!res.ok) return { ok: false, error: 'bad_status' };
  const type = (res.headers.get('content-type') ?? '').split(';')[0].trim();
  if (!type.startsWith('image/')) return { ok: false, error: 'not_image' };
  const declared = Number(res.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > MAX_FRAME_BYTES) return { ok: false, error: 'too_large' };
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (bytes.length > MAX_FRAME_BYTES) return { ok: false, error: 'too_large' };
  if (!bytes.length) return { ok: false, error: 'empty' };
  const lm = Date.parse(res.headers.get('last-modified') ?? '');
  let capturedAt: number | null = Number.isFinite(lm) ? lm : null;
  if (capturedAt === null) {
    const tag = contentTag(bytes, res.headers.get('etag'));
    const seen = lastChange.get(cam.id);
    if (!seen || seen.tag !== tag) lastChange.set(cam.id, { tag, at: now });
    capturedAt = lastChange.get(cam.id)!.at;
  }
  return { ok: true, frame: { bytes, type, capturedAt } };
}
