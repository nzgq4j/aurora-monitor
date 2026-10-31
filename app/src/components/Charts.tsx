'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { useI18n } from '../i18n/I18n';
import { auroraColor } from '../lib/auroraColor';
import { C, kpBarColor, polar } from '../data';

const monoText = (size: number) => ({ fill: C.muted, font: `${size}px 'JetBrains Mono'` });

const K = 4.2, CTR = 240;
/** Polar projection centred on the north pole, rotated so North America faces down. */
const pol = (lat: number, lon: number): [number, number] => {
  const r = (90 - lat) * K, a = ((90 - (lon + 100)) * Math.PI) / 180;
  return [CTR + r * Math.cos(a), CTR + r * Math.sin(a)];
};
const f = (n: number) => Math.round(n * 10) / 10;

/** Colour ramp for OVATION probability: green, then yellow, then red at high values. */

interface PolarProps {
  /** [lon 0..359 east, lat, probability %] */
  points: [number, number, number][];
  /** Equatorward 10% edge as runs of [lon, lat]; a gap ends a run instead of cutting across. */
  edge: [number, number][][];
  /** The user's chosen location, drawn when it falls on the map. */
  marker?: { name: string; lat: number; lon: number; isHome: boolean } | null;
}

/** Map radius (226) in degrees of colatitude: the map reaches about 36°N. */
export const POLAR_MIN_LAT = 90 - 222 / K;

/** Live OVATION aurora probability on a polar map, with the 10% equatorward edge and reference cities. */
export function PolarOval({ points, edge, marker }: PolarProps) {
  const id = useId().replace(/:/g, '');
  const { t } = useI18n();
  const edgePath = edge
    .map(run => run.map(([lon, lat], i) => { const [x, y] = pol(lat, lon > 180 ? lon - 360 : lon); return `${i ? 'L' : 'M'}${f(x)} ${f(y)}`; }).join(' '))
    .join(' ');
  const m = marker && marker.lat >= POLAR_MIN_LAT ? (() => { const [x, y] = pol(marker.lat, marker.lon); return { ...marker, x: f(x), y: f(y), right: x < 340 }; })() : null;
  // Hide reference-city labels the marker would collide with.
  const cities = m ? polar.cities.filter(c => Math.hypot(c.x - m.x, c.y - m.y) > 26) : polar.cities;
  return (
    <svg viewBox="0 0 480 480" style={{ width: '100%', display: 'block' }} role="img"
      aria-label={m ? t('chart.ovalMarked', { place: m.name }) : t('chart.oval')}>
      <defs>
        <clipPath id={`${id}c`}><circle cx="240" cy="240" r="226" /></clipPath>
        <filter id={`${id}b`} x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="4" /></filter>
        <radialGradient id={`${id}g`}><stop offset="0" stopColor="#141a16" /><stop offset="1" stopColor="#050605" /></radialGradient>
      </defs>
      <circle cx="240" cy="240" r="226" fill={`url(#${id}g)`} />
      <g clipPath={`url(#${id}c)`}>
        <g style={{ filter: `url(#${id}b)` }}>
          {points.map(([lon, lat, v]) => {
            const { rgb, alpha } = auroraColor(v);
            if (alpha < 0.02) return null;
            const [x, y] = pol(lat, lon > 180 ? lon - 360 : lon);
            return <circle key={`${lon},${lat}`} cx={f(x)} cy={f(y)} r="6" style={{ fill: `rgb(${rgb.join(',')})`, opacity: alpha }} />;
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
        {cities.map(c => (
          <g key={c.name}>
            <circle cx={c.x} cy={c.y} r="2.6" style={{ fill: '#fff' }} />
            <text x={c.tx} y={c.ty} style={{ fill: '#fff', font: "600 11.5px 'Barlow', 'Golos Text'", textAnchor: c.anchor }}>{c.name}</text>
          </g>
        ))}
      </g>
      <circle cx="240" cy="240" r="226" style={{ fill: 'none', stroke: C.line2 }} />
      {m && (
        <g aria-hidden="true">
          <circle className="map-pulse" cx={m.x} cy={m.y} r="7" style={{ fill: 'none', stroke: C.green, strokeWidth: 2 }} />
          <circle cx={m.x} cy={m.y} r="11" style={{ fill: 'none', stroke: C.green, strokeWidth: 1.5, opacity: .6 }} />
          <circle cx={m.x} cy={m.y} r="4.5" style={{ fill: '#fff', stroke: '#000', strokeWidth: 2 }} />
          <text x={m.right ? m.x + 16 : m.x - 16} y={m.y + 4}
            style={{ fill: C.green, font: "700 13px 'Barlow', 'Golos Text'", textAnchor: m.right ? 'start' : 'end', paintOrder: 'stroke', stroke: '#000', strokeWidth: 4, strokeLinejoin: 'round' }}>
            {m.isHome ? `${m.name.split(',')[0]} · Home` : m.name.split(',')[0]}
          </text>
        </g>
      )}
      {points.length === 0 && <text x="240" y="244" style={{ fill: C.muted, font: "600 13px 'Barlow', 'Golos Text'", textAnchor: 'middle' }}>{t('chart.ovalUnavailable')}</text>}
    </svg>
  );
}

/** Width of an element in CSS pixels, so charts draw text at its true size on every screen. */
export function useWidth<T extends HTMLElement>(): [React.RefObject<T | null>, number] {
  const ref = useRef<T>(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.floor(e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

const DAY = 864e5;

export interface KpBar { t: number; kp: number; past: boolean }

/**
 * Kp bars coloured by level with the value above each bar. `unit` sets the bar length
 * (3-hourly or daily); `minBar` is the narrowest bar in px before the chart scrolls sideways.
 */
export function KpBarChart({ bars, unit, now, minBar = 0, label }: { bars: KpBar[]; unit: 'hour' | 'day'; now: number; minBar?: number; label: string }) {
  const [ref, cw] = useWidth<HTMLDivElement>();
  const { t, num, date } = useI18n();
  const dayLabel = (d: number) => date(d, { month: 'short', day: 'numeric', timeZone: 'UTC' });
  const weekday = (d: number) => date(d, { weekday: 'short', timeZone: 'UTC' });
  const H = unit === 'hour' ? 292 : 280, X0 = 34, PAD = 8, TOP = 26, Y1 = 230, U = (Y1 - TOP) / 9;
  const n = bars.length;
  const W = Math.max(cw, X0 + PAD + n * minBar);
  const bw = n ? (W - X0 - PAD) / n : 0;
  const step = n > 1 ? bars[1].t - bars[0].t : unit === 'hour' ? 3 * 36e5 : DAY;
  const idx = bars.findIndex(b => now >= b.t && now < b.t + step);
  const nowX = idx >= 0 ? X0 + (idx + (now - bars[idx].t) / step) * bw : null;
  const fs = bw >= 56 ? 14 : 11;

  // Open the 3-hour view with "now" near the left edge rather than two days back.
  const scrolled = useRef(false);
  useEffect(() => {
    if (!cw || scrolled.current || nowX === null || !ref.current) return;
    scrolled.current = true;
    if (W > cw) ref.current.scrollLeft = Math.max(0, nowX - 2 * bw - X0);
  }, [cw, W, nowX, bw, ref]);

  if (n === 0) {
    return <div style={{ height: 120, display: 'grid', placeItems: 'center', color: C.muted, fontWeight: 600 }}>{t('chart.kpUnavailable')}</div>;
  }
  const days = unit === 'hour' ? bars.reduce<{ t: number; i0: number; i1: number }[]>((acc, b, i) => {
    const d = Math.floor(b.t / DAY) * DAY;
    if (acc.length && acc[acc.length - 1].t === d) acc[acc.length - 1].i1 = i; else acc.push({ t: d, i0: i, i1: i });
    return acc;
  }, []) : [];

  return (
    <div ref={ref} className="hscroll" style={{ minHeight: H }}>
      {cw > 0 && (
        <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ display: 'block' }} role="img" aria-label={label}>
          {[0, 2, 4, 6, 8].map(k => (
            <g key={k}>
              <line x1={X0} x2={W - PAD} y1={Y1 - k * U} y2={Y1 - k * U} style={{ stroke: '#fff', strokeOpacity: k ? .07 : .25 }} />
              <text x={X0 - 8} y={Y1 - k * U + 4} style={{ ...monoText(11), textAnchor: 'end' }}>{k}</text>
            </g>
          ))}
          {days.slice(1).map(d => <line key={d.t} x1={f(X0 + d.i0 * bw)} x2={f(X0 + d.i0 * bw)} y1={TOP - 10} y2={H - 4} style={{ stroke: '#fff', strokeOpacity: .14 }} />)}
          {/* Drawn first so bars and their values sit on top of the line. */}
          {nowX !== null && (
            <>
              <line x1={f(nowX)} x2={f(nowX)} y1={TOP - 8} y2={Y1 + 2} style={{ stroke: '#fff', strokeWidth: 2, strokeDasharray: '6 4' }} />
              <text x={f(nowX)} y={TOP - 12} style={{ fill: '#fff', font: "700 11px 'Barlow', 'Golos Text'", textAnchor: 'middle' }}>{t('chart.now')}</text>
            </>
          )}
          {bars.map((b, i) => {
            const x = X0 + i * bw, h = Math.max(1.5, b.kp * U);
            return (
              <g key={b.t}>
                <rect x={f(x + 2)} y={f(Y1 - h)} width={f(Math.max(1, bw - 4))} height={f(h)} rx="2" style={{ fill: kpBarColor(b.kp), opacity: b.past ? .62 : 1 }}>
                  <title>{`${new Date(b.t).toISOString().slice(0, 16).replace('T', ' ')} UT · Kp ${num(b.kp, 2)} · ${b.past ? t('chart.observed') : t('chart.forecast')}`}</title>
                </rect>
                <text x={f(x + bw / 2)} y={f(Y1 - h - 6)} style={{ fill: b.past ? C.soft : '#fff', font: `600 ${fs}px 'Barlow', 'Golos Text'`, textAnchor: 'middle' }}>{num(b.kp, 2)}</text>
                {unit === 'hour'
                  ? <text x={f(x + bw / 2)} y={Y1 + 18} style={{ ...monoText(10), textAnchor: 'middle' }}>{new Date(b.t).toISOString().slice(11, 13)}</text>
                  : (
                    <>
                      <text x={f(x + bw / 2)} y={Y1 + 20} style={{ fill: C.soft, font: `600 ${fs}px 'Barlow', 'Golos Text'`, textAnchor: 'middle' }}>{weekday(b.t)}</text>
                      <text x={f(x + bw / 2)} y={Y1 + 38} style={{ fill: C.muted, font: `500 ${Math.min(fs, 12)}px 'Barlow', 'Golos Text'`, textAnchor: 'middle' }}>{dayLabel(b.t)}</text>
                    </>
                  )}
              </g>
            );
          })}
          {days.map(d => (
            <text key={d.t} x={f(X0 + ((d.i0 + d.i1 + 1) / 2) * bw)} y={Y1 + 44} style={{ fill: C.soft, font: "600 13px 'Barlow', 'Golos Text'", textAnchor: 'middle' }}>{`${weekday(d.t)} ${dayLabel(d.t)}`}</text>
          ))}
        </svg>
      )}
    </div>
  );
}

/** Round axis steps (1, 2, 2.5, 5 × 10ⁿ) for about `count` ticks. */
export function ticks(lo: number, hi: number, count = 4): number[] {
  const raw = (hi - lo) / count || 1;
  const p = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map(m => m * p).find(s => s >= raw) ?? 10 * p;
  const out: number[] = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) out.push(+v.toFixed(6));
  return out;
}
