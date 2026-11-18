import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../lib/billing';
import { runDeletions, runEventFeed } from '../../../../lib/socialFeed';
import { supabaseStore } from '../../../../lib/socialStore';
import { liveDeps, viewingDeps } from '../../../../lib/socialLive';
import { runViewingFeed } from '../../../../lib/socialViewing';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Called every minute by Supabase pg_cron (supabase/migrations/…_social_posting.sql) with a single-use ticket:
 * pg_cron inserts a row in private.cron_tickets and sends its token, and consume_cron_ticket() deletes it if
 * it is under 2 minutes old. A replayed or made-up ticket gets 403. The feeds return a status, never throw.
 * The event feed runs every minute; viewing outlooks every 10 minutes (Open-Meteo's free tier allows about
 * 10,000 cloud forecasts a day).
 */
export async function POST(req: Request) {
  const ticket = req.headers.get('x-cron-ticket');
  if (!ticket || !/^[0-9a-f-]{36}$/i.test(ticket)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  let db;
  try { db = supabaseAdmin(); } catch { return NextResponse.json({ error: 'not_configured' }, { status: 503 }); }
  const { data: ok, error } = await db.rpc('consume_cron_ticket', { t: ticket });
  if (error || ok !== true) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const store = supabaseStore(db);
  const viewingDue = new Date().getUTCMinutes() % 10 === 5;
  const [events, viewing, deletions] = await Promise.all([
    runEventFeed(store, liveDeps),
    viewingDue ? runViewingFeed(store, viewingDeps) : Promise.resolve(null),
    runDeletions(store),
  ]);
  if (deletions.deleted.length || deletions.failed.length || !deletions.ok) console.log('social deletions', JSON.stringify(deletions));
  if (events.outcomes?.length || !events.ok) console.log('social feed', JSON.stringify(events));
  if (viewing && (viewing.outcome || !viewing.ok)) console.log('viewing feed', JSON.stringify(viewing));
  return NextResponse.json({ events, ...(viewing ? { viewing } : {}), ...(deletions.deleted.length || deletions.failed.length ? { deletions } : {}) });
}
