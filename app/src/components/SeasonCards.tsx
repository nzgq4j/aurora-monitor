'use client';

import { C, kpBarColor, kpColor } from '../data';
import { useEffect } from 'react';
import { kpNeeded, moon } from '../lib/astro';
import type { AccountData } from '../lib/history';
import { useLocations } from '../lib/locations';
import { useI18n } from '../i18n/I18n';
import { headLead, headText } from '../i18n/core';
import { InfoButton } from './InfoSheet';
import { bestInfo, weeksInfo } from '../lib/cardInfo';

const DAY = 864e5;

/**
 * Phones only (the desktop Dashboard's Overview has the full versions): the best nights in NOAA's 27-day
 * outlook and the season so far, as two compact cards before the Now tab's space weather.
 */
export function SeasonCards({ data }: { data: AccountData }) {
  const { t, num, date } = useI18n();
  const { locations, load } = useLocations();
  useEffect(() => { load(); }, [load]);
  const home = locations.find(l => l.isHome) ?? null;
  // Kp 5 (a typical mid-latitude view) when no Home is saved, as on the Dashboard.
  const need = home ? kpNeeded(home.lat, home.lon) : 5;
  const shortDate = (d: number) => date(d, { month: 'short', day: 'numeric', timeZone: 'UTC' });
  const days = data.days;
  const nights = days.filter(d => d.kpMax >= need).length;

  // Twelve 7-day buckets ending today, as on the Dashboard.
  const end = Math.floor(data.fetchedAt / DAY) * DAY + DAY;
  const weeks = [...Array(12)].map((_, i) => {
    const from = end - (12 - i) * 7 * DAY;
    const inWeek = days.filter(d => d.t >= from && d.t < from + 7 * DAY);
    return { from, kp: inWeek.length ? Math.max(...inWeek.map(d => d.kpMax)) : null };
  });
  const top = 9;
  const best = [...data.outlook].sort((a, b) => b.kp - a.kp || a.t - b.t).slice(0, 5).sort((a, b) => a.t - b.t);
  const level = (kp: number) => (kp >= 7 ? 'strong' : kp >= 6 ? 'moderate' : kp >= 5 ? 'minor' : kp >= 4 ? 'active' : kp >= 3 ? 'unsettled' : 'quiet');

  return (
    <div className="season-cards">
      <section className="season-card season-card-list" aria-labelledby="best-card-h">
        <div className="season-card-head">
          <h2 id="best-card-h">{headLead(t('dash.best.h2a'))}{t('dash.best.h2b')}</h2>
          <span className="season-card-aside"><span className="mono">{t('now.best.source')}</span><InfoButton title={headText(t('dash.best.h2a'), t('dash.best.h2b'))} content={bestInfo(t)} /></span>
        </div>
        {best.length ? best.map(u => {
          const lit = Math.round(moon(u.t + DAY, 0, 0).illumination * 100);
          return (
            <div key={u.t} className="best-row">
              <span className="best-date">
                <small className="mono">{date(u.t, { weekday: 'short', timeZone: 'UTC' })}</small>
                <b>{date(u.t, { day: 'numeric', timeZone: 'UTC' })}</b>
              </span>
              <span className="best-text">
                <b>{t(`night.label.${level(u.kp)}`)}{u.kp >= need ? ` · ${t('now.best.reach')}` : ''}</b>
                <small>{date(u.t, { month: 'short', timeZone: 'UTC' })} · {t('dash.best.moon', { pct: lit })}</small>
              </span>
              <span className="best-kp" style={{ color: kpBarColor(u.kp) === C.darkGreen ? C.green : kpBarColor(u.kp) }}>Kp {u.kp}</span>
            </div>
          );
        }) : <span className="season-note" style={{ padding: '0 16px 16px' }}>{t('dash.best.unavailable')}</span>}
      </section>

      <section className="season-card" aria-labelledby="season-card-h">
        <div className="season-card-head">
          <h2 id="season-card-h">{headLead(t('dash.season.h2a'))}{t('dash.season.h2b')}</h2>
          <span className="season-card-aside"><span className="mono">{t('now.season.weeks')}</span><InfoButton title={headText(t('dash.season.h2a'), t('dash.season.h2b'))} content={weeksInfo(t)} /></span>
        </div>
        {days.length > 0 ? (
          <>
            <p className="season-count">
              <b>{nights}</b>
              <span>{home ? t('now.season.nightsAt', { days: days.length, need, place: home.name.split(',')[0] }) : t('now.season.nights', { days: days.length, need })}</span>
            </p>
            <div className="season-bars" role="img" aria-label={t('dash.season.aria')}>
              <span className="season-need" style={{ bottom: `${Math.min(100, (need / top) * 100)}%` }} aria-hidden="true" />
              {weeks.map(w => (
                <span key={w.from} className="season-bar" title={w.kp === null ? undefined : t('dash.season.week', { date: shortDate(w.from), kp: num(w.kp, 2) })}
                  style={{ height: w.kp === null ? 0 : `${Math.max(2, (w.kp / top) * 100)}%`, background: w.kp === null ? 'transparent' : kpColor(w.kp) }} />
              ))}
            </div>
            <div className="season-axis mono"><span>{shortDate(weeks[0].from)}</span><span>{t('now.season.thisWeek')}</span></div>
            <span className="season-note">
              <span className="season-key" aria-hidden="true" />
              {home ? t('dash.season.visibleFrom', { place: home.name.split(',')[0], need }) : t('dash.season.typical', { need })}
            </span>
          </>
        ) : (
          <span className="season-note">{t('dash.historyUnavailable')}</span>
        )}
      </section>
    </div>
  );
}
