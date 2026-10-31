'use client';

import { useEffect, useState } from 'react';
import { C } from '../data';
import type { SolarActivity as Data } from '../app/api/solar/route';
import { SpaceChart } from './SpaceChart';
import { useI18n } from '../i18n/I18n';

/** Last 24 hours of solar wind at L1 and OVATION hemispheric power, refreshed every two minutes. */
// One request per two minutes, shared by the charts and the card summary on the Now page.
let cached: { at: number; p: Promise<Data> } | null = null;
const fetchSolar = () => {
  if (!cached || Date.now() - cached.at > 11e4) {
    const p = fetch('/api/solar').then(r => (r.ok ? r.json() : Promise.reject())) as Promise<Data>;
    cached = { at: Date.now(), p };
    p.catch(() => { cached = null; });
  }
  return cached.p;
};

/** /api/solar, refreshed every two minutes (`enabled` false skips it, e.g. for plans without the charts). */
export function useSolarData(enabled = true) {
  const [data, setData] = useState<Data | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    const load = () => fetchSolar().then(d => { if (alive) { setData(d); setFailed(false); } }).catch(() => alive && setFailed(true));
    load();
    const id = setInterval(load, 12e4);
    return () => { alive = false; clearInterval(id); };
  }, [enabled]);
  return { data, failed };
}

const PURPLE = '#b06bdc', BLUE = '#5fb8ff';
const cap = (s: string) => s.charAt(0).toLocaleUpperCase() + s.slice(1);

/** The solar wind and hemispheric power charts: magnetic field, speed, density and power, last 24 hours. */
export function SolarActivity() {
  const { data, failed } = useSolarData();
  const { t } = useI18n();

  if (!data) {
    return <div style={{ minHeight: 200, display: 'grid', placeItems: 'center', color: C.muted, fontWeight: 600 }}>{failed ? t('solar.unavailable') : t('solar.loading')}</div>;
  }
  const now = Date.now();
  const wind = (k: 'speed' | 'density' | 'bz' | 'bt') => data.wind.map(p => ({ t: p.t, v: p[k] }));
  return (
    <div className="space-charts">
      <SpaceChart title={t('solar.field')} unit="nT" decimals={1} zero now={now}
        series={[{ points: wind('bz'), color: C.red, fillNegative: true }, { points: wind('bt'), color: PURPLE, dashed: true }]}
        legend={[{ color: C.red, label: t('info.m.bz') }, { color: PURPLE, label: t('solar.bt'), dash: true }]}
        caption={t('solar.bzNote')} />
      <SpaceChart title={t('solar.speed')} unit="km/s" now={now}
        series={[{ points: wind('speed'), color: C.green, area: true, stops: [{ v: 450, color: C.orange }, { v: 600, color: C.red }] }]}
        thresholds={[{ v: 450, color: C.orange, label: t('home.speed.elevated') }, { v: 600, color: C.red, label: t('home.speed.fast') }]}
        legend={[{ color: C.green, label: `< 450 km/s · ${t('home.speed.slow')}` }, { color: C.orange, label: `450+ km/s · ${t('home.speed.elevated')}` }, { color: C.red, label: `600+ km/s · ${t('home.speed.fast')}` }]}
        caption={t('solar.speedNote')} />
      <SpaceChart title={t('solar.density')} unit="p/cm³" decimals={1} now={now}
        series={[{ points: wind('density'), color: BLUE }]}
        thresholds={[{ v: 15, color: C.muted, label: t('home.density.dense') }]}
        legend={[{ color: BLUE, label: `${t('info.m.density')} (p/cm³)` }, { color: C.muted, label: `15+ p/cm³ · ${t('home.density.dense')}`, dash: true }]}
        caption={t('solar.densityNote')} />
      <SpaceChart title={t('solar.hemi')} unit="GW" now={now}
        series={[{ points: data.hemi.map(p => ({ t: p.t, v: p.north })), color: C.green, area: true, forecast: true }]}
        thresholds={[{ v: 20, color: C.orange, label: t('home.hemi.moderate') }, { v: 50, color: C.red, label: t('home.hemi.high') }]}
        legend={[{ color: C.green, label: cap(t('chart.observed')) }, { color: C.green, label: cap(t('chart.forecast')), dash: true }]}
        caption={t('solar.hemiNote')} />
    </div>
  );
}
