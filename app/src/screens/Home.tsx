'use client';

import { useState } from 'react';
import { C, ENTITLEMENTS, kpBarColor } from '../data';
import { KpBarChart, POLAR_MIN_LAT, PolarOval, type KpBar } from '../components/Charts';
import { Locked } from '../components/Locked';
import { SolarActivity } from '../components/SolarActivity';
import type { KpPoint } from '../lib/feeds';
import { YourSky } from '../components/YourSky';
import { G_SCALE } from '../lib/astro';
import { SDO_IMAGES } from '../lib/sdo';
import { useLocations } from '../lib/locations';
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

/** Highest Kp in each UT day; a day counts as observed only when none of it is forecast. */
function dailyPeaks(series: KpPoint[]): KpBar[] {
  const days = new Map<number, KpBar>();
  for (const p of series) {
    const t = Math.floor(p.t / 864e5) * 864e5, past = p.kind !== 'predicted';
    const d = days.get(t);
    if (!d) days.set(t, { t, kp: p.kp, past });
    else { d.kp = Math.max(d.kp, p.kp); d.past = d.past && past; }
  }
  return [...days.values()];
}

type OutlookView = 'hour' | 'day' | 'month';
const OUTLOOK_NOTE: Record<OutlookView, string> = {
  hour: 'Observed & estimated Kp (faded) · NOAA 3-day forecast · 3-hour UT blocks',
  day: 'Highest Kp in each UT day · observed (faded) and NOAA forecast',
  month: 'NOAA 27-day outlook · largest expected Kp each UT day',
};

function Outlook({ data }: { data: NowData }) {
  const { planIndex } = useStore();
  const [picked, setPicked] = useState<OutlookView | null>(null);
  const can = { hour: planIndex >= ENTITLEMENTS.kp3h, day: true, month: planIndex >= ENTITLEMENTS.outlook27 };
  const view = picked ?? (can.hour ? 'hour' : 'day');
  const daily = dailyPeaks(data.series);
  const chart = {
    hour: <KpBarChart unit="hour" minBar={28} now={data.fetchedAt} bars={data.series.map(p => ({ t: p.t, kp: p.kp, past: p.kind !== 'predicted' }))} label="Kp index in 3-hour blocks, observed and forecast" />,
    day: <KpBarChart unit="day" now={data.fetchedAt} bars={daily} label="Highest Kp each day, observed and forecast" />,
    month: <KpBarChart unit="day" minBar={46} now={data.fetchedAt} bars={data.outlook.map(d => ({ t: d.t, kp: d.kp, past: false }))} label="NOAA 27-day outlook of the largest Kp each day" />,
  };
  const tab = (v: OutlookView, label: string) => (
    <button type="button" className="btn" aria-pressed={view === v} onClick={() => setPicked(v)}
      style={{ flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 5, padding: '9px 10px', borderRadius: 999, fontWeight: 700, fontSize: 14, background: view === v ? '#3a3f3c' : 'transparent', color: view === v ? '#fff' : C.soft, whiteSpace: 'nowrap' }}>
      {!can[v] && <svg viewBox="0 0 24 24" width="12" height="12" aria-label="Locked"><path d="M7 11V8a5 5 0 0 1 10 0v3M5.5 11h13v9.5h-13z" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinejoin="round" /></svg>}
      {label}
    </button>
  );
  return (
    <div className="rule-top" style={{ display: 'flex', flexDirection: 'column', gap: 14, paddingTop: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 16, flexWrap: 'wrap' }}>
        <h2 className="display" style={{ fontSize: 'var(--h-section)', lineHeight: 1 }}>Geomagnetic <span className="hl">outlook</span></h2>
        <div role="group" aria-label="Forecast detail" style={{ display: 'flex', padding: 4, border: '1px solid var(--line-2)', borderRadius: 999, background: '#111', flex: '1 1 300px', maxWidth: 420 }}>
          {tab('hour', '3-hourly')}{tab('day', 'Daily peak')}{tab('month', '27-day')}
        </div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', fontSize: 13, color: 'var(--muted)' }}>
        <span>{OUTLOOK_NOTE[view]}</span>
        <span style={{ display: 'inline-flex', gap: 12 }}>
          {([[2, 'Below 3'], [3, '3'], [4, '4 and up']] as const).map(([k, l]) => (
            <span key={k} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><i style={{ width: 10, height: 10, borderRadius: 2, background: kpBarColor(k) }} />{l}</span>
          ))}
        </span>
      </div>
      {can[view] ? chart[view] : (
        <Locked tier={view === 'hour' ? ENTITLEMENTS.kp3h : ENTITLEMENTS.outlook27} preview={chart.day}
          title={view === 'hour' ? '3-hour Kp forecast' : '27-day outlook'}
          body={view === 'hour'
            ? 'See Kp in 3-hour blocks for the next three days, so you know which part of the night to be outside.'
            : 'Plan trips around NOAA’s 27-day outlook, based on the Sun’s rotation.'} />
      )}
    </div>
  );
}

function SolarSection() {
  const { planIndex } = useStore();
  const can = planIndex >= ENTITLEMENTS.solarGraphs;
  return (
    <div className="rule-top" style={{ display: 'flex', flexDirection: 'column', gap: 14, paddingTop: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 24, flexWrap: 'wrap' }}>
        <h2 className="display" style={{ fontSize: 'var(--h-section)', lineHeight: 1 }}>Solar <span className="hl">activity</span></h2>
        <span style={{ fontSize: 13, color: 'var(--muted)' }}>DSCOVR/ACE at L1 · NOAA OVATION · last 24 hours · UT</span>
      </div>
      {can ? <SolarActivity /> : (
        <Locked tier={ENTITLEMENTS.solarGraphs} title="Solar wind & hemispheric power graphs"
          body="Watch speed, density, Bz and hemispheric power over the last 24 hours to spot a storm building before Kp catches up."
          preview={<FakeLines />} />
      )}
    </div>
  );
}

/** Decorative placeholder lines behind the locked solar panel (no real data). */
function FakeLines() {
  const line = (seed: number) => Array.from({ length: 60 }, (_, i) => `${i ? 'L' : 'M'}${i * 10} ${60 + Math.sin(i / 3 + seed) * 22 + Math.sin(i * 1.7 + seed) * 8}`).join(' ');
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(440px,100%),1fr))', gap: 14, padding: 14 }}>
      {[0, 1, 2, 3].map(k => (
        <svg key={k} viewBox="0 0 590 120" style={{ width: '100%', height: 140 }}><path d={line(k * 2)} style={{ fill: 'none', stroke: k === 3 ? '#7FD4FF' : C.green, strokeWidth: 2 }} /></svg>
      ))}
    </div>
  );
}

export function Home({ data }: { data: NowData }) {
  const { planIndex, go } = useStore();
  const { shownPlace } = useLocations();
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
          <PolarOval points={data.oval?.points ?? []} edge={data.oval?.edge ?? []} marker={shownPlace} />
          <span style={{ fontSize: 12, color: 'var(--muted)' }}>
            <span style={{ display: 'inline-block', width: 16, borderTop: `1.5px dashed ${C.red}`, verticalAlign: 'middle', marginRight: 6 }} />
            Equatorward edge of 10% aurora probability
          </span>
          <button type="button" className="btn" onClick={() => go('map')} style={{ alignSelf: 'flex-start', fontSize: 14, fontWeight: 700, color: 'var(--green)' }}>Open the zoomable map →</button>
          {shownPlace && shownPlace.lat < POLAR_MIN_LAT && (
            <span style={{ fontSize: 12, color: 'var(--muted)' }}>
              {shownPlace.lat < 0 ? `${shownPlace.name} is in the southern hemisphere; this map shows the north.` : `${shownPlace.name} is south of this map, which reaches about ${Math.round(POLAR_MIN_LAT)}°N.`}
            </span>
          )}
        </div>
      </div>

      <YourSky kp={kp} />

      <Outlook data={data} />

      <SolarSection />

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
