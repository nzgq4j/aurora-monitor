/** NASA SDO "latest" images (served directly by NASA; refreshed every ~15 minutes). Captions are `sdo.{id}` in the messages. */
export const SDO_IMAGES = [
  { id: '0193' as const, label: 'AIA 193 Å', url: 'https://sdo.gsfc.nasa.gov/assets/img/latest/latest_512_0193.jpg' },
  { id: '0171' as const, label: 'AIA 171 Å', url: 'https://sdo.gsfc.nasa.gov/assets/img/latest/latest_512_0171.jpg' },
  { id: '211193171' as const, label: 'AIA 211·193·171', url: 'https://sdo.gsfc.nasa.gov/assets/img/latest/latest_512_211193171.jpg' },
  { id: '0304' as const, label: 'AIA 304 Å', url: 'https://sdo.gsfc.nasa.gov/assets/img/latest/latest_512_0304.jpg' },
  { id: 'HMIIC' as const, label: 'HMI', url: 'https://sdo.gsfc.nasa.gov/assets/img/latest/latest_512_HMIIC.jpg' },
  { id: 'HMIBC' as const, label: 'HMI magnetogram', url: 'https://sdo.gsfc.nasa.gov/assets/img/latest/latest_512_HMIBC.jpg' },
];
