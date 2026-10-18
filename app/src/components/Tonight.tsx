'use client';

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { C } from '../data';
import type { KpPoint } from '../lib/feeds';
import { useLocations } from '../lib/locations';
import { shareCardBlob } from '../lib/shareCard';
import { SITE } from '../lib/site';
import type { HourScore, Level } from '../lib/tonight';
import { usePointVerdict } from '../lib/usePointVerdict';
import { INTL_TAG } from '../i18n/config';
import { useI18n } from '../i18n/I18n';
import { USEFUL_EVENT } from './InstallPrompt';
import { MoonIcon, useNightMode } from './NightMode';

export const LEVEL_COLOR: Record<Level, string> = { goNow: C.green, goLater: C.green, maybe: C.amber, no: C.muted };
export const scoreColor = (s: number) => (s >= 50 ? C.green : s >= 20 ? C.amber : '#3a403c');

/** Open the location picker in "Your sky" further down the page. */
const toYourSky = () => document.getElementById('your-sky')?.scrollIntoView({ behavior: 'smooth', block: 'start' });

/** A small night-sky scene: aurora glow at the height it should reach, clouds as thick as forecast. */
function SkyScene({ look, strength, cloud, light }: { look: 'low' | 'high' | 'overhead'; strength: number; cloud: number; light: boolean }) {
  const top = look === 'overhead' ? 6 : look === 'high' ? 22 : 40;
  const a = Math.max(0.12, Math.min(1, strength / 80));
  return (
    <svg viewBox="0 0 120 80" className="tonight-scene" aria-hidden="true">
      <defs>
        <linearGradient id="tn-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={light ? '#24324a' : '#05070d'} /><stop offset="1" stopColor={light ? '#46597a' : '#0d1626'} />
        </linearGradient>
        <linearGradient id="tn-glow" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0" stopColor="#6CFF2B" stopOpacity={0.9 * a} /><stop offset=".6" stopColor="#6CFF2B" stopOpacity={0.35 * a} /><stop offset="1" stopColor="#6CFF2B" stopOpacity="0" />
        </linearGradient>
      </defs>
      <rect width="120" height="80" fill="url(#tn-sky)" />
      {!light && [[14, 10], [38, 18], [70, 8], [96, 16], [108, 32], [24, 34], [58, 26]].map(([x, y]) => <circle key={x} cx={x} cy={y} r=".9" fill="#fff" opacity=".7" />)}
      <path d={`M0 66 C 25 ${top + 8}, 50 ${top}, 70 ${top + 4} S 110 ${top + 12}, 120 ${top + 6} L120 66 Z`} fill="url(#tn-glow)" />
      <g fill="#c9d0cb" opacity={Math.min(0.9, cloud / 100)}>
        <ellipse cx="30" cy="30" rx="22" ry="7" /><ellipse cx="82" cy="22" rx="26" ry="8" /><ellipse cx="60" cy="44" rx="30" ry="7" />
      </g>
      <path d="M0 66 L18 60 L32 64 L48 56 L64 63 L82 58 L100 64 L120 60 L120 80 L0 80 Z" fill="#020303" />
    </svg>
  );
}

/**
 * The answer first: should you go out, when, and where to look, for your location, with
 * the next 12 hours as a strip of bars. Scores come from lib/tonight.
 */
export function Tonight({ kp, series }: { kp: number | null; series: KpPoint[] }) {
  const { t, num, locale } = useI18n();
  const { shownPlace } = useLocations();
  const { cond, loading, now, result } = usePointVerdict(shownPlace, kp, series);
  const night = useNightMode();
  const [picked, setPicked] = useState(0);

  // A promising verdict is a good moment to suggest adding the app to the home screen (InstallPrompt).
  const useful = !!result && result.v.level !== 'no';
  useEffect(() => { if (useful) window.dispatchEvent(new Event(USEFUL_EVENT)); }, [useful]);

  const time = (x: number) => new Date(x).toLocaleTimeString(INTL_TAG[locale], { hour: '2-digit', minute: '2-digit' });
  const hourLabel = (x: number) => new Date(x).toLocaleTimeString(INTL_TAG[locale], { hour: '2-digit', hourCycle: 'h23' }).replace(/\D+$/, '');

  // The share text, and the share image drawn ahead of time: Safari only opens the share sheet straight
  // from a tap, so nothing slow can happen between the tap and navigator.share.
  const shareText = result && shownPlace
    ? [t('tonight.shareText', { place: shownPlace.name.split(',')[0], verdict: t(`tonight.level.${result.v.level}`), score: result.v.score }),
      result.v.window ? t('tonight.shareWindow', { from: time(result.v.window.from), to: time(result.v.window.to) }) : ''].filter(Boolean).join(' ')
    : '';
  const shareFile = useRef<File | null>(null);
  const [shareMsg, setShareMsg] = useState('');
  useEffect(() => {
    shareFile.current = null;
    if (!result || !shownPlace || typeof navigator === 'undefined' || !navigator.canShare) return;
    let live = true;
    const { v, hours } = result;
    shareCardBlob({
      place: shownPlace.name.split(',')[0], kicker: t('tonight.h'), verdict: t(`tonight.level.${v.level}`), verdictColor: LEVEL_COLOR[v.level],
      score: v.score, scoreLabel: t('tonight.score'),
      line: v.window ? t('tonight.best', { from: time(v.window.from), to: time(v.window.to) }) : t('tonight.noWindow'),
      barsLabel: t('tonight.next12'), bars: hours.map(h => ({ label: hourLabel(h.t), score: h.score, color: scoreColor(h.score) })), site: SITE.domain,
    }).then(blob => {
      if (!live || !blob) return;
      const file = new File([blob], 'polar-lights-tonight.png', { type: 'image/png' });
      if (navigator.canShare({ files: [file] })) shareFile.current = file;
    });
    return () => { live = false; };
  }, [result, shownPlace, locale]); // eslint-disable-line react-hooks/exhaustive-deps -- t/time follow locale

  const share = async () => {
    const url = SITE.url;
    setShareMsg('');
    try {
      if (navigator.share) {
        const file = shareFile.current;
        await navigator.share(file ? { files: [file], title: SITE.name, text: `${shareText} ${url}` } : { title: SITE.name, text: shareText, url });
      } else {
        await navigator.clipboard.writeText(`${shareText} ${url}`);
        setShareMsg(t('tonight.copied'));
      }
    } catch (e) {
      if ((e as Error).name !== 'AbortError') setShareMsg(t('tonight.shareFailed'));
    }
  };

  const card: CSSProperties = { border: '1px solid var(--line-2)', borderRadius: 18, padding: 18, background: 'radial-gradient(120% 120% at 100% 0%, #0f1a12, #050605 60%)' };

  if (!shownPlace) {
    return (
      <section className="tonight" aria-label={t('tonight.h')} style={card}>
        <span className="eyebrow">{t('tonight.h')}</span>
        <span style={{ fontSize: 17, color: 'var(--soft)' }}>{t('tonight.noPlace')}</span>
        <button type="button" className="btn pill pill-primary" onClick={toYourSky} style={{ alignSelf: 'flex-start', fontSize: 15, padding: '12px 20px' }}>{t('tonight.setPlace')}</button>
      </section>
    );
  }

  const south = shownPlace.lat < 0;
  const v = result?.v;
  const h0 = result?.hours[0];
  const sel: HourScore | undefined = result?.hours[picked];
  const lightUntil = cond?.sun.dark === false ? cond.sun.changesAt : null;
  const limitText = !v || !v.limit || !cond ? null
    : v.limit === 'aurora' ? t('tonight.limit.aurora', { need: cond.kpNeeded, kp: num(v.subject.kp ?? 0, 1) })
    : v.limit === 'dark' ? (lightUntil ? t('tonight.limit.dark', { time: time(lightUntil) }) : t('tonight.limit.darkNone'))
    : v.limit === 'cloud' ? t('tonight.limit.cloud', { pct: v.subject.cloud ?? '—' })
    : t('tonight.limit.moon', { pct: Math.round((result?.m.illumination ?? 0) * 100) });
  const skyWord = (h: HourScore) => t(h.sunAlt <= -12 ? 'tonight.sky.dark' : h.sunAlt < -4 ? 'tonight.sky.twilight' : 'tonight.sky.day');

  return (
    <section className="tonight" aria-label={t('tonight.h')} style={card}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
        <button type="button" className="btn tonight-place" onClick={toYourSky} aria-label={t('tonight.changePlace', { place: shownPlace.name })}>
          <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11Zm0-8.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z" fill="none" stroke="currentColor" strokeWidth="2" /></svg>
          <span>{shownPlace.name.split(',')[0]}</span>
          <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path d="m6 9 6 6 6-6" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </button>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {now !== null && <span className="label" style={{ fontSize: 11 }}>{t('tonight.updated', { time: time(now) })}</span>}
          <button type="button" className="btn tonight-share" onClick={night.toggle} aria-pressed={night.active} aria-label={t('night.toggle')} title={t('night.toggle')}>
            <MoonIcon on={night.active} />
          </button>
          {result && (
            <button type="button" className="btn tonight-share" onClick={share} aria-label={t('tonight.share')}>
              <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M12 15V3m0 0L7.5 7.5M12 3l4.5 4.5M5 11v8a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-8" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </button>
          )}
        </span>
      </div>

      {!v || !h0 ? (
        <span style={{ color: 'var(--muted)', minHeight: 120 }}>{loading || !cond ? t('sky.checking') : t('common.noData')}</span>
      ) : (
        <div className="tonight-body">
          <div className="tonight-main">
          <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0, flex: 1 }}>
              <span className="eyebrow">{t('tonight.h')}</span>
              <h2 className={'display tonight-word' + (v.level === 'goNow' ? ' tonight-glow' : '')} style={{ color: LEVEL_COLOR[v.level] }}>
                {t(`tonight.level.${v.level}`)}
              </h2>
              <span style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                <span className="stat-value tonight-score">{v.score}</span>
                <span style={{ fontSize: 13, color: 'var(--muted)' }}>/100 {t('tonight.score')}</span>
              </span>
            </div>
            <SkyScene look={v.look} strength={v.best.score} cloud={h0.cloud ?? 50} light={h0.sunAlt > -6} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 15 }}>
            <span style={{ fontWeight: 700 }}>
              {v.window ? t('tonight.best', { from: time(v.window.from), to: time(v.window.to) }) : t('tonight.noWindow')}
              {v.window && <span style={{ fontWeight: 500, color: 'var(--soft)' }}>{' · '}{t(v.look === 'overhead' ? 'tonight.look.overhead' : `tonight.look.${v.look}.${south ? 'south' : 'north'}`)}</span>}
            </span>
            {limitText && <span style={{ color: 'var(--muted)', fontSize: 14 }}>{limitText}</span>}
          </div>
          <div className="tonight-badges">
            {kp !== null && <span>{t('tonight.badge.kp', { kp: num(kp, 1) })}</span>}
            {h0.cloud !== null && <span>{t('tonight.badge.cloud', { pct: h0.cloud })}</span>}
            <span>{cond?.sun.dark ? t('tonight.badge.dark') : lightUntil ? t('tonight.badge.light', { time: time(lightUntil) }) : t('tonight.badge.lightNone')}</span>
            <span>{result.m.up ? t('tonight.badge.moonUp', { pct: Math.round(result.m.illumination * 100) }) : t('tonight.badge.moonDown')}</span>
          </div>
          </div>

          <div className="tonight-timeline">
            <span className="label">{t('tonight.next12')}</span>
            <div className="tonight-bars" role="group" aria-label={t('tonight.aria.bars')}>
              {result.hours.map((h, i) => (
                <button key={h.t} type="button" className="btn" aria-pressed={picked === i} onClick={() => setPicked(i)}
                  aria-label={t('tonight.hour', { time: time(h.t), score: h.score, kp: h.kp === null ? '—' : num(h.kp, 1), cloud: h.cloud ?? '—', sky: skyWord(h) })}>
                  <span className="tonight-bar"><i style={{ height: `${Math.max(6, h.score)}%`, background: scoreColor(h.score) }} /></span>
                  <span className="mono">{hourLabel(h.t)}</span>
                </button>
              ))}
            </div>
            {sel && (
              <span style={{ fontSize: 13, color: 'var(--soft)' }} aria-live="polite">
                {t('tonight.hour', { time: time(sel.t), score: sel.score, kp: sel.kp === null ? '—' : num(sel.kp, 1), cloud: sel.cloud ?? '—', sky: skyWord(sel) })}
              </span>
            )}
            <span style={{ fontSize: 11, color: 'var(--dim)' }}>{t('tonight.note')}</span>
            {shareMsg && <span role="status" style={{ fontSize: 13, color: 'var(--green)' }}>{shareMsg}</span>}
          </div>
        </div>
      )}
    </section>
  );
}
