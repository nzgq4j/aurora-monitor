/**
 * Bluesky (AT Protocol) over plain fetch: sign in, keep the session fresh, upload an image and post.
 *
 * The password is used once, to create a session, and never stored. The session tokens live in Supabase
 * Vault (secret `bluesky_session`), read and written only through bluesky_session_get()/bluesky_session_set()
 * with the service role. Non-secret status (handle, DID, last error) is on the social_settings row.
 * BLUESKY_IDENTIFIER / BLUESKY_APP_PASSWORD in the environment are a fallback account only.
 */

export const DEFAULT_SERVICE = 'https://bsky.social';
/** Bluesky's limits, and ours for images. */
export const MAX_GRAPHEMES = 300;
export const MAX_BYTES = 3000;
export const MAX_ALT = 2000;
/**
 * app.bsky.embed.images: each image blob accepts image/* up to 2,000,000 bytes, and a post holds at most 4 images
 * (lexicon packages/api/lexicons/app/bsky/embed/images.json in bluesky-social/atproto, read 18 Nov 2026).
 */
export const MAX_IMAGE_BYTES = 2_000_000;
export const MAX_IMAGES = 4;

export interface Session { service: string; did: string; handle: string; accessJwt: string; refreshJwt: string }

/** A failed XRPC call: `error` is Bluesky's error name (AuthFactorTokenRequired, ExpiredToken …) or `unreachable`. */
export class BlueskyError extends Error {
  constructor(public error: string, message: string, public status = 0) { super(message); }
}

const clean = (service?: string | null) => {
  const s = (service || DEFAULT_SERVICE).trim().replace(/\/+$/, '');
  return /^https?:\/\//.test(s) ? s : `https://${s}`;
};

/** One XRPC call. Non-2xx answers become a BlueskyError carrying Bluesky's error name. */
export async function xrpc<T>(service: string, method: string, opts: { get?: boolean; token?: string; body?: unknown; bytes?: Uint8Array; type?: string; query?: Record<string, string> } = {}): Promise<T> {
  const q = opts.query ? `?${new URLSearchParams(opts.query)}` : '';
  const headers: Record<string, string> = {};
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
  let body: BodyInit | undefined;
  if (opts.bytes) { headers['Content-Type'] = opts.type ?? 'application/octet-stream'; body = opts.bytes as unknown as BodyInit; }
  else if (opts.body !== undefined) { headers['Content-Type'] = 'application/json'; body = JSON.stringify(opts.body); }
  let res: Response;
  try {
    res = await fetch(`${clean(service)}/xrpc/${method}${q}`, { method: opts.get ? 'GET' : 'POST', headers, body });
  } catch (e) {
    throw new BlueskyError('unreachable', String((e as Error).message ?? e));
  }
  const text = await res.text();
  let json: Record<string, unknown> = {};
  try { json = text ? JSON.parse(text) : {}; } catch { /* not JSON */ }
  if (!res.ok) throw new BlueskyError(String(json.error ?? `http_${res.status}`), String(json.message ?? text.slice(0, 200)), res.status);
  return json as T;
}

type SessionReply = { did: string; handle: string; accessJwt: string; refreshJwt: string };

export async function createSession(identifier: string, password: string, service?: string | null): Promise<Session> {
  const s = clean(service);
  const r = await xrpc<SessionReply>(s, 'com.atproto.server.createSession', { body: { identifier: identifier.trim().replace(/^@/, ''), password } });
  return { service: s, did: r.did, handle: r.handle, accessJwt: r.accessJwt, refreshJwt: r.refreshJwt };
}

/** Renew with the refresh token. The refresh token rotates: save the whole returned session every time. */
export async function refreshSession(s: Session): Promise<Session> {
  const r = await xrpc<SessionReply>(s.service, 'com.atproto.server.refreshSession', { token: s.refreshJwt });
  return { ...s, did: r.did, handle: r.handle, accessJwt: r.accessJwt, refreshJwt: r.refreshJwt };
}

export const getSession = (s: Session) => xrpc<{ did: string; handle: string }>(s.service, 'com.atproto.server.getSession', { get: true, token: s.accessJwt });

export async function deleteSession(s: Session): Promise<void> {
  await xrpc(s.service, 'com.atproto.server.deleteSession', { token: s.refreshJwt });
}

/** Delete one of our posts by its at:// URI (repo, collection and rkey are its last three parts). */
export async function deletePost(s: Session, uri: string): Promise<void> {
  const [repo, collection, rkey] = uri.replace(/^at:\/\//, '').split('/');
  if (!repo || collection !== 'app.bsky.feed.post' || !rkey) throw new BlueskyError('bad_uri', uri);
  await xrpc(s.service, 'com.atproto.repo.deleteRecord', { token: s.accessJwt, body: { repo, collection, rkey } });
}

/** Seconds since the epoch at which a JWT expires, from its payload; null if unreadable. */
export function jwtExp(jwt: string): number | null {
  try {
    const part = jwt.split('.')[1];
    const json = JSON.parse(Buffer.from(part.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
    return typeof json.exp === 'number' ? json.exp : null;
  } catch { return null; }
}

/** True when the access token expires within `withinS` seconds (or can't be read). */
export const expiresSoon = (s: Session, now = Date.now(), withinS = 300) => {
  const exp = jwtExp(s.accessJwt);
  return exp === null || exp * 1000 - now < withinS * 1000;
};

// ---- Text: graphemes, bytes and facets ----

type Segmenter = { segment: (s: string) => Iterable<unknown> };
const SegmenterCtor = (Intl as unknown as { Segmenter?: new (l: string, o: { granularity: 'grapheme' }) => Segmenter }).Segmenter;
const seg = SegmenterCtor ? new SegmenterCtor('en', { granularity: 'grapheme' }) : null;
/** Length as Bluesky counts it: user-perceived characters (an emoji with modifiers is one). */
export const graphemes = (s: string) => (seg ? [...seg.segment(s)].length : [...s].length);
const enc = new TextEncoder();
export const utf8Length = (s: string) => enc.encode(s).length;

export type Facet = {
  index: { byteStart: number; byteEnd: number };
  features: ({ $type: 'app.bsky.richtext.facet#link'; uri: string } | { $type: 'app.bsky.richtext.facet#tag'; tag: string })[];
};

/**
 * Links (https://…) and #hashtags in `text`, with their positions as UTF-8 byte offsets (what Bluesky
 * expects; string indices go wrong on accents, CJK and emoji). Run it on the final text.
 */
export function detectFacets(text: string): Facet[] {
  const out: Facet[] = [];
  const at = (i: number) => enc.encode(text.slice(0, i)).length;
  for (const m of text.matchAll(/https?:\/\/[^\s]+/g)) {
    const uri = m[0].replace(/[.,;:!?)\]}'"»”’]+$/, '');
    const start = m.index!;
    out.push({ index: { byteStart: at(start), byteEnd: at(start + uri.length) }, features: [{ $type: 'app.bsky.richtext.facet#link', uri }] });
  }
  for (const m of text.matchAll(/(^|\s)#([\p{L}\p{N}_]+)/gu)) {
    const tag = m[2];
    if (/^\p{N}+$/u.test(tag) || tag.length > 64) continue;
    const start = m.index! + m[1].length;
    out.push({ index: { byteStart: at(start), byteEnd: at(start + 1 + tag.length) }, features: [{ $type: 'app.bsky.richtext.facet#tag', tag }] });
  }
  return out.sort((a, b) => a.index.byteStart - b.index.byteStart);
}

/** Why a post can't go out as it is, or null: empty, too long (300 graphemes or 3000 bytes), alt text too long. */
export function postProblem(text: string, alt?: string | null): 'empty' | 'too_long' | 'alt_too_long' | null {
  if (!text.trim()) return 'empty';
  if (graphemes(text) > MAX_GRAPHEMES || utf8Length(text) > MAX_BYTES) return 'too_long';
  if (alt && graphemes(alt) > MAX_ALT) return 'alt_too_long';
  return null;
}

// ---- Posting ----

export interface PostImage { bytes: Uint8Array; type: 'image/png' | 'image/jpeg'; alt: string; width: number; height: number }
export interface PostResult { uri: string; url: string }

/** The post's address on bsky.app from its at:// URI. */
export const postUrl = (handle: string, uri: string) => `https://bsky.app/profile/${handle}/post/${uri.split('/').pop()}`;

/** The record that createRecord receives (exported for tests). */
type EmbedImage = { blob: unknown; alt: string; width: number; height: number };
export function postRecord(text: string, lang: string, createdAt: string, image?: EmbedImage | EmbedImage[]) {
  const images = image === undefined ? [] : Array.isArray(image) ? image : [image];
  const facets = detectFacets(text);
  return {
    $type: 'app.bsky.feed.post',
    text,
    ...(facets.length ? { facets } : {}),
    langs: [lang],
    createdAt,
    ...(images.length ? { embed: { $type: 'app.bsky.embed.images', images: images.map(i => ({ image: i.blob, alt: i.alt, aspectRatio: { width: i.width, height: i.height } })) } } : {}),
  };
}

/** Publish a post with up to four images (`image` for one, `images` for several; both are combined in order). */
export async function publish(s: Session, text: string, opts: { lang?: string; image?: PostImage | null; images?: PostImage[]; now?: number } = {}): Promise<PostResult> {
  const all = [...(opts.image ? [opts.image] : []), ...(opts.images ?? [])];
  if (all.length > MAX_IMAGES) throw new BlueskyError('too_many_images', `${all.length} images`);
  for (const img of all) {
    const problem = postProblem(text, img.alt);
    if (problem) throw new BlueskyError(problem, problem);
  }
  const problem = postProblem(text);
  if (problem) throw new BlueskyError(problem, problem);
  for (const img of all) if (img.bytes.length > MAX_IMAGE_BYTES) throw new BlueskyError('image_too_large', `${img.bytes.length} bytes`);
  const embed: EmbedImage[] = [];
  for (const img of all) {
    const up = await xrpc<{ blob: unknown }>(s.service, 'com.atproto.repo.uploadBlob', { token: s.accessJwt, bytes: img.bytes, type: img.type });
    embed.push({ blob: up.blob, alt: img.alt, width: img.width, height: img.height });
  }
  const record = postRecord(text, opts.lang ?? 'en', new Date(opts.now ?? Date.now()).toISOString(), embed);
  const r = await xrpc<{ uri: string }>(s.service, 'com.atproto.repo.createRecord', { token: s.accessJwt, body: { repo: s.did, collection: 'app.bsky.feed.post', record } });
  return { uri: r.uri, url: postUrl(s.handle, r.uri) };
}
