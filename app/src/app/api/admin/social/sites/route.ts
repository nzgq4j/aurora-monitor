import { NextResponse } from 'next/server';
import { adminFromRequest } from '../../../../../lib/adminAuth';
import { supabaseAdmin } from '../../../../../lib/billing';
import { supabaseStore } from '../../../../../lib/socialStore';

export const dynamic = 'force-dynamic';

/**
 * Sites for viewing outlooks (administrators only, checked on every request).
 * POST {action: 'add', name, lat, lon, tags?} adds one; {action: 'remove', id} removes one.
 */
export async function POST(req: Request) {
  const admin = await adminFromRequest(req);
  if (!admin) return NextResponse.json({ error: 'not_allowed' }, { status: 403 });
  const store = supabaseStore(supabaseAdmin());
  const b = (await req.json().catch(() => ({}))) as { action?: string; id?: string; name?: string; lat?: number; lon?: number; tags?: string };
  if (b.action === 'add') {
    const name = (b.name ?? '').trim().slice(0, 80), tags = (b.tags ?? '').trim().slice(0, 80);
    const ok = name && typeof b.lat === 'number' && typeof b.lon === 'number' && Math.abs(b.lat) <= 90 && Math.abs(b.lon) <= 180;
    if (!ok) return NextResponse.json({ error: 'bad_request' }, { status: 400 });
    // Hashtags only: words starting with #, letters/digits/underscore.
    const clean = tags.split(/\s+/).filter(t => /^#[\p{L}\p{N}_]+$/u.test(t)).join(' ');
    const site = await store.addSite({ name, lat: b.lat!, lon: b.lon!, tags: clean }, admin.id);
    return NextResponse.json({ site });
  }
  if (b.action === 'remove' && typeof b.id === 'string' && /^[0-9a-f-]{36}$/i.test(b.id)) {
    await store.removeSite(b.id);
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ error: 'bad_request' }, { status: 400 });
}
