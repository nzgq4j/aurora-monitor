import { NextResponse } from 'next/server';
import { adminFromRequest } from '../../../../lib/adminAuth';
import { supabaseAdmin } from '../../../../lib/billing';
import { BlueskyError } from '../../../../lib/bluesky';
import { authFor, buildPost, postEvent } from '../../../../lib/socialFeed';
import { detectEvents, EVENT_KINDS, sampleEvent, type EventKind, type SocialEvent, type SocialRules } from '../../../../lib/socialEvents';
import { supabaseStore } from '../../../../lib/socialStore';
import { liveDeps } from '../../../../lib/socialLive';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const isKind = (k: unknown): k is EventKind => EVENT_KINDS.includes(k as EventKind);

/** What is happening now for each kind, judged as if every kind were switched on at the chosen levels. */
async function current(rules: SocialRules, now: number) {
  const all: SocialRules = { enabled: true, stormMinG: rules.stormMinG || 1, flareMin: rules.flareMin === 'off' ? 'X' : rules.flareMin, shocks: true, substorms: true };
  const inputs = await liveDeps.inputs({ storm: true, flare: true, shock: true, substorm: true });
  return { inputs, events: detectEvents(inputs, all, now) };
}

/**
 * The automatic event feed (administrators only, checked on every request).
 * GET: settings, connection, recent posts and what is happening now. GET ?preview=<kind>: the post exactly as it
 * would go out ({text, alt, image, graphemes}), for the current event of that kind or a marked sample.
 * PATCH: change the rules. POST {kind, text?, alt?}: post the current event of that kind now.
 */
export async function GET(req: Request) {
  if (!(await adminFromRequest(req))) return NextResponse.json({ error: 'not_allowed' }, { status: 403 });
  const store = supabaseStore(supabaseAdmin());
  const settings = await store.settings();
  const now = Date.now();
  const kind = new URL(req.url).searchParams.get('preview');
  if (kind !== null) {
    if (!isKind(kind)) return NextResponse.json({ error: 'bad_request' }, { status: 400 });
    const { inputs, events } = await current(settings, now);
    const live = events.find(e => e.kind === kind);
    const ev: SocialEvent = live ?? sampleEvent(kind, now);
    const built = await buildPost(ev, await liveDeps.cardData(ev, inputs), liveDeps.render);
    return NextResponse.json({
      sample: !live, key: live?.key ?? null, text: built.text, alt: built.alt, graphemes: built.graphemes,
      image: built.card ? `data:${built.card.type};base64,${Buffer.from(built.card.bytes).toString('base64')}` : null,
    });
  }
  const [recent, { events }] = await Promise.all([store.recent(now - 30 * 864e5, 100), current(settings, now).catch(() => ({ events: [] as SocialEvent[] }))]);
  const { handle, did, service, connectedAt, lastError, updatedAt, ...rules } = settings;
  return NextResponse.json({
    rules,
    connection: { handle, did, service, connectedAt, lastError, envFallback: !!(process.env.BLUESKY_IDENTIFIER && process.env.BLUESKY_APP_PASSWORD) },
    updatedAt,
    now: events.map(e => ({ kind: e.kind, key: e.key, at: e.at, posted: recent.some(r => r.key === e.key && r.status === 'posted') })),
    recent,
  });
}

export async function PATCH(req: Request) {
  const admin = await adminFromRequest(req);
  if (!admin) return NextResponse.json({ error: 'not_allowed' }, { status: 403 });
  const b = (await req.json().catch(() => ({}))) as Partial<SocialRules>;
  const patch: Record<string, unknown> = {};
  if (typeof b.enabled === 'boolean') patch.events_enabled = b.enabled;
  if (typeof b.stormMinG === 'number' && Number.isInteger(b.stormMinG) && b.stormMinG >= 0 && b.stormMinG <= 5) patch.storm_min_g = b.stormMinG;
  if (b.flareMin === 'X' || b.flareMin === 'M5' || b.flareMin === 'off') patch.flare_min = b.flareMin;
  if (typeof b.shocks === 'boolean') patch.shocks_enabled = b.shocks;
  if (typeof b.substorms === 'boolean') patch.substorms_enabled = b.substorms;
  if (!Object.keys(patch).length) return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  await supabaseStore(supabaseAdmin()).updateSettings({ ...patch, updated_by: admin.id });
  return NextResponse.json({ ok: true });
}

export async function POST(req: Request) {
  const admin = await adminFromRequest(req);
  if (!admin) return NextResponse.json({ error: 'not_allowed' }, { status: 403 });
  const b = (await req.json().catch(() => ({}))) as { kind?: string; text?: string; alt?: string };
  if (!isKind(b.kind)) return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  const store = supabaseStore(supabaseAdmin());
  const now = Date.now();
  const { inputs, events } = await current(await store.settings(), now);
  const live = events.find(e => e.kind === b.kind);
  if (!live) return NextResponse.json({ error: 'no_event' }, { status: 409 });
  const session = await authFor(store, now);
  if (!session) return NextResponse.json({ error: 'not_connected' }, { status: 409 });
  // A failed post is retried under its own key; one already posted goes out again under a new key.
  const prior = (await store.recent(now - 7 * 864e5, 200)).find(r => r.key === live.key);
  if (prior?.status === 'failed') await store.release(live.key);
  const ev = prior?.status === 'posted' || prior?.status === 'posting' ? { ...live, key: `${live.key}#${now}` } : live;
  try {
    const out = await postEvent(store, session, ev, await liveDeps.cardData(ev, inputs), liveDeps.render, { now, manual: true, by: admin.id, text: b.text?.trim() || undefined, alt: b.alt?.trim() || undefined });
    if (out.status === 'failed') return NextResponse.json({ error: out.error }, { status: 400 });
    return NextResponse.json({ ...out, repost: ev.key !== live.key });
  } catch (e) {
    return NextResponse.json({ error: e instanceof BlueskyError ? e.error : 'failed' }, { status: 500 });
  }
}
