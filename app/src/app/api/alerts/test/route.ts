import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../lib/billing';
import { sendTestAlert } from '../../../../lib/alertEngine';

export const dynamic = 'force-dynamic';

/**
 * Sends a labelled test alert to one account: POST { userId } with the same x-alerts-key as the
 * scheduled run (held only in Supabase Vault, checked with check_alerts_key()). Returns each channel's
 * outcome, e.g. { email: 'sent', push: 'sent' }.
 */
export async function POST(req: Request) {
  const key = req.headers.get('x-alerts-key');
  if (!key) return NextResponse.json({ error: 'unauthorised' }, { status: 401 });
  let admin;
  try { admin = supabaseAdmin(); } catch { return NextResponse.json({ error: 'not_configured' }, { status: 503 }); }
  const { data: ok, error } = await admin.rpc('check_alerts_key', { k: key });
  if (error || ok !== true) return NextResponse.json({ error: 'unauthorised' }, { status: 401 });
  const { userId } = await req.json().catch(() => ({})) as { userId?: string };
  if (!userId || !/^[0-9a-f-]{36}$/i.test(userId)) return NextResponse.json({ error: 'userId required' }, { status: 400 });
  const result = await sendTestAlert(admin, userId);
  console.log('test alert', userId.slice(0, 8), JSON.stringify(result));
  return NextResponse.json(result);
}
