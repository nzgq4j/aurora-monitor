import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

// The real alert engine and forecast, with stand-ins for the feeds, cloud and database. Tromsø at
// 22:00 UTC on 20 Nov 2026 (dark, near magnetic midnight), clear sky, Moon not counted.
const env = vi.hoisted(() => ({ kp: 3 as number | null, ovation: 20 as number | null, cloud: 0 as number | null, hourly: [] as { t: number; pct: number }[], series: [] as { t: number; kp: number; kind: string }[] }));
vi.mock('./feeds', () => ({
  kpNow: async () => (env.kp === null ? null : { t: Date.now(), kp: env.kp }),
  kpSeries: async () => env.series,
  ovation: async () => (env.ovation === null ? null : {}),
  ovalAt: () => ({ overhead: env.ovation ?? 0, nearby: env.ovation ?? 0 }),
}));
vi.mock('./cloud', () => ({ cloudCover: async () => (env.cloud === null ? null : { now: env.cloud, aurora: env.cloud, layers: null, next12h: env.hourly }) }));
vi.mock('./astro', async orig => ({ ...(await orig<typeof import('./astro')>()), moon: () => ({ illumination: 0 }), moonAltitude: () => -10 }));

import { runAlerts } from './alertEngine';
import type { AlertLevel } from './alerts';

const NOW = Date.UTC(2026, 10, 20, 22);
const HOME = { lat: 69.65, lon: 18.96 };
type Kind = 'aurora' | 'forecast' | 'storm';

/** Users set to each level, each with Tromsø as Home; returns what each was sent. */
async function run(users: { id: string; level: AlertLevel; storm?: boolean; chaser?: boolean; quiet?: boolean; kp?: number; away?: boolean }[], log: { user_id: string; location_id: string | null; kind: Kind; created_at: string }[] = []) {
  const sent: { user_id: string; kind: Kind; level: AlertLevel | null }[] = [];
  const q = (rows: unknown[]) => {
    const b: Record<string, unknown> = {};
    for (const m of ['select', 'eq', 'in', 'gte', 'order', 'limit']) b[m] = () => b;
    b.range = async () => ({ data: rows, error: null });
    b.then = (ok: (v: unknown) => unknown) => Promise.resolve({ data: rows, error: null }).then(ok);
    return b;
  };
  const tables: Record<string, unknown[]> = {
    alert_settings: users.map(u => ({ user_id: u.id, kp_threshold: u.kp ?? 6, time_zone: 'UTC', channels: { email: true },
      rules: { aurora: true, level: u.level, forecast: true, storm: u.storm ?? false, quiet: u.quiet ?? false, quietFrom: '21:00', quietTo: '23:00' } })),
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
beforeEach(() => { vi.setSystemTime(NOW); env.kp = 3; env.ovation = 20; env.cloud = 0; env.hourly = []; env.series = []; });

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
