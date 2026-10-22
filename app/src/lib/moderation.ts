'use client';

import { supabase } from './supabase';

/** /api/gallery/moderate as the signed-in moderator; null when not allowed or unreachable. */
export async function moderate<T>(body: object): Promise<T | null> {
  const s = (await supabase()?.auth.getSession())?.data.session;
  if (!s) return null;
  try {
    const res = await fetch('/api/gallery/moderate', { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${s.access_token}` }, body: JSON.stringify(body) });
    return res.ok ? ((await res.json()) as T) : null;
  } catch {
    return null;
  }
}

/** Photos waiting for approval (moderators only). */
export const pendingCount = async () => (await moderate<{ photos: { status: string }[] }>({}))?.photos.filter(p => p.status === 'pending').length ?? 0;
