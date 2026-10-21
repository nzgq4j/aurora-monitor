import { NextResponse } from 'next/server';
import { supabaseAdmin, userFromRequest } from '../../../../lib/billing';

export const dynamic = 'force-dynamic';

/** A member takes their own photo off the gallery: it is marked removed and its files are deleted. */
export async function POST(req: Request) {
  const user = await userFromRequest(req);
  if (!user) return NextResponse.json({ error: 'signed_out' }, { status: 401 });
  const { photoId } = (await req.json().catch(() => ({}))) as { photoId?: string };
  if (!photoId) return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  const db = supabaseAdmin();
  const { data: photo } = await db.from('gallery_photos').select('user_id, path, thumb_path').eq('id', photoId).maybeSingle();
  if (!photo || photo.user_id !== user.id) return NextResponse.json({ error: 'not_allowed' }, { status: 403 });
  const { error } = await db.from('gallery_photos').update({ status: 'removed' }).eq('id', photoId);
  if (error) return NextResponse.json({ error: 'failed' }, { status: 500 });
  await db.storage.from('gallery').remove([photo.path, photo.thumb_path]);
  await db.rpc('recount_helpful', { p_photo: photoId });
  return NextResponse.json({ ok: true });
}
