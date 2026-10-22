import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../lib/billing';
import { runAlerts } from '../../../../lib/alertEngine';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** Run records kept this long (alert_runs). */
const KEEP_DAYS = 14;

/**
 * Called every 10 minutes by Supabase pg_cron (see supabase/migrations/…_alert_engine.sql). The key it
 * sends lives only in Supabase Vault; it's checked there through check_alerts_key(). Every run is recorded
 * in alert_runs, including runs that fail, so a quiet outage shows up there.
 */
export async function POST(req: Request) {
  const key = req.headers.get('x-alerts-key');
  if (!key) return NextResponse.json({ error: 'unauthorised' }, { status: 401 });
  let admin;
  try { admin = supabaseAdmin(); } catch { return NextResponse.json({ error: 'not_configured' }, { status: 503 }); }
  const { data: ok, error } = await admin.rpc('check_alerts_key', { k: key });
  if (error || ok !== true) return NextResponse.json({ error: 'unauthorised' }, { status: 401 });
  const started = Date.now();
  const record = async (row: { ok: boolean; summary?: object; error?: string }) => {
    const { error: e } = await admin.from('alert_runs').insert({ ...row, ms: Date.now() - started });
    if (e) console.error('alerts run: record failed', e.message);
    await admin.from('alert_runs').delete().lt('ran_at', new Date(Date.now() - KEEP_DAYS * 864e5).toISOString());
  };
  try {
    const summary = await runAlerts(admin);
    console.log('alerts run', JSON.stringify(summary));
    await record({ ok: summary.feedsOk && summary.deferred === 0, summary });
    return NextResponse.json(summary);
  } catch (e) {
    console.error('alerts run failed', e);
    await record({ ok: false, error: String((e as Error).message ?? e).slice(0, 500) });
    return NextResponse.json({ error: 'run_failed' }, { status: 500 });
  }
}
