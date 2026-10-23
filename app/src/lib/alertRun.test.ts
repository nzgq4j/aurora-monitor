import { beforeEach, describe, expect, it, vi } from 'vitest';

// The run is tested against stand-ins for the forecast feeds, cloud data and the database.
const feeds = vi.hoisted(() => ({ kp: 7 as number | null, series: [] as { t: number; kp: number; kind: string }[], oval: null }));
vi.mock('./feeds', () => ({
  kpNow: async () => (feeds.kp === null ? null : { t: Date.now(), kp: feeds.kp }),
  kpSeries: async () => feeds.series,
  ovation: async () => feeds.oval,
  ovalAt: () => ({ nearby: 0 }),
  hp30Recent: async () => [],
}));
vi.mock('./cloud', () => ({ cloudCover: async () => null }));

import { runAlerts } from './alertEngine';

type Rows = Record<string, unknown[]>;
/** A tiny stand-in for the Supabase client: every query on a table returns that table's rows. */
function fakeAdmin(rows: Rows, fail: string[] = []) {
  const inserted: Record<string, unknown[]> = {};
  const query = (table: string) => {
    const result = () => (fail.includes(table) ? { data: null, error: { message: `${table} down` } } : { data: rows[table] ?? [], error: null });
    const q: Record<string, unknown> = {};
    for (const m of ['select', 'eq', 'in', 'gte', 'order', 'limit']) q[m] = () => q;
    q.range = async () => result();
    q.then = (ok: (v: unknown) => unknown) => Promise.resolve(result()).then(ok);
    q.insert = async (r: unknown[]) => { (inserted[table] ??= []).push(...r); return { error: null }; };
    return q;
  };
  return { admin: { from: query, auth: { admin: { getUserById: async () => ({ data: { user: { email: 'x@example.com' } } }) } } } as never, inserted };
}

const user = (id: string, rules: unknown = {}) => ({ user_id: id, kp_threshold: 6, rules, time_zone: 'UTC', channels: { email: true } });

beforeEach(() => { feeds.kp = 7; feeds.series = []; });

describe('runAlerts', () => {
  it('alerts every user even when one has broken saved rules', async () => {
    const ids = ['00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-00000000000c'];
    const { admin, inserted } = fakeAdmin({ alert_settings: [user(ids[0]), user(ids[1], { quiet: true, quietFrom: 5, quietTo: {} }), user(ids[2])] });
    const summary = await runAlerts(admin);
    expect(summary).toMatchObject({ users: 3, failed: 0, deferred: 0, feedsOk: true });
    // Kp 7 is over every user's storm threshold of 6: one storm alert each.
    expect((inserted.alert_log ?? []).length).toBe(3);
  });
  it('sends nothing and says why when the forecast feeds are all down', async () => {
    feeds.kp = null;
    const { admin, inserted } = fakeAdmin({ alert_settings: [user('00000000-0000-0000-0000-00000000000a')] });
    expect(await runAlerts(admin)).toMatchObject({ feedsOk: false, alerts: 0 });
    expect(inserted.alert_log).toBeUndefined();
  });
  it('skips a batch whose recent alerts can’t be read, rather than risk repeats', async () => {
    const { admin, inserted } = fakeAdmin({ alert_settings: [user('00000000-0000-0000-0000-00000000000a')] }, ['alert_log']);
    expect(await runAlerts(admin)).toMatchObject({ users: 0, deferred: 1 });
    expect(inserted.alert_log).toBeUndefined();
  });
});
