/** The live wiring of the event feed: NOAA/GFZ feeds in, cards drawn in-process (server only). */

import { hemiPowerSeries, hp30Recent, kpSeries, ovation, solarWindSeries, xrayRecent } from './feeds';
import { renderCard } from './socialCard';
import type { FeedDeps } from './socialFeed';

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
    const oval = ev.kind === 'storm' || ev.kind === 'substorm' ? await ovation().catch(() => null) : null;
    return { oval, kp: inputs.kp, xrays: inputs.xrays, wind: inputs.wind, power: inputs.power };
  },
  render: renderCard,
};
