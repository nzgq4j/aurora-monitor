'use client';

import { useEffect, useState } from 'react';
import { C, ENTITLEMENTS } from '../data';
import { Locked } from '../components/Locked';
import { SolarActivity, useSolarData } from '../components/SolarActivity';
import { Explain } from '../components/Explain';
import { DetailCard } from '../components/DetailCard';
import { SunspotRegions, useSunspots } from '../components/SunspotRegions';
import { SunImages } from '../components/SunImages';
import { SunTimelapse } from '../components/SunTimelapse';
import { solarLine, spaceLine, summaryText } from '../lib/detailSummaries';
import { SDO_IMAGES } from '../lib/sdo';
import type { NowData } from '../lib/now';
import { useStore } from '../store';
import { useI18n } from '../i18n/I18n';

function SolarSection() {
  const { planIndex } = useStore();
  const can = planIndex >= ENTITLEMENTS.solarGraphs;
  const i18n = useI18n();
  const { t } = i18n;
  const { data } = useSolarData(can);
  // Client clock only, so the server and browser renders agree.
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => setNow(Date.now()), [data]);
  const summary = !can ? t('detail.solar.locked') : data && now !== null ? summaryText(i18n, solarLine(data.wind, now)) : t('detail.loading');
  return (
    <DetailCard id="solar" title={<>{t('solar.h2a')} <span className="hl">{t('solar.h2b')}</span></>} summary={summary}>
      <span style={{ fontSize: 13, color: 'var(--muted)' }}>{t('solar.source')}</span>
      {can ? <SolarActivity /> : (
        <Locked tier={ENTITLEMENTS.solarGraphs} title={t('feat.solarGraphs')}
          body={t('solar.locked')}
          preview={<FakeLines />} />
      )}
    </DetailCard>
  );
}

/** Decorative placeholder lines behind the locked solar panel (no real data). */
function FakeLines() {
  // Rounded: Math.sin can differ in the last digits between the server and the browser, which breaks hydration.
  const line = (seed: number) => Array.from({ length: 60 }, (_, i) => `${i ? 'L' : 'M'}${i * 10} ${(60 + Math.sin(i / 3 + seed) * 22 + Math.sin(i * 1.7 + seed) * 8).toFixed(1)}`).join(' ');
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(440px,100%),1fr))', gap: 14, padding: 14 }}>
      {[0, 1, 2, 3].map(k => (
        <svg key={k} viewBox="0 0 590 120" style={{ width: '100%', height: 140 }}><path d={line(k * 2)} style={{ fill: 'none', stroke: k === 3 ? '#7FD4FF' : C.green, strokeWidth: 2 }} /></svg>
      ))}
    </div>
  );
}

/**
 * The Sun tab: space weather (solar wind and hemispheric power), solar activity, and the Sun now with its
 * sunspot regions, live images and time-lapse. Moved from the Now page so it stays on the aurora.
 */
export function Sun({ data }: { data: NowData }) {
  const spots = useSunspots();
  const i18n = useI18n();
  const { t, tn, num } = i18n;
  const fmt = (n: number | null | undefined, d = 0) => (n === null || n === undefined ? '—' : num(n, d));
  const w = data.wind;
  const stats = [
    { label: t('home.stat.bz'), info: t('solar.bzInfo'), value: fmt(w?.bz, 1), unit: 'nT', note: w?.bz == null ? t('common.noData') : w.bz <= -10 ? t('home.bz.strongSouth') : w.bz <= -3 ? t('home.bz.south') : w.bz < 3 ? t('home.bz.zero') : t('home.bz.north'), c: w?.bz != null && w.bz <= -3 ? C.green : C.soft },
    { label: t('home.stat.speed'), info: t('solar.speedInfo'), value: fmt(w?.speed), unit: 'km/s', note: w?.speed == null ? t('common.noData') : w.speed >= 600 ? t('home.speed.fast') : w.speed >= 450 ? t('home.speed.elevated') : t('home.speed.slow'), c: w?.speed != null && w.speed >= 450 ? C.amber : C.soft },
    { label: t('home.stat.hemi'), info: t('solar.hemiInfo'), value: fmt(data.hemi?.north), unit: 'GW', note: data.hemi == null ? t('common.noData') : data.hemi.north >= 50 ? t('home.hemi.high') : data.hemi.north >= 20 ? t('home.hemi.moderate') : t('home.hemi.low'), c: data.hemi && data.hemi.north >= 50 ? C.red : C.soft },
    { label: t('home.stat.density'), info: t('solar.densityInfo'), value: fmt(w?.density, 1), unit: 'p/cm³', note: w?.density == null ? t('common.noData') : w.density >= 15 ? t('home.density.dense') : t('home.density.typical'), c: C.soft },
  ];

  return (
    <main data-screen-label="Sun" className="wrap" style={{ padding: '40px var(--gutter) 48px', display: 'flex', flexDirection: 'column', gap: 36 }}>
      <h1 className="you-title">{t('nav.sun')}</h1>

      <DetailCard id="space" title={<>{t('detail.space.h2a')} <span className="hl">{t('detail.space.h2b')}</span></>} summary={summaryText(i18n, spaceLine(w))}>
        <div className="now-stats">
          {stats.map(s => (
            <div key={s.label} className="now-stat">
              <span className="label">{s.label}</span>
              <span className="stat-value" style={{ fontSize: 32 }}>
                {s.value}<span style={{ fontSize: 14, fontWeight: 600, color: 'var(--muted)', marginLeft: 4 }}>{s.unit}</span>
              </span>
              <span style={{ fontSize: 13, fontWeight: 600, color: s.c }}>{s.note}</span>
              <Explain>{s.info}</Explain>
            </div>
          ))}
        </div>
      </DetailCard>

      <SolarSection />

      <DetailCard id="sun" title={<>{t('home.sun.h2a')} <span className="hl">{t('home.sun.h2b')}</span></>}
        summary={spots?.regions.length ? `${tn('detail.sunRegions', spots.regions.length)} · ${t('detail.sun', { n: SDO_IMAGES.length })}` : t('detail.sun', { n: SDO_IMAGES.length })}>
        <span style={{ fontSize: 13, color: 'var(--muted)' }}>{t('home.sun.source')}</span>
        <SunspotRegions />
        <SunImages />
        <SunTimelapse />
      </DetailCard>
    </main>
  );
}
