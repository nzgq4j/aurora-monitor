/** NASA SDO "latest" images (served directly by NASA; refreshed every ~15 minutes). Captions are `sdo.{id}` in the messages. */
export const SDO_IMAGES = [
  { id: '0193' as const, label: 'AIA 193 Å', url: 'https://sdo.gsfc.nasa.gov/assets/img/latest/latest_512_0193.jpg' },
  { id: '0171' as const, label: 'AIA 171 Å', url: 'https://sdo.gsfc.nasa.gov/assets/img/latest/latest_512_0171.jpg' },
  { id: 'HMIIC' as const, label: 'HMI', url: 'https://sdo.gsfc.nasa.gov/assets/img/latest/latest_512_HMIIC.jpg' },
];
