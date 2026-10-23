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
