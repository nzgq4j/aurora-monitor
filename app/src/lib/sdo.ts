/** NASA SDO "latest" images and SOHO's LASCO C2 (served directly by NASA; refreshed every ~15 minutes). Captions are `sdo.{id}` in the messages. */
export const SDO_IMAGES = [
  { id: '0193' as const, label: 'AIA 193 Å', url: 'https://sdo.gsfc.nasa.gov/assets/img/latest/latest_512_0193.jpg' },
  { id: '0171' as const, label: 'AIA 171 Å', url: 'https://sdo.gsfc.nasa.gov/assets/img/latest/latest_512_0171.jpg' },
  { id: '211193171' as const, label: 'AIA 211·193·171', url: 'https://sdo.gsfc.nasa.gov/assets/img/latest/latest_512_211193171.jpg' },
  { id: '0304' as const, label: 'AIA 304 Å', url: 'https://sdo.gsfc.nasa.gov/assets/img/latest/latest_512_0304.jpg' },
  { id: 'HMIIC' as const, label: 'HMI', url: 'https://sdo.gsfc.nasa.gov/assets/img/latest/latest_512_HMIIC.jpg' },
  { id: 'HMIBC' as const, label: 'HMI magnetogram', url: 'https://sdo.gsfc.nasa.gov/assets/img/latest/latest_512_HMIBC.jpg' },
  { id: '0131' as const, label: 'AIA 131 Å', url: 'https://sdo.gsfc.nasa.gov/assets/img/latest/latest_512_0131.jpg' },
  { id: '0094' as const, label: 'AIA 94 Å', url: 'https://sdo.gsfc.nasa.gov/assets/img/latest/latest_512_0094.jpg' },
  // Not a disc image: SOHO's coronagraph blocks the Sun (the white circle marks its edge) to show CMEs leaving it.
  { id: 'C2' as const, label: 'LASCO C2', url: 'https://soho.nascom.nasa.gov/data/realtime/c2/512/latest.jpg' },
];

/** The same image at another size: SDO publishes 512, 1024 and 2048 px; LASCO C2 goes up to 1024. */
export const sdoAt = (url: string, size: 1024 | 2048) =>
  url.replace('/latest_512_', `/latest_${size}_`).replace('/c2/512/', '/c2/1024/');
