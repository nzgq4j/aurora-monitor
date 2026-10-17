// Membership tiers, copy and map geometry. Live space-weather data comes from src/lib/feeds.ts.

export type TierId = 'free' | 'observer' | 'chaser' | 'observatory';

export interface Tier {
  id: TierId;
  name: string;
  /** Monthly price in USD. */
  m: number;
  /** Annual price in USD. */
  y: number;
  blurb: string;
  /** Saved-location allowance. */
  locs: number;
  accent: string;
}

export const TIERS: Tier[] = [
  { id: 'free', name: 'Free', m: 0, y: 0, blurb: 'The live sky, for the curious.', locs: 1, accent: '#C9D0CB' },
  { id: 'observer', name: 'Observer', m: 4, y: 36, blurb: 'Instant alerts for your own backyard.', locs: 3, accent: '#2FA84A' },
  { id: 'chaser', name: 'Chaser', m: 9, y: 84, blurb: 'Everything you need to chase a storm.', locs: 10, accent: '#6CFF2B' },
  { id: 'observatory', name: 'Observatory', m: 24, y: 216, blurb: 'Raw data, API access and seats for teams.', locs: 99, accent: '#B07CFF' },
];

/** Feature label and the index of the tier that introduces it. */
export const FEATS: [string, number][] = [
  ['Live Kp, oval & solar wind', 0],
  ['3-day forecast (daily peak Kp)', 0],
  ['Daily email digest', 0],
  ['Instant push alerts', 1],
  ['Hour-by-hour cloud + darkness', 1],
  ['3-hour Kp forecast', 1],
  ['27-day outlook', 1],
  ['SMS alerts', 2],
  ['Bz & substorm onset alerts', 2],
  ['Dark-sky spot map', 2],
  ['Solar wind & hemispheric power graphs', 2],
  ['Data export & API', 3],
  ['5 team seats', 3],
];

export const COMPARE: [string, string[]][] = [
  ['Saved locations', ['1', '3', '10', 'Unlimited']],
  ['Alert channels', ['Email', 'Email, push', 'Email, push, SMS', 'All + webhook']],
  ['Alert speed', ['Daily digest', '< 1 min', '< 1 min', '< 1 min']],
  ['Forecast range', ['3 days', '27 days', '27 days', '27 days']],
  ['Kp forecast detail', ['Daily peak', '3-hourly', '3-hourly', '3-hourly']],
  ['Solar activity graphs', ['—', '—', '✓', '✓']],
  ['Cloud & darkness model', ['—', '✓', '✓', '✓']],
  ['Substorm onset alerts', ['—', '—', '✓', '✓']],
  ['Kp history', ['7 days', '90 days', '2 years', 'Since 1932']],
  ['API & export', ['—', '—', '—', '✓']],
];

/** Index into TIERS of the first plan that includes each gated feature. */
export const ENTITLEMENTS = { kp3h: 1, outlook27: 1, solarGraphs: 2 } as const;

export const KP_NAME = ['', '', 'Quiet', 'Unsettled', 'Active', 'G1 Minor', 'G2 Moderate', 'G3 Strong', 'G4 Severe', 'G5 Extreme'];

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

/** [key, label, sub, minimum tier index] */
export const TRIGGER_DEFS: [TriggerKey, string, string, number][] = [
  ['kp', 'Kp threshold reached', 'Uses the level you set above', 0],
  ['cme', 'CME arrival & storm watches', 'When NOAA issues a G-scale watch', 0],
  ['clear', 'Clear sky + aurora', 'Only when your clouds are under 40%', 1],
  ['bz', 'Bz turns south', 'Sustained −10 nT for 15 minutes', 2],
  ['sub', 'Substorm onset', 'Sudden brightening detected', 2],
];

export const CHANNEL_DEFS: [ChannelKey, string, string, number][] = [
  ['email', 'Email', 'sam@example.com', 0],
  ['push', 'Push', 'iPhone 15 · OVAL app', 1],
  ['sms', 'SMS', '+1 (612) •••-4410', 2],
];
