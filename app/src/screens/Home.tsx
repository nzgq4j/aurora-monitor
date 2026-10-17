'use client';

import { C } from '../data';
import { KpOutlookChart, PolarOval } from '../components/Charts';
import { YourSky } from '../components/YourSky';
import { G_SCALE } from '../lib/astro';
import { SDO_IMAGES } from '../lib/sdo';
import type { NowData } from '../lib/now';
import { useStore } from '../store';

const hhmm = (t: number) => new Date(t).toISOString().slice(11, 16);
const fmt = (n: number | null | undefined, d = 0) => (n === null || n === undefined ? '—' : n.toFixed(d).replace('-', '−'));

function headline(kp: number | null): [string, string] {
  if (kp === null) return ['Kp', 'Unavailable'];
  const g = G_SCALE(kp);
  if (g > 0) return [`G${g} Storm`, 'In progress'];
  if (kp >= 4) return ['Active', 'Watch the sky'];
  if (kp >= 3) return ['Unsettled', 'Aurora far north'];
  return ['Quiet', 'Low activity'];
}

function summary(d: NowData): string {
  const parts: string[] = [];
  if (d.kp) {
    const g = G_SCALE(d.kp.kp);
    parts.push(`Planetary Kp is ${d.kp.kp.toFixed(2)}${g ? ` (G${g} geomagnetic storm)` : ''} for the period starting ${hhmm(d.kp.t)} UT.`);
  }
  const w = d.wind;
  if (w && (w.speed !== null || w.bz !== null)) {
    const bits = [w.speed !== null && `solar wind speed is ${Math.round(w.speed)} km/s`, w.bz !== null && `IMF Bz is ${fmt(w.bz, 1)} nT`].filter(Boolean).join(' and ');
    const tone = w.bz === null ? '' : w.bz <= -5 ? ' Bz is southward, which couples solar-wind energy into the magnetosphere.' : w.bz < 0 ? ' Bz is slightly southward.' : ' Bz is northward, which suppresses activity.';
    parts.push(`At L1, ${bits}.${tone}`);
  }
  if (d.hemi) parts.push(`Northern hemispheric power is ${d.hemi.north} GW.`);
  return parts.join(' ') || 'Live data from NOAA SWPC is temporarily unavailable.';
}

export function Home({ data }: { data: NowData }) {
  const { planIndex, go } = useStore();
  const kp = data.kp?.kp ?? null;
  const [l1, l2] = headline(kp);
  const level = kp === null ? 0 : Math.round(kp);
  const updated = Math.max(data.kp?.t ?? 0, data.wind?.t ?? 0, data.hemi?.t ?? 0);
  const w = data.wind;
  const stats = [
    { label: 'IMF BZ', value: fmt(w?.bz, 1), unit: 'nT', note: w?.bz == null ? 'No data' : w.bz <= -10 ? 'Strong south' : w.bz <= -3 ? 'Southward' : w.bz < 3 ? 'Near zero' : 'Northward', c: w?.bz != null && w.bz <= -3 ? C.green : C.soft },
    { label: 'SPEED', value: fmt(w?.speed), unit: 'km/s', note: w?.speed == null ? 'No data' : w.speed >= 600 ? 'Fast stream' : w.speed >= 450 ? 'Elevated' : 'Slow', c: w?.speed != null && w.speed >= 450 ? C.amber : C.soft },
    { label: 'HEMI POWER', value: fmt(data.hemi?.north), unit: 'GW', note: data.hemi == null ? 'No data' : data.hemi.north >= 50 ? 'High' : data.hemi.north >= 20 ? 'Moderate' : 'Low', c: data.hemi && data.hemi.north >= 50 ? C.red : C.soft },
    { label: 'DENSITY', value: fmt(w?.density, 1), unit: 'p/cm³', note: w?.density == null ? 'No data' : w.density >= 15 ? 'Dense' : 'Typical', c: C.soft },
  ];
  const scale = [1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => ({ n: n === 5 ? 'G1' : n === 9 ? 'G5' : String(n), bg: n >= 5 ? C.red : n === 4 ? C.amber : C.darkGreen, on: n <= level }));

  return (
    <main data-screen-label="Now" className="wrap" style={{ padding: '40px var(--gutter) 48px', display: 'flex', flexDirection: 'column', gap: 36 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(420px,100%),1fr))', gap: 40, alignItems: 'center' }}>
        <div className="hero-copy">
          <div className="kicker" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: updated ? 'var(--green)' : C.muted }} />
            {updated ? `LIVE · DATA ${hhmm(updated)} UT` : 'LIVE DATA UNAVAILABLE'}
          </div>
          <h1 className="display" style={{ fontSize: 'clamp(36px, 12cqi, 80px)', lineHeight: .88 }}>
            {l1}<br /><span className="hl" style={{ whiteSpace: 'nowrap' }}>{l2}</span>
          </h1>
          <p style={{ margin: 0, maxWidth: 540, fontSize: 18, lineHeight: 1.45, color: 'var(--soft)', textWrap: 'pretty' }}>{summary(data)}</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(9,1fr)', gap: 4, maxWidth: 520 }} aria-label={`Kp scale, current level ${kp === null ? 'unknown' : kp.toFixed(2)}`}>
            {scale.map(s => (
              <div key={s.n} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ height: 14, borderRadius: 2, background: s.bg, opacity: s.on ? 1 : .22 }} />
                <span className="mono" style={{ fontSize: 11, color: 'var(--muted)' }}>{s.n}</span>
              </div>
            ))}
          </div>
          <div className="now-stats">
            {stats.map(s => (
              <div key={s.label} className="now-stat">
                <span className="label">{s.label}</span>
                <span className="stat-value" style={{ fontSize: 32 }}>
                  {s.value}<span style={{ fontSize: 14, fontWeight: 600, color: 'var(--muted)', marginLeft: 4 }}>{s.unit}</span>
                </span>
                <span style={{ fontSize: 13, fontWeight: 600, color: s.c }}>{s.note}</span>
              </div>
            ))}
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 520, width: '100%', justifySelf: 'center' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
            <span style={{ fontFamily: 'var(--f-display)', fontWeight: 800, fontSize: 14, color: 'var(--green)', letterSpacing: '.04em' }}>AURORAL OVAL · OVATION</span>
            <span className="label">{data.oval?.forecast ? `FORECAST ${hhmm(data.oval.forecast)} UT` : '—'}</span>
          </div>
          <PolarOval points={data.oval?.points ?? []} edge={data.oval?.edge ?? []} />
          <span style={{ fontSize: 12, color: 'var(--muted)' }}>
            <span style={{ display: 'inline-block', width: 16, borderTop: `1.5px dashed ${C.red}`, verticalAlign: 'middle', marginRight: 6 }} />
            Equatorward edge of 10% aurora probability
          </span>
        </div>
      </div>

      <YourSky kp={kp} />

      <div className="rule-top" style={{ display: 'flex', flexDirection: 'column', gap: 12, paddingTop: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 24, flexWrap: 'wrap' }}>
          <h2 className="display" style={{ fontSize: 'var(--h-section)', lineHeight: 1 }}>Geomagnetic <span className="hl">outlook</span></h2>
          <span style={{ fontSize: 13, color: 'var(--muted)' }}>Observed &amp; estimated Kp (darker) · NOAA 3-day forecast · UT days</span>
        </div>
        <div className="hscroll"><div style={{ minWidth: 640 }}><KpOutlookChart series={data.series} now={data.fetchedAt} /></div></div>
      </div>

      <div className="rule-top" style={{ display: 'flex', flexDirection: 'column', gap: 16, paddingTop: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 24, flexWrap: 'wrap' }}>
          <h2 className="display" style={{ fontSize: 'var(--h-section)', lineHeight: 1 }}>The Sun <span className="hl">now</span></h2>
          <span style={{ fontSize: 13, color: 'var(--muted)' }}>NASA Solar Dynamics Observatory · latest images</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(220px,100%),1fr))', gap: 16 }}>
          {SDO_IMAGES.map(img => (
            <figure key={img.id} style={{ margin: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={img.url} alt={`The Sun in ${img.label}, latest SDO image`} loading="lazy" width={512} height={512}
                style={{ width: '100%', height: 'auto', aspectRatio: '1', borderRadius: 12, background: '#050605', border: '1px solid var(--line)' }} />
              <figcaption style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 13 }}>
                <span style={{ fontWeight: 700 }}>{img.label}</span><span style={{ color: 'var(--muted)' }}>{img.note}</span>
              </figcaption>
            </figure>
          ))}
        </div>
      </div>

      {planIndex === 0 && (
        <div className="cta-banner" style={{ border: '1px solid var(--line-2)', borderRadius: 16, background: 'radial-gradient(120% 140% at 100% 100%,rgba(89,255,58,.18),rgba(0,0,0,0) 60%)' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <span className="display" style={{ fontSize: 'var(--h-section)', lineHeight: 1 }}>Never miss <span className="hl">a night</span></span>
            <span style={{ fontSize: 16, color: 'var(--soft)' }}>Instant alerts when the oval reaches your sky, with clouds and darkness taken into account.</span>
          </div>
          <button type="button" className="btn pill pill-primary" onClick={() => go('plans')} style={{ fontSize: 15, padding: '14px 22px', whiteSpace: 'nowrap' }}>See memberships</button>
        </div>
      )}
    </main>
  );
}
