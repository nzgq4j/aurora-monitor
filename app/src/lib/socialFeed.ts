/**
 * The automatic event feed for Bluesky, run every minute by /api/cron/social, and the shared pieces the
 * admin page uses (connection, preview, Post now). Every step returns a status object; nothing throws out
 * of runEventFeed, so a posting problem never breaks the cron route.
 */

import { BlueskyError, createSession, expiresSoon, graphemes, publish, refreshSession, type Session } from './bluesky';
import { detectEvents, eventPostText, IMAGE_WAIT_MS, isRepeat, pickStyle, type EventInputs, type SocialEvent } from './socialEvents';
import type { SocialStore } from './socialStore';
import type { Card, CardData } from './socialCard';

export interface FeedDeps {
  /** Live inputs for the rules (only the feeds a switched-on rule needs). */
  inputs: (need: { storm: boolean; flare: boolean; shock: boolean; substorm: boolean }) => Promise<EventInputs>;
  /** Extra data the cards need (the aurora oval). */
  cardData: (ev: SocialEvent, inputs: EventInputs) => Promise<CardData>;
  render: (ev: SocialEvent, data: CardData) => Promise<Card>;
  now?: () => number;
}

/** At most this many posts per run, biggest news first. */
const PER_RUN = 2;
const PRIORITY: Record<SocialEvent['kind'], number> = { storm: 0, flare: 1, shock: 2, substorm: 3, viewing: 4 };

/** A session that works now: the stored one (refreshed when it expires within 5 minutes), else the env account. */
export async function authFor(store: SocialStore, now = Date.now()): Promise<Session | null> {
  let s = await store.session();
  if (s && expiresSoon(s, now)) {
    try {
      s = await refreshSession(s);
      await store.saveSession(s); // the refresh token rotates: keep the new pair
    } catch (e) {
      const code = e instanceof BlueskyError ? e.error : 'unreachable';
      // A network hiccup keeps the session for next time; a refused refresh means signing in again.
      if (code !== 'unreachable') await store.updateSettings({ last_error: `session_expired:${code}` });
      s = null;
    }
  }
  if (s) return s;
  const id = process.env.BLUESKY_IDENTIFIER, pw = process.env.BLUESKY_APP_PASSWORD;
  if (id && pw) {
    try { return await createSession(id, pw, process.env.BLUESKY_SERVICE); } catch { return null; }
  }
  return null;
}

export interface BuiltPost { text: string; alt: string | null; card: Card | null; graphemes: number }

/** The post exactly as it would be published: text, card and alt text. `card` is null if drawing failed. */
export async function buildPost(ev: SocialEvent, data: CardData, render: FeedDeps['render']): Promise<BuiltPost> {
  const text = eventPostText(ev);
  let card: Card | null = null;
  try { card = await render(ev, data); } catch (e) { console.error('social card failed', ev.key, e); }
  return { text, alt: card?.alt ?? null, card, graphemes: graphemes(text) };
}

export type PostOutcome = { key: string; status: 'posted'; url: string } | { key: string; status: 'failed'; error: string } | { key: string; status: 'waiting' | 'taken' };

/**
 * Claim the event, draw its card and publish. Claim first, so overlapping runs never double-post. Without a
 * card the event waits (claim released) until IMAGE_WAIT_MS after it happened, then goes out as text only.
 */
export async function postEvent(store: SocialStore, session: Session, ev: SocialEvent, data: CardData, render: FeedDeps['render'], opts: { now: number; manual?: boolean; by?: string | null; text?: string; alt?: string }): Promise<PostOutcome> {
  const claimed = await store.claim({ key: ev.key, kind: ev.kind, event_at: new Date(ev.at).toISOString(), data: ev, manual: !!opts.manual, posted_by: opts.by ?? null });
  if (!claimed) return { key: ev.key, status: 'taken' };
  const built = await buildPost(ev, data, render);
  if (!built.card && !opts.manual && opts.now - ev.at < IMAGE_WAIT_MS) {
    await store.release(ev.key);
    return { key: ev.key, status: 'waiting' };
  }
  const text = opts.text ?? built.text;
  const alt = built.card ? (opts.alt ?? built.alt ?? '') : null;
  try {
    const r = await publish(session, text, { lang: 'en', now: opts.now, image: built.card ? { bytes: built.card.bytes, type: built.card.type, alt: alt!, width: built.card.width, height: built.card.height } : null });
    await store.finish(ev.key, { status: 'posted', post_uri: r.uri, post_url: r.url, text, alt, image: !!built.card, error: null });
    return { key: ev.key, status: 'posted', url: r.url };
  } catch (e) {
    const error = e instanceof BlueskyError ? e.error : String((e as Error).message ?? e).slice(0, 200);
    // Failed posts are not retried automatically (that risks repeats); Post now in the admin page retries.
    await store.finish(ev.key, { status: 'failed', error, text, alt, image: !!built.card });
    return { key: ev.key, status: 'failed', error };
  }
}

export interface FeedStatus { ok: boolean; skipped?: 'off' | 'not_connected' | 'no_data'; events?: string[]; outcomes?: PostOutcome[]; error?: string }

/** One run of the automatic feed. Never throws. */
export async function runEventFeed(store: SocialStore, deps: FeedDeps): Promise<FeedStatus> {
  const now = deps.now?.() ?? Date.now();
  try {
    const rules = await store.settings();
    if (!rules.enabled) return { ok: true, skipped: 'off' };
    const inputs = await deps.inputs({ storm: rules.stormMinG > 0, flare: rules.flareMin !== 'off', shock: rules.shocks, substorm: rules.substorms });
    const events = detectEvents(inputs, rules, now);
    if (!events.length) return { ok: true, events: [] };
    const recent = await store.recent(now - 24 * 36e5, 200);
    const live = recent.filter(r => r.status !== 'failed');
    // Failed keys are not retried automatically either.
    const fresh = events.filter(ev => !isRepeat(ev, live, now) && !recent.some(r => r.key === ev.key))
      .sort((a, b) => PRIORITY[a.kind] - PRIORITY[b.kind]).slice(0, PER_RUN);
    if (!fresh.length) return { ok: true, events: events.map(e => e.key) };
    const session = await authFor(store, now);
    if (!session) return { ok: true, skipped: 'not_connected', events: fresh.map(e => e.key) };
    const outcomes: PostOutcome[] = [];
    for (const ev of fresh) {
      try {
        ev.style = pickStyle(ev.kind, recent);
        outcomes.push(await postEvent(store, session, ev, await deps.cardData(ev, inputs), deps.render, { now }));
      } catch (e) {
        outcomes.push({ key: ev.key, status: 'failed', error: String((e as Error).message ?? e).slice(0, 200) });
      }
    }
    return { ok: true, events: events.map(e => e.key), outcomes };
  } catch (e) {
    console.error('social feed failed', e);
    return { ok: false, error: String((e as Error).message ?? e).slice(0, 300) };
  }
}
