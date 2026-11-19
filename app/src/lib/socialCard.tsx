/**
 * Share cards for automatic Bluesky posts: a 1080 × 1350 PNG per event, drawn on the server with next/og
 * (Satori + Resvg) from the same data as the post, with its alt text built alongside so they can't drift.
 *
 * Graphics are SVG strings embedded as images. Satori can't pass fonts into nested SVG, so every label is a
 * positioned element over the image, not SVG text. Fonts must be TTF/OTF: Google Fonts serves TrueType when
 * the CSS is requested without a browser user agent.
 */

/* eslint-disable @next/next/no-img-element -- Satori draws plain <img> elements; next/image doesn't apply */
import { ImageResponse } from 'next/og';
import { feature } from 'topojson-client';
import type { Topology, GeometryCollection } from 'topojson-specification';
import land110 from 'world-atlas/land-110m.json';
import { auroraColor } from './auroraColor';
import { ovalPoints, type Oval } from './feeds';
import { G_NAME, fmtKp, hhmm, localHm, lookPhrase, type CardStyle, type SocialEvent } from './socialEvents';
import { globeSvg, kpModelOval, midnightCenter, regionMapSvg } from './socialGlobe';

export const CARD_W = 1080, CARD_H = 1350;
const PAD = 64, INNER = CARD_W - 2 * PAD;
const GREEN = '#6CFF2B', MUTED = '#9AA39D', SOFT = '#C9D0CB', LINE = '#2a302c', BG = '#0b0d0c', PANEL = '#121513';
const G_COLOR = ['#2FA84A', '#E6B800', '#FF9A3C', '#F06A6A', '#F06A6A', '#D44CFF'];
const KP_COLOR = (k: number) => (k >= 5 ? '#F06A6A' : k >= 4 ? '#FF9A3C' : k >= 3 ? '#E6B800' : '#2FA84A');

export interface CardData {
  oval?: Oval | null;
  kp?: { t: number; kp: number; kind: string }[];
  xrays?: { t: number; flux: number }[];
  wind?: { t: number; speed: number | null; density: number | null }[];
  power?: { observed: number; north: number; south: number }[];
  /** A current image of the Sun for the 'sun' style: a data URL, its instrument and its publisher. */
  sun?: { src: string; label: string; source: string } | null;
}

/** The style actually drawn: the requested one when its data is there, else the data card. */
export function effectiveStyle(ev: SocialEvent, data: CardData): CardStyle {
  const s = ev.style ?? 'card';
  if (s === 'sun') return data.sun ? 'sun' : 'card';
  // Viewing posts always show the place: tonight a forecast globe for the best hour; now the live map or globe.
  if (ev.kind === 'viewing' && ev.viewing) return ev.viewing.mode === 'now' && s === 'map' ? 'map' : 'globe';
  if (s === 'map') return 'card';
  if (s === 'globe') return ev.kind === 'viewing' || ev.kind === 'storm' || ev.kind === 'substorm' ? 'globe' : 'card';
  return 'card';
}

// ---- Fonts ----

const fontCache = new Map<string, Promise<ArrayBuffer>>();
/** A Google Font as TrueType (no browser user agent, so the CSS points at .ttf files). */
function googleFont(family: string, weight: number): Promise<ArrayBuffer> {
  const k = `${family}:${weight}`;
  if (!fontCache.has(k)) {
    const p = (async () => {
      const css = await (await fetch(`https://fonts.googleapis.com/css2?family=${family.replace(/ /g, '+')}:wght@${weight}`)).text();
      const url = css.match(/src:\s*url\(([^)]+)\)\s*format\('(?:truetype|opentype)'\)/)?.[1];
      if (!url) throw new Error(`no TrueType for ${family} ${weight}`);
      return (await fetch(url)).arrayBuffer();
    })();
    p.catch(() => fontCache.delete(k));
    fontCache.set(k, p);
  }
  return fontCache.get(k)!;
}
const fonts = () => Promise.all([
  googleFont('Archivo', 800).then(data => ({ name: 'Archivo', data, weight: 800 as const, style: 'normal' as const })),
  googleFont('Barlow', 500).then(data => ({ name: 'Barlow', data, weight: 500 as const, style: 'normal' as const })),
  googleFont('Barlow', 700).then(data => ({ name: 'Barlow', data, weight: 700 as const, style: 'normal' as const })),
  googleFont('JetBrains Mono', 400).then(data => ({ name: 'JetBrains Mono', data, weight: 400 as const, style: 'normal' as const })),
]);

// ---- Text fitting ----

/** Rough width of `s` in em (Archivo heavy): CJK and wide letters count more. */
export const emWidth = (s: string) => [...s].reduce((w, c) => w + (/[　-鿿가-힯]/.test(c) ? 1 : /[MWmw@]/.test(c) ? 0.85 : /[A-Z0-9]/.test(c) ? 0.66 : /[ il.,:;'|!()]/.test(c) ? 0.3 : 0.55), 0);
/** The largest font size (down to `min`) at which `s` fits on one line of `width` px. */
export const fitLine = (s: string, width: number, max: number, min: number) => Math.max(min, Math.min(max, Math.floor(width / Math.max(1, emWidth(s)))));

// ---- Graphics (SVG strings) ----

const svgUrl = (svg: string) => `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
const r1 = (n: number) => Math.round(n * 10) / 10;

let landRings: [number, number][][] | null = null;
function land(): [number, number][][] {
  if (!landRings) {
    const topo = land110 as unknown as Topology<{ land: GeometryCollection }>;
    const fc = feature(topo, topo.objects.land) as unknown as { features: { geometry: { type: string; coordinates: number[][][] | number[][][][] } }[] };
    landRings = fc.features.flatMap(f => (f.geometry.type === 'Polygon' ? [f.geometry.coordinates as number[][][]] : (f.geometry.coordinates as number[][][][])))
      .flatMap(poly => poly.map(ring => ring.map(([lon, lat]) => [lon, lat] as [number, number])));
  }
  return landRings;
}

/** Polar map (side × side) of the OVATION oval with land outlines, north or south pole at the centre, edge at 40°. */
export function polarSvg(oval: Oval | null | undefined, hemi: 'north' | 'south', side: number, marker?: { lat: number; lon: number } | null): string {
  const c = side / 2, k = (side / 2 - 4) / 50; // 90° → 40° fills the radius
  const proj = (lat: number, lon: number): [number, number] => {
    const co = hemi === 'north' ? 90 - lat : 90 + lat;
    const a = ((hemi === 'north' ? 90 - (lon + 100) : 90 + (lon + 100)) * Math.PI) / 180;
    return [c + co * k * Math.cos(a), c + co * k * Math.sin(a)];
  };
  const paths = land().map(ring => {
    const near = ring.some(([, lat]) => (hemi === 'north' ? lat > 30 : lat < -30));
    if (!near) return '';
    return ring.map(([lon, lat], i) => { const [x, y] = proj(lat, lon); return `${i ? 'L' : 'M'}${r1(x)} ${r1(y)}`; }).join('') + 'Z';
  }).filter(Boolean).join('');
  const cells: string[] = [];
  if (oval) {
    const pts: [number, number, number][] = hemi === 'north' ? ovalPoints(oval, 40, 2, 4)
      : oval.grid.flatMap((row, i) => { const lat = i - 90; return lat > -40 ? [] : [...row].flatMap((v, lon) => (lon % 2 === 0 && v >= 4 ? [[lon, lat, v] as [number, number, number]] : [])); });
    for (const [lon, lat, p] of pts) {
      const [x, y] = proj(lat, lon > 180 ? lon - 360 : lon);
      const { rgb, alpha } = auroraColor(p);
      cells.push(`<circle cx="${r1(x)}" cy="${r1(y)}" r="${r1(k * 1.5)}" fill="rgb(${rgb.join(',')})" fill-opacity="${alpha.toFixed(2)}"/>`);
    }
  }
  const rings = [80, 70, 60, 50].map(l => `<circle cx="${c}" cy="${c}" r="${r1((90 - l) * k)}" fill="none" stroke="#ffffff" stroke-opacity="0.12" stroke-width="1.5" stroke-dasharray="4 6"/>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${side}" height="${side}" viewBox="0 0 ${side} ${side}">`
    + `<defs><clipPath id="d"><circle cx="${c}" cy="${c}" r="${c - 2}"/></clipPath></defs>`
    + `<circle cx="${c}" cy="${c}" r="${c - 2}" fill="#06100c"/>`
    + `<g clip-path="url(#d)"><path d="${paths}" fill="#1c2620" stroke="#3b4a40" stroke-width="1.2"/>${cells.join('')}${rings}</g>`
    + `<circle cx="${c}" cy="${c}" r="${c - 2}" fill="none" stroke="${LINE}" stroke-width="3"/>`
    + (marker ? (() => { const [x, y] = proj(marker.lat, marker.lon); return `<circle cx="${r1(x)}" cy="${r1(y)}" r="16" fill="none" stroke="${GREEN}" stroke-width="4"/><circle cx="${r1(x)}" cy="${r1(y)}" r="7" fill="#ffffff" stroke="#000" stroke-width="2"/>`; })() : '')
    + '</svg>';
}

/** Kp bars: observed/estimated solid, predicted faded; a line at Kp 5 (storm level). */
export function kpBarsSvg(kp: { t: number; kp: number; kind: string }[], w: number, h: number): string {
  const n = kp.length || 1, gap = 6, bw = (w - gap * (n - 1)) / n;
  const bars = kp.map((p, i) => {
    const bh = Math.max(4, (p.kp / 9) * (h - 4));
    return `<rect x="${r1(i * (bw + gap))}" y="${r1(h - bh)}" width="${r1(bw)}" height="${r1(bh)}" rx="4" fill="${KP_COLOR(p.kp)}" fill-opacity="${p.kind === 'predicted' ? 0.35 : 1}"/>`;
  }).join('');
  const y5 = r1(h - (5 / 9) * (h - 4));
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${bars}<line x1="0" x2="${w}" y1="${y5}" y2="${y5}" stroke="#ffffff" stroke-opacity="0.35" stroke-width="2" stroke-dasharray="6 6"/></svg>`;
}

/** The next 12 hours' viewing scores as bars (green from 50, amber from 20). */
export function scoreBarsSvg(hours: { score: number }[], w: number, h: number): string {
  const n = hours.length || 1, gap = 8, bw = (w - gap * (n - 1)) / n;
  const bars = hours.map((p, i) => {
    const bh = Math.max(4, (Math.min(100, p.score) / 100) * (h - 4));
    const col = p.score >= 50 ? GREEN : p.score >= 20 ? '#E6B800' : '#3b4a40';
    return `<rect x="${r1(i * (bw + gap))}" y="${r1(h - bh)}" width="${r1(bw)}" height="${r1(bh)}" rx="5" fill="${col}"/>`;
  }).join('');
  const y50 = r1(h - 0.5 * (h - 4));
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${bars}<line x1="0" x2="${w}" y1="${y50}" y2="${y50}" stroke="#ffffff" stroke-opacity="0.35" stroke-width="2" stroke-dasharray="6 6"/></svg>`;
}

/** A time series as a line on a w × h box; `y` maps a value to 0..1 (bottom..top). */
function lineSvg(series: { t: number; v: number }[][], colors: string[], t0: number, t1: number, y: (v: number) => number, w: number, h: number, grid: number[] = [], marks: number[] = []): string {
  const X = (t: number) => r1(((t - t0) / (t1 - t0)) * w), Y = (v: number) => r1(h - Math.max(0, Math.min(1, y(v))) * h);
  const lines = series.map((s, i) => `<path d="${s.map((p, j) => `${j ? 'L' : 'M'}${X(p.t)} ${Y(p.v)}`).join('')}" fill="none" stroke="${colors[i]}" stroke-width="4" stroke-linejoin="round"/>`).join('');
  const g = grid.map(v => `<line x1="0" x2="${w}" y1="${Y(v)}" y2="${Y(v)}" stroke="#ffffff" stroke-opacity="0.12" stroke-width="1.5"/>`).join('');
  const m = marks.map(t => `<line x1="${X(t)}" x2="${X(t)}" y1="0" y2="${h}" stroke="${GREEN}" stroke-opacity="0.8" stroke-width="2" stroke-dasharray="6 6"/>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${g}${m}${lines}</svg>`;
}

// ---- Card ----

export interface Card { bytes: Uint8Array; type: 'image/png' | 'image/jpeg'; width: number; height: number; alt: string }

const KICKER: Record<SocialEvent['kind'], string> = { storm: 'GEOMAGNETIC STORM', flare: 'SOLAR FLARE', shock: 'SOLAR WIND SHOCK', substorm: 'AURORAL SUBSTORM', viewing: 'AURORA VIEWING' };
const kicker = (ev: SocialEvent) => (ev.kind === 'viewing' ? `AURORA VIEWING · ${ev.viewing?.mode === 'now' ? 'NOW' : 'TONIGHT'}` : KICKER[ev.kind]);
const SOURCE: Record<SocialEvent['kind'], string> = {
  storm: 'NOAA SWPC (Kp, OVATION), GFZ Potsdam (Hp30)', flare: 'NOAA SWPC (GOES X-ray flux)',
  shock: 'NOAA SWPC (real-time solar wind at L1)', substorm: 'NOAA SWPC (OVATION hemispheric power)',
  viewing: 'NOAA SWPC (Kp, OVATION), Open-Meteo (cloud)',
};
const SOURCE_TONIGHT = 'NOAA SWPC (Kp forecast), Open-Meteo (cloud)';
const dateUtc = (t: number) => new Date(t).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

/** The facts the card shows, label → value: shared by the card and its alt text. */
export function cardFacts(ev: SocialEvent): [string, string][] {
  const time: [string, string] = ['Time', `${hhmm(ev.at)}, ${dateUtc(ev.at)}`];
  switch (ev.kind) {
    case 'storm': return [['Level', `G${ev.g} (${G_NAME[ev.g ?? 1]})`], ['Kp', fmtKp(ev.kp ?? 0)], time, ['Source', SOURCE.storm]];
    case 'flare': return [['Class', `${ev.cls} (${ev.ended ? 'peak' : 'peak so far'})`], time, ['Source', SOURCE.flare]];
    case 'shock': return [['Solar wind', `${ev.from} → ${ev.to} km/s`], time, ['Source', SOURCE.shock]];
    case 'substorm': return [['Auroral power', `${ev.from} → ${ev.to} GW (${ev.hemi === 'south' ? 'southern' : 'northern'} hemisphere)`], time, ['Source', SOURCE.substorm]];
    case 'viewing': {
      const v = ev.viewing!;
      const w = v.window;
      return [
        v.mode === 'now'
          ? ['Now', `${localHm(ev.at, v.tz)} local (${hhmm(ev.at)})${w && w.to > ev.at ? ` · good until about ${localHm(w.to, v.tz)}` : ''}`]
          : ['Best', w ? `${localHm(w.from, v.tz)}–${localHm(w.to, v.tz)} local (${hhmm(w.from).slice(0, 5)}–${hhmm(w.to)})` : `${localHm(ev.at, v.tz)} local (${hhmm(ev.at)})`],
        ['Score', `${v.score}/100 · Kp ${v.kp === null ? '–' : fmtKp(v.kp)}, needs ${v.need}${v.cloud === null ? '' : ` · ${v.cloud}% cloud`}`],
        ['Look', lookPhrase(v)],
        ['Source', v.mode === 'now' ? SOURCE.viewing : SOURCE_TONIGHT],
      ];
    }
  }
}

/** The card's big headline: the number that matters. */
export function cardHead(ev: SocialEvent): string {
  switch (ev.kind) {
    case 'storm': return `G${ev.g} (${G_NAME[ev.g ?? 1]})`;
    case 'flare': return ev.cls ?? '';
    case 'shock': return `${ev.from} → ${ev.to} km/s`;
    case 'substorm': return `${ev.from} → ${ev.to} GW`;
    case 'viewing': return ev.viewing?.site.name ?? '';
  }
}
const sentence = (s: string) => s.charAt(0) + s.slice(1).toLowerCase();

/** What the picture shows, for the alt text (the visual code explained). */
function graphicDescription(ev: SocialEvent, data: CardData): string {
  const hemi = ev.hemi === 'south' ? 'south' : 'north';
  const style = effectiveStyle(ev, data);
  const ovalNote = data.oval ? '' : ' The aurora forecast was not available when the card was made.';
  if (style === 'globe' && ev.viewing?.mode === 'tonight') {
    const v = ev.viewing;
    return `A close-up globe centred on ${v.site.name} (marked by a ringed white dot) shows the Earth at ${localHm(ev.at, v.tz)} local time (${hhmm(ev.at)}), the best time tonight: night is dark and daylight a lighter wash. The forecast aurora oval for that time is drawn in green, yellow and red; it is modelled from NOAA's Kp forecast (Kp ${v.kp === null ? 'unknown' : fmtKp(v.kp)}), not a live observation. Below it, bars show the viewing score for each of the next 12 hours in local time, combining aurora strength, darkness, cloud and moonlight: green bars are good (50 or more), amber possible, grey poor, with a dashed line at 50.`;
  }
  if (style === 'globe') {
    const where = ev.viewing ? `A close-up globe, about 5,000 km top to bottom, centred on ${ev.viewing.site.name}, which is marked by a ringed white dot,` : `A globe centred on the ${hemi}ern auroral zone at local midnight`;
    return `${where} shows the Earth now: night is dark and daylight a lighter wash, with the current aurora forecast (OVATION) drawn as rings of green, yellow and red dots around the poles; red is the highest chance.${ovalNote}`;
  }
  if (style === 'map' && ev.viewing) {
    return `A map about 1,600 km across, centred on ${ev.viewing.site.name} (marked by a ringed white dot), shows land in dark green and the current aurora forecast (OVATION) as green, yellow and red squares; red is the highest chance. Dashed lines mark every 5° of latitude and 10° of longitude.${ovalNote}`;
  }
  if (style === 'sun' && data.sun) {
    return `A current image of the Sun from ${data.sun.source} (${data.sun.label})${ev.kind === 'shock' ? ': a coronagraph that blocks the Sun\'s bright disc (a white circle marks it) to show clouds of material leaving it.' : ', in the wavelength that shows flares as bright patches.'}`;
  }
  switch (ev.kind) {
    case 'storm': return `A map centred on the ${hemi} pole shows the current aurora forecast (OVATION) as a band of green, yellow and red dots around the pole; red is the highest chance. Below it, bars show the Kp index every 3 hours over the last day and the next day, coloured from green (quiet) to red (storm), with forecast bars faded and a dashed line at Kp 5, the storm threshold.${data.oval ? '' : ' The aurora forecast was not available when the card was made.'}`;
    case 'flare': return `A chart shows the GOES X-ray flux over the last 6 hours on a logarithmic scale with the flare classes A, B, C, M and X marked; the line climbs into the flare and a dashed line marks ${ev.ended ? 'its peak' : 'when it crossed the posting threshold'}.`;;
    case 'shock': return 'Two charts show the solar wind at L1 over the last 6 hours: speed in km/s (green) and density in particles per cm³ (amber), both jumping at the shock, which a dashed line marks.';
    case 'substorm': return `A map centred on the ${hemi} pole shows the current aurora forecast as a band of coloured dots; below it, a line shows the ${hemi}ern hemispheric auroral power in gigawatts over the last 6 hours, rising sharply at the end.`;
    case 'viewing': {
      const v = ev.viewing!;
      const pole = v.site.lat < 0 ? 'south' : 'north';
      return `A map centred on the ${pole} pole shows the current aurora forecast as a band of green, yellow and red dots, with ${v.site.name} marked by a ringed white dot. Below it, bars show the viewing score for each of the next 12 hours in local time, combining aurora strength, darkness, cloud and moonlight: green bars are good (50 or more), amber possible, grey poor, with a dashed line at 50.${data.oval ? '' : ' The aurora forecast was not available when the card was made.'}`;
    }
  }
}

/** Alt text: layout, headline, facts and the visual code, ending with the site address printed on the card. */
export function cardAlt(ev: SocialEvent, data: CardData): string {
  const facts = cardFacts(ev).map(([k, v]) => `${k}: ${v}`).join('. ');
  return `Polar Lights card. ${sentence(kicker(ev))}: ${cardHead(ev)}. ${graphicDescription(ev, data)} ${facts}. www.polarlights.io.`;
}

const label = { fontFamily: 'JetBrains Mono', fontSize: 22, color: MUTED, letterSpacing: 1 } as const;

const GLOBE_SIDE = 720, MAP_H = 720, FORECAST_H = 500;
/** Close-up globes: about 5,000 km top to bottom around a site; storms show most of the oval. */
const ZOOM_SITE = 2.6, ZOOM_STORM = 1.5;
/** The map or globe drawing for the card (async: their smooth layers are computed per pixel). */
async function artFor(ev: SocialEvent, data: CardData): Promise<string | null> {
  const style = effectiveStyle(ev, data);
  if (style === 'globe' && ev.viewing) {
    const v = ev.viewing;
    // Centred a little poleward of the site, where the oval is.
    const center = { lat: Math.max(-80, Math.min(80, v.site.lat + 3 * Math.sign(v.site.lat))), lon: v.site.lon };
    // Tonight: the Earth at the best hour, with the oval modelled from the Kp forecast for that hour.
    if (v.mode === 'tonight') return globeSvg({ w: INNER, h: FORECAST_H, zoom: ZOOM_SITE, center, oval: v.kp === null ? null : kpModelOval(v.kp, ev.at), t: ev.at, marker: v.site });
    return globeSvg({ w: INNER, h: GLOBE_SIDE, zoom: ZOOM_SITE, center, oval: data.oval, t: ev.at, marker: v.site });
  }
  if (style === 'globe') return globeSvg({ w: INNER, h: GLOBE_SIDE, zoom: ZOOM_STORM, center: midnightCenter(ev.at, ev.hemi === 'south'), oval: data.oval, t: ev.at });
  if (style === 'map' && ev.viewing) return regionMapSvg({ w: INNER, h: MAP_H, site: ev.viewing.site, oval: data.oval });
  return null;
}

function Graphic({ ev, data, art }: { ev: SocialEvent; data: CardData; art: string | null }) {
  const now = ev.at;
  const style = effectiveStyle(ev, data);
  if (style === 'globe' && art && ev.viewing?.mode === 'tonight') {
    const v = ev.viewing, hours = v.hours.slice(0, 12);
    return (
      <div style={{ display: 'flex', flexDirection: 'column', width: INNER }}>
        <img src={svgUrl(art)} width={INNER} height={FORECAST_H} alt="" />
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 10, ...label, fontSize: 20 }}>
          <span>{`FORECAST FOR ${localHm(ev.at, v.tz)} LOCAL (${hhmm(ev.at)})`}</span><span>{v.kp === null ? 'NO KP FORECAST' : `AURORA · KP ${fmtKp(v.kp)} MODEL`}</span>
        </div>
        <img src={svgUrl(scoreBarsSvg(hours, INNER, 110))} width={INNER} height={110} style={{ marginTop: 22 }} alt="" />
        <div style={{ display: 'flex', marginTop: 8, ...label, fontSize: 20 }}>
          {hours.map((h, i) => <span key={h.t} style={{ display: 'flex', width: INNER / hours.length }}>{i % 3 === 0 ? localHm(h.t, v.tz) : ''}</span>)}
        </div>
        <div style={{ display: 'flex', marginTop: 6, ...label, fontSize: 20 }}>VIEWING SCORE · NEXT 12 H · LOCAL TIME</div>
      </div>
    );
  }
  if (style === 'globe' && art) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: INNER }}>
        <img src={svgUrl(art)} width={INNER} height={GLOBE_SIDE} alt="" />
        <div style={{ display: 'flex', justifyContent: 'space-between', width: INNER, marginTop: 10, ...label, fontSize: 20 }}><span>EARTH NOW · NIGHT AND DAY</span><span>AURORA NOW (OVATION)</span></div>
      </div>
    );
  }
  if (style === 'map' && ev.viewing && art) {
    const w = INNER, h = MAP_H;
    return (
      <div style={{ display: 'flex', flexDirection: 'column', width: INNER }}>
        <img src={svgUrl(art)} width={w} height={h} alt="" />
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 10, ...label, fontSize: 20 }}><span>AURORA NOW (OVATION)</span><span>ABOUT 1,600 KM ACROSS</span></div>
      </div>
    );
  }
  if (style === 'sun' && data.sun) {
    const side = 780;
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: INNER }}>
        <img src={data.sun.src} width={side} height={side} style={{ borderRadius: 24 }} alt="" />
        <div style={{ display: 'flex', justifyContent: 'space-between', width: side, marginTop: 10, ...label, fontSize: 20 }}><span>{data.sun.label.toUpperCase()}</span><span>{data.sun.source.toUpperCase()}</span></div>
      </div>
    );
  }
  if (ev.kind === 'storm' || ev.kind === 'substorm') {
    const side = 600;
    const hemi = ev.hemi === 'south' ? 'south' : 'north';
    const kp = (data.kp ?? []).filter(p => p.t >= now - 24 * 36e5 && p.t <= now + 24 * 36e5).slice(-16);
    const pw = (data.power ?? []).filter(p => p.observed >= now - 6 * 36e5).sort((a, b) => a.observed - b.observed);
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: INNER }}>
        <div style={{ display: 'flex', position: 'relative', width: side, height: side }}>
          <img src={svgUrl(polarSvg(data.oval, hemi, side))} width={side} height={side} alt="" />
          <div style={{ ...label, position: 'absolute', left: 0, top: 8, display: 'flex' }}>{hemi === 'north' ? 'NORTH POLE' : 'SOUTH POLE'}</div>
          <div style={{ ...label, position: 'absolute', right: 0, top: 8, display: 'flex' }}>AURORA NOW</div>
        </div>
        {ev.kind === 'storm' && kp.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', width: INNER, marginTop: 28 }}>
            <img src={svgUrl(kpBarsSvg(kp, INNER, 120))} width={INNER} height={120} alt="" />
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, ...label }}><span>KP · LAST 24 H</span><span>NEXT 24 H (FORECAST)</span></div>
          </div>
        )}
        {ev.kind === 'substorm' && pw.length > 1 && (
          <div style={{ display: 'flex', flexDirection: 'column', width: INNER, marginTop: 28 }}>
            <img src={svgUrl(lineSvg([pw.map(p => ({ t: p.observed, v: p[hemi] }))], [GREEN], now - 6 * 36e5, now, v => v / Math.max(80, ...pw.map(p => p[hemi])), INNER, 120))} width={INNER} height={120} alt="" />
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, ...label }}><span>AURORAL POWER (GW) · LAST 6 H</span><span>NOW</span></div>
          </div>
        )}
      </div>
    );
  }
  const W = INNER, H = 640, t0 = now - 6 * 36e5, t1 = now + 15 * 6e4;
  if (ev.kind === 'flare') {
    const pts = (data.xrays ?? []).filter(p => p.t >= t0).sort((a, b) => a.t - b.t).map(p => ({ t: p.t, v: p.flux }));
    const y = (v: number) => (Math.log10(v) + 8) / 5; // 1e-8 (A) … 1e-3
    const classes: [string, number][] = [['A', 1e-8], ['B', 1e-7], ['C', 1e-6], ['M', 1e-5], ['X', 1e-4]];
    return (
      <div style={{ display: 'flex', position: 'relative', width: W, height: H, background: PANEL, borderRadius: 24 }}>
        <img src={svgUrl(lineSvg([pts], [GREEN], t0, t1, y, W - 80, H - 60, classes.map(c => c[1]), [ev.at]))} width={W - 80} height={H - 60} style={{ position: 'absolute', left: 60, top: 30 }} alt="" />
        {classes.map(([c, v]) => <div key={c} style={{ ...label, fontSize: 26, color: c === 'X' || c === 'M' ? SOFT : MUTED, position: 'absolute', left: 22, top: 30 + (H - 60) * (1 - y(v)) - 34, display: 'flex' }}>{c}</div>)}
        <div style={{ ...label, position: 'absolute', left: 60, top: 0, display: 'flex' }}>GOES X-RAY FLUX · W/M²</div>
        <div style={{ ...label, position: 'absolute', left: 60, bottom: 2, display: 'flex' }}>−6 H</div>
        <div style={{ ...label, position: 'absolute', right: 24, bottom: 2, display: 'flex' }}>NOW</div>
      </div>
    );
  }
  const pts = (data.wind ?? []).filter(p => p.t >= t0).sort((a, b) => a.t - b.t);
  const sp = pts.filter(p => p.speed !== null).map(p => ({ t: p.t, v: p.speed! }));
  const dn = pts.filter(p => p.density !== null).map(p => ({ t: p.t, v: p.density! }));
  const half = (H - 20) / 2;
  const maxS = Math.max(700, ...sp.map(p => p.v)), maxD = Math.max(20, ...dn.map(p => p.v));
  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: W, height: H }}>
      {[['SPEED (KM/S)', sp, '#6CFF2B', (v: number) => (v - 250) / (maxS - 250)], ['DENSITY (/CM³)', dn, '#E6B800', (v: number) => v / maxD]].map(([name, s, col, yf]) => (
        <div key={name as string} style={{ display: 'flex', position: 'relative', width: W, height: half, background: PANEL, borderRadius: 24, marginBottom: 20 }}>
          <img src={svgUrl(lineSvg([s as { t: number; v: number }[]], [col as string], t0, t1, yf as (v: number) => number, W - 48, half - 70, [], [ev.at]))} width={W - 48} height={half - 70} style={{ position: 'absolute', left: 24, top: 50 }} alt="" />
          <div style={{ ...label, position: 'absolute', left: 24, top: 14, display: 'flex' }}>{name as string}</div>
          <div style={{ ...label, position: 'absolute', right: 24, top: 14, display: 'flex' }}>{name === 'SPEED (KM/S)' ? `SCALE 250–${Math.round(maxS)}` : `SCALE 0–${Math.round(maxD)}`}</div>
          <div style={{ ...label, position: 'absolute', left: 24, bottom: 8, display: 'flex' }}>−6 H</div>
          <div style={{ ...label, position: 'absolute', right: 24, bottom: 8, display: 'flex' }}>NOW</div>
        </div>
      ))}
    </div>
  );
}

/** Draw the card for `ev`. Throws if fonts can't be loaded (the poster then waits and tries again). */
export async function renderCard(ev: SocialEvent, data: CardData): Promise<Card> {
  const art = await artFor(ev, data);
  const head = cardHead(ev);
  const accent = ev.kind === 'viewing' ? (ev.viewing?.mode === 'now' ? GREEN : '#E6B800') : ev.kind === 'storm' ? G_COLOR[ev.g ?? 1] : ev.kind === 'flare' ? (ev.cls?.startsWith('X') ? '#F06A6A' : '#FF9A3C') : GREEN;
  const el = (
    <div style={{ width: CARD_W, height: CARD_H, display: 'flex', flexDirection: 'column', background: BG, padding: PAD, fontFamily: 'Barlow', color: '#fff' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', fontFamily: 'Archivo', fontSize: 40, letterSpacing: 1 }}>
          <div style={{ width: 22, height: 22, borderRadius: 11, background: GREEN, marginRight: 16 }} />
          <span>POLAR</span><span style={{ color: GREEN, marginLeft: 12 }}>LIGHTS</span>
        </div>
        <div style={{ ...label, fontSize: 24, display: 'flex' }}>{`${hhmm(ev.at)} · ${dateUtc(ev.at)}`}</div>
      </div>
      <div style={{ display: 'flex', ...label, fontSize: 28, color: accent, marginTop: 44, letterSpacing: 3 }}>{kicker(ev)}</div>
      <div style={{ display: 'flex', fontFamily: 'Archivo', fontSize: fitLine(head, INNER * 0.9, 112, 52), lineHeight: 1.05, marginTop: 8, whiteSpace: 'nowrap' }}>{head}</div>
      <div style={{ display: 'flex', marginTop: 36, flexGrow: 1 }}><Graphic ev={ev} data={data} art={art} /></div>
      <div style={{ display: 'flex', flexDirection: 'column', borderTop: `2px solid ${LINE}`, paddingTop: 22 }}>
        {cardFacts(ev).filter(([k]) => k !== 'Time').map(([k, v]) => (
          <div key={k} style={{ display: 'flex', fontSize: 30, marginBottom: 8 }}>
            <span style={{ color: MUTED, width: 260 }}>{k}</span><span style={{ fontWeight: 700, color: SOFT, flex: 1 }}>{v}</span>
          </div>
        ))}
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 14, ...label, fontSize: 22 }}>
          <span style={{ color: GREEN }}>www.polarlights.io</span>
        </div>
      </div>
    </div>
  );
  const res = new ImageResponse(el, { width: CARD_W, height: CARD_H, fonts: await fonts() });
  let bytes = new Uint8Array(await res.arrayBuffer());
  if (!bytes.length) throw new Error('empty card');
  // Photographs make large PNGs: those cards go out as JPEG to stay well under Bluesky's 1 MB.
  if (effectiveStyle(ev, data) === 'sun') {
    const sharp = (await import('sharp')).default;
    bytes = new Uint8Array(await sharp(bytes).jpeg({ quality: 86, mozjpeg: true }).toBuffer());
    return { bytes, type: 'image/jpeg', width: CARD_W, height: CARD_H, alt: cardAlt(ev, data) };
  }
  return { bytes, type: 'image/png', width: CARD_W, height: CARD_H, alt: cardAlt(ev, data) };
}
