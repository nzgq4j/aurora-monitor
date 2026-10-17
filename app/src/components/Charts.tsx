'use client';

import { useId } from 'react';
import { C, kpColor, polar } from '../data';
import type { KpPoint } from '../lib/feeds';

const monoText = (size: number) => ({ fill: C.muted, font: `${size}px 'JetBrains Mono'` });

const K = 4.2, CTR = 240;
/** Polar projection centred on the north pole, rotated so North America faces down. */
const pol = (lat: number, lon: number): [number, number] => {
  const r = (90 - lat) * K, a = ((90 - (lon + 100)) * Math.PI) / 180;
  return [CTR + r * Math.cos(a), CTR + r * Math.sin(a)];
};
const f = (n: number) => Math.round(n * 10) / 10;

/** Colour ramp for OVATION probability: green, then yellow, then red at high values. */
const ovalColor = (v: number) => (v >= 50 ? '#F06A6A' : v >= 25 ? '#E6B800' : '#59FF3A');

interface PolarProps {
  /** [lon 0..359 east, lat, probability %] */
  points: [number, number, number][];
  /** Equatorward 10% edge, [lon, lat] per longitude. */
  edge: [number, number][];
}

/** Live OVATION aurora probability on a polar map, with the 10% equatorward edge and reference cities. */
export function PolarOval({ points, edge }: PolarProps) {
  const id = useId().replace(/:/g, '');
  const edgePath = edge.length > 2
    ? edge.map(([lon, lat], i) => { const [x, y] = pol(lat, lon > 180 ? lon - 360 : lon); return `${i ? 'L' : 'M'}${f(x)} ${f(y)}`; }).join(' ') + ' Z'
    : '';
  return (
    <svg viewBox="0 0 480 480" style={{ width: '100%', display: 'block' }} role="img" aria-label="OVATION aurora probability over the northern hemisphere">
      <defs>
        <clipPath id={`${id}c`}><circle cx="240" cy="240" r="226" /></clipPath>
        <filter id={`${id}b`} x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="4" /></filter>
        <radialGradient id={`${id}g`}><stop offset="0" stopColor="#141a16" /><stop offset="1" stopColor="#050605" /></radialGradient>
      </defs>
      <circle cx="240" cy="240" r="226" fill={`url(#${id}g)`} />
      <g clipPath={`url(#${id}c)`}>
        <g style={{ filter: `url(#${id}b)` }}>
          {points.map(([lon, lat, v]) => {
            const [x, y] = pol(lat, lon > 180 ? lon - 360 : lon);
            return <circle key={`${lon},${lat}`} cx={f(x)} cy={f(y)} r="6" style={{ fill: ovalColor(v), opacity: Math.min(1, 0.15 + v / 40) }} />;
          })}
        </g>
        {polar.meridians.map((m, i) => <line key={i} x1="240" y1="240" x2={m.x} y2={m.y} style={{ stroke: '#fff', strokeOpacity: .08 }} />)}
        {polar.rings.map(r => (
          <g key={r.lbl}>
            <circle cx="240" cy="240" r={r.r} style={{ fill: 'none', stroke: '#fff', strokeOpacity: .12 }} />
            <text x="244" y={r.ly} style={{ fill: '#7d857f', font: "10px 'JetBrains Mono'" }}>{r.lbl}</text>
          </g>
        ))}
        {edgePath && <path d={edgePath} style={{ fill: 'none', stroke: C.red, strokeWidth: 1.5, strokeDasharray: '5 5' }} />}
        {polar.cities.map(c => (
          <g key={c.name}>
            <circle cx={c.x} cy={c.y} r="2.6" style={{ fill: '#fff' }} />
            <text x={c.tx} y={c.ty} style={{ fill: '#fff', font: "600 11.5px 'Barlow'", textAnchor: c.anchor }}>{c.name}</text>
          </g>
        ))}
      </g>
      <circle cx="240" cy="240" r="226" style={{ fill: 'none', stroke: C.line2 }} />
      {points.length === 0 && <text x="240" y="244" style={{ fill: C.muted, font: "600 13px 'Barlow'", textAnchor: 'middle' }}>Oval data unavailable</text>}
    </svg>
  );
}

const DAY = 864e5, STEP = 3 * 36e5;
const X0 = 48, X1 = 1150, Y1 = 290, U = 30;
const dayLabel = (t: number) => new Date(t).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });

/** 3-hour Kp: observed and estimated bars (darker) up to now, NOAA forecast after. */
export function KpOutlookChart({ series, now }: { series: KpPoint[]; now: number }) {
  if (series.length === 0) {
    return (
      <svg viewBox="0 0 1200 320" style={{ width: '100%', display: 'block' }} role="img" aria-label="Kp data unavailable">
        <text x="600" y="160" style={{ fill: C.muted, font: "600 16px 'Barlow'", textAnchor: 'middle' }}>Kp data unavailable</text>
      </svg>
    );
  }
  const t0 = Math.floor(series[0].t / DAY) * DAY;
  const t1 = Math.ceil((series[series.length - 1].t + STEP) / DAY) * DAY;
  const x = (t: number) => X0 + ((t - t0) / (t1 - t0)) * (X1 - X0);
  const bw = (STEP / (t1 - t0)) * (X1 - X0);
  const days: number[] = [];
  for (let d = t0; d < t1; d += DAY) days.push(d);
  const nowX = f(Math.max(X0, Math.min(X1, x(now))));
  return (
    <svg viewBox="0 0 1200 320" style={{ width: '100%', display: 'block' }} role="img" aria-label={`Kp index ${dayLabel(t0)} to ${dayLabel(t1 - DAY)}, observed and forecast`}>
      {[...Array(10)].map((_, k) => (
        <g key={k}>
          <line x1="48" x2="1150" y1={Y1 - k * U} y2={Y1 - k * U} style={{ stroke: '#fff', strokeOpacity: .07 }} />
          <text x="38" y={Y1 - k * U + 4} style={{ ...monoText(11), textAnchor: 'end' }}>{k}</text>
        </g>
      ))}
      {days.slice(1).map(d => <line key={d} x1={f(x(d))} x2={f(x(d))} y1="20" y2="290" style={{ stroke: '#fff', strokeOpacity: .14 }} />)}
      {series.map(p => (
        <rect key={p.t} x={f(x(p.t) + 2.5)} y={f(Y1 - p.kp * U)} width={f(Math.max(1, bw - 5))} height={f(p.kp * U)} style={{ fill: kpColor(p.kp, p.kind !== 'predicted') }}>
          <title>{`${new Date(p.t).toISOString().slice(0, 16).replace('T', ' ')} UT · Kp ${p.kp.toFixed(2)} · ${p.kind}`}</title>
        </rect>
      ))}
      <line x1={nowX} x2={nowX} y1="14" y2="292" style={{ stroke: '#fff', strokeWidth: 3, strokeDasharray: '7 5' }} />
      <text x={nowX} y="10" style={{ fill: '#fff', font: "700 12px 'Barlow'", textAnchor: 'middle' }}>NOW</text>
      {days.map(d => <text key={d} x={f(x(d + DAY / 2))} y="310" style={{ fill: C.soft, font: "600 13px 'Barlow'", textAnchor: 'middle' }}>{dayLabel(d)}</text>)}
      <line x1="48" x2="1150" y1="290" y2="290" style={{ stroke: C.muted }} />
    </svg>
  );
}
