import { NextResponse } from 'next/server';
import { supabaseAdmin, userFromRequest } from '../../../../lib/billing';

export const dynamic = 'force-dynamic';

type Action = 'restore' | 'remove' | 'feature' | 'unfeature';

async function admin(req: Request) {
  const user = await userFromRequest(req);
  if (!user) return null;
  const { data } = await supabaseAdmin().from('admins').select('user_id').eq('user_id', user.id).maybeSingle();
  return data ? user : null;
}

/**
 * Gallery moderation (admins table only). POST {} lists photos waiting for review (hidden by three
 * reports, or reported at all) with their report reasons; POST {photoId, action} restores, removes
 * (files deleted), features or unfeatures one. Featuring awards the poster the Featured achievement.
 */
export async function POST(req: Request) {
  const user = await admin(req);
  if (!user) return NextResponse.json({ error: 'not_allowed' }, { status: 403 });
  const db = supabaseAdmin();
  const { photoId, action } = (await req.json().catch(() => ({}))) as { photoId?: string; action?: Action };

  if (!photoId) {
    const { data: photos } = await db.from('gallery_photos')
      .select('id, user_id, taken_at, created_at, thumb_path, caption, place, kp, source, status, featured, helpful, reports')
      .or('status.eq.hidden,reports.gt.0').neq('status', 'removed').order('created_at', { ascending: false }).limit(100);
    const ids = (photos ?? []).map(p => p.id);
    const users = [...new Set((photos ?? []).map(p => p.user_id))];
    const [{ data: reports }, { data: members }] = await Promise.all([
      ids.length ? db.from('photo_reports').select('photo_id, reason').in('photo_id', ids) : Promise.resolve({ data: [] as { photo_id: string; reason: string }[] }),
      users.length ? db.from('members').select('user_id, handle').in('user_id', users) : Promise.resolve({ data: [] as { user_id: string; handle: string }[] }),
    ]);
    const handle = new Map((members ?? []).map(m => [m.user_id, m.handle]));
    return NextResponse.json({
      photos: (photos ?? []).map(({ user_id, ...p }) => ({
        ...p, handle: handle.get(user_id) ?? '',
        reasons: (reports ?? []).filter(r => r.photo_id === p.id).map(r => r.reason),
      })),
    });
  }

  const { data: photo } = await db.from('gallery_photos').select('user_id, path, thumb_path').eq('id', photoId).maybeSingle();
  if (!photo) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  if (action === 'restore') {
    await db.from('photo_reports').delete().eq('photo_id', photoId);
    await db.from('gallery_photos').update({ status: 'visible', reports: 0 }).eq('id', photoId);
  } else if (action === 'remove') {
    await db.from('gallery_photos').update({ status: 'removed' }).eq('id', photoId);
    await db.storage.from('gallery').remove([photo.path, photo.thumb_path]);
    await db.rpc('recount_helpful', { p_photo: photoId });
  } else if (action === 'feature' || action === 'unfeature') {
    await db.from('gallery_photos').update({ featured: action === 'feature' }).eq('id', photoId);
    if (action === 'feature') await db.rpc('award', { p_user: photo.user_id, p_kind: 'featured', p_ref: photoId, p_points: 50 });
    await db.rpc('refresh_points', { p_user: photo.user_id });
  } else {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  }
  console.log('gallery moderate', action, photoId.slice(0, 8), 'by', user.id.slice(0, 8));
  return NextResponse.json({ ok: true });
}
