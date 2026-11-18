import { describe, expect, it } from 'vitest';
import { SKY_CAMERAS, cameraById } from './skycams';
import { freshness, greatCircleKm, inSeason, nearestCameras, panelModel } from './skycamLogic';

const KIRUNA = { lat: 67.8558, lon: 20.2253 };
const MIDSUMMER_NOON = Date.parse('2026-06-21T12:00:00Z');
const MIDWINTER_NIGHT = Date.parse('2026-12-21T23:00:00Z');
const frame = (capturedAt: number) => ({ 'irf-kiruna': { kind: 'frame' as const, capturedAt, src: 'blob:k' } });

describe('distances', () => {
  it('great-circle distance is about right', () => {
    // Kiruna to Tromsø is about 250 km.
    expect(greatCircleKm(KIRUNA, { lat: 69.65, lon: 18.96 })).toBeGreaterThan(200);
    expect(greatCircleKm(KIRUNA, { lat: 69.65, lon: 18.96 })).toBeLessThan(260);
  });

  it('keeps cameras within 800 km, nearest first, at most three', () => {
    const near = nearestCameras(KIRUNA, SKY_CAMERAS);
    expect(near.length).toBe(3);
    expect(near[0].cam.id).toBe('irf-kiruna');
    expect(near.every(n => n.km <= 800)).toBe(true);
    for (let i = 1; i < near.length; i++) expect(near[i].km).toBeGreaterThanOrEqual(near[i - 1].km);
  });
});

describe('panel', () => {
  it('is hidden in polar summer at Kiruna (daylight)', () => {
    expect(panelModel(KIRUNA, MIDSUMMER_NOON, SKY_CAMERAS, frame(MIDSUMMER_NOON))).toEqual({ visible: false, reason: 'daylight' });
  });

  it('shows the Kiruna image at midwinter midnight', () => {
    const m = panelModel(KIRUNA, MIDWINTER_NIGHT, SKY_CAMERAS, frame(MIDWINTER_NIGHT - 60_000));
    expect(m.visible).toBe(true);
    if (!m.visible) return;
    expect(m.items[0]).toMatchObject({ kind: 'image', src: 'blob:k' });
    expect(m.items[0].cam.id).toBe('irf-kiruna');
    // Cameras without a cleared licence are link cards.
    expect(m.items.slice(1).every(i => i.kind === 'link')).toBe(true);
  });

  it('marks a stale frame offline', () => {
    const m = panelModel(KIRUNA, MIDWINTER_NIGHT, SKY_CAMERAS, frame(MIDWINTER_NIGHT - 3_600_000));
    expect(m.visible && m.items[0].kind).toBe('offline');
  });

  it('loading before a frame arrives, error when it fails', () => {
    const loading = panelModel(KIRUNA, MIDWINTER_NIGHT, SKY_CAMERAS, {});
    expect(loading.visible && loading.items[0].kind).toBe('loading');
    const err = panelModel(KIRUNA, MIDWINTER_NIGHT, SKY_CAMERAS, { 'irf-kiruna': { kind: 'error' } });
    expect(err.visible && err.items[0].kind).toBe('error');
  });

  it('is hidden where no camera is in range (Yukagir) or with no place', () => {
    expect(panelModel({ lat: 71.776, lon: 139.848 }, MIDWINTER_NIGHT, SKY_CAMERAS, {})).toEqual({ visible: false, reason: 'no-camera' });
    expect(panelModel(null, MIDWINTER_NIGHT, SKY_CAMERAS, {})).toEqual({ visible: false, reason: 'no-camera' });
  });
});

describe('season and freshness', () => {
  const k = cameraById('irf-kiruna')!;
  it('dark at midwinter midnight, not at midsummer noon', () => {
    expect(inSeason(k, MIDWINTER_NIGHT)).toBe(true);
    expect(inSeason(k, MIDSUMMER_NOON)).toBe(false);
  });
  it('fresh within the age limit, stale beyond it or when unknown', () => {
    const now = MIDWINTER_NIGHT;
    expect(freshness(k, now - 599_000, now)).toBe('fresh');
    expect(freshness(k, now - 601_000, now)).toBe('stale');
    expect(freshness(k, null, now)).toBe('stale');
  });
});
