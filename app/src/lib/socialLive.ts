/** The live wiring of the event feed: NOAA/GFZ feeds in, cards drawn in-process (server only). */

import { hemiPowerSeries, hp30Recent, kpNow, kpSeries, ovalAt, ovation, solarWindSeries, xrayRecent } from './feeds';
import { kpNeeded, moon } from './astro';
import { cloudCover } from './cloud';
import { hourlyScores, verdict } from './tonight';
import { authFor } from './socialFeed';
import type { SiteOutlook, ViewingDeps } from './socialViewing';
import type { ViewingSite } from './socialEvents';
import type { CardData } from './socialCard';
import { renderCard } from './socialCard';
import { SDO_IMAGES, sdoAt } from './sdo';
import type { FeedDeps } from './socialFeed';

/**
 * The latest Sun image for a card, as a data URL: SDO AIA 131 Å (shows flares) or SOHO LASCO C3 (shows CMEs
 * leaving the Sun), at 1024 px. Null if it can't be fetched in time (the card then uses the data style).
 */
export async function sunImage(id: '0131' | 'C3'): Promise<CardData['sun']> {
  const img = SDO_IMAGES.find(i => i.id === id)!;
  try {
    const res = await fetch(sdoAt(img, 1024), { signal: AbortSignal.timeout(8000), cache: 'no-store' });
    if (!res.ok) return null;
    const type = res.headers.get('content-type')?.split(';')[0] ?? 'image/jpeg';
    const bytes = Buffer.from(await res.arrayBuffer());
    if (bytes.length < 10_000) return null;
    return { src: `data:${type};base64,${bytes.toString('base64')}`, label: id === 'C3' ? 'LASCO C3 coronagraph' : 'SDO AIA 131 Å', source: id === 'C3' ? 'ESA/NASA SOHO' : 'NASA SDO' };
  } catch { return null; }
}

export const liveDeps: FeedDeps = {
  async inputs(need) {
    const [kp, hp30, xrays, wind, power] = await Promise.all([
      need.storm ? kpSeries().catch(() => []) : [],
      need.storm ? hp30Recent().catch(() => []) : [],
      need.flare ? xrayRecent().catch(() => []) : [],
      need.shock ? solarWindSeries().catch(() => []) : [],
      need.substorm ? hemiPowerSeries().catch(() => []) : [],
    ]);
    return { kp, hp30, xrays, wind, power };
  },
  // The card is drawn from the data already in hand (a brand-new event may not be in any feed by id yet).
  async cardData(ev, inputs) {
    const [oval, sun] = await Promise.all([
      ev.kind === 'storm' || ev.kind === 'substorm' ? ovation().catch(() => null) : null,
      ev.style === 'sun' ? sunImage(ev.kind === 'shock' ? 'C3' : '0131') : null,
    ]);
    return { oval, sun, kp: inputs.kp, xrays: inputs.xrays, wind: inputs.wind, power: inputs.power };
  },
  render: renderCard,
};

/** Hourly viewing scores and verdicts for each site (the same inputs as the place alerts in alertEngine). */
export async function siteOutlooks(sites: ViewingSite[], now: number): Promise<{ outlooks: SiteOutlook[]; card: CardData }> {
  const [kpLatest, series, oval] = await Promise.all([kpNow().catch(() => null), kpSeries().catch(() => []), ovation().catch(() => null)]);
  const kp = kpLatest?.kp ?? null;
  const outlooks = await Promise.all(sites.map(async site => {
    const need = kpNeeded(site.lat, site.lon);
    const cloud = await cloudCover(site.lat, site.lon).catch(() => null);
    const hours = hourlyScores({
      lat: site.lat, lon: site.lon, need, kpNow: kp, series,
      ovationNearby: oval ? ovalAt(oval, site.lat, site.lon).nearby : null,
      cloudNow: cloud?.aurora ?? null, cloudHourly: cloud?.next12h ?? [],
      moonIllumination: moon(now, site.lat, site.lon).illumination, now,
    });
    return { site, hours, verdict: verdict(hours, need), need, tz: cloud?.timeZone ?? null };
  }));
  return { outlooks, card: { oval, kp: series } };
}

export const viewingDeps: ViewingDeps = { outlooks: siteOutlooks, render: renderCard, auth: authFor };
