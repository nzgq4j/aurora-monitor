'use client';

import { useId } from 'react';
import { C } from '../data';
import { useI18n } from '../i18n/I18n';
import { ticks, useWidth } from './Charts';

const f = (n: number) => Math.round(n * 10) / 10;
const NOW = '#3d8bff';
/** A gap longer than this breaks the line rather than joining across missing data. */
const GAP = 12e5;

export interface Series {
  points: { t: number; v: number | null }[];
  color: string;
  /** Dashed throughout (a secondary line, such as Bt). */
  dashed?: boolean;
  /** Fill between the line and zero where the value is negative (Bz south). */
  fillNegative?: boolean;
  /** Fill under the line, fading down. */
  area?: boolean;
  /** Colour the line by value: below the first stop it is `color`, then each stop's colour from its value up. */
  stops?: { v: number; color: string }[];
  /** Values after now are a forecast, drawn dashed. */
  forecast?: boolean;
}
export interface Threshold { v: number; color: string; label: string }
export interface LegendItem { color: string; label: string; dash?: boolean }

/**
 * A space-weather chart in a rounded card: labelled grid, dashed threshold lines, a blue Now line, then a
 * legend and a one-line caption under the card. Times are UT, as in the rest of the solar data.
 */
export function SpaceChart({ title, unit, decimals = 0, series, thresholds = [], zero, legend, caption, now }: {
  title: string; unit: string; decimals?: number; series: Series[]; thresholds?: Threshold[]; zero?: boolean;
  legend: LegendItem[]; caption: string; now: number;
}) {
  const [ref, W] = useWidth<HTMLDivElement>();
  const { t, num } = useI18n();
  const uid = useId().replace(/:/g, '');
  const H = 200, X0 = 40, X1 = W - 14, TOP = 26, BOT = 172;
  const all = series.flatMap(s => s.points).filter((p): p is { t: number; v: number } => p.v !== null);
  const main = series[0].points.filter((p): p is { t: number; v: number } => p.v !== null);
  const last = [...main].reverse().find(p => p.t <= now) ?? main[main.length - 1];

  let lo = Math.min(...all.map(p => p.v), ...thresholds.map(x => x.v)), hi = Math.max(...all.map(p => p.v), ...thresholds.map(x => x.v));
  if (zero) { lo = Math.min(lo, 0); hi = Math.max(hi, 0); }
  const pad = (hi - lo) * 0.08 || 1;
  lo -= pad; hi += pad;
  if (!zero && lo < 0 && Math.min(...all.map(p => p.v)) >= 0) lo = 0;
  const ys = ticks(lo, hi);
  lo = Math.min(lo, ys[0]); hi = Math.max(hi, ys[ys.length - 1]);
  const t0 = all.length ? Math.min(...all.map(p => p.t)) : now - 864e5;
  const t1 = Math.max(now, ...all.map(p => p.t));
  const x = (v: number) => X0 + ((v - t0) / (t1 - t0 || 1)) * (X1 - X0);
  const y = (v: number) => BOT - ((v - lo) / (hi - lo || 1)) * (BOT - TOP);

  // Runs of points without long gaps, each split where the forecast starts.
  const runs = (s: Series) => {
    const pts = s.points.filter((p): p is { t: number; v: number } => p.v !== null);
    const out: { pts: typeof pts; dashed: boolean }[] = [];
    let cur: (typeof out)[number] | null = null;
    pts.forEach((p, i) => {
      const dashed = !!s.dashed || (!!s.forecast && p.t > now);
      const gap = i > 0 && p.t - pts[i - 1].t > GAP;
      if (!cur || gap || cur.dashed !== dashed) {
        cur = { pts: cur && !gap ? [pts[i - 1], p] : [p], dashed };
        out.push(cur);
      } else cur.pts.push(p);
    });
    return out;
  };
  const line = (pts: { t: number; v: number }[]) => pts.map((p, i) => `${i ? 'L' : 'M'}${f(x(p.t))} ${f(y(p.v))}`).join(' ');
  const every = (W < 480 ? 6 : 3) * 36e5;
  const hours: number[] = [];
  for (let h = Math.ceil(t0 / every) * every; h <= t1; h += every) hours.push(h);
  const nowX = x(now);

  return (
    <section className="space-chart">
      <div className="space-chart-head">
        <h3>{title}</h3>
        {last && <span className="mono" style={{ color: series[0].stops ? colorAt(series[0], last.v) : series[0].color }}>{num(last.v, decimals)} {unit}</span>}
      </div>
      <div className="space-chart-card" ref={ref}>
        {W > 0 && main.length > 1 ? (
          <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ display: 'block' }} role="img"
            aria-label={`${title}, ${t('chart.lastHours', { n: 24 })}${last ? `, ${t('chart.latest', { value: `${num(last.v, decimals)} ${unit}` })}` : ''}`}>
            <defs>
              {series.map((s, i) => s.stops && (
                <linearGradient key={i} id={`${uid}-g${i}`} gradientUnits="userSpaceOnUse" x1="0" x2="0" y1={BOT} y2={TOP}>
                  {gradStops(s, lo, hi).map((g, k) => <stop key={k} offset={g.o} stopColor={g.c} />)}
                </linearGradient>
              ))}
              <linearGradient id={`${uid}-area`} x1="0" x2="0" y1="0" y2="1">
                <stop offset="0" stopColor={C.darkGreen} stopOpacity=".45" /><stop offset="1" stopColor={C.darkGreen} stopOpacity=".05" />
              </linearGradient>
              <clipPath id={`${uid}-neg`}><rect x={X0} y={y(0)} width={Math.max(0, X1 - X0)} height={Math.max(0, BOT - y(0))} /></clipPath>
            </defs>
            {ys.map(v => (
              <g key={v}>
                <line x1={X0} x2={X1} y1={f(y(v))} y2={f(y(v))} stroke="#fff" strokeOpacity={zero && v === 0 ? .4 : .09} strokeDasharray={zero && v === 0 ? '3 3' : undefined} />
                <text x={X0 - 8} y={f(y(v)) + 4} className="space-chart-tick" textAnchor="end">{num(v, String(v).split('.')[1]?.length ?? 0)}</text>
              </g>
            ))}
            {hours.map(h => (
              <g key={h}>
                <line x1={f(x(h))} x2={f(x(h))} y1={TOP} y2={BOT} stroke="#fff" strokeOpacity=".08" strokeDasharray="2 4" />
                <text x={f(x(h))} y={BOT + 20} className="space-chart-tick" textAnchor="middle">{new Date(h).toISOString().slice(11, 16)}</text>
              </g>
            ))}
            {thresholds.map(th => (
              <g key={th.v}>
                <line x1={X0} x2={X1} y1={f(y(th.v))} y2={f(y(th.v))} stroke={th.color} strokeWidth="1.4" strokeDasharray="6 5" />
                <text x={X0 + 6} y={f(y(th.v)) - 6} fill={th.color} className="space-chart-label">{th.label}</text>
              </g>
            ))}
            {series.map((s, i) => runs(s).map((r, k) => {
              const d = line(r.pts);
              const base = `L${f(x(r.pts[r.pts.length - 1].t))} ${f(s.fillNegative ? y(0) : BOT)} L${f(x(r.pts[0].t))} ${f(s.fillNegative ? y(0) : BOT)} Z`;
              const stroke = s.stops ? `url(#${uid}-g${i})` : s.color;
              return (
                <g key={`${i}-${k}`}>
                  {s.area && !r.dashed && <path d={`${d} ${base}`} fill={`url(#${uid}-area)`} />}
                  {s.fillNegative && <path d={`${d} ${base}`} fill={s.color} fillOpacity=".28" clipPath={`url(#${uid}-neg)`} />}
                  <path d={d} fill="none" stroke={stroke} strokeWidth={s.dashed ? 2 : 2.4} strokeDasharray={r.dashed ? '5 4' : undefined} strokeLinejoin="round" strokeLinecap="round" />
                </g>
              );
            }))}
            <line x1={f(nowX)} x2={f(nowX)} y1={TOP - 6} y2={BOT} stroke={NOW} strokeWidth="2.5" />
            <g transform={`translate(${f(Math.min(nowX, X1 - 22))} 0)`}>
              <rect x="-24" y="2" width="48" height="20" rx="5" fill="#0e2340" />
              <text x="0" y="16" textAnchor="middle" className="space-chart-now">{t('chart.now')}</text>
            </g>
          </svg>
        ) : W > 0 ? (
          <div style={{ height: H, display: 'grid', placeItems: 'center', color: C.muted, fontWeight: 600 }}>{t('chart.noRecent')}</div>
        ) : <div style={{ height: H }} />}
      </div>
      <ul className="space-chart-legend">
        {legend.map(l => (
          <li key={l.label}><i className={l.dash ? 'dash' : ''} style={{ background: l.dash ? `repeating-linear-gradient(90deg, ${l.color} 0 5px, transparent 5px 8px)` : l.color }} aria-hidden="true" />{l.label}</li>
        ))}
      </ul>
      <p className="space-chart-caption">{caption}</p>
    </section>
  );
}

/** The colour a value-coloured line has at `v`. */
function colorAt(s: Series, v: number) {
  let c = s.color;
  for (const st of s.stops ?? []) if (v >= st.v) c = st.color;
  return c;
}

/** Hard colour changes at each stop, as gradient offsets from the bottom (lo) to the top (hi) of the plot. */
function gradStops(s: Series, lo: number, hi: number) {
  const o = (v: number) => Math.min(1, Math.max(0, (v - lo) / (hi - lo || 1)));
  const out = [{ o: 0, c: s.color }];
  let prev = s.color;
  for (const st of s.stops ?? []) { out.push({ o: o(st.v), c: prev }, { o: o(st.v), c: st.color }); prev = st.color; }
  out.push({ o: 1, c: prev });
  return out;
}
