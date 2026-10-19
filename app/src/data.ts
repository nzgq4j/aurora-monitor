// Membership tiers, copy and map geometry. Live space-weather data comes from src/lib/feeds.ts.

export type TierId = 'free' | 'chaser';

/** Plan names and copy are translated: see `tier.{id}` and `tier.{id}.blurb` in the messages. */
export interface Tier {
  id: TierId;
  /** Monthly price in USD. */
  m: number;
  /** Annual price in USD. */
  y: number;
  /** Saved-location allowance. */
  locs: number;
  accent: string;
}

export const TIERS: Tier[] = [
  { id: 'free', m: 0, y: 0, locs: 1, accent: '#C9D0CB' },
  { id: 'chaser', m: 5, y: 50, locs: 10, accent: '#6CFF2B' },
];

/** Days of free trial for a first subscription (Stripe checkout, see lib/billing). */
export const TRIAL_DAYS = 14;

/** Feature (message key `feat.{id}`) and the index of the tier that introduces it. */
export const FEATS = [
  ['live', 0], ['forecast3d', 0], ['digest', 0], ['push', 1], ['kp3h', 1], ['outlook27', 1],
  ['hourly', 1], ['solarGraphs', 1], ['sms', 1], ['substorm', 1], ['darkSky', 1], ['locations10', 1],
] as const;

/** Comparison rows: label `cmp.{id}`, cells `cmp.{id}.{tier}`. A cell reading "—" means not included. */
export const COMPARE = ['locations', 'channels', 'speed', 'range', 'detail', 'solar', 'cloud', 'substorm', 'history'] as const;

/** Index into TIERS of the first plan that includes each gated feature. */
export const ENTITLEMENTS = { kp3h: 1, outlook27: 1, solarGraphs: 1, skyView: 1 } as const;

export const C = {
  green: '#6CFF2B',
  darkGreen: '#2FA84A',
  amber: '#E6B800',
  orange: '#FF9A3C',
  red: '#F06A6A',
  muted: '#9AA39D',
  soft: '#C9D0CB',
  line: '#1d211e',
  line2: '#2a302c',
  dash: '#4a504c',
} as const;

export const f = (n: number) => +n.toFixed(1);

export const kpColor = (k: number, observed = false) =>
  k >= 5 ? (observed ? '#C04F52' : C.red) : k >= 4 ? (observed ? '#B08F0C' : C.amber) : (observed ? '#1F6B33' : C.darkGreen);

/** Bar colour for a Kp value: green below 3, yellow from 3, orange from 4, red from 5 (G1 storm). */
export const kpBarColor = (k: number) => (k >= 5 ? C.red : k >= 4 ? C.orange : k >= 3 ? C.amber : C.darkGreen);

// ---- Polar auroral-oval map ----
const K = 4.2, CTR = 240;
const pol = (lat: number, lon: number): [number, number] => {
  const r = (90 - lat) * K, a = (90 - (lon + 100)) * Math.PI / 180;
  return [CTR + r * Math.cos(a), CTR + r * Math.sin(a)];
};

export const polar = {
  rings: [80, 70, 60, 50, 40].map(l => ({ r: (90 - l) * K, ly: CTR - (90 - l) * K - 4, lbl: l + '°' })),
  meridians: [...Array(12)].map((_, i) => { const a = i * Math.PI / 6; return { x: f(CTR + 240 * Math.cos(a)), y: f(CTR + 240 * Math.sin(a)) }; }),
  cities: ([
    ['Fairbanks', 64.8, -147.7], ['Anchorage', 61.2, -149.9, 1], ['Yellowknife', 62.5, -114.4], ['Churchill', 58.8, -94.2],
    ['Edmonton', 53.5, -113.5, 1], ['Winnipeg', 49.9, -97.1], ['Seattle', 47.6, -122.3, 1], ['Minneapolis', 45, -93.3],
    ['Montreal', 45.5, -73.6], ['Chicago', 41.9, -87.6], ['Reykjavík', 64.1, -21.9],
  ] as [string, number, number, number?][]).map(([name, lat, lon, e]) => {
    const [x, y] = pol(lat, lon);
    return { name, x: f(x), y: f(y), tx: f(x + (e ? -6 : 6)), ty: f(y + 4), anchor: (e ? 'end' : 'start') as 'end' | 'start' };
  }),
};

export type TriggerKey = 'kp' | 'cme' | 'clear' | 'bz' | 'sub';
export type ChannelKey = 'email' | 'push' | 'sms';

/** [key, minimum tier index]; label `trigger.{key}`, detail `trigger.{key}.sub`. */
export const TRIGGER_DEFS: [TriggerKey, number][] = [['kp', 0], ['cme', 0], ['clear', 1], ['bz', 1], ['sub', 1]];

/** [key, minimum tier index]; label `channel.{key}`, detail `channel.{key}.sub` (email shows the account address instead). */
export const CHANNEL_DEFS: [ChannelKey, number][] = [['email', 0], ['push', 1], ['sms', 1]];
