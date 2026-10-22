import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../lib/billing';
import { notifyPending } from '../../../../lib/moderatorMail';

export const dynamic = 'force-dynamic';

/**
 * Emails the moderators when photos are waiting for approval. Called by the database as soon as a photo is
 * posted (a trigger, through pg_net) and every 15 minutes as a safety net (pg_cron), both with the same
 * Vault key as the alert run. See supabase/migrations/…_gallery_pending_email.sql.
 */
export async function POST(req: Request) {
  const key = req.headers.get('x-alerts-key');
  if (!key) return NextResponse.json({ error: 'unauthorised' }, { status: 401 });
  let admin;
  try { admin = supabaseAdmin(); } catch { return NextResponse.json({ error: 'not_configured' }, { status: 503 }); }
  const { data: ok, error } = await admin.rpc('check_alerts_key', { k: key });
  if (error || ok !== true) return NextResponse.json({ error: 'unauthorised' }, { status: 401 });
  const r = await notifyPending(admin);
  if (r.result !== 'nothing_new') console.log('gallery pending email', JSON.stringify(r));
  return NextResponse.json(r, { status: r.result.startsWith('failed') ? 502 : 200 });
}
