'use client';

import { useEffect, useState } from 'react';
import { C } from '../data';
import type { SolarActivity as Data } from '../app/api/solar/route';
import { LineChart } from './Charts';

/** Last 24 hours of solar wind at L1 and OVATION hemispheric power, refreshed every two minutes. */
export function SolarActivity() {
  const [data, setData] = useState<Data | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let alive = true;
    const load = () => fetch('/api/solar').then(r => (r.ok ? r.json() : Promise.reject())).then((d: Data) => { if (alive) { setData(d); setFailed(false); } }).catch(() => alive && setFailed(true));
    load();
    const id = setInterval(load, 12e4);
    return () => { alive = false; clearInterval(id); };
  }, []);

  if (!data) {
    return <div style={{ minHeight: 200, display: 'grid', placeItems: 'center', color: C.muted, fontWeight: 600 }}>{failed ? 'Solar activity data is unavailable right now.' : 'Loading solar activity…'}</div>;
  }
  const now = Date.now();
  const wind = (k: 'speed' | 'density' | 'bz' | 'bt') => data.wind.map(p => ({ t: p.t, v: p[k] }));
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(440px,100%),1fr))', gap: 14 }}>
      <LineChart title="Hemispheric power · North" unit="GW" color={C.green} points={data.hemi.map(p => ({ t: p.t, v: p.north }))} forecastAfter={now}
        note="OVATION estimate; NOAA publishes the last several hours. Dashed values are the short-range forecast." />
      <LineChart title="Solar wind speed" unit="km/s" color={C.green} points={wind('speed')} />
      <LineChart title="Solar wind density" unit="p/cm³" color={C.green} decimals={1} points={wind('density')} />
      <LineChart title="IMF Bz (GSM)" unit="nT" color="#7FD4FF" decimals={1} zero points={wind('bz')} note="Southward (negative) Bz lets solar-wind energy into the magnetosphere." />
    </div>
  );
}
