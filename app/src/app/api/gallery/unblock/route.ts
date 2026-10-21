import { NextResponse } from 'next/server';
import { supabaseAdmin, userFromRequest } from '../../../../lib/billing';

export const dynamic = 'force-dynamic';

/** Unblock a member, by their gallery name. */
export async function POST(req: Request) {
  const user = await userFromRequest(req);
  if (!user) return NextResponse.json({ error: 'signed_out' }, { status: 401 });
  const { handle } = (await req.json().catch(() => ({}))) as { handle?: string };
  if (!handle) return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  const db = supabaseAdmin();
  const { data: m } = await db.from('members').select('user_id').eq('handle', handle).maybeSingle();
  if (m) await db.from('member_blocks').delete().eq('user_id', user.id).eq('blocked_id', m.user_id);
  return NextResponse.json({ ok: true });
}
