import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../lib/billing';
import { runAlerts } from '../../../../lib/alertEngine';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Called every 10 minutes by Supabase pg_cron (see supabase/migrations/…_alert_engine.sql). The key it
 * sends lives only in Supabase Vault; it's checked there through check_alerts_key().
 */
export async function POST(req: Request) {
  const key = req.headers.get('x-alerts-key');
  if (!key) return NextResponse.json({ error: 'unauthorised' }, { status: 401 });
  let admin;
  try { admin = supabaseAdmin(); } catch { return NextResponse.json({ error: 'not_configured' }, { status: 503 }); }
  const { data: ok, error } = await admin.rpc('check_alerts_key', { k: key });
  if (error || ok !== true) return NextResponse.json({ error: 'unauthorised' }, { status: 401 });
  try {
    const summary = await runAlerts(admin);
    console.log('alerts run', JSON.stringify(summary));
    return NextResponse.json(summary);
  } catch (e) {
    console.error('alerts run failed', e);
    return NextResponse.json({ error: 'run_failed' }, { status: 500 });
  }
}
