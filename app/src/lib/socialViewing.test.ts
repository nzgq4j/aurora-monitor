import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { graphemes } from './bluesky';
import { cardAlt } from './socialCard';
import { eventPostText, sampleEvent, type ViewingSite } from './socialEvents';
import { memoryStore } from './socialStore';
import { groupRegions, nightKey, runViewingFeed, viewingBudget, viewingCandidates, type SiteOutlook, type ViewingDeps } from './socialViewing';
import type { HourScore, Verdict } from './tonight';

const NOW = Date.parse('2026-11-19T03:00:00Z');
const site = (id: string, name: string, lat: number, lon: number, tags = ''): ViewingSite => ({ id, name, lat, lon, tags });
const SITES = [
  site('a-ornes', 'Ørnes, Nordland', 66.869, 13.706, '#nordlys #Norway'),
  site('b-fair', 'Fairbanks, Alaska', 64.838, -147.716, '#Alaska'),
  site('c-yuk', 'Yukagir, Sakha', 71.776, 139.848),
  site('d-church', 'Churchill, Manitoba', 58.768, -94.167),
  site('e-sand', 'Sandnessjøen, Nordland', 66.022, 12.632),
  site('f-tjotta', 'Tjøtta, Nordland', 65.823, 12.428),
  site('g-soder', 'Söderhamn, Gävleborg', 61.415, 16.986),
];

const hours = (scores: number[], base = NOW): HourScore[] => scores.map((score, i) => ({ t: base + i * 36e5, score, kp: 4.33, cloud: 10, sunAlt: -30, moonUp: false, f: { aurora: 1, dark: 1, cloud: 1, moon: 1 } }));
function outlook(s: ViewingSite, level: Verdict['level'], scores: number[], bestIdx = 0, tz = 'Europe/Oslo', base = NOW): SiteOutlook {
  const h = hours(scores, base);
  const best = h[bestIdx];
  return { site: s, hours: h, need: 1, tz, verdict: { level, score: level === 'goNow' ? h[0].score : best.score, best, subject: best, window: { from: best.t, to: best.t + 2 * 36e5 }, limit: null, look: 'high' } };
}

describe('regions', () => {
  it('groups the three Nordland sites and keeps the others apart', () => {
    const groups = groupRegions(SITES);
    expect(groups).toHaveLength(5);
    expect(groups.find(g => g.length > 1)?.map(s => s.id).sort()).toEqual(['a-ornes', 'e-sand', 'f-tjotta']);
  });
});

describe('nightKey', () => {
  it('keeps a night together across local midnight', () => {
    expect(nightKey(Date.parse('2026-11-19T03:00:00Z'), 'America/Anchorage', -147.7)).toBe('2026-11-18');
    expect(nightKey(Date.parse('2026-11-19T10:00:00Z'), 'America/Anchorage', -147.7)).toBe('2026-11-18');
    // The night changes at local noon: 11:00 in Alaska still belongs to the night before, 14:00 to the next.
    expect(nightKey(Date.parse('2026-11-19T20:00:00Z'), 'America/Anchorage', -147.7)).toBe('2026-11-18');
    expect(nightKey(Date.parse('2026-11-19T23:00:00Z'), 'America/Anchorage', -147.7)).toBe('2026-11-19');
    expect(nightKey(Date.parse('2026-11-19T03:00:00Z'), null, 13.7)).toBe('2026-11-18');
  });
});

describe('viewingCandidates', () => {
  it('names the best site per region, visible-now first, and skips weak or imminent ones', () => {
    const out = viewingCandidates([
      outlook(SITES[0], 'goLater', [10, 20, 70, 60], 2),
      outlook(SITES[5], 'goNow', [55, 50, 40]),
      outlook(SITES[1], 'maybe', [10, 30, 35], 2, 'America/Anchorage'),
      outlook(SITES[3], 'goLater', [40, 80], 1, 'America/Winnipeg'),
      outlook(SITES[6], 'goLater', [5, 10, 90], 2, 'Europe/Stockholm'),
    ], NOW);
    expect(out.map(e => [e.viewing?.site.name, e.viewing?.mode, e.viewing?.score])).toEqual([
      ['Tjøtta, Nordland', 'now', 55],
      ['Söderhamn, Gävleborg', 'tonight', 90],
      ['Churchill, Manitoba', 'tonight', 80],
    ]);
    expect(out[0].key).toBe('viewing:a-ornes:2026-11-18');
    expect(out[0].viewing?.nearby).toEqual(['Ørnes, Nordland']);
  });
});

describe('viewingBudget', () => {
  const row = (h: number, status: 'posted' | 'failed' = 'posted') => ({ kind: 'viewing' as const, status, created_at: new Date(NOW - h * 36e5).toISOString() });
  it('caps at 4 a UTC day and keeps 2 hours between posts; failed posts do not count', () => {
    expect(viewingBudget([], NOW)).toEqual({ ok: true });
    expect(viewingBudget([row(1)], NOW)).toEqual({ ok: false, reason: 'too_soon' });
    expect(viewingBudget([row(1, 'failed')], NOW)).toEqual({ ok: true });
    const today = [0.0, 0.5, 1, 2.5].map(h => ({ kind: 'viewing' as const, status: 'posted' as const, created_at: new Date(Date.parse('2026-11-19T00:10:00Z') + h * 36e5).toISOString() }));
    expect(viewingBudget(today, Date.parse('2026-11-19T08:00:00Z'))).toEqual({ ok: false, reason: 'daily_cap' });
    expect(viewingBudget(today, Date.parse('2026-11-20T00:05:00Z'))).toEqual({ ok: true });
  });
});

describe('viewing text and alt', () => {
  it('stays within 300 graphemes with local times and tags, even for long names', () => {
    for (const mode of ['now', 'tonight'] as const) {
      const ev = sampleEvent('viewing', NOW);
      ev.viewing = { ...ev.viewing!, mode, site: { ...ev.viewing!.site, name: 'Kirkenes and the Pasvik Valley, Sør-Varanger, Finnmark', tags: '#nordlys #Norway #Finnmark' } };
      const text = eventPostText(ev);
      expect(graphemes(text)).toBeLessThanOrEqual(300);
      expect(text).toContain('#nordlys');
      expect(text).not.toMatch(/official warning/i);
      expect(text).toContain('https://www.polarlights.io/map');
    }
    const tonight = eventPostText(sampleEvent('viewing', NOW));
    expect(tonight.split('\n')[0]).toContain('Fairbanks, Alaska');
    expect(tonight.split('\n')[1]).toMatch(/^Best from \d\d:\d\d to \d\d:\d\d local time \(\d\d:\d\d–\d\d:\d\d UTC\)/);
    const alt = cardAlt(sampleEvent('viewing', NOW), {});
    expect(alt).toContain('Fairbanks, Alaska');
    expect(alt).toContain('ringed white dot');
    expect(graphemes(alt)).toBeGreaterThan(150);
  });
});

describe('runViewingFeed', () => {
  let sent: unknown[] = [];
  beforeEach(() => {
    sent = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit = {}) => {
      const method = new URL(url).pathname.replace('/xrpc/', '');
      if (method === 'com.atproto.repo.createRecord') sent.push(JSON.parse(String(init.body)));
      const reply = method === 'com.atproto.repo.uploadBlob' ? { blob: { ref: 'b' } } : { uri: 'at://did:plc:pl/app.bsky.feed.post/3v' };
      return new Response(JSON.stringify(reply), { status: 200 });
    }));
  });
  afterEach(() => vi.unstubAllGlobals());
  const session = { service: 'https://pds.test', did: 'did:plc:pl', handle: 'polarlights.io', accessJwt: 'a', refreshJwt: 'r' };
  const deps = (now: number): ViewingDeps => ({
    now: () => now,
    auth: async () => session,
    render: async () => ({ bytes: new Uint8Array([137, 80, 78, 71]), type: 'image/png', width: 1080, height: 1350, alt: 'Polar Lights card for a viewing site with a map of the aurora oval and hourly viewing bars.' }),
    outlooks: async () => ({ outlooks: [outlook(SITES[0], 'goNow', [60], 0, 'Europe/Oslo', now), outlook(SITES[3], 'goLater', [20, 75], 1, 'America/Winnipeg', now)], card: {} }),
  });

  it('is off until switched on', async () => {
    const st = memoryStore({ sites: SITES });
    expect(await runViewingFeed(st, deps(NOW))).toEqual({ ok: true, skipped: 'off' });
  });

  it('posts the best region, then waits 2 hours, then posts the next region; never the same region twice a night', async () => {
    const st = memoryStore({ settings: { viewing_enabled: true }, sites: SITES });
    const first = await runViewingFeed(st, deps(NOW));
    expect(first.outcome).toMatchObject({ status: 'posted' });
    expect((sent[0] as { record: { text: string; langs: string[] } }).record.text.split('\n')[0]).toContain('Ørnes, Nordland');
    expect((sent[0] as { record: { text: string } }).record.text).toContain('Aurora, darkness and clear sky line up');
    // Real store rows carry created_at = now; the memory store stamps the wall clock, so pin it.
    st.rows.forEach(r => { r.created_at = new Date(NOW).toISOString(); });
    expect((await runViewingFeed(st, deps(NOW + 10 * 6e4))).skipped).toBe('too_soon');
    const later = await runViewingFeed(st, deps(NOW + 2 * 36e5 + 6e4));
    expect(later.outcome).toMatchObject({ status: 'posted' });
    expect((sent[1] as { record: { text: string } }).record.text.split('\n')[0]).toContain('Churchill, Manitoba');
    // The picture style rotates: the second viewing post uses the next style after the first's.
    expect(st.rows.map(r => r.data?.style)).toEqual(['globe', 'map']);
    st.rows.forEach(r => { r.created_at = new Date(NOW).toISOString(); });
    const again = await runViewingFeed(st, deps(NOW + 4 * 36e5 + 2 * 6e4));
    expect(again.candidates).toEqual([]);
    expect(sent).toHaveLength(2);
  });
});
