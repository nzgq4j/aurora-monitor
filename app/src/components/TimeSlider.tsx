'use client';

import { useEffect } from 'react';
import type { Frame } from '../lib/ovalFrames';
import { useI18n } from '../i18n/I18n';

const hhmm = (t: number) => new Date(t).toISOString().slice(11, 16);

interface Props {
  frames: Frame[];
  /** 0 … frames.length; frames.length is Live (the current oval). */
  index: number;
  onIndex: (i: number) => void;
  playing: boolean;
  onPlaying: (p: boolean) => void;
}

/**
 * Replay the last day of aurora (#43): a step per saved half-hourly OVATION frame, ending on Live.
 * Play steps forward and stops at Live; the user can always drag the slider.
 */
export function TimeSlider({ frames, index, onIndex, playing, onPlaying }: Props) {
  const { t } = useI18n();
  const live = index >= frames.length;
  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => onIndex(Math.min(frames.length, index + 1)), 800);
    if (index >= frames.length) onPlaying(false);
    return () => clearInterval(id);
  }, [playing, index, frames.length, onIndex, onPlaying]);
  const f = frames[index];
  return (
    <div className="map-time" role="group" aria-label={t('map.time.label')}>
      <button type="button" className="btn map-time-play" aria-pressed={playing}
        aria-label={t(playing ? 'map.time.pause' : 'map.time.play')}
        onClick={() => { if (!playing && live) onIndex(0); onPlaying(!playing); }}>
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
          {playing ? <path d="M7 5h3v14H7zM14 5h3v14h-3z" fill="currentColor" /> : <path d="M7 4.5v15l12-7.5-12-7.5Z" fill="currentColor" />}
        </svg>
      </button>
      <input type="range" min={0} max={frames.length} step={1} value={index} aria-valuetext={live ? t('map.time.live') : t('map.time.observed', { time: hhmm(f.observed ?? f.forecast) })}
        onChange={e => { onPlaying(false); onIndex(+e.target.value); }} />
      <span className="map-time-label">
        <b>{live ? t('map.time.live') : t('map.time.observed', { time: hhmm(f.observed ?? f.forecast) })}</b>
        <small className="mono">{index + 1}/{frames.length + 1}</small>
      </span>
    </div>
  );
}
