import { NextResponse } from 'next/server';
import { supabaseAdmin, userFromRequest } from '../../../../lib/billing';

export const dynamic = 'force-dynamic';

/** Helpful on or off for a gallery photo (not one's own); the database then recounts it. */
export async function POST(req: Request) {
  const user = await userFromRequest(req);
  if (!user) return NextResponse.json({ error: 'signed_out' }, { status: 401 });
  const { photoId } = (await req.json().catch(() => ({}))) as { photoId?: string };
  if (!photoId) return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  const db = supabaseAdmin();
  const { data: photo } = await db.from('gallery_photos').select('user_id, status').eq('id', photoId).maybeSingle();
  if (!photo || photo.status !== 'visible' || photo.user_id === user.id) return NextResponse.json({ error: 'not_allowed' }, { status: 403 });
  const { data: had } = await db.from('photo_votes').select('photo_id').eq('photo_id', photoId).eq('user_id', user.id).maybeSingle();
  const { error } = had
    ? await db.from('photo_votes').delete().eq('photo_id', photoId).eq('user_id', user.id)
    : await db.from('photo_votes').insert({ photo_id: photoId, user_id: user.id });
  if (error) return NextResponse.json({ error: 'failed' }, { status: 500 });
  const { data: helpful } = await db.rpc('recount_helpful', { p_photo: photoId });
  return NextResponse.json({ helpful: helpful ?? 0, voted: !had });
}
