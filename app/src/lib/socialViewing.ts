/**
 * Viewing outlooks for Bluesky: posts about aurora viewing at chosen sites around the world (social_sites).
 * Uses the same hourly score as the Tonight page and place alerts (lib/tonight: aurora, darkness, cloud, moon).
 *
 * Rules:
 * - "Visible now" when a site's score now is 50 or more (Tonight's "go now"); "tonight" when the best hour in
 *   the next 12 scores 50 or more and starts at least 30 minutes ahead (Tonight's "go later").
 * - Sites within 150 km count as one region; the best site in the region is named.
 * - At most one post per region per night (the site's local night), at most 4 viewing posts per UTC day,
 *   at least 2 hours apart, at most one per run. "Visible now" goes before "tonight", then the higher score.
 */

import type { HourScore, Verdict } from './tonight';
import type { EventPostRow, SocialStore } from './socialStore';
import type { Session } from './bluesky';
import { postEvent, type FeedDeps, type PostOutcome } from './socialFeed';
import type { CardData } from './socialCard';
import { pickStyle, type SocialEvent, type ViewingSite } from './socialEvents';

export const REGION_KM = 150;
export const DAILY_CAP = 4;
export const GAP_MS = 2 * 36e5;
const GOOD = 50;

export function distanceKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const r = Math.PI / 180, dLat = (b.lat - a.lat) * r, dLon = (b.lon - a.lon) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Sites grouped into regions: any two sites within `km` of each other share a region (chained). */
export function groupRegions<T extends { lat: number; lon: number }>(sites: T[], km = REGION_KM): T[][] {
  const parent = sites.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  for (let i = 0; i < sites.length; i++) for (let j = i + 1; j < sites.length; j++) {
    if (distanceKm(sites[i], sites[j]) <= km) parent[find(i)] = find(j);
  }
  const groups = new Map<number, T[]>();
  sites.forEach((s, i) => { const k = find(i); groups.set(k, [...(groups.get(k) ?? []), s]); });
  return [...groups.values()];
}

/** The site's night as a local date: the date 12 hours earlier, so a night after midnight counts with its evening. */
export function nightKey(now: number, tz: string | null, lon: number): string {
  const t = now - 12 * 36e5;
  try {
    if (tz) return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(t);
  } catch { /* unknown zone: fall back to solar time */ }
  return new Date(t + (lon / 15) * 36e5).toISOString().slice(0, 10);
}

export interface SiteOutlook {
  site: ViewingSite;
  hours: HourScore[];
  verdict: Verdict;
  need: number;
  tz: string | null;
}

/** One candidate per region where viewing is good now or later tonight, best first. */
export function viewingCandidates(outlooks: SiteOutlook[], now: number): SocialEvent[] {
  const out: (SocialEvent & { rank: number })[] = [];
  for (const region of groupRegions(outlooks.map(o => ({ ...o, lat: o.site.lat, lon: o.site.lon })))) {
    type Pick = { o: SiteOutlook; mode: 'now' | 'tonight'; score: number; at: number };
    const scored = region.flatMap((o): Pick[] => {
      const v = o.verdict;
      if (v.level === 'goNow' && v.score >= GOOD) return [{ o, mode: 'now', score: v.score, at: now }];
      if (v.level === 'goLater' && v.score >= GOOD && v.window && v.best.t >= now + 30 * 6e4) return [{ o, mode: 'tonight', score: v.score, at: v.best.t }];
      return [];
    }).sort((a, b) => (a.mode === b.mode ? b.score - a.score : a.mode === 'now' ? -1 : 1));
    const top = scored[0];
    if (!top) continue;
    const regionId = region.map(r => r.site.id).sort()[0];
    const { o } = top;
    out.push({
      kind: 'viewing', key: `viewing:${regionId}:${nightKey(now, o.tz, o.site.lon)}`, at: top.mode === 'now' ? now : top.at,
      rank: (top.mode === 'now' ? 1000 : 0) + top.score,
      viewing: {
        site: o.site, mode: top.mode, score: top.score, window: o.verdict.window, tz: o.tz,
        kp: (top.mode === 'now' ? o.hours[0] : o.verdict.best).kp, need: o.need,
        cloud: (top.mode === 'now' ? o.hours[0] : o.verdict.best).cloud === null ? null : Math.round((top.mode === 'now' ? o.hours[0] : o.verdict.best).cloud!),
        look: o.verdict.look, hours: o.hours.map(h => ({ t: h.t, score: h.score })),
        nearby: region.filter(r => r.site.id !== o.site.id).map(r => r.site.name),
      },
    });
  }
  return out.sort((a, b) => b.rank - a.rank).map(({ rank: _rank, ...ev }) => ev); // eslint-disable-line @typescript-eslint/no-unused-vars -- drop the sort key
}

/** Whether another viewing post may go out now: under the daily cap and at least 2 hours after the last. */
export function viewingBudget(recent: Pick<EventPostRow, 'kind' | 'status' | 'created_at'>[], now: number): { ok: true } | { ok: false; reason: 'daily_cap' | 'too_soon' } {
  const posts = recent.filter(r => r.kind === 'viewing' && r.status !== 'failed' && r.status !== 'deleted' && r.status !== 'deleting').map(r => Date.parse(r.created_at));
  const day = new Date(now).toISOString().slice(0, 10);
  if (posts.filter(t => new Date(t).toISOString().slice(0, 10) === day).length >= DAILY_CAP) return { ok: false, reason: 'daily_cap' };
  if (posts.some(t => t > now - GAP_MS)) return { ok: false, reason: 'too_soon' };
  return { ok: true };
}

export interface ViewingDeps {
  outlooks: (sites: ViewingSite[], now: number) => Promise<{ outlooks: SiteOutlook[]; card: CardData }>;
  render: FeedDeps['render'];
  auth: (store: SocialStore, now: number) => Promise<Session | null>;
  now?: () => number;
}

export interface ViewingStatus { ok: boolean; skipped?: 'off' | 'no_sites' | 'not_connected' | 'daily_cap' | 'too_soon'; candidates?: string[]; outcome?: PostOutcome; error?: string }

/** One run of the viewing feed. Never throws. */
export async function runViewingFeed(store: SocialStore, deps: ViewingDeps): Promise<ViewingStatus> {
  const now = deps.now?.() ?? Date.now();
  try {
    const settings = await store.settings();
    if (!settings.viewingEnabled) return { ok: true, skipped: 'off' };
    const sites = await store.sites();
    if (!sites.length) return { ok: true, skipped: 'no_sites' };
    const recent = await store.recent(now - 3 * 864e5, 300);
    const budget = viewingBudget(recent, now);
    if (!budget.ok) return { ok: true, skipped: budget.reason };
    const { outlooks, card } = await deps.outlooks(sites, now);
    // A region posted (or failed) tonight is done; one whose post was deleted can go out again.
    const candidates = viewingCandidates(outlooks, now).filter(ev => !recent.some(r => r.key === ev.key && r.status !== 'deleted'));
    if (!candidates.length) return { ok: true, candidates: [] };
    const session = await deps.auth(store, now);
    if (!session) return { ok: true, skipped: 'not_connected', candidates: candidates.map(c => c.key) };
    const ev = { ...candidates[0], style: pickStyle('viewing', recent) };
    if (recent.some(r => r.key === ev.key && r.status === 'deleted')) await store.release(ev.key);
    const outcome = await postEvent(store, session, ev, card, deps.render, { now });
    return { ok: true, candidates: candidates.map(c => c.key), outcome };
  } catch (e) {
    console.error('viewing feed failed', e);
    return { ok: false, error: String((e as Error).message ?? e).slice(0, 300) };
  }
}
