/**
 * Which all-sky cameras to show for a place, and in what state. Pure functions (no I/O); used by the
 * "Live sky cams" panel (client) and the Bluesky attachment gate (server).
 *
 * - Distance: great-circle (haversine) from the place to each camera; the nearest within 800 km, at most three.
 *   An all-sky camera shows the sky over the camera, not over the place, so the panel shows the distance.
 * - Darkness: the camera runs while the Sun at the camera is below its darkSunElevationDeg (−10° by default,
 *   the rule UiT and SGO publish). One rule covers both the dark season and night.
 * - Freshness: a frame older than maxImageAgeSeconds (or no frame at all) is "offline".
 * The panel is hidden when no camera in range is in darkness (e.g. Yukagir, or any place in polar summer).
 */

import { sunAltitude } from './astro';
import type { SkyCamera } from './skycams';

export const DEFAULT_RADIUS_KM = 800;
export const MAX_CAMERAS = 3;

/** Great-circle distance in km (haversine, mean Earth radius). */
export function greatCircleKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const r = Math.PI / 180, dLat = (b.lat - a.lat) * r, dLon = (b.lon - a.lon) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** The nearest cameras within `radiusKm` of the place, closest first, at most `max`. */
export function nearestCameras(place: { lat: number; lon: number }, cams: SkyCamera[], radiusKm = DEFAULT_RADIUS_KM, max = MAX_CAMERAS): { cam: SkyCamera; km: number }[] {
  return cams.map(cam => ({ cam, km: greatCircleKm(place, cam) }))
    .filter(x => x.km <= radiusKm)
    .sort((a, b) => a.km - b.km)
    .slice(0, max);
}

/** The Sun's elevation at the camera (degrees). */
export const sunElevationAt = (cam: Pick<SkyCamera, 'lat' | 'lon'>, t: number) => sunAltitude(t, cam.lat, cam.lon);

/** True while the camera runs: the Sun at the camera is below its dark threshold. */
export const inSeason = (cam: Pick<SkyCamera, 'lat' | 'lon' | 'darkSunElevationDeg'>, t: number) => sunElevationAt(cam, t) < cam.darkSunElevationDeg;

/** 'fresh' when a frame captured at `capturedAt` (ms) is within the camera's age limit; else 'stale'. */
export function freshness(cam: Pick<SkyCamera, 'maxImageAgeSeconds'>, capturedAt: number | null, now: number): 'fresh' | 'stale' {
  if (capturedAt === null || !Number.isFinite(capturedAt)) return 'stale';
  const age = (now - capturedAt) / 1000;
  return age <= cam.maxImageAgeSeconds && age > -300 ? 'fresh' : 'stale';
}

/** What the panel knows about a cleared camera's latest frame (from /api/skycam/:id). */
export type FrameStatus = { kind: 'loading' } | { kind: 'error' } | { kind: 'frame'; capturedAt: number | null; src: string };

export type PanelItem =
  | { kind: 'image'; cam: SkyCamera; km: number; capturedAt: number | null; src: string }
  | { kind: 'loading'; cam: SkyCamera; km: number }
  | { kind: 'offline'; cam: SkyCamera; km: number }
  | { kind: 'error'; cam: SkyCamera; km: number }
  | { kind: 'link'; cam: SkyCamera; km: number };

export type PanelModel = { visible: false; reason: 'no-camera' | 'daylight' } | { visible: true; items: PanelItem[] };

/**
 * The panel for a place at time `now`. Only cameras in range and in darkness appear. A camera whose licence is
 * cleared shows its image (or "loading", "offline" when its frame is stale, "error" when it can't be fetched); every other
 * camera is a link card to the operator's page. Hidden when no camera in range is in darkness.
 */
export function panelModel(place: { lat: number; lon: number } | null, now: number, cams: SkyCamera[], frames: Record<string, FrameStatus | undefined>, radiusKm = DEFAULT_RADIUS_KM): PanelModel {
  if (!place) return { visible: false, reason: 'no-camera' };
  const near = nearestCameras(place, cams, radiusKm);
  if (!near.length) return { visible: false, reason: 'no-camera' };
  const dark = near.filter(({ cam }) => inSeason(cam, now));
  if (!dark.length) return { visible: false, reason: 'daylight' };
  const items = dark.map(({ cam, km }): PanelItem => {
    if (cam.license.status !== 'cleared' || !cam.imageUrl) return { kind: 'link', cam, km };
    const f = frames[cam.id];
    if (!f || f.kind === 'loading') return { kind: 'loading', cam, km };
    if (f.kind === 'error') return { kind: 'error', cam, km };
    if (freshness(cam, f.capturedAt, now) === 'stale') return { kind: 'offline', cam, km };
    return { kind: 'image', cam, km, capturedAt: f.capturedAt, src: f.src };
  });
  return { visible: true, items };
}
