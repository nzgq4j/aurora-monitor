'use client';

import { supabase } from './supabase';
import type { Achievement, MemberInfo, SpecialRow } from './badges';

/**
 * The community gallery and badges, through the database functions in
 * supabase/migrations/20261022000100_badges_gallery.sql and the /api/gallery/* routes (for the steps that
 * remove rows or files, which run with the server's key).
 */

export type Filter = 'tonight' | 'storm' | 'near' | 'top' | 'recent';
export type Precision = 'town' | 'area' | 'none';
export type ReportReason = 'not_aurora' | 'inappropriate' | 'spam' | 'not_theirs' | 'other';

export interface Photo {
  id: string;
  taken_at: string;
  path: string;
  thumb_path: string;
  width: number | null;
  height: number | null;
  caption: string | null;
  place: string | null;
  lat: number | null;
  lon: number | null;
  kp: number | null;
  source: 'app' | 'upload';
  camera: string | null;
  featured: boolean;
  helpful: number;
  /** pending: waiting for a moderator (only its poster sees it). */
  status: 'pending' | 'visible' | 'hidden' | 'removed';
  handle: string;
  points: number;
  voted: boolean;
  mine: boolean;
}

const BUCKET = 'gallery';
const BASE = process.env.NEXT_PUBLIC_SUPABASE_URL;

/** Public URL of a gallery file. */
export const fileUrl = (path: string) => `${BASE}/storage/v1/object/public/${BUCKET}/${path}`;

async function session() {
  const sb = supabase();
  if (!sb) return null;
  const { data: { session: s } } = await sb.auth.getSession();
  return s ? { sb, s } : null;
}

export async function myMember(): Promise<MemberInfo | null> {
  const a = await session();
  if (!a) return null;
  const { data, error } = await a.sb.rpc('my_member');
  const r = (data as { handle: string; points: number; helpful: number; is_admin: boolean }[] | null)?.[0];
  return error || !r ? null : { handle: r.handle, points: r.points, helpful: r.helpful, isAdmin: r.is_admin };
}

export async function myAchievements(): Promise<Achievement[]> {
  const a = await session();
  if (!a) return [];
  const { data } = await a.sb.from('achievements').select('kind, ref, at, value, points').order('at');
  return (data as Achievement[] | null) ?? [];
}

/** The member's special badges (the others stay secret): supabase/migrations/20261027000100_special_badges.sql. */
export async function mySpecialBadges(): Promise<SpecialRow[]> {
  const a = await session();
  if (!a) return [];
  const { data } = await a.sb.rpc('my_special_badges');
  return (data as SpecialRow[] | null) ?? [];
}

export type RedeemStatus = 'ok' | 'invalid' | 'expired' | 'used' | 'have' | 'limit' | 'error';

/** Redeems a tour code. On 'ok' (and 'have') the slug of the badge it gives. */
export async function redeemBadgeCode(code: string): Promise<{ status: RedeemStatus; slug?: string }> {
  const a = await session();
  if (!a) return { status: 'error' };
  const { data, error } = await a.sb.rpc('redeem_badge_code', { p_code: code });
  return error || !data ? { status: 'error' } : (data as { status: RedeemStatus; slug?: string });
}

export async function setHandle(handle: string): Promise<'ok' | 'invalid' | 'taken' | 'error'> {
  const a = await session();
  if (!a) return 'error';
  const { data, error } = await a.sb.rpc('set_handle', { p_handle: handle });
  return error ? 'error' : (data as 'ok' | 'invalid' | 'taken');
}

export async function feed(filter: Filter | 'around' | 'one' | 'mine', o: { lat?: number; lon?: number; at?: string; id?: string; offset?: number; limit?: number } = {}): Promise<Photo[] | null> {
  const sb = supabase();
  if (!sb) return null;
  // Paged by position in the full sort order, so "Show more" neither skips nor repeats photos.
  const { data, error } = await sb.rpc('gallery_page', {
    p_filter: filter, p_lat: o.lat ?? null, p_lon: o.lon ?? null, p_at: o.at ?? null, p_id: o.id ?? null, p_offset: o.offset ?? 0, p_limit: o.limit ?? 30,
  });
  return error ? null : (data as Photo[]);
}

export const onePhoto = async (id: string) => (await feed('one', { id }))?.[0] ?? null;

/** A server route, as the signed-in member. */
async function route<T>(path: string, body: object): Promise<T | null> {
  const a = await session();
  if (!a) return null;
  try {
    const res = await fetch(path, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${a.s.access_token}` }, body: JSON.stringify(body) });
    return res.ok ? ((await res.json()) as T) : null;
  } catch {
    return null;
  }
}

/** Helpful on or off; the new count, or null on failure. */
export const toggleHelpful = async (id: string) => (await route<{ helpful: number; voted: boolean }>('/api/gallery/vote', { photoId: id }));
export const removePhoto = async (id: string) => !!(await route<{ ok: boolean }>('/api/gallery/remove', { photoId: id }))?.ok;
export const unblock = async (handle: string) => !!(await route<{ ok: boolean }>('/api/gallery/unblock', { handle }))?.ok;

export async function reportPhoto(id: string, reason: ReportReason): Promise<boolean> {
  const a = await session();
  if (!a) return false;
  const { error } = await a.sb.rpc('report_photo', { p_photo: id, p_reason: reason });
  return !error;
}

export async function blockOwner(id: string): Promise<boolean> {
  const a = await session();
  if (!a) return false;
  const { error } = await a.sb.rpc('block_photo_owner', { p_photo: id });
  return !error;
}

export async function myBlocks(): Promise<string[]> {
  const a = await session();
  if (!a) return [];
  const { data } = await a.sb.rpc('my_blocks');
  return ((data as { handle: string }[] | null) ?? []).map(r => r.handle);
}

/** Re-encode as JPEG at most `edge` px on the long side. Drawing to a canvas drops the file's metadata (GPS included). */
async function jpeg(src: Blob, edge: number, quality: number): Promise<{ blob: Blob; width: number; height: number }> {
  const bmp = await createImageBitmap(src);
  const k = Math.min(1, edge / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
  c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height);
  bmp.close();
  const blob = await new Promise<Blob | null>(res => c.toBlob(res, 'image/jpeg', quality));
  if (!blob) throw new Error('encode');
  return { blob, width: c.width, height: c.height };
}

export interface PostInput {
  photo: Blob;
  caption: string;
  place: string | null;
  lat: number | null;
  lon: number | null;
  precision: Precision;
  takenAt: number;
  source: 'app' | 'upload';
  camera: string | null;
}

export type PostResult = { ok: true; id: string } | { ok: false; reason: 'signin' | 'limit' | 'error' };

export async function postPhoto(p: PostInput): Promise<PostResult> {
  const a = await session();
  if (!a) return { ok: false, reason: 'signin' };
  try {
    const [full, thumb] = await Promise.all([jpeg(p.photo, 2048, 0.88), jpeg(p.photo, 720, 0.8)]);
    const id = crypto.randomUUID();
    const dir = a.s.user.id;
    const path = `${dir}/${id}.jpg`, thumbPath = `${dir}/${id}_t.jpg`;
    const store = a.sb.storage.from(BUCKET);
    const up1 = await store.upload(path, full.blob, { contentType: 'image/jpeg', cacheControl: '31536000' });
    if (up1.error) return { ok: false, reason: 'error' };
    const up2 = await store.upload(thumbPath, thumb.blob, { contentType: 'image/jpeg', cacheControl: '31536000' });
    if (up2.error) return { ok: false, reason: 'error' };
    const { data, error } = await a.sb.rpc('post_photo', {
      p_path: path, p_thumb: thumbPath, p_width: full.width, p_height: full.height, p_caption: p.caption,
      p_place: p.precision === 'none' ? null : p.place, p_lat: p.lat, p_lon: p.lon, p_precision: p.precision,
      p_taken_at: new Date(p.takenAt).toISOString(), p_source: p.source, p_camera: p.camera,
    });
    if (error) return { ok: false, reason: /Ten photos/.test(error.message) ? 'limit' : 'error' };
    return { ok: true, id: data as string };
  } catch {
    return { ok: false, reason: 'error' };
  }
}

/** Town and wider-area names for a position (BigDataCloud, no key), in the page's language. */
export async function placeNames(lat: number, lon: number): Promise<{ town: string | null; area: string | null }> {
  try {
    const lang = document.documentElement.lang || 'en';
    const res = await fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=${lang}`);
    const j = await res.json();
    const town = j.city || j.locality || null;
    const region = j.principalSubdivision || null;
    const country = j.countryCode || j.countryName || null;
    return { town: town ? [town, region ? j.principalSubdivisionCode?.split('-').pop() || region : country].filter(Boolean).join(', ') : null,
      area: [region, country].filter(Boolean).join(', ') || null };
  } catch {
    return { town: null, area: null };
  }
}
