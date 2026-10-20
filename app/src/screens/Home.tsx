'use client';

import { useEffect, useRef, useState } from 'react';
import { C, ENTITLEMENTS, kpBarColor } from '../data';
import { KpBarChart, POLAR_MIN_LAT, PolarOval, type KpBar } from '../components/Charts';
import { Locked } from '../components/Locked';
import { SolarActivity, useSolarData } from '../components/SolarActivity';
import { DetailCard } from '../components/DetailCard';
import { StormOutlook, stormSummary, useDay, useStorm } from '../components/StormOutlook';
import { SunspotRegions, useSunspots } from '../components/SunspotRegions';
import { outlookLine, solarLine, spaceLine, type Line } from '../lib/detailSummaries';
import type { KpPoint } from '../lib/feeds';
import { YourSky } from '../components/YourSky';
import { Tonight } from '../components/Tonight';
import { G_SCALE } from '../lib/astro';
import { SDO_IMAGES } from '../lib/sdo';
import { SunTimelapse } from '../components/SunTimelapse';
import { useLocations } from '../lib/locations';
import { useConditions } from '../lib/useConditions';
import { INTL_TAG } from '../i18n/config';
import type { NowData } from '../lib/now';
import type { AccountData } from '../lib/history';
import { SeasonCards } from '../components/SeasonCards';
import { nowCardBlob } from '../lib/shareCard';
import { SITE } from '../lib/site';
import { useStore } from '../store';
import { useI18n, type I18n } from '../i18n/I18n';

const hhmm = (t: number) => new Date(t).toISOString().slice(11, 16);

function headline(kp: number | null, { t }: I18n): [string, string] {
  if (kp === null) return ['Kp', t('home.h.unavailable')];
  const g = G_SCALE(kp);
  if (g > 0) return [t('home.h.storm', { g }), t('home.h.inProgress')];
  if (kp >= 4) return [t('home.h.active'), t('home.h.watch')];
  if (kp >= 3) return [t('home.h.unsettled'), t('home.h.farNorth')];
  return [t('home.h.quiet'), t('home.h.low')];
}

function summary(d: NowData, { t, num }: I18n, clock: (t: number) => string): string {
  const parts: string[] = [];
  if (d.kp) {
    const g = G_SCALE(d.kp.kp);
    parts.push(t(g ? 'home.sum.kpStorm' : 'home.sum.kp', { kp: num(d.kp.kp, 2), g, time: clock(d.kp.t) }));
  }
  const w = d.wind;
  if (w && (w.speed !== null || w.bz !== null)) {
    const speed = w.speed !== null ? num(w.speed) : null, bz = w.bz !== null ? num(w.bz, 1) : null;
    parts.push(speed !== null && bz !== null ? t('home.sum.windBoth', { speed, bz }) : speed !== null ? t('home.sum.windSpeed', { speed }) : t('home.sum.windBz', { bz: bz! }));
    if (w.bz !== null) parts.push(t(w.bz <= -5 ? 'home.sum.bzSouth' : w.bz < 0 ? 'home.sum.bzSlightSouth' : 'home.sum.bzNorth'));
  }
  if (d.hemi) parts.push(t('home.sum.hemi', { gw: num(d.hemi.north) }));
  return parts.join(' ') || t('home.sum.unavailable');
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

function Outlook({ data }: { data: NowData }) {
  const { planIndex } = useStore();
  const i18n = useI18n();
  const { t, date } = i18n;
  const [picked, setPicked] = useState<OutlookView | null>(null);
  const can = { hour: planIndex >= ENTITLEMENTS.kp3h, day: true, month: planIndex >= ENTITLEMENTS.outlook27 };
  const view = picked ?? (can.hour ? 'hour' : 'day');
  const daily = dailyPeaks(data.series);
  const chart = {
    hour: <KpBarChart unit="hour" minBar={28} now={data.fetchedAt} bars={data.series.map(p => ({ t: p.t, kp: p.kp, past: p.kind !== 'predicted' }))} label={t('outlook.aria.hour')} />,
    day: <KpBarChart unit="day" now={data.fetchedAt} bars={daily} label={t('outlook.aria.day')} />,
    month: <KpBarChart unit="day" minBar={46} now={data.fetchedAt} bars={data.outlook.map(d => ({ t: d.t, kp: d.kp, past: false }))} label={t('outlook.aria.month')} />,
  };
  const tab = (v: OutlookView, label: string) => (
    <button type="button" className="btn" aria-pressed={view === v} onClick={() => setPicked(v)}
      style={{ flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 5, padding: '9px 10px', borderRadius: 999, fontWeight: 700, fontSize: 14, background: view === v ? '#3a3f3c' : 'transparent', color: view === v ? '#fff' : C.soft, whiteSpace: 'nowrap' }}>
      {!can[v] && <svg viewBox="0 0 24 24" width="12" height="12" aria-label={t('common.locked')}><path d="M7 11V8a5 5 0 0 1 10 0v3M5.5 11h13v9.5h-13z" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinejoin="round" /></svg>}
      {label}
    </button>
  );
  const line = outlookLine(data.series, data.fetchedAt);
  return (
    <DetailCard id="outlook" title={<>{t('outlook.h2a')} <span className="hl">{t('outlook.h2b')}</span></>}
      summary={summaryText(i18n, line, line.at !== undefined ? date(line.at, { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }) : undefined)}>
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <div role="group" aria-label={t('outlook.detail')} style={{ display: 'flex', padding: 4, border: '1px solid var(--line-2)', borderRadius: 999, background: '#111', flex: '1 1 300px', maxWidth: 420 }}>
          {tab('hour', t('outlook.tab.hour'))}{tab('day', t('outlook.tab.day'))}{tab('month', t('outlook.tab.month'))}
        </div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', fontSize: 13, color: 'var(--muted)' }}>
        <span>{t(`outlook.note.${view}`)}</span>
        <span style={{ display: 'inline-flex', gap: 12 }}>
          {([[2, t('outlook.legend.below3')], [3, '3'], [4, '4'], [5, t('outlook.legend.5up')]] as const).map(([k, l]) => (
            <span key={k} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><i style={{ width: 10, height: 10, borderRadius: 2, background: kpBarColor(k) }} />{l}</span>
          ))}
        </span>
      </div>
      {can[view] ? chart[view] : (
        <Locked tier={view === 'hour' ? ENTITLEMENTS.kp3h : ENTITLEMENTS.outlook27} preview={chart.day}
          title={view === 'hour' ? t('feat.kp3h') : t('feat.outlook27')}
          body={view === 'hour' ? t('outlook.locked.hour') : t('outlook.locked.month')} />
      )}
    </DetailCard>
  );
}

/** Storm outlook (#40), after the Kp outlook; the highest forecast Kp from now on feeds its aurora potential. */
function StormSection({ data }: { data: NowData }) {
  const { t } = useI18n();
  const storm = useStorm();
  const day = useDay();
  const ahead = data.series.filter(p => p.kind === 'predicted' && p.t + 3 * 36e5 > data.fetchedAt);
  const top = ahead.length ? ahead.reduce((a, b) => (b.kp > a.kp ? b : a)) : null;
  const peak = top && { kp: top.kp, at: top.t };
  return (
    <DetailCard id="storm" title={<>{t('storm.h2a')} <span className="hl">{t('storm.h2b')}</span></>} summary={stormSummary(storm, t, day)}>
      <StormOutlook peak={peak} />
    </DetailCard>
  );
}

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

/** A card summary's message (`detail.{key}`), numbers in the page's format, with an optional formatted day. */
function summaryText({ t, num }: Pick<I18n, 't' | 'num'>, line: Line, day?: string) {
  const vars = Object.fromEntries(Object.entries(line.vars ?? {}).map(([k, v]) => [k, typeof v === 'number' ? num(v, Number.isInteger(v) ? 0 : 1) : v]));
  return t(`detail.${line.key}`, { ...vars, ...(day ? { day } : {}) });
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

export function Home({ data, season }: { data: NowData; season?: AccountData }) {
  const spots = useSunspots();
  const { planIndex, go } = useStore();
  const { shownPlace } = useLocations();
  const i18n = useI18n();
  const { t, tn, num } = i18n;
  const fmt = (n: number | null | undefined, d = 0) => (n === null || n === undefined ? '—' : num(n, d));
  const kp = data.kp?.kp ?? null;
  const [l1, l2] = headline(kp, i18n);
  const level = kp === null ? 0 : Math.round(kp);
  const updated = Math.max(data.kp?.t ?? 0, data.wind?.t ?? 0, data.hemi?.t ?? 0);
  const w = data.wind;
  const stats = [
    { label: t('home.stat.bz'), value: fmt(w?.bz, 1), unit: 'nT', note: w?.bz == null ? t('common.noData') : w.bz <= -10 ? t('home.bz.strongSouth') : w.bz <= -3 ? t('home.bz.south') : w.bz < 3 ? t('home.bz.zero') : t('home.bz.north'), c: w?.bz != null && w.bz <= -3 ? C.green : C.soft },
    { label: t('home.stat.speed'), value: fmt(w?.speed), unit: 'km/s', note: w?.speed == null ? t('common.noData') : w.speed >= 600 ? t('home.speed.fast') : w.speed >= 450 ? t('home.speed.elevated') : t('home.speed.slow'), c: w?.speed != null && w.speed >= 450 ? C.amber : C.soft },
    { label: t('home.stat.hemi'), value: fmt(data.hemi?.north), unit: 'GW', note: data.hemi == null ? t('common.noData') : data.hemi.north >= 50 ? t('home.hemi.high') : data.hemi.north >= 20 ? t('home.hemi.moderate') : t('home.hemi.low'), c: data.hemi && data.hemi.north >= 50 ? C.red : C.soft },
    { label: t('home.stat.density'), value: fmt(w?.density, 1), unit: 'p/cm³', note: w?.density == null ? t('common.noData') : w.density >= 15 ? t('home.density.dense') : t('home.density.typical'), c: C.soft },
  ];
  const scale = [1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => ({ n: n === 5 ? 'G1' : n === 9 ? 'G5' : String(n), bg: n >= 5 ? C.red : n === 4 ? C.amber : C.darkGreen, on: n <= level }));
  // Times on the Now card in local time at the shown place (its zone comes with the cloud forecast), else this
  // device's. The server render can't know either, so it shows UT until the page is running in the browser.
  const { data: placeCond } = useConditions(shownPlace?.lat, shownPlace?.lon);
  const placeTz = placeCond?.cloud?.timeZone ?? undefined;
  const [inBrowser, setInBrowser] = useState(false);
  useEffect(() => setInBrowser(true), []);
  const clock = (x: number) => (!inBrowser ? `${hhmm(x)} UT`
    : new Date(x).toLocaleTimeString(INTL_TAG[i18n.locale], { hour: '2-digit', minute: '2-digit', ...(placeTz ? { timeZone: placeTz } : {}) }));
  const kicker = updated ? t('home.live', { time: clock(updated) }) : t('home.liveUnavailable');

  // Share the Now card: text, and an image with the current oval as its background, drawn ahead of time
  // because Safari only opens the share sheet straight from a tap (as the verdict card does).
  const nowCard = useRef<HTMLElement>(null);
  const nowFile = useRef<File | null>(null);
  const [nowMsg, setNowMsg] = useState('');
  const shareText = t('home.shareText', { l1, l2, kp: kp === null ? '—' : num(kp, 1) });
  useEffect(() => {
    nowFile.current = null;
    if (typeof navigator === 'undefined' || !navigator.canShare) return;
    let live = true;
    const oval = nowCard.current?.querySelector<SVGSVGElement>('svg[viewBox="0 0 480 480"]') ?? null;
    nowCardBlob({
      kicker, l1, l2, line: kp === null ? '' : t('home.shareLine', { kp: num(kp, 1) }),
      scale: scale.map(s => ({ label: s.n, color: s.bg, on: s.on })),
      ovalLabel: data.oval?.forecast ? `${t('home.oval')} · ${t('home.ovalForecast', { time: clock(data.oval.forecast) })}` : t('home.oval'),
      site: SITE.domain,
      edgeLat: data.oval?.edge.length ? Math.min(...data.oval.edge.flat().map(([, lat]) => lat)) : null,
    }, oval).then(blob => {
      if (!live || !blob) return;
      const file = new File([blob], 'polar-lights-now.png', { type: 'image/png' });
      if (navigator.canShare({ files: [file] })) nowFile.current = file;
    });
    return () => { live = false; };
  }, [data, i18n.locale, placeTz, inBrowser]); // eslint-disable-line react-hooks/exhaustive-deps -- the rest follows the data, language and zone
  const shareNow = async () => {
    setNowMsg('');
    try {
      if (navigator.share) {
        const file = nowFile.current;
        await navigator.share(file ? { files: [file], title: SITE.name, text: `${shareText} ${SITE.url}` } : { title: SITE.name, text: shareText, url: SITE.url });
      } else {
        await navigator.clipboard.writeText(`${shareText} ${SITE.url}`);
        setNowMsg(t('tonight.copied'));
      }
    } catch (e) {
      if ((e as Error).name !== 'AbortError') setNowMsg(t('tonight.shareFailed'));
    }
  };

  return (
    <main data-screen-label="Now" className="wrap" style={{ padding: '40px var(--gutter) 48px', display: 'flex', flexDirection: 'column', gap: 36 }}>
      {/* Now: the global picture (Kp, headline, oval), as a card above the verdict for your location. */}
      <section className="now-card" aria-label={t('nav.now')} ref={nowCard}>
        <div className="hero-copy">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
            <div className="kicker" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: updated ? 'var(--green)' : C.muted }} />
              {kicker}
            </div>
            <button type="button" className="btn tonight-share" onClick={shareNow} aria-label={t('home.share')} title={t('home.share')}>
              <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M12 15V3m0 0L7.5 7.5M12 3l4.5 4.5M5 11v8a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-8" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </button>
          </div>
          {nowMsg && <span role="status" style={{ fontSize: 13, color: 'var(--green)' }}>{nowMsg}</span>}
          <h1 className="display" style={{ fontSize: 'clamp(36px, 12cqi, 80px)', lineHeight: .88 }}>
            <span className="hero-line">{l1}</span><br /><span className="hl hero-line">{l2}</span>
          </h1>
          <p style={{ margin: 0, maxWidth: 540, fontSize: 18, lineHeight: 1.45, color: 'var(--soft)', textWrap: 'pretty' }}>{summary(data, i18n, clock)}</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(9,1fr)', gap: 4, maxWidth: 520 }} aria-label={t('home.scale', { level: kp === null ? '—' : num(kp, 2) })}>
            {scale.map(s => (
              <div key={s.n} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ height: 14, borderRadius: 2, background: s.bg, opacity: s.on ? 1 : .22 }} />
                <span className="mono" style={{ fontSize: 11, color: 'var(--muted)' }}>{s.n}</span>
              </div>
            ))}
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 520, width: '100%', justifySelf: 'center' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
            <span style={{ fontFamily: 'var(--f-display)', fontWeight: 800, fontSize: 14, color: 'var(--green)', letterSpacing: '.04em' }}>{t('home.oval')}</span>
            <span className="label">{data.oval?.forecast ? t('home.ovalForecast', { time: clock(data.oval.forecast) }) : '—'}</span>
          </div>
          <PolarOval points={data.oval?.points ?? []} edge={data.oval?.edge ?? []} marker={shownPlace} />
          <span style={{ fontSize: 12, color: 'var(--muted)' }}>
            <span style={{ display: 'inline-block', width: 16, borderTop: `1.5px dashed ${C.red}`, verticalAlign: 'middle', marginRight: 6 }} />
            {t('home.ovalEdge')}
          </span>
          <button type="button" className="btn" onClick={() => go('map')} style={{ alignSelf: 'flex-start', fontSize: 14, fontWeight: 700, color: 'var(--green)' }}>{t('home.openMap')}</button>
          {shownPlace && shownPlace.lat < POLAR_MIN_LAT && (
            <span style={{ fontSize: 12, color: 'var(--muted)' }}>
              {shownPlace.lat < 0 ? t('home.southern', { place: shownPlace.name }) : t('home.southOfMap', { place: shownPlace.name, lat: Math.round(POLAR_MIN_LAT) })}
            </span>
          )}
        </div>
      </section>

      {/* The answer for your location (see components/Tonight). */}
      <Tonight kp={kp} series={data.series} />

      <YourSky kp={kp} />

      <Outlook data={data} />

      <StormSection data={data} />

      {season && <SeasonCards data={season} />}

      <DetailCard id="space" title={<>{t('detail.space.h2a')} <span className="hl">{t('detail.space.h2b')}</span></>} summary={summaryText(i18n, spaceLine(w))}>
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
      </DetailCard>

      <SolarSection />

      <DetailCard id="sun" title={<>{t('home.sun.h2a')} <span className="hl">{t('home.sun.h2b')}</span></>}
        summary={spots?.regions.length ? `${tn('detail.sunRegions', spots.regions.length)} · ${t('detail.sun', { n: SDO_IMAGES.length })}` : t('detail.sun', { n: SDO_IMAGES.length })}>
        <span style={{ fontSize: 13, color: 'var(--muted)' }}>{t('home.sun.source')}</span>
        <SunspotRegions />
        {/* The visible-light (HMI) view is the labelled disc above. */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(220px,100%),1fr))', gap: 16 }}>
          {SDO_IMAGES.filter(img => img.id !== 'HMIIC').map(img => (
            <figure key={img.id} style={{ margin: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={img.url} alt={t('home.sun.alt', { band: img.label })} loading="lazy" width={512} height={512}
                style={{ width: '100%', height: 'auto', aspectRatio: '1', borderRadius: 12, background: '#050605', border: '1px solid var(--line)' }} />
              <figcaption style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 13 }}>
                <span style={{ fontWeight: 700 }}>{img.label}</span><span style={{ color: 'var(--muted)' }}>{t(`sdo.${img.id}`)}</span>
              </figcaption>
            </figure>
          ))}
        </div>
        <SunTimelapse />
      </DetailCard>

      {planIndex === 0 && (
        <div className="cta-banner" style={{ border: '1px solid var(--line-2)', borderRadius: 16, background: 'radial-gradient(120% 140% at 100% 100%,rgba(89,255,58,.18),rgba(0,0,0,0) 60%)' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <span className="display" style={{ fontSize: 'var(--h-section)', lineHeight: 1 }}>{t('home.cta.h2a')} <span className="hl">{t('home.cta.h2b')}</span></span>
            <span style={{ fontSize: 16, color: 'var(--soft)' }}>{t('home.cta.body')}</span>
          </div>
          <button type="button" className="btn pill pill-primary" onClick={() => go('plans')} style={{ fontSize: 15, padding: '14px 22px', whiteSpace: 'nowrap' }}>{t('common.seeMemberships')}</button>
        </div>
      )}
    </main>
  );
}
