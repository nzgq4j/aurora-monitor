import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

// The real alert engine and forecast, with stand-ins for the feeds, cloud and database. Tromsø at
// 22:00 UTC on 20 Nov 2026 (dark, near magnetic midnight), clear sky, Moon not counted.
const env = vi.hoisted(() => ({ kp: 3 as number | null, ovation: 20 as number | null, cloud: 0 as number | null, hourly: [] as { t: number; pct: number }[], wind: [] as { t: number; bz: number | null }[], power: [] as { observed: number; north: number; south: number }[], windReads: 0, hp: [] as { t: number; hp: number }[], xrays: [] as { t: number; flux: number }[], sims: null as unknown[] | null, series: [] as { t: number; kp: number; kind: string }[] }));
vi.mock('./feeds', () => ({
  kpNow: async () => (env.kp === null ? null : { t: Date.now(), kp: env.kp }),
  kpSeries: async () => env.series,
  ovation: async () => (env.ovation === null ? null : {}),
  ovalAt: () => ({ overhead: env.ovation ?? 0, nearby: env.ovation ?? 0 }),
  solarWindSeries: async () => { env.windReads++; return env.wind; },
  hemiPowerSeries: async () => env.power,
  hp30Recent: async () => env.hp,
  xrayRecent: async () => env.xrays,
  enlilSims: async () => env.sims,
}));
vi.mock('./cloud', () => ({ cloudCover: async () => (env.cloud === null ? null : { now: env.cloud, aurora: env.cloud, layers: null, next12h: env.hourly }) }));
vi.mock('./astro', async orig => ({ ...(await orig<typeof import('./astro')>()), moon: () => ({ illumination: 0 }), moonAltitude: () => -10 }));

import { runAlerts } from './alertEngine';
import type { AlertLevel } from './alerts';

const NOW = Date.UTC(2026, 10, 20, 22);
const HOME = { lat: 69.65, lon: 18.96 };
type Kind = 'aurora' | 'forecast' | 'storm' | 'bz' | 'substorm' | 'coupling' | 'flare' | 'shock' | 'cme';

/** Users set to each level, each with Tromsø as Home; returns what each was sent. */
async function run(users: { id: string; level: AlertLevel; storm?: boolean; chaser?: boolean; quiet?: boolean; kp?: number; away?: boolean; aurora?: boolean; triggers?: { bz?: boolean; sub?: boolean; coupling?: boolean; flare?: boolean; cme?: boolean } }[], log: { user_id: string; location_id: string | null; kind: Kind; created_at: string; value?: number | null }[] = []) {
  const sent: { user_id: string; kind: Kind; level: AlertLevel | null }[] = [];
  const q = (rows: unknown[]) => {
    const b: Record<string, unknown> = {};
    for (const m of ['select', 'eq', 'in', 'gte', 'order', 'limit']) b[m] = () => b;
    b.range = async () => ({ data: rows, error: null });
    b.then = (ok: (v: unknown) => unknown) => Promise.resolve({ data: rows, error: null }).then(ok);
    return b;
  };
  const tables: Record<string, unknown[]> = {
    alert_settings: users.map(u => ({ user_id: u.id, kp_threshold: u.kp ?? 6, time_zone: 'UTC', channels: { email: true }, triggers: u.triggers ?? null,
      rules: { aurora: u.aurora ?? true, level: u.level, forecast: true, storm: u.storm ?? false, quiet: u.quiet ?? false, quietFrom: '21:00', quietTo: '23:00' } })),
    profiles: users.map(u => ({ id: u.id, plan: u.chaser ? 'chaser' : 'free', subscription_status: null, trial_ends_at: u.chaser ? '2099-01-01T00:00:00Z' : null, locale: 'en' })),
    locations: users.flatMap(u => [{ id: `loc-${u.id}`, user_id: u.id, name: 'Tromsø', ...HOME, is_home: true },
      ...(u.away ? [{ id: `away-${u.id}`, user_id: u.id, name: 'Abisko', lat: 68.35, lon: 18.83, is_home: false }] : [])]),
    alert_log: log,
  };
  const admin = {
    from: (t: string) => ({ ...q(tables[t] ?? []), insert: async (rows: typeof sent) => { if (t === 'alert_log') sent.push(...rows); return { error: null }; } }),
    auth: { admin: { getUserById: async () => ({ data: { user: { email: 'x@example.com' } } }) } },
  } as never;
  const summary = await runAlerts(admin);
  return { summary, sent };
}

const LEVELS: AlertLevel[] = ['faint', 'visible', 'clear'];
const byLevel = (sent: { user_id: string; kind: Kind; level: AlertLevel | null }[]) =>
  Object.fromEntries(LEVELS.map(l => [l, sent.filter(s => s.user_id === l && s.kind === 'aurora').map(s => s.level)[0] ?? null]));

beforeAll(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(NOW); });
afterAll(() => { vi.useRealTimers(); });
beforeEach(() => { vi.setSystemTime(NOW); env.kp = 3; env.ovation = 20; env.cloud = 0; env.hourly = []; env.series = []; env.wind = []; env.power = []; env.windReads = 0; env.hp = []; env.xrays = []; env.sims = null; });

const only = (sent: { user_id: string; kind: Kind }[], id: string) => sent.filter(x => x.user_id === id).map(x => x.kind);

describe('aurora alerts by level (clear, dark, moonless sky)', () => {
  // Low, medium and high probability: what each setting is sent, and the level the alert reports.
  it.each([
    [2, { faint: null, visible: null, clear: null }],
    [6, { faint: 'faint', visible: null, clear: null }],
    [10, { faint: 'faint', visible: null, clear: null }],
    [15, { faint: 'visible', visible: 'visible', clear: null }],
    [30, { faint: 'visible', visible: 'visible', clear: null }],
    [40, { faint: 'clear', visible: 'clear', clear: 'clear' }],
    [70, { faint: 'clear', visible: 'clear', clear: 'clear' }],
  ] as const)('OVATION %i%%', async (p, expected) => {
    env.ovation = p;
    const { sent, summary } = await run(LEVELS.map(level => ({ id: level, level })));
    expect(byLevel(sent)).toEqual(expected);
    expect(summary).toMatchObject({ failed: 0, deferred: 0, feedsOk: true });
  });
});

describe('what stops or changes an aurora alert', () => {
  it('heavy cloud stops it', async () => {
    env.ovation = 70; env.cloud = 90;
    expect((await run([{ id: 'faint', level: 'faint' }])).sent).toEqual([]);
  });
  it('without a cloud forecast it can still say visible, never clearly visible', async () => {
    env.ovation = 70; env.cloud = null;
    expect(byLevel((await run(LEVELS.map(level => ({ id: level, level })))).sent)).toEqual({ faint: 'visible', visible: 'visible', clear: null });
  });
  it('daylight stops it', async () => {
    vi.setSystemTime(Date.UTC(2026, 5, 21, 12)); env.ovation = 70;
    expect((await run([{ id: 'faint', level: 'faint' }])).sent).toEqual([]);
  });
  it('without OVATION it falls back to Kp', async () => {
    env.ovation = null; env.kp = 5;
    expect(byLevel((await run(LEVELS.map(level => ({ id: level, level })))).sent).clear).toBe('clear');
    // Tromsø is under the oval: even very quiet Kp near magnetic midnight can be visible there, not vivid.
    env.kp = 0.33;
    expect(byLevel((await run(LEVELS.map(level => ({ id: level, level })))).sent).clear).toBeNull();
  });
  it('quiet hours hold aurora alerts back but not storm alerts', async () => {
    env.ovation = 70; env.kp = 7;
    vi.setSystemTime(Date.UTC(2026, 10, 20, 22, 30));
    const { sent, summary } = await run([{ id: 'q', level: 'faint', quiet: true, storm: true }]);
    expect(only(sent, 'q')).toEqual(['storm']);
    expect(summary.skippedQuiet).toBe(1);
  });
  it('an alert for a place isn’t repeated within 6 hours, but is after', async () => {
    env.ovation = 70;
    const at = (h: number) => new Date(NOW - h * 36e5).toISOString();
    expect((await run([{ id: 'r', level: 'faint' }], [{ user_id: 'r', location_id: 'loc-r', kind: 'aurora', created_at: at(2) }])).sent).toEqual([]);
    expect(only((await run([{ id: 'r', level: 'faint' }], [{ user_id: 'r', location_id: 'loc-r', kind: 'aurora', created_at: at(7) }])).sent, 'r')).toEqual(['aurora']);
  });
});

describe('storm alerts', () => {
  it('go out when Kp reaches the user’s storm Kp, whatever the aurora level', async () => {
    env.ovation = 0; env.kp = 6.33;
    const { sent } = await run([{ id: 's6', level: 'clear', storm: true, kp: 6 }, { id: 's7', level: 'clear', storm: true, kp: 7 }, { id: 'off', level: 'clear', storm: false, kp: 5 }]);
    expect(only(sent, 's6')).toEqual(['storm']);
    expect(only(sent, 's7')).toEqual([]);
    expect(only(sent, 'off')).toEqual([]);
  });
  it('count a forecast Kp within the next three hours', async () => {
    env.ovation = 0; env.kp = 3; env.series = [{ t: NOW + 2 * 36e5, kp: 7, kind: 'predicted' }];
    expect(only((await run([{ id: 's', level: 'clear', storm: true, kp: 6 }])).sent, 's')).toEqual(['storm']);
  });
  it('aren’t repeated within 12 hours', async () => {
    env.kp = 7; env.ovation = 0;
    const log = [{ user_id: 's', location_id: null, kind: 'storm' as const, created_at: new Date(NOW - 5 * 36e5).toISOString() }];
    expect((await run([{ id: 's', level: 'clear', storm: true, kp: 6 }], log)).sent).toEqual([]);
  });
});

describe('Free and Chaser', () => {
  it('Free covers Home only; Chaser every saved place', async () => {
    env.ovation = 70;
    const { sent } = await run([{ id: 'free', level: 'faint', away: true }, { id: 'chaser', level: 'faint', away: true, chaser: true }]);
    expect(sent.filter(x => x.user_id === 'free').length).toBe(1);
    expect(sent.filter(x => x.user_id === 'chaser').length).toBe(2);
  });
  it('Chaser gets a heads-up when only the next hour reaches the level', async () => {
    // Cloudy now, clearing within the hour.
    env.ovation = 70; env.cloud = 95; env.hourly = [{ t: NOW + 1.5 * 36e5, pct: 0 }];
    const { sent } = await run([{ id: 'free', level: 'visible' }, { id: 'chaser', level: 'visible', chaser: true }]);
    expect(only(sent, 'free')).toEqual([]);
    expect(only(sent, 'chaser')).toEqual(['forecast']);
  });
});

describe('technical alerts (Chaser)', () => {
  // Bz at −12 to −15 nT for the last 20 minutes; hemispheric power from 12 to 48 GW in half an hour.
  const south = () => { env.wind = [-3, -12, -13, -15, -14].map((bz, i, a) => ({ t: NOW - (a.length - i) * 3e5, bz })); };
  const jump = () => { env.power = [12, 14, 15, 22, 35, 48].map((v, i, a) => ({ observed: NOW - (a.length - 1 - i) * 3e5, north: v, south: 5 })); };
  const tech = (id: string, extra = {}) => ({ id, level: 'clear' as AlertLevel, aurora: false, chaser: true, triggers: { bz: true, sub: true }, ...extra });
  beforeEach(() => { env.ovation = 0; south(); jump(); });

  it('Bz south and a substorm both alert a Chaser member at night', async () => {
    const { sent } = await run([tech('c')]);
    expect(only(sent, 'c').sort()).toEqual(['bz', 'substorm']);
  });
  it('need Chaser', async () => {
    expect((await run([tech('free', { chaser: false })])).sent).toEqual([]);
  });
  it('only the ones switched on', async () => {
    expect(only((await run([tech('c', { triggers: { bz: true } })])).sent, 'c')).toEqual(['bz']);
    expect(only((await run([tech('c', { triggers: { sub: true } })])).sent, 'c')).toEqual(['substorm']);
  });
  it('wait for the dark and for quiet hours to end', async () => {
    vi.setSystemTime(Date.UTC(2026, 5, 21, 12)); south(); env.power = [];
    expect((await run([tech('c')])).sent).toEqual([]);
    vi.setSystemTime(Date.UTC(2026, 10, 20, 22, 30)); south(); jump();
    expect((await run([tech('c', { quiet: true })])).sent).toEqual([]);
  });
  it('need the condition to be happening now', async () => {
    env.wind = [-12, -13, -15, -4].map((bz, i, a) => ({ t: NOW - (a.length - i) * 3e5, bz }));
    env.power = [40, 45, 48, 50].map((v, i, a) => ({ observed: NOW - (a.length - 1 - i) * 3e5, north: v, south: 5 }));
    expect((await run([tech('c')])).sent).toEqual([]);
  });
  it('aren’t repeated within 3 hours (Bz) and 2 hours (substorm)', async () => {
    const log = (kind: Kind, h: number) => ({ user_id: 'c', location_id: null, kind, created_at: new Date(NOW - h * 36e5).toISOString() });
    expect((await run([tech('c')], [log('bz', 2), log('substorm', 1)])).sent).toEqual([]);
    expect(only((await run([tech('c')], [log('bz', 4), log('substorm', 3)])).sent, 'c').sort()).toEqual(['bz', 'substorm']);
  });
  it('leave the solar wind unread when nobody has them on', async () => {
    await run([{ id: 'a', level: 'visible' }]);
    expect(env.windReads).toBe(0);
  });
});

describe('scientific alerts (Chaser)', () => {
  const sci = (id: string, extra = {}) => ({ id, level: 'clear' as AlertLevel, aurora: false, chaser: true, triggers: { flare: true, cme: true, coupling: true }, ...extra });
  const xr = (flux: number[]) => flux.map((f, i, a) => ({ t: NOW - (a.length - 1 - i) * 6e4, flux: f }));
  // Quiet solar wind for an hour, then a shock: faster, denser, stronger field.
  const shock = () => { env.wind = [...Array.from({ length: 10 }, (_, i) => ({ t: NOW - (12 - i) * 3e5, speed: 400, density: 5, bt: 6, by: 2, bz: 2 })),
    { t: NOW - 2 * 3e5, speed: 520, density: 14, bt: 18, by: 2, bz: 2 }, { t: NOW - 3e5, speed: 530, density: 15, bt: 19, by: 2, bz: 2 }] as never; };
  const driven = () => { env.wind = Array.from({ length: 7 }, (_, i) => ({ t: NOW - (7 - i) * 3e5, speed: 650, density: 8, bt: 16, by: 2, bz: -15 })) as never; };
  const sim = (arrivalH: number, kp = 7) => ({ modelCompletionTime: '2026-11-20T12:00Z', estimatedShockArrivalTime: new Date(NOW + arrivalH * 36e5).toISOString().slice(0, 16) + 'Z', isEarthGB: false, kp_90: kp, cmeIDs: ['CME-1'] });

  it('a flare at M1 or more, and again when it reaches X', async () => {
    env.ovation = 0; env.xrays = xr([3e-6, 8e-6, 2.1e-5]);
    expect(only((await run([sci('s')])).sent, 's')).toEqual(['flare']);
    const log = [{ user_id: 's', location_id: null, kind: 'flare' as const, created_at: new Date(NOW - 30 * 6e4).toISOString(), value: 2.1e-5 }];
    expect((await run([sci('s')], log)).sent).toEqual([]);
    env.xrays = xr([2e-5, 6e-5, 1.3e-4]);
    expect(only((await run([sci('s')], log)).sent, 's')).toEqual(['flare']);
  });
  it('a CME shock at L1, any time of day', async () => {
    vi.setSystemTime(Date.UTC(2026, 5, 21, 12)); env.ovation = 0;
    env.wind = [...Array.from({ length: 10 }, (_, i) => ({ t: Date.now() - (12 - i) * 3e5, speed: 400, density: 5, bt: 6, by: 2, bz: 2 })),
      { t: Date.now() - 2 * 3e5, speed: 520, density: 14, bt: 18, by: 2, bz: 2 }, { t: Date.now() - 3e5, speed: 530, density: 15, bt: 19, by: 2, bz: 2 }] as never;
    expect(only((await run([sci('s')])).sent, 's')).toEqual(['shock']);
  });
  it('a CME forecast, once per expected arrival however often the model reruns', async () => {
    env.ovation = 0; env.sims = [sim(30)];
    expect(only((await run([sci('s')])).sent, 's')).toEqual(['cme']);
    const log = [{ user_id: 's', location_id: null, kind: 'cme' as const, created_at: new Date(NOW - 5 * 36e5).toISOString(), value: Math.round((NOW + 28 * 36e5) / 36e5) }];
    expect((await run([sci('s')], log)).sent).toEqual([]);
    env.sims = [sim(60)];
    expect(only((await run([sci('s')], log)).sent, 's')).toEqual(['cme']);
  });
  it('strong coupling only in the dark', async () => {
    env.ovation = 0; driven();
    expect(only((await run([sci('s')])).sent, 's')).toEqual(['coupling']);
    vi.setSystemTime(Date.UTC(2026, 5, 21, 12)); env.wind = Array.from({ length: 7 }, (_, i) => ({ t: Date.now() - (7 - i) * 3e5, speed: 650, density: 8, bt: 16, by: 2, bz: -15 })) as never;
    expect((await run([sci('s')])).sent).toEqual([]);
  });
  it('none for Free, none in quiet hours, none when switched off', async () => {
    env.ovation = 0; env.xrays = xr([2e-5]); shock(); env.sims = [sim(30)];
    expect((await run([sci('f', { chaser: false })])).sent).toEqual([]);
    vi.setSystemTime(Date.UTC(2026, 10, 20, 22, 30)); env.xrays = [{ t: Date.now(), flux: 2e-5 }];
    expect((await run([sci('q', { quiet: true })])).sent).toEqual([]);
    expect((await run([sci('o', { triggers: {} })])).sent).toEqual([]);
  });
  it('storm alerts use Hp30 when it runs ahead of Kp', async () => {
    env.ovation = 0; env.kp = 3; env.hp = [{ t: NOW - 30 * 6e4, hp: 6.33 }];
    expect(only((await run([{ id: 's', level: 'clear', aurora: false, storm: true, kp: 6 }])).sent, 's')).toEqual(['storm']);
    env.hp = [{ t: NOW - 4 * 36e5, hp: 6.33 }];
    expect((await run([{ id: 's', level: 'clear', aurora: false, storm: true, kp: 6 }])).sent).toEqual([]);
  });
});
