import { NextResponse } from 'next/server';
import { adminFromRequest } from '../../../../lib/adminAuth';
import { supabaseAdmin } from '../../../../lib/billing';
import { BlueskyError } from '../../../../lib/bluesky';
import { authFor, buildPost, postEvent, runDeletions } from '../../../../lib/socialFeed';
import { detectEvents, EVENT_KINDS, pickStyle, sampleEvent, STYLES, type CardStyle, type EventKind, type SocialEvent, type SocialRules } from '../../../../lib/socialEvents';
import { supabaseStore, type SocialSettings, type SocialStore } from '../../../../lib/socialStore';
import { liveDeps, siteOutlooks } from '../../../../lib/socialLive';
import { viewingCandidates } from '../../../../lib/socialViewing';
import type { CardData } from '../../../../lib/socialCard';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const isKind = (k: unknown): k is EventKind => k === 'viewing' || EVENT_KINDS.includes(k as EventKind);

/** What is happening now for each event kind, judged as if every kind were switched on at the chosen levels. */
async function current(rules: SocialRules, now: number) {
  const all: SocialRules = { enabled: true, stormMinG: rules.stormMinG || 1, flareMin: rules.flareMin === 'off' ? 'X' : rules.flareMin, shocks: true, substorms: true };
  const inputs = await liveDeps.inputs({ storm: true, flare: true, shock: true, substorm: true });
  return { inputs, events: detectEvents(inputs, all, now) };
}

/** The live event of `kind` right now (the best viewing candidate for 'viewing'), with its card data. */
async function liveEvent(store: SocialStore, settings: SocialSettings, kind: EventKind, now: number, style: CardStyle): Promise<{ live: SocialEvent | undefined; data: CardData }> {
  if (kind === 'viewing') {
    const { outlooks, card } = await siteOutlooks(await store.sites(), now);
    const live = viewingCandidates(outlooks, now)[0];
    return { live: live && { ...live, style }, data: card };
  }
  const { inputs, events } = await current(settings, now);
  const found = events.find(e => e.kind === kind);
  const live = found && { ...found, style };
  return { live, data: await liveDeps.cardData(live ?? { ...sampleEvent(kind, now), style }, inputs) };
}

/** The requested style if it suits the kind, else the next one in the rotation. */
async function styleFor(store: SocialStore, kind: EventKind, asked: unknown, now: number): Promise<CardStyle> {
  if (STYLES[kind].includes(asked as CardStyle)) return asked as CardStyle;
  return pickStyle(kind, await store.recent(now - 30 * 864e5, 300));
}

/**
 * Automatic posting (administrators only, checked on every request).
 * GET: settings, connection, sites, recent posts and what is happening now. GET ?preview=<kind>: the post exactly
 * as it would go out ({text, alt, image, graphemes}), for the current event of that kind or a marked sample.
 * PATCH: change the rules. POST {kind, text?, alt?}: post the current event of that kind now.
 */
export async function GET(req: Request) {
  if (!(await adminFromRequest(req))) return NextResponse.json({ error: 'not_allowed' }, { status: 403 });
  const store = supabaseStore(supabaseAdmin());
  const settings = await store.settings();
  const now = Date.now();
  const params = new URL(req.url).searchParams;
  const kind = params.get('preview');
  if (kind !== null) {
    if (!isKind(kind)) return NextResponse.json({ error: 'bad_request' }, { status: 400 });
    const style = await styleFor(store, kind, params.get('style'), now);
    const { live, data } = await liveEvent(store, settings, kind, now, style);
    const ev: SocialEvent = live ?? { ...sampleEvent(kind, now), style };
    const built = await buildPost(ev, data, liveDeps.render);
    return NextResponse.json({
      sample: !live, key: live?.key ?? null, style, styles: STYLES[kind], text: built.text, alt: built.alt, graphemes: built.graphemes,
      image: built.card ? `data:${built.card.type};base64,${Buffer.from(built.card.bytes).toString('base64')}` : null,
    });
  }
  const sites = await store.sites();
  const [recent, { events }, outlook] = await Promise.all([
    store.recent(now - 30 * 864e5, 100),
    current(settings, now).catch(() => ({ events: [] as SocialEvent[] })),
    siteOutlooks(sites, now).catch(() => null),
  ]);
  const viewing = outlook ? viewingCandidates(outlook.outlooks, now) : [];
  const { handle, did, service, connectedAt, lastError, updatedAt, ...rules } = settings;
  const posted = (key: string) => recent.some(r => r.key === key && r.status === 'posted');
  // (deleted posts are listed with their status; the region can be posted again)
  return NextResponse.json({
    rules,
    connection: { handle, did, service, connectedAt, lastError, envFallback: !!(process.env.BLUESKY_IDENTIFIER && process.env.BLUESKY_APP_PASSWORD) },
    updatedAt,
    now: [
      ...events.map(e => ({ kind: e.kind, key: e.key, at: e.at, posted: posted(e.key) })),
      ...viewing.slice(0, 1).map(e => ({ kind: e.kind, key: e.key, at: e.at, posted: posted(e.key), site: e.viewing?.site.name, mode: e.viewing?.mode })),
    ],
    sites: sites.map(s => {
      const o = outlook?.outlooks.find(x => x.site.id === s.id);
      return { ...s, level: o?.verdict.level ?? null, score: o?.verdict.score ?? null, best: o?.verdict.window?.from ?? null, tz: o?.tz ?? null };
    }),
    recent,
  });
}

export async function PATCH(req: Request) {
  const admin = await adminFromRequest(req);
  if (!admin) return NextResponse.json({ error: 'not_allowed' }, { status: 403 });
  const b = (await req.json().catch(() => ({}))) as Partial<SocialRules> & { viewingEnabled?: boolean };
  const patch: Record<string, unknown> = {};
  if (typeof b.enabled === 'boolean') patch.events_enabled = b.enabled;
  if (typeof b.stormMinG === 'number' && Number.isInteger(b.stormMinG) && b.stormMinG >= 0 && b.stormMinG <= 5) patch.storm_min_g = b.stormMinG;
  if (b.flareMin === 'X' || b.flareMin === 'M5' || b.flareMin === 'off') patch.flare_min = b.flareMin;
  if (typeof b.shocks === 'boolean') patch.shocks_enabled = b.shocks;
  if (typeof b.substorms === 'boolean') patch.substorms_enabled = b.substorms;
  if (typeof b.viewingEnabled === 'boolean') patch.viewing_enabled = b.viewingEnabled;
  if (!Object.keys(patch).length) return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  await supabaseStore(supabaseAdmin()).updateSettings({ ...patch, updated_by: admin.id });
  return NextResponse.json({ ok: true });
}

export async function POST(req: Request) {
  const admin = await adminFromRequest(req);
  if (!admin) return NextResponse.json({ error: 'not_allowed' }, { status: 403 });
  const b = (await req.json().catch(() => ({}))) as { kind?: string; text?: string; alt?: string; style?: string; action?: string; key?: string };
  const store = supabaseStore(supabaseAdmin());
  const now = Date.now();
  // Delete a post from Bluesky: mark it, then remove it straight away (the cron retries if this fails).
  if (b.action === 'delete') {
    const row = typeof b.key === 'string' ? (await store.recent(now - 90 * 864e5, 500)).find(r => r.key === b.key) : undefined;
    if (!row || (row.status !== 'posted' && row.status !== 'deleting')) return NextResponse.json({ error: 'bad_request' }, { status: 400 });
    await store.finish(row.key, { status: 'deleting' });
    const out = await runDeletions(store, now);
    const failed = out.failed.find(f => f.key === row.key);
    return failed ? NextResponse.json({ error: failed.error }, { status: 502 }) : NextResponse.json({ ok: true });
  }
  if (!isKind(b.kind)) return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  const { live, data } = await liveEvent(store, await store.settings(), b.kind, now, await styleFor(store, b.kind, b.style, now));
  if (!live) return NextResponse.json({ error: 'no_event' }, { status: 409 });
  const session = await authFor(store, now);
  if (!session) return NextResponse.json({ error: 'not_connected' }, { status: 409 });
  // A failed post is retried under its own key; one already posted goes out again under a new key.
  const prior = (await store.recent(now - 7 * 864e5, 300)).find(r => r.key === live.key);
  if (prior?.status === 'failed' || prior?.status === 'deleted') await store.release(live.key);
  const ev = prior?.status === 'posted' || prior?.status === 'posting' ? { ...live, key: `${live.key}#${now}` } : live;
  try {
    const out = await postEvent(store, session, ev, data, liveDeps.render, { now, manual: true, by: admin.id, text: b.text?.trim() || undefined, alt: b.alt?.trim() || undefined });
    if (out.status === 'failed') return NextResponse.json({ error: out.error }, { status: 400 });
    return NextResponse.json({ ...out, repost: ev.key !== live.key });
  } catch (e) {
    return NextResponse.json({ error: e instanceof BlueskyError ? e.error : 'failed' }, { status: 500 });
  }
}
