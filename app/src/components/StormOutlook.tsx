'use client';

import { useEffect, useState } from 'react';
import { C } from '../data';
import type { StormData } from '../app/api/storm/route';
import { kpNeeded } from '../lib/astro';
import { classFlux, reachMagLat, solarLevel, stormHeadline, type StormLevel } from '../lib/storm';
import { useLocations } from '../lib/locations';
import { useI18n } from '../i18n/I18n';

let cached: Promise<StormData | null> | null = null;
const load = () => (cached ??= fetch('/api/storm').then(r => (r.ok ? r.json() : null)).catch(() => null));

/** /api/storm, shared by the card summary and its body. */
export function useStorm() {
  const [data, setData] = useState<StormData | null | undefined>(undefined);
  useEffect(() => { load().then(setData); }, []);
  return data;
}

/** The same colours as the Kp bars: Kp 4 orange, storm levels red and beyond. */
export const LEVEL_COLOR: Record<StormLevel, string> = { quiet: C.darkGreen, active: C.orange, minor: C.red, moderate: '#ff4f9a', strong: '#d65cff' };
const ROWS = ['active', 'minor', 'moderate', 'strong'] as const;

/** A day as "Tue 20 Oct" (UT dates). */
export const useDay = () => {
  const { date } = useI18n();
  return (day: string) => date(Date.parse(`${day}T12:00:00Z`), { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
};

/** The collapsed card's line: the storm headline and the Sun's flare activity. */
export function stormSummary(d: StormData | null | undefined, t: ReturnType<typeof useI18n>['t'], day: (d: string) => string) {
  if (d === undefined) return t('detail.loading');
  if (!d || !d.days.length) return t('storm.unavailable');
  const h = stormHeadline(d.days);
  const sun = t(`storm.solar.${solarLevel(d.flares?.max ? classFlux(d.flares.max.cls) : null)}`);
  return `${h.level === 'quiet' ? t('storm.level.quiet') : t('storm.likely', { level: t(`storm.level.${h.level}`), day: day(h.day!), pct: h.prob })} · ${t('storm.sunIs', { level: sun })}`;
}

/**
 * Storm outlook (#40): how likely a geomagnetic storm is over the next three days and what that means
 * for seeing aurora here, Earth-directed CMEs on their way, and the Sun's flare, radiation and
 * sunspot activity. NOAA SWPC and NASA DONKI data via /api/storm; levels in lib/storm.
 */
export function StormOutlook({ peak }: { peak: { kp: number; at: number } | null }) {
  const data = useStorm();
  const { t, num, date } = useI18n();
  const day = useDay();
  const { shownPlace } = useLocations();

  if (data === undefined) return <p className="storm-note">{t('detail.loading')}</p>;
  if (!data) return <p className="storm-note">{t('storm.unavailable')}</p>;

  const h = data.days.length ? stormHeadline(data.days) : null;
  const when = (x: number) => date(x, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'UTC' });
  const need = shownPlace ? kpNeeded(shownPlace.lat, shownPlace.lon) : null;
  const potential = !peak ? null
    : shownPlace && need !== null
      ? need === 0 ? t('storm.potential.any', { place: shownPlace.name.split(',')[0] })
      : t(peak.kp >= need ? 'storm.potential.enough' : 'storm.potential.short', { kp: num(peak.kp, 1), day: date(peak.at, { weekday: 'short', timeZone: 'UTC' }), place: shownPlace.name.split(',')[0], need })
      : t('storm.potential.reach', { kp: num(peak.kp, 1), day: date(peak.at, { weekday: 'short', timeZone: 'UTC' }), lat: reachMagLat(peak.kp) });
  const maxFlux = data.flares?.max ? classFlux(data.flares.max.cls) : null;
  const level = solarLevel(maxFlux);
  const fp = data.flareProb[0];

  const stats = [
    { label: t('storm.stat.solar'), value: t(`storm.solar.${level}`), note: data.flares?.max ? t('storm.stat.largest', { cls: data.flares.max.cls }) : t('storm.stat.noFlares'), c: level === 'high' ? C.red : level === 'moderate' ? C.orange : C.muted },
    { label: t('storm.stat.xray'), value: data.xray?.cls ?? '—', note: data.flares ? t('storm.stat.flares', { c: data.flares.c, m: data.flares.m, x: data.flares.x }) : '', c: C.muted },
    { label: t('storm.stat.protons'), value: data.protons ? `S${data.protons.s}` : '—', note: data.protons ? t('storm.stat.pfu', { pfu: num(data.protons.pfu, data.protons.pfu < 10 ? 2 : 0) }) : '', c: data.protons && data.protons.s ? C.orange : C.muted },
    { label: t('storm.stat.ssn'), value: data.ssn ? String(data.ssn.value) : '—', note: data.ssn ? day(data.ssn.day) : '', c: C.muted },
  ];

  return (
    <div className="storm">
      {h && (
        <div className="storm-head">
          <span className="storm-chip" style={{ color: LEVEL_COLOR[h.level], borderColor: LEVEL_COLOR[h.level] }}>{t(`storm.level.${h.level}`)}</span>
          <span className="storm-head-text">
            <b>{h.level === 'quiet' ? t('storm.quietLine') : t('storm.likelyWhen', { day: day(h.day!), pct: h.prob })}</b>
            {potential && <span>{potential}</span>}
          </span>
        </div>
      )}

      {data.days.length > 0 && (
        <div className="storm-table-wrap">
          <table className="storm-table">
            <caption>{t('storm.probs')}</caption>
            <thead><tr><th scope="col"><span className="sr-only">{t('storm.level')}</span></th>{data.days.map(d => <th key={d.day} scope="col">{day(d.day)}</th>)}</tr></thead>
            <tbody>
              {ROWS.map(r => (
                <tr key={r}>
                  <th scope="row"><i style={{ background: LEVEL_COLOR[r] }} />{t(`storm.level.${r}`)}</th>
                  {data.days.map(d => (
                    <td key={d.day}>
                      <span className="storm-bar"><i style={{ width: `${d[r]}%`, background: LEVEL_COLOR[r] }} /></span>
                      <span className="mono">{d[r]}%</span>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="storm-cme">
        <span className="label">{t('storm.cme.h')}</span>
        {data.cmes === null ? <span className="storm-note">{t('storm.cme.unavailable')}</span>
          : !data.cmes.length ? <span>{t('storm.cme.none')}</span>
          : data.cmes.map(c => (
            <span key={c.arrival} className="storm-cme-row">
              <b>{t(c.glancing ? 'storm.cme.glancing' : 'storm.cme.impact', { time: when(c.arrival) })}</b>
              {c.kpHigh !== null && <span>{c.kpLow === c.kpHigh ? t('storm.cme.kp', { kp: num(c.kpHigh, 0) }) : t('storm.cme.kpRange', { lo: num(c.kpLow!, 0), hi: num(c.kpHigh, 0) })}</span>}
              {c.link && <a href={c.link} target="_blank" rel="noopener noreferrer">{t('storm.cme.model')}</a>}
            </span>
          ))}
        <span className="storm-note">{t('storm.cme.note')}</span>
      </div>

      <div className="now-stats">
        {stats.map(s => (
          <div key={s.label} className="now-stat">
            <span className="label">{s.label}</span>
            <span className="stat-value" style={{ fontSize: 28 }}>{s.value}</span>
            <span style={{ fontSize: 13, fontWeight: 600, color: s.c }}>{s.note}</span>
          </div>
        ))}
      </div>
      {fp && (fp.minor !== null || fp.proton !== null) && (
        <span className="storm-note">{t('storm.flareProb', { day: day(fp.day), minor: fp.minor ?? '—', major: fp.major ?? '—', proton: fp.proton ?? '—' })}</span>
      )}
      <details className="storm-help">
        <summary>{t('storm.help.h')}</summary>
        <p>{t('storm.help.levels', { pct: 25 })}</p>
        <p>{t('storm.help.solar')}</p>
        <p>{t('storm.help.s')}</p>
      </details>
      <span className="storm-note">{t('storm.source')}</span>
    </div>
  );
}
