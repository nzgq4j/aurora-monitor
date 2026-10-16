// Static content and chart geometry for the OVAL prototype.
// All figures are illustrative placeholder data carried over from the design.

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
  ['3-day forecast', 0],
  ['Daily email digest', 0],
  ['Instant push alerts', 1],
  ['Hour-by-hour cloud + darkness', 1],
  ['27-day outlook', 1],
  ['SMS alerts', 2],
  ['Bz & substorm onset alerts', 2],
  ['Dark-sky spot map', 2],
  ['Data export & API', 3],
  ['5 team seats', 3],
];

export const COMPARE: [string, string[]][] = [
  ['Saved locations', ['1', '3', '10', 'Unlimited']],
  ['Alert channels', ['Email', 'Email, push', 'Email, push, SMS', 'All + webhook']],
  ['Alert speed', ['Daily digest', '< 1 min', '< 1 min', '< 1 min']],
  ['Forecast range', ['3 days', '27 days', '27 days', '27 days']],
  ['Cloud & darkness model', ['—', '✓', '✓', '✓']],
  ['Substorm onset alerts', ['—', '—', '✓', '✓']],
  ['Kp history', ['7 days', '90 days', '2 years', 'Since 1932']],
  ['API & export', ['—', '—', '—', '✓']],
];

export const KP_NAME = ['', '', 'Quiet', 'Unsettled', 'Active', 'G1 Minor', 'G2 Moderate', 'G3 Strong', 'G4 Severe', 'G5 Extreme'];
export const KP_WHERE = ['', '', 'not visible', 'not visible', 'unlikely, except during substorms', 'low on the north horizon', 'clearly visible to the north', 'likely overhead', 'overhead and across the sky', 'overhead and across the sky'];

export const C = {
  green: '#6CFF2B',
  darkGreen: '#2FA84A',
  amber: '#E6B800',
  red: '#F06A6A',
  muted: '#9AA39D',
  soft: '#C9D0CB',
  line: '#1d211e',
  line2: '#2a302c',
  dash: '#4a504c',
} as const;

export const f = (n: number) => +n.toFixed(1);

/** Deterministic pseudo-noise in [0, 1). */
const nz = (i: number, s = 1) => {
  const x = Math.sin(i * 12.9898 + s * 78.233) * 43758.5453;
  return x - Math.floor(x);
};

/** Storm-scale colour for a Kp value; `observed` uses the darker variant. */
export const kpColor = (k: number, observed = false) =>
  k >= 5 ? (observed ? '#C04F52' : C.red) : k >= 4 ? (observed ? '#B08F0C' : C.amber) : (observed ? '#1F6B33' : C.darkGreen);

// ---- Geomagnetic outlook (observed + forecast Kp) ----
const PAST = [2, 2.33, 2.67, 2, 1.67, 1, 1.33, 2, 2.33, 2.67, 3, 3.33, 4, 4.67, 5, 5.33];
const FORECAST = [5.67, 6, 5.33, 4.67, 4, 3.67, 3.33, 3, 3, 3.33, 3.67, 3.33, 3, 2.67, 2.33, 2.33, 2, 2, 2.33, 2, 1.67, 1.67, 2, 2];
const X0 = 48, X1 = 1150, Y1 = 290, U = 30, BW = (X1 - X0) / 40;

export const kpChart = {
  bars: PAST.concat(FORECAST).map((k, i) => ({ x: f(X0 + i * BW + 2.5), y: f(Y1 - k * U), w: f(BW - 5), h: f(k * U), fill: kpColor(k, i < PAST.length) })),
  grid: [...Array(10)].map((_, k) => ({ k, y: Y1 - k * U, ty: Y1 - k * U + 4 })),
  dayLines: [1, 2, 3, 4].map(d => f(X0 + d * 8 * BW)),
  dayLabels: ['Oct 15', 'Oct 16', 'Oct 17', 'Oct 18', 'Oct 19'].map((t, d) => ({ t, x: f(X0 + (d * 8 + 4) * BW) })),
  nowX: f(X0 + PAST.length * BW),
};

export const kpScale = [1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => ({
  n: n === 5 ? 'G1' : n === 9 ? 'G5' : String(n),
  bg: n >= 5 ? C.red : n === 4 ? C.amber : C.darkGreen,
  op: n <= 5 ? 1 : 0.22,
}));

export const nowStats = [
  { label: 'IMF BZ', value: '−14.2', unit: 'nT', note: 'Strong south', c: C.green },
  { label: 'SPEED', value: '618', unit: 'km/s', note: 'Fast stream', c: C.amber },
  { label: 'HEMI POWER', value: '74', unit: 'GW', note: 'High', c: C.red },
  { label: 'DARK IN', value: '1h 18', unit: 'm', note: 'Central US', c: C.soft },
];

// ---- Polar auroral-oval map ----
const K = 4.2, CTR = 240;
const pol = (lat: number, lon: number): [number, number] => {
  const r = (90 - lat) * K, a = (90 - (lon + 100)) * Math.PI / 180;
  return [CTR + r * Math.cos(a), CTR + r * Math.sin(a)];
};
const [ocx, ocy] = pol(80.7, -72.7);

export const polar = {
  oval: { cx: f(ocx), cy: f(ocy), r: 112, vr: 160 },
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

// ---- Account: season chart ----
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const season = [3, 4, 5, 3, 6, 4, 3, 7, 4, 5, 3, 6].map((k, i) => {
  const w = 860 / 12, x = 30 + i * w, alerts = k >= 5 ? Math.min(3, k - 4) : 0;
  const d0 = new Date(Date.UTC(2026, 6, 27) + i * 7 * 864e5);
  return {
    x: f(x + 10), w: f(w - 20), y: f(210 - k * 20), h: k * 20, fill: kpColor(k), cx: f(x + w / 2),
    lbl: MONTHS[d0.getUTCMonth()] + ' ' + d0.getUTCDate(),
    dots: [...Array(alerts)].map((_, j) => ({ x: f(x + w / 2), y: f(210 - k * 20 - 12 - j * 11) })),
  };
});
export const seasonGrid = [0, 3, 6, 9].map(k => ({ k, y: 210 - k * 20, ty: 214 - k * 20 }));
export const SEASON_VISIBLE_Y = 110;

// ---- Account: last 30 nights of max Kp ----
export const hist30 = [...Array(30)].map((_, i) =>
  i === 29 ? 5.33 : Math.round((1.5 + nz(i, 11) * 3.2 + (i === 8 || i === 9 ? 2.5 : 0) + (i === 21 ? 3 : 0)) * 3) / 3);

export const overviewStats = [
  { label: 'ALERTS THIS SEASON', value: '14', note: '9 with clear skies', c: C.green },
  { label: 'NIGHTS KP ≥ 5', value: '11', note: 'Since Aug 1', c: C.soft },
  { label: 'STRONGEST', value: 'Kp 7', note: 'Sep 15 · G3', c: C.red },
  { label: 'TONIGHT', value: '62%', note: 'Best 22:00–01:00', c: C.green },
];

export const upcoming = [
  { d: 'Sat Oct 17', kp: '7', chance: 78, note: 'CME arrival · G3 watch', c: C.green },
  { d: 'Sun Oct 18', kp: '5', chance: 52, note: 'Storm tail, clouds 40%', c: C.darkGreen },
  { d: 'Mon Nov 2', kp: '5', chance: 44, note: 'Recurrent coronal hole', c: C.darkGreen },
  { d: 'Tue Nov 3', kp: '5', chance: 38, note: 'Recurrent coronal hole', c: C.amber },
  { d: 'Mon Nov 9', kp: '4', chance: 21, note: 'Unsettled, near new moon', c: C.amber },
];

export const locations = [
  { name: 'Minneapolis, MN', coords: '44.98°N 93.27°W', chance: 62, cloud: 15, need: 5, tag: 'HOME' },
  { name: 'Duluth, MN', coords: '46.79°N 92.10°W', chance: 78, cloud: 30, need: 4, tag: 'SAVED' },
  { name: 'Grand Marais, MN', coords: '47.75°N 90.33°W', chance: 86, cloud: 10, need: 4, tag: 'SAVED' },
];

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
