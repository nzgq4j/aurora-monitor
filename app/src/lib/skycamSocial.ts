/**
 * An all-sky camera frame for a Bluesky "visible now" post: off unless SKYCAM_SOCIAL_ENABLED is "true", and then
 * attached only when every gate passes. Otherwise the post goes out exactly as before (no image, no credit).
 *
 * Gates, in order (the first that fails names the reason):
 *   1. the flag is on;
 *   2. a camera is within range of the post's site and in darkness;
 *   3. that camera's licence is cleared and its socialPermission is 'granted' with grantedBy, grantedOn and evidence;
 *   4. its latest frame (fetched by skycamFetch, the same code as /api/skycam/:id) arrives and is fresh;
 *   5. the frame is not near-black (a black frame says nothing and reads as broken);
 *   6. it fits Bluesky's blob limit, recompressed only if over it (the credit then says "resized");
 *   7. the post text with the credit line and source link stays within 300 graphemes (hashtags give way first).
 * The post text gets the credit and a link to the operator's page (a link facet; see bluesky.detectFacets), and
 * the image gets alt text with the camera, capture time and credit.
 */

import { MAX_GRAPHEMES, MAX_IMAGE_BYTES, graphemes, type PostImage } from './bluesky';
import { SKY_CAMERAS, type SkyCamera } from './skycams';
import { fetchFrame, type Frame } from './skycamFetch';
import { freshness, inSeason, nearestCameras } from './skycamLogic';

/** A frame whose mean brightness (0–255, all channels) is below this is treated as black. */
export const MIN_MEAN_BRIGHTNESS = 12;

export type SkipReason = 'flag_off' | 'no_camera' | 'no_permission' | 'fetch_failed' | 'stale' | 'too_dark' | 'too_large' | 'too_long';
export type Attachment = { ok: true; cam: SkyCamera; image: PostImage; text: string } | { ok: false; reason: SkipReason; cam?: SkyCamera };

export interface SkycamSocialDeps {
  enabled?: () => boolean;
  cams?: SkyCamera[];
  fetch?: (cam: SkyCamera, now: number) => Promise<Awaited<ReturnType<typeof fetchFrame>>>;
}

export const skycamSocialEnabled = () => process.env.SKYCAM_SOCIAL_ENABLED === 'true';

/** A complete permission record: who granted it, when, and the evidence (registryProblems enforces the same). */
export const socialPermitted = (cam: SkyCamera) => {
  const p = cam.socialPermission;
  return cam.license.status === 'cleared' && p.status === 'granted' && !!(p.grantedBy && p.grantedOn && p.evidence);
};

const hhmm = (ms: number) => new Date(ms).toISOString().slice(11, 16);
const licenceLabel = (cam: SkyCamera) => (cam.license.kind === 'CC-BY-4.0' ? 'CC BY 4.0' : 'used with permission');

/**
 * The camera frame and new post text for `text` about a site, or why not. Fetches at most one frame, and only
 * after the flag, range, darkness and permission gates have passed.
 */
export async function skycamAttachment(site: { lat: number; lon: number }, text: string, now: number, deps: SkycamSocialDeps = {}): Promise<Attachment> {
  if (!(deps.enabled ?? skycamSocialEnabled)()) return { ok: false, reason: 'flag_off' };
  const near = nearestCameras(site, deps.cams ?? SKY_CAMERAS).filter(n => inSeason(n.cam, now) && n.cam.imageUrl);
  if (!near.length) return { ok: false, reason: 'no_camera' };
  const pick = near.find(n => socialPermitted(n.cam));
  if (!pick) return { ok: false, reason: 'no_permission', cam: near[0].cam };
  const { cam } = pick;

  const r = await (deps.fetch ?? fetchFrame)(cam, now);
  if (!r.ok) return { ok: false, reason: 'fetch_failed', cam };
  if (freshness(cam, r.frame.capturedAt, now) === 'stale') return { ok: false, reason: 'stale', cam };

  const prepared = await prepare(r.frame);
  if (prepared === 'too_dark') return { ok: false, reason: 'too_dark', cam };
  if (prepared === 'too_large') return { ok: false, reason: 'too_large', cam };

  const credit = `${cam.credit.text}, ${licenceLabel(cam)}${prepared.resized ? ', resized' : ''}`;
  const full = withCredit(text, `Sky cam: ${credit} ${cam.sourcePageUrl}`);
  if (!full) return { ok: false, reason: 'too_long', cam };
  const alt = `All-sky camera image from ${cam.name}, captured ${hhmm(r.frame.capturedAt!)} UTC. Image: ${credit}.`;
  return { ok: true, cam, text: full, image: { bytes: prepared.bytes, type: prepared.type, alt, width: prepared.width, height: prepared.height } };
}

/**
 * The post text with the credit line added before a closing hashtag line (or at the end). When that is over 300
 * graphemes the hashtag line is dropped, since the credit is required and the hashtags are not; null if it still
 * does not fit.
 */
export function withCredit(text: string, line: string): string | null {
  const lines = text.split('\n');
  const last = lines[lines.length - 1] ?? '';
  const tags = /^(#[\p{L}\p{N}_]+\s*)+$/u.test(last.trim()) ? last : null;
  const body = tags ? lines.slice(0, -1).join('\n') : text;
  for (const t of tags ? [`${body}\n${line}\n${tags}`, `${body}\n${line}`] : [`${body}\n${line}`]) if (graphemes(t) <= MAX_GRAPHEMES) return t;
  return null;
}

type Prepared = { bytes: Uint8Array; type: 'image/jpeg' | 'image/png'; width: number; height: number; resized: boolean };

/** Brightness check, then the size limit: the bytes are passed through unchanged unless they are over it. */
async function prepare(frame: Frame): Promise<Prepared | 'too_dark' | 'too_large'> {
  const sharp = (await import('sharp')).default;
  const img = sharp(frame.bytes);
  const [meta, stats] = await Promise.all([img.metadata(), img.stats()]);
  const colour = stats.channels.slice(0, Math.min(3, stats.channels.length));
  const mean = colour.reduce((a, c) => a + c.mean, 0) / colour.length;
  if (mean < MIN_MEAN_BRIGHTNESS) return 'too_dark';
  const width = meta.width ?? 0, height = meta.height ?? 0;
  const passthrough = frame.type === 'image/jpeg' || frame.type === 'image/png';
  if (frame.bytes.length <= MAX_IMAGE_BYTES && passthrough) return { bytes: frame.bytes, type: frame.type as Prepared['type'], width, height, resized: false };
  // Over the limit (or a type Bluesky posts handle less well): recompress as JPEG, shrinking until it fits.
  for (const [side, quality] of [[2048, 85], [1600, 80], [1200, 75]] as const) {
    const { data, info } = await sharp(frame.bytes).resize({ width: side, height: side, fit: 'inside', withoutEnlargement: true }).jpeg({ quality }).toBuffer({ resolveWithObject: true });
    if (data.length <= MAX_IMAGE_BYTES) return { bytes: new Uint8Array(data), type: 'image/jpeg', width: info.width, height: info.height, resized: true };
  }
  return 'too_large';
}
