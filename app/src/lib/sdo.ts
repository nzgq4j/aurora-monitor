const SDO = (ch: string) => `https://sdo.gsfc.nasa.gov/assets/img/latest/latest_512_${ch}.jpg`;
const SWPC = 'https://services.swpc.noaa.gov/images/animations';

/**
 * The live Sun views: NASA SDO, SOHO's LASCO coronagraphs (ESA/NASA), and NOAA's SUVI (GOES-19) and CCOR
 * coronagraphs (GOES-19 and SWFO-L1), straight from their publishers. SDO and SOHO refresh every 15 minutes
 * or so, SWPC's every 4 to 15. Captions are `sdo.{id}` in the messages; the capture-sun edge function saves
 * every one hourly for the time-lapse. `sized`: the publisher also has it at 1024 and 2048 px (see sdoAt).
 */
export const SDO_IMAGES = [
  { id: '0193', label: 'AIA 193 Å', url: SDO('0193'), sized: true },
  { id: '0171', label: 'AIA 171 Å', url: SDO('0171'), sized: true },
  { id: '211193171', label: 'AIA 211·193·171', url: SDO('211193171'), sized: true },
  { id: '0211', label: 'AIA 211 Å', url: SDO('0211'), sized: true },
  { id: '0304', label: 'AIA 304 Å', url: SDO('0304'), sized: true },
  { id: 'HMIIC', label: 'HMI', url: SDO('HMIIC'), sized: true },
  { id: 'HMIBC', label: 'HMI magnetogram', url: SDO('HMIBC'), sized: true },
  { id: '0131', label: 'AIA 131 Å', url: SDO('0131'), sized: true },
  { id: '0094', label: 'AIA 94 Å', url: SDO('0094'), sized: true },
  { id: '0335', label: 'AIA 335 Å', url: SDO('0335'), sized: true },
  { id: '1600', label: 'AIA 1600 Å', url: SDO('1600'), sized: true },
  { id: '1700', label: 'AIA 1700 Å', url: SDO('1700'), sized: true },
  { id: 'SUVIMAP', label: 'SUVI map', url: `${SWPC}/suvi/primary/map/latest.png`, sized: false },
  { id: 'SUVI195', label: 'SUVI 195 Å', url: `${SWPC}/suvi/primary/195/latest.png`, sized: false },
  { id: 'SUVI284', label: 'SUVI 284 Å', url: `${SWPC}/suvi/primary/284/latest.png`, sized: false },
  // Not disc images: coronagraphs block the Sun (a circle marks its edge) to show CMEs leaving it.
  { id: 'C2', label: 'LASCO C2', url: 'https://soho.nascom.nasa.gov/data/realtime/c2/512/latest.jpg', sized: true },
  { id: 'C3', label: 'LASCO C3', url: 'https://soho.nascom.nasa.gov/data/realtime/c3/512/latest.jpg', sized: true },
  { id: 'CCOR1', label: 'CCOR-1', url: `${SWPC}/ccor1/latest.jpg`, sized: false },
  { id: 'CCOR1D', label: 'CCOR-1 Δ', url: `${SWPC}/ccor1-diff/latest.jpg`, sized: false },
  { id: 'CCOR2', label: 'CCOR-2', url: `${SWPC}/ccor2/latest.jpg`, sized: false },
  { id: 'CCOR2D', label: 'CCOR-2 Δ', url: `${SWPC}/ccor2-diff/latest.jpg`, sized: false },
] as const;

export type SunView = (typeof SDO_IMAGES)[number];

/**
 * The same image at another size: SDO publishes 512, 1024 and 2048 px, and LASCO goes up to 1024.
 * SWPC's images come in one size (1024 px or larger), so they are used as they are.
 */
export const sdoAt = (img: SunView, size: 1024 | 2048) =>
  img.sized ? img.url.replace('/latest_512_', `/latest_${size}_`).replace(/\/(c[23])\/512\//, '/$1/1024/') : img.url;
