'use client';

import { useEffect, useState } from 'react';
import { C, ENTITLEMENTS } from '../data';
import { Locked } from '../components/Locked';
import { SolarActivity, useSolarData } from '../components/SolarActivity';
import { InfoButton } from '../components/InfoSheet';
import { StatIcon } from '../components/StatIcon';
import { solarInfo, spaceInfo, sunInfo } from '../lib/cardInfo';
import { DetailCard } from '../components/DetailCard';
import { SunspotRegions, useSunspots } from '../components/SunspotRegions';
import { SunImages } from '../components/SunImages';
import { SunTimelapse } from '../components/SunTimelapse';
import { solarLine, spaceLine, summaryText } from '../lib/detailSummaries';
import { SDO_IMAGES } from '../lib/sdo';
import type { NowData } from '../lib/now';
import { useStore } from '../store';
import { useI18n } from '../i18n/I18n';
import { headLead, headText } from '../i18n/core';
import { INTL_TAG } from '../i18n/config';
import { ShareButton } from '../components/ShareButton';
import { useStorm } from '../components/StormOutlook';
import { dataCardBlob } from '../lib/shareCard';
import { sharePost, shareStamp } from '../lib/share';
import { SITE } from '../lib/site';

function SolarSection() {
  const { planIndex } = useStore();
  const can = planIndex >= ENTITLEMENTS.solarGraphs;
  const i18n = useI18n();
  const { t } = i18n;
  const { data } = useSolarData(can);
  // Client clock only, so the server and browser renders agree.
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => setNow(Date.now()), [data]);
  const line = data && now !== null ? solarLine(data.wind, now) : null;
  const summary = !can ? t('detail.solar.locked') : line
    ? summaryText(i18n, line, undefined, line.at !== undefined ? new Date(line.at).toLocaleTimeString(INTL_TAG[i18n.locale], { hour: '2-digit', minute: '2-digit' }) : undefined)
    : t('detail.loading');
  return (
    <DetailCard id="solar" title={<>{headLead(t('solar.h2a'))}<span className="hl">{t('solar.h2b')}</span></>} summary={summary}
      aside={<InfoButton title={headText(t('solar.h2a'), t('solar.h2b'))} content={solarInfo(t)} />}>
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
  // Each tile: the value in its status colour, with the status as a pill (the info sheet explains the scales).
  const stats = [
    { icon: 'field' as const, label: t('info.m.bz'), value: fmt(w?.bz, 1), unit: 'nT', note: w?.bz == null ? t('common.noData') : w.bz <= -10 ? t('home.bz.strongSouth') : w.bz <= -3 ? t('home.bz.south') : w.bz < 3 ? t('home.bz.zero') : t('home.bz.north'), c: w?.bz == null ? C.soft : w.bz <= -3 ? C.green : w.bz >= 3 ? C.red : C.soft },
    { icon: 'wind' as const, label: t('info.m.speed'), value: fmt(w?.speed), unit: 'km/s', note: w?.speed == null ? t('common.noData') : w.speed >= 600 ? t('home.speed.fast') : w.speed >= 450 ? t('home.speed.elevated') : t('home.speed.slow'), c: w?.speed == null ? C.soft : w.speed >= 600 ? C.red : w.speed >= 450 ? C.orange : C.soft },
    { icon: 'bolt' as const, label: t('info.m.hemi'), value: fmt(data.hemi?.north), unit: 'GW', note: data.hemi == null ? t('common.noData') : data.hemi.north >= 50 ? t('home.hemi.high') : data.hemi.north >= 20 ? t('home.hemi.moderate') : t('home.hemi.low'), c: data.hemi == null ? C.soft : data.hemi.north >= 50 ? C.red : data.hemi.north >= 20 ? C.orange : C.soft },
    { icon: 'density' as const, label: t('info.m.density'), value: fmt(w?.density, 1), unit: 'p/cm³', note: w?.density == null ? t('common.noData') : w.density >= 15 ? t('home.density.dense') : t('home.density.typical'), c: w?.density != null && w.density >= 15 ? '#5fb8ff' : C.soft },
  ];

  // Share pictures and posts for Space weather and the Sun now (see components/ShareButton).
  const storm = useStorm();
  const spaceTitle = headText(t('detail.space.h2a'), t('detail.space.h2b'));
  const spaceSum = summaryText(i18n, spaceLine(w));
  const drawSpace = () => dataCardBlob({
    kicker: shareStamp(i18n, w?.t ?? data.fetchedAt), title: t('detail.space.h2a'), title2: t('detail.space.h2b'), line: spaceSum,
    source: 'NOAA SWPC · DSCOVR/ACE', site: SITE.domain,
    body: { kind: 'tiles', tiles: stats.map(s => ({ label: s.label, value: s.value, unit: s.unit, note: s.note, color: s.c })) },
  });
  const sunTitle = headText(t('home.sun.h2a'), t('home.sun.h2b'));
  const flare = storm?.flares?.max ? t('storm.stat.largest', { cls: storm.flares.max.cls }) : storm ? t('storm.stat.noFlares') : '';
  const sunSum = [spots ? tn('detail.sunRegions', spots.regions.length) : '', flare].filter(Boolean).join(' · ') || t('detail.sun', { n: SDO_IMAGES.length });
  const drawSun = async () => {
    // The visible-light disc from our own origin (/api/sunspots/image), so the canvas may use it.
    const image = await fetch('/api/sunspots/image').then(r => (r.ok ? r.blob() : null)).then(b => (b ? createImageBitmap(b) : null)).catch(() => null);
    return dataCardBlob({
      kicker: shareStamp(i18n, data.fetchedAt), title: t('home.sun.h2a'), title2: t('home.sun.h2b'), line: sunSum, source: 'NASA SDO · NOAA SWPC', site: SITE.domain,
      body: { kind: 'image', image, facts: [
        { label: t('info.sun.m.regions'), value: spots ? String(spots.regions.length) : '—' },
        { label: t('storm.stat.solar'), value: storm?.flares?.max?.cls ?? '—', color: C.orange },
        { label: t('storm.stat.ssn'), value: storm?.ssn ? String(storm.ssn.value) : '—' },
      ] },
    });
  };

  return (
    <main data-screen-label="Sun" className="wrap" style={{ padding: 'clamp(12px, 3vw, 40px) var(--gutter) 48px', display: 'flex', flexDirection: 'column', gap: 32 }}>
      {/* The tab bar already says Sun; the heading stays for screen readers. */}
      <h1 className="sr-only">{t('nav.sun')}</h1>

      <DetailCard id="space" title={<>{headLead(t('detail.space.h2a'))}<span className="hl">{t('detail.space.h2b')}</span></>} summary={summaryText(i18n, spaceLine(w))}
        aside={<>
          <ShareButton label={`${t('tonight.share')}: ${spaceTitle}`} name="polar-lights-space-weather.png" draw={drawSpace} text={sharePost(t, spaceTitle, spaceSum)} url={`${SITE.url}/sun`} stamp={`${w?.t}|${data.hemi?.t}|${i18n.locale}`} />
          <InfoButton title={spaceTitle} content={spaceInfo(t)} />
        </>}>
        <div className="space-tiles">
          {stats.map(s => (
            <div key={s.label} className="space-tile">
              <StatIcon name={s.icon} />
              <span className="space-tile-label">{s.label}</span>
              <span className="space-tile-value" style={{ color: s.c }}>{s.value}<small>{s.unit}</small></span>
              <span className="space-tile-pill" style={{ color: s.c, borderColor: s.c }}>{s.note}</span>
            </div>
          ))}
        </div>
      </DetailCard>

      <SolarSection />

      <DetailCard id="sun" title={<>{headLead(t('home.sun.h2a'))}<span className="hl">{t('home.sun.h2b')}</span></>}
        aside={<>
          <ShareButton label={`${t('tonight.share')}: ${sunTitle}`} name="polar-lights-sun-now.png" draw={drawSun} text={sharePost(t, sunTitle, sunSum)} url={`${SITE.url}/sun`} stamp={`${spots?.regions.length}|${storm?.flares?.max?.cls}|${!!storm}|${i18n.locale}`} />
          <InfoButton title={sunTitle} content={sunInfo(t)} />
        </>}
        summary={spots?.regions.length ? `${tn('detail.sunRegions', spots.regions.length)} · ${t('detail.sun', { n: SDO_IMAGES.length })}` : t('detail.sun', { n: SDO_IMAGES.length })}>
        <span style={{ fontSize: 13, color: 'var(--muted)' }}>{t('home.sun.source')}</span>
        <SunspotRegions />
        <SunImages />
        <SunTimelapse />
      </DetailCard>
    </main>
  );
}
