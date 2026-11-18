import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../lib/billing';
import { runEventFeed } from '../../../../lib/socialFeed';
import { supabaseStore } from '../../../../lib/socialStore';
import { liveDeps } from '../../../../lib/socialLive';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Called every minute by Supabase pg_cron (supabase/migrations/…_social_posting.sql) with a single-use ticket:
 * pg_cron inserts a row in private.cron_tickets and sends its token, and consume_cron_ticket() deletes it if
 * it is under 2 minutes old. A replayed or made-up ticket gets 403. The feed returns a status, never throws.
 */
export async function POST(req: Request) {
  const ticket = req.headers.get('x-cron-ticket');
  if (!ticket || !/^[0-9a-f-]{36}$/i.test(ticket)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  let db;
  try { db = supabaseAdmin(); } catch { return NextResponse.json({ error: 'not_configured' }, { status: 503 }); }
  const { data: ok, error } = await db.rpc('consume_cron_ticket', { t: ticket });
  if (error || ok !== true) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const events = await runEventFeed(supabaseStore(db), liveDeps);
  if (events.outcomes?.length || !events.ok) console.log('social feed', JSON.stringify(events));
  return NextResponse.json({ events });
}
