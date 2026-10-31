import { C } from '../data';
import { SDO_IMAGES } from './sdo';
import type { I18n } from '../i18n/I18n';
import type { InfoContent, InfoMetric } from '../components/InfoSheet';

/** Colours for the scales in the info sheets: the same as the values they describe on the cards. */
const GREY = '#6b736e', BLUE = '#7FD4FF';
type T = I18n['t'];

const why = (t: T, card: 'space' | 'solar' | 'outlook' | 'oval' | 'tonight' | 'best' | 'weeks') =>
  ([1, 2, 3] as const).map(n => t(`info.${card}.why${n}`));

const bz = (t: T): InfoMetric => ({
  name: t('info.m.bz'), badge: t('info.mostImportant'), text: t('info.space.bz'),
  scale: [
    { color: C.green, value: '≤ −10 nT', label: t('home.bz.strongSouth') },
    { color: C.darkGreen, value: '≤ −3 nT', label: t('home.bz.south') },
    { color: GREY, value: '−3 … 3 nT', label: t('home.bz.zero') },
    { color: C.red, value: '≥ 3 nT', label: t('home.bz.north') },
  ],
});
const speed = (t: T, text: string): InfoMetric => ({
  name: t('info.m.speed'), text,
  scale: [
    { color: GREY, value: '< 450 km/s', label: t('home.speed.slow') },
    { color: C.orange, value: '450+ km/s', label: t('home.speed.elevated') },
    { color: C.red, value: '600+ km/s', label: t('home.speed.fast') },
  ],
});
const hemi = (t: T, text: string): InfoMetric => ({
  name: t('info.m.hemi'), text,
  scale: [
    { color: GREY, value: '< 20 GW', label: t('home.hemi.low') },
    { color: C.orange, value: '20+ GW', label: t('home.hemi.moderate') },
    { color: C.red, value: '50+ GW', label: t('home.hemi.high') },
  ],
});
const density = (t: T, text: string): InfoMetric => ({
  name: t('info.m.density'), text,
  scale: [
    { color: GREY, value: '< 15 p/cm³', label: t('home.density.typical') },
    { color: BLUE, value: '15+ p/cm³', label: t('home.density.dense') },
  ],
});

/** Sun tab: the solar wind now. */
export const spaceInfo = (t: T): InfoContent => ({
  heading: t('info.space.h'), lead: t('info.space.lead'), why: why(t, 'space'),
  metrics: [bz(t), speed(t, t('info.space.speed')), hemi(t, t('info.space.hemi')), density(t, t('info.space.density'))],
});

/** Sun tab: the solar activity charts. */
export const solarInfo = (t: T): InfoContent => ({
  heading: t('info.solar.h'), lead: t('info.solar.lead'), why: why(t, 'solar'),
  metrics: [
    { name: t('info.m.field'), text: t('info.solar.field') },
    speed(t, t('info.solar.speed')),
    density(t, t('info.solar.density')),
    hemi(t, t('info.solar.hemi')),
  ],
  note: t('info.solar.note'),
});

/** Sun tab: the Sun now (sunspot regions, live images, time-lapse). */
export const sunInfo = (t: T): InfoContent => ({
  heading: t('info.sun.h'), lead: t('info.sun.lead'),
  metrics: [
    { name: t('info.sun.m.regions'), text: t('info.sun.regions'), image: '/api/sunspots/image' },
    // Each live view, with what it shows.
    ...SDO_IMAGES.map(i => ({ name: i.label, text: t(`sdo.${i.id}.info`), image: i.url })),
    { name: t('sunLapse.h'), text: t('info.sun.lapse') },
  ],
});

/** Now page: the Kp outlook. */
export const outlookInfo = (t: T): InfoContent => ({
  heading: t('info.outlook.h'), lead: t('info.outlook.lead'), why: why(t, 'outlook'),
  metrics: (['hour', 'day', 'month'] as const).map(v => ({ name: t(`outlook.tab.${v}`), text: t(`info.outlook.${v}`) })),
});

/** Now page: the auroral oval map. */
export const ovalInfo = (t: T): InfoContent => ({
  heading: t('info.oval.h'), lead: t('info.oval.lead'), why: why(t, 'oval'),
  metrics: [
    { name: t('info.oval.m.edge'), text: t('info.oval.edge') },
    { name: t('info.oval.m.place'), text: t('info.oval.place') },
  ],
});

/** Now page: the Tonight go-out score. */
export const tonightInfo = (t: T): InfoContent => ({
  heading: t('info.tonight.h'), lead: t('info.tonight.lead'), why: why(t, 'tonight'),
  metrics: [{
    name: t('info.tonight.m.score'), text: t('info.tonight.score'),
    scale: [
      { color: C.green, value: '50+', label: t('tonight.level.goNow') },
      { color: C.amber, value: '20+', label: t('tonight.level.maybe') },
      { color: GREY, value: '< 20', label: t('tonight.level.no') },
    ],
  }],
});

/** Now page: Your sky. */
export const skyInfo = (t: T): InfoContent => ({
  heading: t('info.sky.h'), lead: t('info.sky.lead'),
  metrics: [
    { name: t('info.sky.m.aurora'), text: t('info.sky.aurora'), scale: [
      { color: GREY, value: '5%+', label: t('info.sky.aurora5') },
      { color: C.amber, value: '15%+', label: t('info.sky.aurora15') },
      { color: C.green, value: '40%+', label: t('info.sky.aurora40') },
    ] },
    { name: t('info.sky.m.cloud'), text: t('info.sky.cloud'), scale: [
      { color: C.green, value: '< 30%', label: t('info.sky.cloud30') },
      { color: C.red, value: '60%+', label: t('info.sky.cloud60') },
    ] },
    { name: t('info.sky.m.dark'), text: t('info.sky.dark') },
    { name: t('info.sky.m.needs'), text: t('info.sky.needs') },
    { name: t('info.sky.m.sat'), text: t('info.sky.sat') },
  ],
});

/** Now page: best nights ahead. */
export const bestInfo = (t: T): InfoContent => ({ heading: t('info.best.h'), lead: t('info.best.lead'), why: why(t, 'best') });

/** Now page: recent weeks. */
export const weeksInfo = (t: T): InfoContent => ({ heading: t('info.weeks.h'), lead: t('info.weeks.lead'), why: why(t, 'weeks') });

/** Now page: the storm outlook. */
export const stormInfo = (t: T): InfoContent => ({
  heading: t('info.storm.h'), lead: t('info.storm.lead'),
  metrics: [
    { name: t('info.storm.m.levels'), text: t('info.storm.levels', { pct: 25 }), scale: [
      { color: C.amber, value: 'Kp 4', label: t('info.storm.active') },
      { color: C.orange, value: 'Kp 5', label: t('info.storm.g1') },
      { color: C.red, value: 'Kp 6', label: t('info.storm.g2') },
      { color: '#c04bd6', value: 'Kp 7+', label: t('info.storm.g3') },
    ] },
    { name: t('storm.cme.h'), text: t('info.storm.cme') },
    { name: t('storm.stat.solar'), text: t('info.storm.solar'), scale: [
      { color: GREY, value: '< C', label: t('storm.solar.veryLow') },
      { color: C.amber, value: 'C', label: t('storm.solar.low') },
      { color: C.orange, value: 'M1–M4', label: t('storm.solar.moderate') },
      { color: C.red, value: 'M5+', label: t('storm.solar.high') },
    ] },
    { name: t('storm.stat.xray'), text: t('info.storm.xray') },
    { name: t('storm.stat.protons'), text: t('info.storm.protons') },
    { name: t('storm.stat.ssn'), text: t('info.storm.ssn') },
  ],
});
