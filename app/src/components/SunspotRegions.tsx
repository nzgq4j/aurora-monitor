'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { layoutLabels, magGreek, magRisk, project, solarB0, type PlacedLabel, type Region } from '../lib/sunspots';
import { useI18n } from '../i18n/I18n';

interface Data { observed: string; regions: Region[] }

let cached: Promise<Data | null> | null = null;
const load = () => (cached ??= fetch('/api/sunspots').then(r => (r.ok ? r.json() : null)).catch(() => null));

/** NOAA's active regions (shared by the card summary and the disc). */
export function useSunspots() {
  const [data, setData] = useState<Data | null | undefined>(undefined);
  useEffect(() => { load().then(setData); }, []);
  return data;
}

/** Label size, as a fraction of the image width (about 15 px on a 420 px disc). */
const LABEL = 0.036;

/**
 * Leader line from a label to its spot: starts just off the label's near edge and stops short of the
 * spot so it never covers it.
 */
function leader(l: PlacedLabel) {
  const x1 = l.anchor === 'start' ? l.lx - LABEL * 0.2 : l.lx + LABEL * 0.2, y1 = l.ly;
  const dx = l.x - x1, dy = l.y - y1, d = Math.hypot(dx, dy) || 1;
  const k = Math.max(0, d - LABEL * 0.45) / d;
  return { x1, y1, x2: x1 + dx * k, y2: y1 + dy * k };
}

const pct = (v: number | null) => (v === null ? '—' : `${v}%`);

const RISK_COLOR = { low: '#6CFF2B', elevated: '#E6B800', high: '#F06A6A' } as const;

/**
 * The Sun in visible light (SDO HMI) with NOAA's active regions labelled by number (#41), and a table
 * of the regions: spot count, magnetic and McIntosh class, and flare chances. The disc's centre and
 * radius are measured from the image itself, so the labels follow however SDO frames the Sun.
 */
export function SunspotRegions() {
  const { t, date } = useI18n();
  const data = useSunspots();
  const [disc, setDisc] = useState<{ cx: number; cy: number; r: number } | null>(null);
  const img = useRef<HTMLImageElement>(null);
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => setNow(Date.now()), []);

  // Find the disc: the bright span across the middle row and column (as fractions of the image).
  const measure = () => {
    const el = img.current;
    if (!el?.naturalWidth) return;
    const w = el.naturalWidth, h = el.naturalHeight;
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const ctx = c.getContext('2d', { willReadFrequently: true })!;
    ctx.drawImage(el, 0, 0);
    const lit = (x: number, y: number) => { const p = ctx.getImageData(x, y, 1, 1).data; return p[0] + p[1] + p[2] > 90; };
    const span = (n: number, at: (i: number) => boolean) => {
      let a = 0, b = n - 1;
      while (a < n && !at(a)) a++;
      while (b > a && !at(b)) b--;
      return [a, b] as const;
    };
    const [x0, x1] = span(w, i => lit(i, Math.round(h / 2)));
    const [y0, y1] = span(h, i => lit(Math.round(w / 2), i));
    if (x1 - x0 < w * 0.3 || y1 - y0 < h * 0.3) return;
    setDisc({ cx: (x0 + x1 + 1) / 2 / w, cy: (y0 + y1 + 1) / 2 / h, r: (x1 - x0 + 1 + y1 - y0 + 1) / 4 / w });
  };

  // A cached image can finish loading before React attaches onLoad, so also measure once mounted.
  useEffect(() => { if (img.current?.complete) measure(); }, []);

  const placed = useMemo(() => {
    if (!data || now === null) return [];
    const b0 = solarB0(now);
    return data.regions.map(r => ({ r, p: project(r, now, b0) }));
  }, [data, now]);

  // Only regions with spots are labelled on the disc (NOAA keeps numbering a region after its spots fade).
  const byId = new Map(placed.map(({ r }) => [r.region, r]));
  const labels = disc ? layoutLabels(placed.filter(({ r, p }) => p.front && (r.spots ?? 0) > 0)
    .map(({ r, p }) => ({ id: r.region, x: disc.cx + p.x * disc.r, y: disc.cy - p.y * disc.r })), LABEL, disc.cx) : [];
  // Table: regions with spots first, then the spotless ones.
  const rows = [...placed].sort((a, b) => +((b.r.spots ?? 0) > 0) - +((a.r.spots ?? 0) > 0) || a.r.region - b.r.region);

  if (data === null) return <p className="sun-regions-note">{t('spots.unavailable')}</p>;

  return (
    <div className="sun-regions">
      <figure className="sun-disc">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img ref={img} src="/api/sunspots/image" alt={t('spots.alt')} width={1024} height={1024} onLoad={measure} />
        {disc && (
          <svg viewBox="0 0 1 1" aria-hidden="true">
            {labels.map(l => {
              const r = byId.get(l.id)!;
              const color = RISK_COLOR[magRisk(r.mag) ?? 'low'];
              return (
                <g key={l.id}>
                  <line {...leader(l)} stroke={color} strokeWidth={0.003} strokeLinecap="round" />
                  <text x={l.lx} y={l.ly + LABEL * 0.36} fontSize={LABEL} fontWeight={800} fill={color} textAnchor={l.anchor}
                    stroke="#000" strokeWidth={0.008} paintOrder="stroke">{l.id}</text>
                </g>
              );
            })}
          </svg>
        )}
        <figcaption>{data ? t('spots.observed', { date: date(Date.parse(`${data.observed}T00:00:00Z`), { day: 'numeric', month: 'short', timeZone: 'UTC' }) }) : t('sky.checking')}</figcaption>
        <details className="toggle-info">
          <summary>{t('chart.explain')}</summary>
          <p>{t('sdo.HMIIC.info')}</p>
        </details>
      </figure>

      <div className="sun-table-wrap">
        {data && !data.regions.length ? <p className="sun-regions-note">{t('spots.none')}</p> : (
          <table className="sun-table">
            <thead>
              <tr><th scope="col">{t('spots.col.region')}</th><th scope="col">{t('spots.col.spots')}</th><th scope="col">{t('spots.col.mag')}</th><th scope="col">{t('spots.col.mcintosh')}</th><th scope="col">{t('spots.col.flare')}</th></tr>
            </thead>
            <tbody>
              {rows.map(({ r, p }) => {
                const risk = magRisk(r.mag), spotless = !((r.spots ?? 0) > 0);
                return (
                  <tr key={r.region} className={spotless ? 'sun-spotless' : undefined}>
                    <th scope="row"><span className="sun-dot" style={{ background: RISK_COLOR[risk ?? 'low'], opacity: risk ? 1 : 0.35 }} />{r.region}{!p.front ? <small>{t('spots.behind')}</small> : spotless && <small>{t('spots.noSpots')}</small>}</th>
                    <td className="mono">{r.spots ?? '—'}</td>
                    <td>{magGreek(r.mag)}</td>
                    <td className="mono">{r.mcintosh ?? '—'}</td>
                    <td className="mono">{pct(r.flare.m)} / {pct(r.flare.x)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        <details className="sun-help">
          <summary>{t('spots.help.title')}</summary>
          <p><b>{t('spots.col.mag')}.</b> {t('spots.help.mag')}</p>
          <p><b>{t('spots.col.mcintosh')}.</b> {t('spots.help.mcintosh')}</p>
          <p className="sun-legend">
            <span><i style={{ background: RISK_COLOR.low }} />{t('spots.risk.low')}</span>
            <span><i style={{ background: RISK_COLOR.elevated }} />{t('spots.risk.elevated')}</span>
            <span><i style={{ background: RISK_COLOR.high }} />{t('spots.risk.high')}</span>
          </p>
        </details>
      </div>
    </div>
  );
}
