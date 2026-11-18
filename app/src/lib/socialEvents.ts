/**
 * Automatic Bluesky posts: which space-weather events are worth a post, and the post text for each.
 * Pure functions (no I/O), so the rules and the text limits are unit-tested (socialEvents.test.ts).
 *
 * Rules, all from observed data only (never forecasts):
 * - storm: Kp (observed/estimated, last 3 h) or GFZ Hp30 (last 90 min) reaches the minimum G level.
 *   Posted again only when it climbs to a higher G level, or after 24 h.
 * - flare: GOES X-ray flux reaches the minimum class (X1, or M5 if chosen). One post per flare.
 * - shock: a solar-wind shock passes L1 (speed up 50 km/s and density or field up by half). One per 6 h.
 * - substorm: auroral power in a hemisphere at least doubles to 30 GW or more. Off by default; one per 3 h.
 * An event first crossed more than 30 minutes ago is never posted, so switching the feed on posts no backlog.
 */

import { powerJump, shockArrival } from './alerts';
import { graphemes, MAX_GRAPHEMES } from './bluesky';

export type EventKind = 'storm' | 'flare' | 'shock' | 'substorm' | 'viewing';
/** The space-weather kinds the event feed detects; 'viewing' (site outlooks) has its own feed (socialViewing). */
export const EVENT_KINDS: EventKind[] = ['storm', 'flare', 'shock', 'substorm'];

export interface SocialRules {
  enabled: boolean;
  /** Minimum NOAA G level for storm posts (1–5); 0 turns storm posts off. */
  stormMinG: number;
  /** Minimum flare class: 'X' (X1+), 'M5' (M5+), or 'off'. */
  flareMin: 'X' | 'M5' | 'off';
  shocks: boolean;
  substorms: boolean;
}
export const DEFAULT_SOCIAL_RULES: SocialRules = { enabled: false, stormMinG: 1, flareMin: 'X', shocks: true, substorms: false };

export interface SocialEvent {
  kind: EventKind;
  /** Unique per event: the claim key in social_event_posts. */
  key: string;
  /** When the event crossed the posting threshold (ms). */
  at: number;
  /** storm */
  g?: number; kp?: number;
  /** flare: peak flux so far (W/m²) and its class, e.g. "X1.2" */
  flux?: number; cls?: string;
  /** shock: wind speed before and after (km/s); substorm: power before and after (GW) */
  from?: number; to?: number;
  hemi?: 'north' | 'south';
  /** viewing: the site, now or later tonight, its score (0–100) and best window, and what the sky needs */
  viewing?: Viewing;
  /** The picture style for this post (rotates per kind, see STYLES). */
  style?: CardStyle;
}

/** Picture styles: the data card, a globe, a regional map (viewing), or a real image of the Sun (flare, shock). */
export type CardStyle = 'card' | 'globe' | 'map' | 'sun';
export const STYLES: Record<EventKind, CardStyle[]> = {
  storm: ['card', 'globe'], flare: ['card', 'sun'], shock: ['card', 'sun'], substorm: ['card', 'globe'], viewing: ['card', 'map', 'globe'],
};
/** The next style for `kind`: the one after the style of its most recent post, so posts alternate. */
export function pickStyle(kind: EventKind, recent: { kind: string; status: string; created_at: string; data: Partial<SocialEvent> | null }[]): CardStyle {
  const list = STYLES[kind];
  const last = recent.filter(r => r.kind === kind && r.status !== 'failed' && r.status !== 'deleted').sort((a, b) => b.created_at.localeCompare(a.created_at))[0]?.data?.style;
  const i = last ? list.indexOf(last) : -1;
  return list[(i + 1) % list.length];
}

/** A stable pick from `options` for this event, so wording varies between posts but a preview matches the post. */
export function variant<T>(key: string, options: T[]): T {
  let h = 2166136261;
  for (const ch of key) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return options[(h >>> 0) % options.length];
}

export interface ViewingSite { id: string; name: string; lat: number; lon: number; tags: string }
export interface Viewing {
  site: ViewingSite;
  mode: 'now' | 'tonight';
  score: number;
  /** Run of good hours (ms), local to the site via `tz`. */
  window: { from: number; to: number } | null;
  /** IANA time zone of the site (from the cloud forecast); null → times in UTC. */
  tz: string | null;
  kp: number | null;
  need: number;
  cloud: number | null;
  look: 'low' | 'high' | 'overhead';
  /** The next 12 hours' scores, for the card. */
  hours: { t: number; score: number }[];
  /** Names of the other sites grouped with this one (within ~150 km). */
  nearby: string[];
}

/** An event older than this when first seen is never posted. */
export const MAX_AGE_MS = 30 * 6e4;
/** Without an image after this long, the event is posted as text only. */
export const IMAGE_WAIT_MS = 15 * 6e4;

export const G_NAME = ['', 'minor', 'moderate', 'strong', 'severe', 'extreme'] as const;
/** NOAA G level for a Kp value: Kp 5 → G1 … Kp 9 → G5 (0 below Kp 5). */
export const gLevel = (kp: number) => (kp >= 5 ? Math.min(5, Math.floor(kp + 1e-9) - 4) : 0);

/** Flare class from flux in W/m²: 1.2e-4 → "X1.2", 5.4e-5 → "M5.4". */
export function flareClass(flux: number): string {
  const scale: [string, number][] = [['X', 1e-4], ['M', 1e-5], ['C', 1e-6], ['B', 1e-7], ['A', 1e-8]];
  const [l, base] = scale.find(([, b]) => flux >= b) ?? scale[scale.length - 1];
  return `${l}${(Math.floor((flux / base) * 10 + 1e-9) / 10).toFixed(1)}`;
}
const FLARE_THRESHOLD = { X: 1e-4, M5: 5e-5 } as const;

export interface EventInputs {
  kp: { t: number; kp: number; kind: string }[];
  hp30: { t: number; hp: number }[];
  xrays: { t: number; flux: number }[];
  wind: { t: number; speed: number | null; density: number | null; bt: number | null }[];
  power: { observed: number; north: number; south: number }[];
}

const isoMinute = (t: number) => new Date(t).toISOString().slice(0, 16);
const utcDay = (t: number) => new Date(t).toISOString().slice(0, 10);

/** The storm now: the highest observed/estimated Kp in the last 3 h, or Hp30 in the last 90 min. */
export function stormNow(inp: Pick<EventInputs, 'kp' | 'hp30'>, now: number): { kp: number; t: number } | null {
  const pts = [
    ...inp.kp.filter(p => p.kind !== 'predicted' && p.t >= now - 3 * 36e5 && p.t <= now).map(p => ({ kp: p.kp, t: p.t })),
    ...inp.hp30.filter(p => p.t >= now - 90 * 6e4 && p.t <= now).map(p => ({ kp: p.hp, t: p.t })),
  ];
  if (!pts.length) return null;
  return pts.reduce((a, b) => (b.kp > a.kp || (b.kp === a.kp && b.t > a.t) ? b : a));
}

/** The flare in progress: the run of 1-minute flux at or above M1 that includes the newest point. */
export function flareNowRun(xrays: EventInputs['xrays'], now: number): { start: number; peak: number; peakAt: number; points: EventInputs['xrays'] } | null {
  const pts = [...xrays].filter(p => p.t <= now + 6e4).sort((a, b) => a.t - b.t);
  const last = pts[pts.length - 1];
  if (!last || now - last.t > 15 * 6e4 || last.flux < 1e-5) return null;
  let i = pts.length - 1;
  while (i > 0 && pts[i - 1].flux >= 1e-5 && pts[i].t - pts[i - 1].t <= 5 * 6e4) i--;
  const run = pts.slice(i);
  const top = run.reduce((a, b) => (b.flux > a.flux ? b : a));
  return { start: run[0].t, peak: top.flux, peakAt: top.t, points: run };
}

/** Events worth a post now under `rules`. Recent-post checks (de-duplication) are in socialFeed. */
export function detectEvents(inp: EventInputs, rules: SocialRules, now: number): SocialEvent[] {
  const out: SocialEvent[] = [];
  if (rules.stormMinG > 0) {
    const s = stormNow(inp, now);
    const g = s ? gLevel(s.kp) : 0;
    if (s && g >= rules.stormMinG) out.push({ kind: 'storm', key: `storm:G${g}:${utcDay(now)}`, at: s.t, g, kp: s.kp });
  }
  if (rules.flareMin !== 'off') {
    const run = flareNowRun(inp.xrays, now);
    const limit = FLARE_THRESHOLD[rules.flareMin];
    const crossed = run?.points.find(p => p.flux >= limit);
    if (run && crossed && now - crossed.t <= MAX_AGE_MS) {
      out.push({ kind: 'flare', key: `flare:${isoMinute(run.start)}`, at: crossed.t, flux: run.peak, cls: flareClass(run.peak) });
    }
  }
  if (rules.shocks) {
    const sh = shockArrival(inp.wind, now);
    const last = inp.wind.reduce((m, p) => Math.max(m, p.t), 0);
    if (sh) out.push({ kind: 'shock', key: `shock:${isoMinute(Math.floor(last / 36e5) * 36e5)}`, at: last, from: sh.from, to: sh.to });
  }
  if (rules.substorms) {
    for (const hemi of ['north', 'south'] as const) {
      const j = powerJump(inp.power, hemi, now);
      const last = inp.power.reduce((m, p) => Math.max(m, p.observed), 0);
      if (j) out.push({ kind: 'substorm', key: `substorm:${hemi}:${isoMinute(Math.floor(last / (3 * 36e5)) * 3 * 36e5)}`, at: last, from: Math.round(j.from), to: Math.round(j.to), hemi });
    }
  }
  return out;
}

/** How long a posted event of this kind blocks another post of the same kind (unless a storm climbs a level). */
export const REPEAT_MS: Record<EventKind, number> = { storm: 24 * 36e5, flare: 60 * 6e4, shock: 6 * 36e5, substorm: 3 * 36e5, viewing: 0 };

/** Whether `ev` repeats a recent non-failed post. A storm at a higher G level, or a bigger flare class, is new. */
export function isRepeat(ev: SocialEvent, recent: { key: string; kind: string; created_at: string; data: Partial<SocialEvent> | null }[], now: number): boolean {
  return recent.some(r => {
    if (r.key === ev.key) return true;
    if (ev.kind === 'viewing') return false; // viewing limits live in socialViewing
    if (r.kind !== ev.kind || Date.parse(r.created_at) < now - REPEAT_MS[ev.kind]) return false;
    if (ev.kind === 'storm') return (r.data?.g ?? 0) >= (ev.g ?? 0);
    if (ev.kind === 'flare') return (r.data?.flux ?? 0) * 10 >= (ev.flux ?? 0); // a tenfold-bigger flare is new
    if (ev.kind === 'substorm') return r.data?.hemi === ev.hemi;
    return true;
  });
}

// ---- Post text (English: the account's language) ----

export const SITE_URL = 'https://www.polarlights.io';
export const LINKS: Record<EventKind, string> = { storm: `${SITE_URL}/map`, flare: `${SITE_URL}/sun`, shock: `${SITE_URL}/sun`, substorm: `${SITE_URL}/map`, viewing: `${SITE_URL}/map` };
const TAGS: Record<Exclude<EventKind, 'viewing'>, string> = {
  storm: '#aurora #NorthernLights #SpaceWeather #GeomagneticStorm',
  flare: '#SolarFlare #SpaceWeather #Sun',
  shock: '#SpaceWeather #CME #aurora',
  substorm: '#aurora #SpaceWeather',
};

export const hhmm = (t: number) => `${new Date(t).toISOString().slice(11, 16)} UTC`;
/** Kp to one decimal (Kp comes in thirds; Hp30 can be any value). */
export const fmtKp = (kp: number) => (Math.round(kp * 3) / 3).toFixed(1);

/** Clock time at the site ("22:00"), in its time zone when known, else UTC. */
export function localHm(t: number, tz: string | null): string {
  try { return new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: tz ?? 'UTC' }).format(t); }
  catch { return new Date(t).toISOString().slice(11, 16); }
}
const utcHm = (t: number) => new Date(t).toISOString().slice(11, 16);
/** Where to look from the site, by how far past the threshold the aurora is. */
export function lookPhrase(v: Viewing): string {
  const side = v.site.lat < 0 ? 'southern' : 'northern';
  return v.look === 'overhead' ? 'overhead' : v.look === 'high' ? `high in the ${side} sky` : `low on the ${side} horizon`;
}
const hashtags = (ev: SocialEvent) => (ev.kind === 'viewing'
  ? `#aurora ${(ev.viewing?.site.lat ?? 1) < 0 ? '#AuroraAustralis' : '#NorthernLights'} ${ev.viewing?.site.tags ?? ''}`.trim()
  : TAGS[ev.kind]);

export function headline(ev: SocialEvent): string {
  const g = `G${ev.g} (${G_NAME[ev.g ?? 1]})`, hemi = ev.hemi === 'south' ? 'southern' : 'northern', name = ev.viewing?.site.name ?? '';
  switch (ev.kind) {
    case 'storm': return variant(ev.key, [`Geomagnetic storm: ${g}`, `${g} geomagnetic storm under way`, `Storm level reached: ${g}`]);
    case 'flare': return variant(ev.key, [`Solar flare: ${ev.cls}`, `${ev.cls} solar flare`, `The Sun just fired an ${ev.cls} flare`]);
    case 'shock': return variant(ev.key, ['Solar wind shock at L1', 'Shock wave from the Sun arriving', 'CME shock detected at L1']);
    case 'substorm': return variant(ev.key, [`Aurora brightening (${hemi} hemisphere)`, `Substorm under way (${hemi} hemisphere)`]);
    case 'viewing': return ev.viewing?.mode === 'now'
      ? variant(ev.key, [`Aurora visible now: ${name}`, `Look up in ${name}: aurora now`, `${name}: aurora conditions are good right now`])
      : variant(ev.key, [`Good aurora chance tonight: ${name}`, `Tonight in ${name}: good aurora chances`, `${name} tonight: watch the sky`]);
  }
}

/** The body lines between the headline and the link, longest first: later entries are shorter fallbacks. */
function bodies(ev: SocialEvent): string[] {
  switch (ev.kind) {
    case 'storm': return [
      `Kp reached ${fmtKp(ev.kp ?? 0)} at ${hhmm(ev.at)}. Aurora may be seen farther from the poles than usual where skies are dark and clear.`,
      `Kp reached ${fmtKp(ev.kp ?? 0)} at ${hhmm(ev.at)}.`,
    ];
    case 'flare': return [
      `X-ray flux reached class ${ev.cls} at ${hhmm(ev.at)}. Strong flares can disturb radio on Earth's dayside; aurora depends on whether a CME follows.`,
      `X-ray flux reached class ${ev.cls} at ${hhmm(ev.at)}.`,
    ];
    case 'shock': return [
      `Solar wind jumped from ${ev.from} to ${ev.to} km/s at ${hhmm(ev.at)}, often a CME arriving. It reaches Earth in about an hour and can start a storm.`,
      `Solar wind jumped from ${ev.from} to ${ev.to} km/s at ${hhmm(ev.at)}.`,
    ];
    case 'substorm': return [
      `Auroral power rose from ${ev.from} to ${ev.to} GW at ${hhmm(ev.at)}. Under the oval with dark, clear skies, look now.`,
      `Auroral power rose from ${ev.from} to ${ev.to} GW at ${hhmm(ev.at)}.`,
    ];
    case 'viewing': {
      const v = ev.viewing!;
      if (v.mode === 'now') return [
        `Aurora, darkness and clear sky line up (score ${v.score}/100). Kp ${fmtKp(v.kp ?? 0)}; this sky needs Kp ${v.need}. Look ${lookPhrase(v)}.`,
        `Score ${v.score}/100 at ${localHm(ev.at, v.tz)} local time. Look ${lookPhrase(v)}.`,
        `Score ${v.score}/100 now.`,
      ];
      const w = v.window ?? { from: ev.at, to: ev.at };
      const cloud = v.cloud === null ? '' : `, ${v.cloud}% cloud expected`;
      return [
        `Best from ${localHm(w.from, v.tz)} to ${localHm(w.to, v.tz)} local time (${utcHm(w.from)}–${utcHm(w.to)} UTC), score ${v.score}/100${cloud}.`,
        `Best from ${localHm(w.from, v.tz)} to ${localHm(w.to, v.tz)} local time, score ${v.score}/100.`,
        `Score ${v.score}/100 later tonight.`,
      ];
    }
  }
}

/** The post: headline, body, link and hashtags. Always within 300 graphemes (the link counts). */
export function eventPostText(ev: SocialEvent): string {
  const lead = LINKS[ev.kind] === `${SITE_URL}/map` ? variant(`${ev.key}:link`, ['Live map and forecast', 'Follow it live', 'Track it live']) : variant(`${ev.key}:link`, ['Live data', 'Follow it live']);
  const tail = `${lead}: ${LINKS[ev.kind]}\n${hashtags(ev)}`;
  for (const body of bodies(ev)) {
    const text = `${headline(ev)}\n${body}\n${tail}`;
    if (graphemes(text) <= MAX_GRAPHEMES) return text;
  }
  return `${headline(ev)}\n${LINKS[ev.kind]}`;
}

/** Sample events for previews when nothing is happening (clearly marked as samples in the admin page). */
export function sampleEvent(kind: EventKind, now: number): SocialEvent {
  const at = Math.floor(now / 6e4) * 6e4;
  switch (kind) {
    case 'storm': return { kind, key: 'sample', at, g: 3, kp: 7 };
    case 'flare': return { kind, key: 'sample', at, flux: 1.2e-4, cls: 'X1.2' };
    case 'shock': return { kind, key: 'sample', at, from: 420, to: 610 };
    case 'substorm': return { kind, key: 'sample', at, from: 22, to: 64, hemi: 'north' };
    case 'viewing': return { kind, key: 'sample', at, viewing: {
      site: { id: 'sample', name: 'Fairbanks, Alaska', lat: 64.84, lon: -147.72, tags: '#Alaska' }, mode: 'tonight', score: 64,
      window: { from: at + 3 * 36e5, to: at + 6 * 36e5 }, tz: 'America/Anchorage', kp: 4.33, need: 1, cloud: 10, look: 'high',
      hours: Array.from({ length: 12 }, (_, i) => ({ t: at + i * 36e5, score: [8, 12, 25, 48, 60, 64, 58, 40, 22, 10, 4, 0][i] })), nearby: [],
    } };
  }
}
