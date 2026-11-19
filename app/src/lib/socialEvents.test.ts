import { describe, expect, it } from 'vitest';
import { graphemes } from './bluesky';
import { DEFAULT_SOCIAL_RULES, EVENT_KINDS, STYLES, detectEvents, eventPostText, flareClass, gLevel, headline, isRepeat, pickStyle, recentFlare, sampleEvent, stormNow, type EventInputs, type SocialEvent } from './socialEvents';

const NOW = Date.parse('2026-11-18T14:30:00Z');
const empty: EventInputs = { kp: [], hp30: [], xrays: [], wind: [], power: [] };
const on = { ...DEFAULT_SOCIAL_RULES, enabled: true, substorms: true };

describe('levels and classes', () => {
  it('maps Kp to NOAA G levels', () => {
    expect([4.67, 5, 5.67, 6, 7, 8.33, 9].map(gLevel)).toEqual([0, 1, 1, 2, 3, 4, 5]);
  });
  it('names flare classes', () => {
    expect(flareClass(1.23e-4)).toBe('X1.2');
    expect(flareClass(5.47e-5)).toBe('M5.4');
    expect(flareClass(2e-6)).toBe('C2.0');
  });
});

describe('storm', () => {
  it('uses observed Kp and Hp30, never forecasts', () => {
    const inp: EventInputs = { ...empty, kp: [{ t: NOW - 36e5, kp: 4.33, kind: 'observed' }, { t: NOW + 36e5, kp: 8, kind: 'predicted' }], hp30: [{ t: NOW - 30 * 6e4, hp: 6.33 }] };
    expect(stormNow(inp, NOW)?.kp).toBe(6.33);
    const ev = detectEvents(inp, on, NOW);
    expect(ev).toEqual([expect.objectContaining({ kind: 'storm', g: 2, key: 'storm:G2:2026-11-18' })]);
    expect(detectEvents({ ...inp, hp30: [] }, on, NOW)).toEqual([]);
  });
  it('respects the minimum level and the off switch', () => {
    const inp: EventInputs = { ...empty, hp30: [{ t: NOW - 6e5, hp: 5.33 }] };
    expect(detectEvents(inp, { ...on, stormMinG: 2 }, NOW)).toEqual([]);
    expect(detectEvents(inp, { ...on, stormMinG: 0 }, NOW)).toEqual([]);
  });
});

describe('flare', () => {
  const run = (peak: number, crossAgoMin: number) => Array.from({ length: 60 }, (_, i) => {
    const t = NOW - (59 - i) * 6e4;
    return { t, flux: i < 59 - crossAgoMin - 5 ? 2e-6 : i < 59 - crossAgoMin ? 3e-5 : peak };
  });
  it('posts an X flare crossed within 30 minutes, keyed by the start of its run', () => {
    const ev = detectEvents({ ...empty, xrays: run(1.5e-4, 10) }, on, NOW);
    expect(ev).toEqual([expect.objectContaining({ kind: 'flare', cls: 'X1.5' })]);
    expect(ev[0].key).toBe(`flare:${new Date(NOW - 15 * 6e4).toISOString().slice(0, 16)}`);
  });
  it('never posts a backlog (crossed over 30 minutes ago) or a flare below the minimum', () => {
    expect(detectEvents({ ...empty, xrays: run(1.5e-4, 40) }, on, NOW)).toEqual([]);
    expect(detectEvents({ ...empty, xrays: run(6e-5, 5) }, on, NOW)).toEqual([]);
    // M2 option: an M2.4 that crossed 5 minutes ago posts; an M1.9 does not.
    const m = (peak: number) => Array.from({ length: 60 }, (_, i) => ({ t: NOW - (59 - i) * 6e4, flux: i < 54 ? 1.2e-5 : peak }));
    expect(detectEvents({ ...empty, xrays: m(2.4e-5) }, { ...on, flareMin: 'M2' }, NOW)).toMatchObject([{ kind: 'flare', cls: 'M2.4' }]);
    expect(detectEvents({ ...empty, xrays: m(1.9e-5) }, { ...on, flareMin: 'M2' }, NOW)).toEqual([]);
  });
});

describe('repeats', () => {
  const row = (ev: Partial<SocialEvent> & { kind: SocialEvent['kind'] }, agoH: number, key = 'other') => ({ key, kind: ev.kind, created_at: new Date(NOW - agoH * 36e5).toISOString(), data: ev });
  it('posts a storm again only at a higher level or after 24 h', () => {
    const g2: SocialEvent = { kind: 'storm', key: 'storm:G2:x', at: NOW, g: 2, kp: 6 };
    expect(isRepeat(g2, [row({ kind: 'storm', g: 2 }, 3)], NOW)).toBe(true);
    expect(isRepeat(g2, [row({ kind: 'storm', g: 1 }, 3)], NOW)).toBe(false);
    expect(isRepeat(g2, [row({ kind: 'storm', g: 3 }, 25)], NOW)).toBe(false);
  });
  it('treats the same key as posted', () => {
    expect(isRepeat({ kind: 'shock', key: 'k', at: NOW }, [row({ kind: 'storm' }, 100, 'k')], NOW)).toBe(true);
  });
});

describe('post text', () => {
  it('stays within 300 graphemes with link and tags, for every kind and extreme values', () => {
    for (const kind of EVENT_KINDS) {
      for (const ev of [sampleEvent(kind, NOW), { ...sampleEvent(kind, NOW), g: 5, kp: 9, cls: 'X28.0', from: 1234, to: 2999 }]) {
        const text = eventPostText(ev);
        expect(graphemes(text)).toBeLessThanOrEqual(300);
        expect(text).toContain('https://www.polarlights.io/');
        expect(text).not.toMatch(/official warning/i);
        expect(text).toMatch(/#\w+/);
      }
    }
  });
});

describe('variety', () => {
  it('words the same kind of post differently from event to event, but the same for one event', () => {
    const heads = new Set(Array.from({ length: 30 }, (_, i) => headline({ ...sampleEvent('storm', NOW), key: `storm:G3:day${i}` })));
    expect(heads.size).toBeGreaterThan(1);
    const ev = { ...sampleEvent('flare', NOW), key: 'flare:x' };
    expect(eventPostText(ev)).toBe(eventPostText(ev));
  });
  it('rotates picture styles per kind, skipping failed posts', () => {
    const row = (style: string, h: number, status = 'posted') => ({ kind: 'viewing', status, created_at: new Date(NOW - h * 36e5).toISOString(), data: { style } as Partial<SocialEvent> });
    expect(pickStyle('viewing', [])).toBe('globe');
    expect(pickStyle('viewing', [row('globe', 2)])).toBe('map');
    expect(pickStyle('viewing', [row('map', 1), row('globe', 5)])).toBe('globe');
    // An older post with a retired style starts the rotation again.
    expect(pickStyle('viewing', [row('card', 1)])).toBe('globe');
    expect(pickStyle('viewing', [row('map', 1, 'failed'), row('globe', 3)])).toBe('map');
    expect(pickStyle('storm', [])).toBe('card');
    expect(STYLES.flare).toContain('sun');
  });
});

describe('recentFlare (Post now)', () => {
  const NOW2 = Date.parse('2026-11-19T14:30:00Z');
  // Quiet C-level flux with two finished flares: M2.4 peaking at 13:24 and M1.1 at 13:59.
  const xrays = Array.from({ length: 360 }, (_, i) => {
    const t = NOW2 - (359 - i) * 6e4;
    const m = new Date(t).toISOString().slice(11, 16);
    const flux = m >= '13:15' && m <= '13:35' ? (m === '13:24' ? 2.4e-5 : 1.4e-5) : m >= '13:56' && m <= '14:03' ? (m === '13:59' ? 1.1e-5 : 1.02e-5) : 4e-6;
    return { t, flux };
  });
  it('finds the biggest finished flare of the last 6 hours at the chosen level', () => {
    expect(recentFlare(xrays, NOW2, 'M2')).toEqual({ kind: 'flare', key: 'flare:2026-11-19T13:15', at: Date.parse('2026-11-19T13:24:00Z'), flux: 2.4e-5, cls: 'M2.4', ended: true });
    expect(recentFlare(xrays, NOW2, 'X')).toBeNull();
    expect(recentFlare(xrays, NOW2 + 7 * 36e5, 'M2')).toBeNull(); // out of the window
  });
  it('uses the same key as the live feed for a flare still in progress', () => {
    const live = xrays.map(p => (p.t >= NOW2 - 10 * 6e4 ? { ...p, flux: p.t >= NOW2 - 4 * 6e4 ? 3e-5 : 1.5e-5 } : p));
    const ev = recentFlare(live, NOW2, 'M2')!;
    expect(ev).toMatchObject({ cls: 'M3.0', ended: false });
    expect(detectEvents({ kp: [], hp30: [], xrays: live, wind: [], power: [] }, { enabled: true, stormMinG: 0, flareMin: 'M2', shocks: false, substorms: false }, NOW2)[0].key).toBe(ev.key);
  });
});
