'use client';

import { useId } from 'react';
import { C, kpChart, polar } from '../data';

const monoText = (size: number) => ({ fill: C.muted, font: `${size}px 'JetBrains Mono'` });

/** Polar projection of the northern auroral oval with the view line and reference cities. */
export function PolarOval() {
  const id = useId().replace(/:/g, '');
  const { oval } = polar;
  return (
    <svg viewBox="0 0 480 480" style={{ width: '100%', display: 'block' }} role="img" aria-label="Auroral oval over North America">
      <defs>
        <clipPath id={`${id}c`}><circle cx="240" cy="240" r="226" /></clipPath>
        <filter id={`${id}b`} x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="16" /></filter>
        <filter id={`${id}b2`} x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="6" /></filter>
        <radialGradient id={`${id}g`}><stop offset="0" stopColor="#141a16" /><stop offset="1" stopColor="#050605" /></radialGradient>
      </defs>
      <circle cx="240" cy="240" r="226" fill={`url(#${id}g)`} />
      <g clipPath={`url(#${id}c)`}>
        <circle cx={oval.cx} cy={oval.cy} r={oval.vr} style={{ fill: 'none', stroke: '#E5484D', strokeWidth: 34, opacity: .45, filter: `url(#${id}b)` }} />
        <circle cx={oval.cx} cy={oval.cy} r={oval.r} style={{ fill: 'none', stroke: '#59FF3A', strokeWidth: 46, opacity: .75, filter: `url(#${id}b)` }} />
        <circle cx={oval.cx} cy={oval.cy} r={oval.r} style={{ fill: 'none', stroke: '#9CFF6E', strokeWidth: 12, opacity: .5, filter: `url(#${id}b2)` }} />
        {polar.meridians.map((m, i) => <line key={i} x1="240" y1="240" x2={m.x} y2={m.y} style={{ stroke: '#fff', strokeOpacity: .08 }} />)}
        {polar.rings.map(r => (
          <g key={r.lbl}>
            <circle cx="240" cy="240" r={r.r} style={{ fill: 'none', stroke: '#fff', strokeOpacity: .12 }} />
            <text x="244" y={r.ly} style={{ fill: '#7d857f', font: "10px 'JetBrains Mono'" }}>{r.lbl}</text>
          </g>
        ))}
        <circle cx={oval.cx} cy={oval.cy} r={oval.vr} style={{ fill: 'none', stroke: C.red, strokeWidth: 1.5, strokeDasharray: '5 5' }} />
        {polar.cities.map(c => (
          <g key={c.name}>
            <circle cx={c.x} cy={c.y} r="2.6" style={{ fill: '#fff' }} />
            <text x={c.tx} y={c.ty} style={{ fill: '#fff', font: "600 11.5px 'Barlow'", textAnchor: c.anchor }}>{c.name}</text>
          </g>
        ))}
      </g>
      <circle cx="240" cy="240" r="226" style={{ fill: 'none', stroke: C.line2 }} />
    </svg>
  );
}

/** Observed Kp (darker bars) followed by the 3-day forecast, with a NOW marker. */
export function KpOutlookChart() {
  const { bars, grid, dayLines, dayLabels, nowX } = kpChart;
  return (
    <svg viewBox="0 0 1200 320" style={{ width: '100%', display: 'block' }} role="img" aria-label="Observed and forecast Kp index, Oct 15 to Oct 19">
      {grid.map(g => (
        <g key={g.k}>
          <line x1="48" x2="1150" y1={g.y} y2={g.y} style={{ stroke: '#fff', strokeOpacity: .07 }} />
          <text x="38" y={g.ty} style={{ ...monoText(11), textAnchor: 'end' }}>{g.k}</text>
        </g>
      ))}
      {dayLines.map(x => <line key={x} x1={x} x2={x} y1="20" y2="290" style={{ stroke: '#fff', strokeOpacity: .14 }} />)}
      {bars.map((b, i) => <rect key={i} x={b.x} y={b.y} width={b.w} height={b.h} style={{ fill: b.fill }} />)}
      <line x1={nowX} x2={nowX} y1="14" y2="292" style={{ stroke: '#fff', strokeWidth: 3, strokeDasharray: '7 5' }} />
      <text x={nowX} y="10" style={{ fill: '#fff', font: "700 12px 'Barlow'", textAnchor: 'middle' }}>NOW</text>
      {dayLabels.map(d => <text key={d.t} x={d.x} y="310" style={{ fill: C.soft, font: "600 13px 'Barlow'", textAnchor: 'middle' }}>{d.t}</text>)}
      <line x1="48" x2="1150" y1="290" y2="290" style={{ stroke: C.muted }} />
    </svg>
  );
}

