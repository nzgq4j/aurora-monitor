'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { BottomSheet } from './BottomSheet';
import { supabase } from '../lib/supabase';
import { SDO_IMAGES } from '../lib/sdo';
import { useI18n } from '../i18n/I18n';

type Channel = (typeof SDO_IMAGES)[number]['id'];
interface Frame { t: number; url: string }

/** Time spans to play. */
const RANGES = [
  { id: 'day', hours: 24 },
  { id: 'week', hours: 7 * 24 },
  { id: 'rotation', hours: 27 * 24 },
] as const;
/** Most frames one view loads (about 6 MB); beyond it, frames are picked evenly across the span. */
const MAX_FRAMES = 120;
type Range = (typeof RANGES)[number]['id'];

/** Frames per second while playing. */
const FPS = 8;

/** The saved frames for a channel over the last `hours`, oldest first: every one, or MAX_FRAMES spread evenly. */
async function loadFrames(channel: Channel, hours: number): Promise<Frame[] | null> {
  const db = supabase();
  if (!db) return null;
  const since = new Date(Date.now() - hours * 36e5).toISOString();
  const { data, error } = await db.from('sun_frames').select('taken_at, path').eq('channel', channel).gte('taken_at', since).order('taken_at').limit(1000);
  if (error || !data) return null;
  // The first and latest frames always stay in.
  const rows = data.length <= MAX_FRAMES ? data
    : Array.from({ length: MAX_FRAMES }, (_, i) => data[Math.round((i * (data.length - 1)) / (MAX_FRAMES - 1))]);
  return rows.map(r => ({ t: Date.parse(r.taken_at), url: db.storage.from('sun-frames').getPublicUrl(r.path).data.publicUrl }));
}

/**
 * Time-lapse of the Sun from the images the capture-sun edge function saves every hour: pick the
 * view (any of the live views in lib/sdo.ts) and the span (a day, a week, or a full rotation of about 27 days).
 * Frames are loaded before playing so playback is smooth.
 */
export function SunTimelapse() {
  const { t, tn, date } = useI18n();
  const [channel, setChannel] = useState<Channel>('HMIIC');
  const [range, setRange] = useState<Range>('week');
  const [frames, setFrames] = useState<Frame[] | null | undefined>(undefined);
  const [loaded, setLoaded] = useState(0);
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  // Phones pick the view and span from a sheet (see the rows below); wider screens use the chips.
  const [sheet, setSheet] = useState<null | 'view' | 'span'>(null);
  const closeSheet = useCallback(() => setSheet(null), []);
  const r = RANGES.find(x => x.id === range)!;

  useEffect(() => {
    let live = true;
    setFrames(undefined); setLoaded(0); setPlaying(false);
    loadFrames(channel, r.hours).then(f => {
      if (!live) return;
      setFrames(f);
      setIndex(f?.length ? f.length - 1 : 0);
      // Preload every frame so playback doesn't wait on the network.
      f?.forEach(fr => { const im = new Image(); im.onload = im.onerror = () => live && setLoaded(n => n + 1); im.src = fr.url; });
    });
    return () => { live = false; };
  }, [channel, r.hours]);

  const ready = !!frames?.length && loaded >= frames.length;
  useEffect(() => {
    if (!playing || !frames?.length) return;
    const id = setInterval(() => setIndex(i => (i + 1) % frames.length), 1000 / FPS);
    return () => clearInterval(id);
  }, [playing, frames]);

  const when = (x: number) => date(x, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  const f = frames?.[index];
  const span = frames && frames.length > 1 ? frames[frames.length - 1].t - frames[0].t : 0;
  // Still filling the span (frames are saved hourly), allowing a couple of missed hours.
  const building = !!frames?.length && span < (r.hours - 2) * 36e5;
  const label = useMemo(() => SDO_IMAGES.find(i => i.id === channel)!.label, [channel]);

  return (
    <section className="sun-lapse" aria-label={t('sunLapse.h')}>
      <div className="sun-lapse-head">
        <span className="label">{t('sunLapse.h')}</span>
        <div className="sun-lapse-chips" role="group" aria-label={t('sunLapse.view')}>
          {SDO_IMAGES.map(i => (
            <button key={i.id} type="button" className="btn" aria-pressed={channel === i.id} onClick={() => setChannel(i.id)}>{i.label}</button>
          ))}
        </div>
        <div className="sun-lapse-chips" role="group" aria-label={t('sunLapse.span')}>
          {RANGES.map(x => (
            <button key={x.id} type="button" className="btn" aria-pressed={range === x.id} onClick={() => setRange(x.id)}>{t(`sunLapse.range.${x.id}`)}</button>
          ))}
        </div>
        <div className="you-group-rows sun-lapse-rows">
          <button type="button" className="btn you-row" aria-haspopup="dialog" onClick={() => setSheet('view')}>
            <span className="you-row-label">{t('sunLapse.view')}</span><span className="you-row-value">{label}</span><Chevron />
          </button>
          <button type="button" className="btn you-row" aria-haspopup="dialog" onClick={() => setSheet('span')}>
            <span className="you-row-label">{t('sunLapse.span')}</span><span className="you-row-value">{t(`sunLapse.range.${range}`)}</span><Chevron />
          </button>
        </div>
      </div>

      {sheet === 'view' && (
        <BottomSheet title={t('sunLapse.view')} onClose={closeSheet}>
          <div className="you-group-rows">
            {SDO_IMAGES.map(i => (
              <button key={i.id} type="button" className="btn you-row" aria-pressed={channel === i.id} onClick={() => { setChannel(i.id); closeSheet(); }}>
                <span className="you-row-label sun-lapse-option"><b>{i.label}</b><small>{t(`sdo.${i.id}`)}</small></span>
                {channel === i.id && <Check />}
              </button>
            ))}
          </div>
        </BottomSheet>
      )}
      {sheet === 'span' && (
        <BottomSheet title={t('sunLapse.span')} onClose={closeSheet}>
          <div className="you-group-rows">
            {RANGES.map(x => (
              <button key={x.id} type="button" className="btn you-row" aria-pressed={range === x.id} onClick={() => { setRange(x.id); closeSheet(); }}>
                <span className="you-row-label">{t(`sunLapse.range.${x.id}`)}</span>
                {range === x.id && <Check />}
              </button>
            ))}
          </div>
        </BottomSheet>
      )}

      <div className="sun-lapse-frame">
        {f ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={f.url} alt={t('sunLapse.alt', { band: label, time: when(f.t) })} width={512} height={512} />
        ) : (
          <span className="storm-note">{frames === undefined ? t('detail.loading') : frames === null ? t('sunLapse.unavailable') : t('sunLapse.none')}</span>
        )}
        {f && <span className="sun-lapse-stamp mono">{when(f.t)}</span>}
      </div>

      {!!frames?.length && (
        <div className="map-time" role="group" aria-label={t('sunLapse.h')}>
          <button type="button" className="btn map-time-play" aria-pressed={playing} disabled={!ready || frames.length < 2}
            aria-label={t(playing ? 'sunLapse.pause' : 'sunLapse.play')}
            onClick={() => { if (!playing && index === frames.length - 1) setIndex(0); setPlaying(!playing); }}>
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
              {playing ? <path d="M7 5h3v14H7zM14 5h3v14h-3z" fill="currentColor" /> : <path d="M7 4.5v15l12-7.5-12-7.5Z" fill="currentColor" />}
            </svg>
          </button>
          <input type="range" min={0} max={frames.length - 1} step={1} value={index} aria-valuetext={f ? when(f.t) : ''}
            onChange={e => { setPlaying(false); setIndex(+e.target.value); }} />
          <span className="map-time-label">
            <b>{ready ? tn('sunLapse.frames', frames.length) : t('sunLapse.loading', { n: loaded, total: frames.length })}</b>
            <small className="mono">{index + 1}/{frames.length}</small>
          </span>
        </div>
      )}
      {building && <p className="storm-note">{t('sunLapse.building', { date: when(frames![0].t) })}</p>}
    </section>
  );
}

const Chevron = () => (
  <span className="you-chevron"><svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M9 6l6 6-6 6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg></span>
);
const Check = () => (
  <span style={{ color: 'var(--green)', display: 'flex' }}><svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg></span>
);
