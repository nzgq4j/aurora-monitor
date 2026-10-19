'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { OvalGrid } from '../app/api/oval/route';
import { moonPosition } from '../lib/astro';
import { useLocations } from '../lib/locations';
import { sampleOval, smoothOval } from '../lib/ovalSmooth';
import { auroraBand, bandPeak, cameraPose, kpEdge, point16, wrap180, type BandSlice } from '../lib/skyView';
import { SITE } from '../lib/site';
import { useStore } from '../store';
import { INTL_TAG } from '../i18n/config';
import { useI18n } from '../i18n/I18n';

/** Horizontal angle the rear main camera sees along the long side of its picture (typical phones: 63–70°). */
const CAMERA_FOV = 66;
/** Boost levels for the live picture and the photo: brightness, contrast, saturation. */
const BOOST = [[1, 1, 1], [1.5, 1.12, 1.3], [2.1, 1.25, 1.55], [2.8, 1.35, 1.8]] as const;
const boostCss = (b: number) => `brightness(${BOOST[b][0]}) contrast(${BOOST[b][1]}) saturate(${BOOST[b][2]})`;

type Phase = 'intro' | 'starting' | 'live' | 'error';
type Pose = { az: number | null; el: number; roll: number };

/** iOS 13+ asks for motion access from a tap; elsewhere this does nothing. */
async function askMotion(): Promise<boolean> {
  const D = (window as unknown as { DeviceOrientationEvent?: { requestPermission?: () => Promise<string> } }).DeviceOrientationEvent;
  if (!D?.requestPermission) return true;
  try { return (await D.requestPermission()) === 'granted'; } catch { return false; }
}

/** A circular moving average for headings, a plain one for angles that don't wrap. */
const smoothAngle = (prev: number | null, next: number, k: number) => (prev === null ? next : (prev + wrap180(next - prev) * k + 360) % 360);

/**
 * Augmented vision (#92): the live rear camera with the horizon, compass points, the expected aurora band
 * (OVATION along each direction, at 100–250 km), the oval's edge for the current Kp and the Moon drawn
 * over it, a boost for faint aurora, and a photo button that never uses the flash. Phones only.
 */
export function SkyView({ kp }: { kp: number | null }) {
  const { t, num, locale } = useI18n();
  const { go } = useStore();
  const { shownPlace } = useLocations();
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const [phase, setPhase] = useState<Phase>('intro');
  const [error, setError] = useState('');
  const [boost, setBoost] = useState(1);
  const [caption, setCaption] = useState(false);
  const [pose, setPose] = useState<Pose | null>(null);
  const [compass, setCompass] = useState<'ok' | 'calibrate' | 'none'>('ok');
  const [here, setHere] = useState<{ lat: number; lon: number; name: string | null } | null>(null);
  const [field, setField] = useState<Float32Array | null>(null);
  const [view, setView] = useState({ w: 390, h: 844, ppd: 12 });
  const [shot, setShot] = useState<{ url: string; file: File } | null>(null);
  const [busy, setBusy] = useState(false);

  // The aurora forecast grid (the same one as the map), smoothed for sampling.
  useEffect(() => {
    fetch('/api/oval').then(r => (r.ok ? r.json() : null)).then((g: OvalGrid | null) => {
      if (g) setField(smoothOval(Uint8Array.from(atob(g.data), c => c.charCodeAt(0))));
    }).catch(() => { /* the overlay works without the band */ });
  }, []);

  const start = async () => {
    setPhase('starting');
    setError('');
    const motionOk = await askMotion();
    try {
      stream.current = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1920 } } });
    } catch {
      setPhase('error'); setError(t('sky.err.camera')); return;
    }
    // Make sure no torch is on: the view and photos never light the scene.
    const track = stream.current.getVideoTracks()[0];
    track.applyConstraints({ advanced: [{ torch: false } as MediaTrackConstraintSet] }).catch(() => { /* no torch control */ });
    if (!motionOk) setCompass('none');
    // Where the user stands now; the shown place if the location isn't shared.
    navigator.geolocation?.getCurrentPosition(
      pos => setHere({ lat: pos.coords.latitude, lon: pos.coords.longitude, name: null }),
      () => shownPlace && setHere({ lat: shownPlace.lat, lon: shownPlace.lon, name: shownPlace.name.split(',')[0] }),
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 600000 },
    );
    if (shownPlace) setHere(h => h ?? { lat: shownPlace.lat, lon: shownPlace.lon, name: shownPlace.name.split(',')[0] });
    setPhase('live');
  };

  // The live view's video element appears with the 'live' phase: give it the stream then.
  useEffect(() => {
    const v = video.current;
    if (phase !== 'live' || !v || !stream.current || v.srcObject === stream.current) return;
    v.srcObject = stream.current;
    v.play().catch(() => { /* autoplay with muted + playsInline is allowed; retried on the next tap */ });
  }, [phase]);

  // Stop the camera on leaving.
  useEffect(() => () => stream.current?.getTracks().forEach(tr => tr.stop()), []);

  // Orientation: Android gives an absolute (north-referenced) event; iOS a compass heading alongside.
  useEffect(() => {
    if (phase !== 'live') return;
    let last: Pose | null = null, sawAbsolute = false, raf = 0, pending: Pose | null = null;
    const flush = () => { raf = 0; if (pending) setPose(pending); };
    const onOrient = (e: DeviceOrientationEvent & { webkitCompassHeading?: number; webkitCompassAccuracy?: number }, absolute: boolean) => {
      if (e.beta === null || e.gamma === null) return;
      if (absolute) sawAbsolute = true; else if (sawAbsolute) return;
      const p = cameraPose(e.alpha ?? 0, e.beta, e.gamma);
      let az: number | null = null;
      if (typeof e.webkitCompassHeading === 'number' && e.webkitCompassHeading >= 0) {
        az = e.webkitCompassHeading;
        setCompass(e.webkitCompassAccuracy === undefined || e.webkitCompassAccuracy < 0 || e.webkitCompassAccuracy > 25 ? 'calibrate' : 'ok');
      } else if (absolute && e.alpha !== null) az = p.az;
      const roll = p.roll - (screen.orientation?.angle ?? 0);
      const next: Pose = {
        az: az === null ? null : smoothAngle(last?.az ?? null, az, 0.25),
        el: last ? last.el + (p.el - last.el) * 0.25 : p.el,
        roll: last ? last.roll + wrap180(roll - last.roll) * 0.25 : roll,
      };
      last = next; pending = next;
      if (!raf) raf = requestAnimationFrame(flush);
    };
    const abs = (e: Event) => onOrient(e as DeviceOrientationEvent, true);
    const rel = (e: Event) => onOrient(e as DeviceOrientationEvent, false);
    window.addEventListener('deviceorientationabsolute', abs);
    window.addEventListener('deviceorientation', rel);
    // No heading after a few seconds: the overlay can't be aligned to the compass.
    const check = setTimeout(() => setPose(p => { if (!p || p.az === null) setCompass(c => (c === 'ok' ? 'none' : c)); return p; }), 3000);
    return () => { window.removeEventListener('deviceorientationabsolute', abs); window.removeEventListener('deviceorientation', rel); cancelAnimationFrame(raf); clearTimeout(check); };
  }, [phase]);

  // Pixels per degree on screen: the video is scaled to cover the view, its long side spans CAMERA_FOV.
  useEffect(() => {
    if (phase !== 'live') return;
    const measure = () => {
      const v = video.current, w = window.innerWidth, h = window.innerHeight;
      const vw = v?.videoWidth || 1080, vh = v?.videoHeight || 1920;
      const scale = Math.max(w / vw, h / vh);
      setView({ w, h, ppd: (scale * Math.max(vw, vh)) / CAMERA_FOV });
    };
    measure();
    video.current?.addEventListener('loadedmetadata', measure);
    window.addEventListener('resize', measure);
    const v = video.current;
    return () => { v?.removeEventListener('loadedmetadata', measure); window.removeEventListener('resize', measure); };
  }, [phase]);

  const band = useMemo<BandSlice[]>(() => (field && here ? auroraBand((la, lo) => sampleOval(field, la, lo), here.lat, here.lon) : []), [field, here]);
  const edge = useMemo(() => (kp !== null && here ? kpEdge(kp, here.lat, here.lon) : []), [kp, here]);
  const moon = useMemo(() => (here ? moonPosition(Date.now(), here.lat, here.lon) : null), [here]);
  const peak = bandPeak(band);

  const capture = async () => {
    const v = video.current;
    if (busy) return;
    if (!v || !v.videoWidth) { setError(t('sky.err.photo')); return; }
    setBusy(true);
    try {
      let source: CanvasImageSource = v, w = v.videoWidth, h = v.videoHeight;
      // Full-resolution still where the browser offers it (Chrome on Android), flash explicitly off.
      const IC = (window as unknown as { ImageCapture?: new (t: MediaStreamTrack) => { takePhoto: (s?: object) => Promise<Blob> } }).ImageCapture;
      const track = stream.current?.getVideoTracks()[0];
      if (IC && track) {
        try {
          // Some cameras never answer takePhoto; after 4 s the live frame is used instead.
          const blob = await Promise.race([new IC(track).takePhoto({ fillLightMode: 'off' }), new Promise<never>((_, no) => setTimeout(() => no(new Error('timeout')), 4000))]);
          const bmp = await createImageBitmap(blob);
          source = bmp; w = bmp.width; h = bmp.height;
        } catch { /* fall back to the live frame */ }
      }
      const strip = caption ? Math.round(Math.max(w, h) * 0.045) : 0;
      const c = document.createElement('canvas');
      c.width = w; c.height = h + strip;
      const ctx = c.getContext('2d')!;
      // Canvas filters: Chrome, Firefox and Safari 18+; older Safari gets the same boost by hand below.
      const filterOk = typeof (ctx as { filter?: unknown }).filter === 'string';
      if (filterOk) ctx.filter = boostCss(boost);
      ctx.drawImage(source, 0, 0, w, h);
      ctx.filter = 'none';
      if (!filterOk && boost > 0) {
        // Safari without canvas filters: the same boost by hand.
        const img = ctx.getImageData(0, 0, w, h), d = img.data, [br, ct, sat] = BOOST[boost];
        for (let i = 0; i < d.length; i += 4) {
          let r = d[i] * br, g = d[i + 1] * br, b = d[i + 2] * br;
          const l = 0.299 * r + 0.587 * g + 0.114 * b;
          r = l + (r - l) * sat; g = l + (g - l) * sat; b = l + (b - l) * sat;
          d[i] = (r - 128) * ct + 128; d[i + 1] = (g - 128) * ct + 128; d[i + 2] = (b - 128) * ct + 128;
        }
        ctx.putImageData(img, 0, 0);
      }
      if (strip) {
        ctx.fillStyle = '#000'; ctx.fillRect(0, h, w, strip);
        ctx.fillStyle = '#fff'; ctx.font = `600 ${Math.round(strip * 0.42)}px system-ui, sans-serif`; ctx.textBaseline = 'middle';
        const when = new Date().toLocaleString(INTL_TAG[locale], { dateStyle: 'medium', timeStyle: 'short' });
        const facing = pose?.az != null ? `${t(`sky.dir.${point16(pose.az)}`)} ${Math.round(pose.az)}°` : '';
        const where = here ? (here.name ?? `${num(here.lat, 2)}°, ${num(here.lon, 2)}°`) : '';
        ctx.fillText([where, when, facing, kp !== null ? `Kp ${num(kp, 1)}` : ''].filter(Boolean).join('  ·  '), strip * 0.4, h + strip / 2, w - strip * 3.4);
        ctx.textAlign = 'right'; ctx.fillStyle = '#6CFF2B';
        ctx.fillText(SITE.domain, w - strip * 0.4, h + strip / 2);
      }
      const blob = await new Promise<Blob | null>(res => c.toBlob(res, 'image/jpeg', 0.92));
      if (!blob) throw new Error('encode');
      const file = new File([blob], `polar-lights-sky-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}.jpg`, { type: 'image/jpeg' });
      setShot(s => { if (s) URL.revokeObjectURL(s.url); return { url: URL.createObjectURL(blob), file }; });
    } catch {
      setError(t('sky.err.photo'));
    } finally {
      setBusy(false);
    }
  };

  const share = async () => {
    if (!shot) return;
    if (navigator.canShare?.({ files: [shot.file] })) {
      try { await navigator.share({ files: [shot.file], title: SITE.name }); } catch { /* cancelled */ }
    } else {
      const a = document.createElement('a'); a.href = shot.url; a.download = shot.file.name; a.click();
    }
  };

  // Screen position of a point in the sky (before the roll is applied to the whole overlay).
  const cx = view.w / 2, cy = view.h / 2;
  const at = (az: number, el: number) => (pose && pose.az !== null ? { x: cx + wrap180(az - pose.az) * view.ppd, y: cy - (el - pose.el) * view.ppd } : null);
  const inView = (az: number) => pose?.az != null && Math.abs(wrap180(az - pose.az)) < 100;

  if (phase !== 'live') {
    return (
      <div className="sky sky-intro">
        <button type="button" className="btn sky-close" onClick={() => go('home')} aria-label={t('sky.close')}>×</button>
        <h1 className="display">{t('sky.title')}</h1>
        <p>{t('sky.intro')}</p>
        <ul>
          <li>{t('sky.intro.overlay')}</li>
          <li>{t('sky.intro.boost')}</li>
          <li>{t('sky.intro.photo')}</li>
        </ul>
        <p className="sky-small">{t('sky.permissions')}</p>
        {error && <p className="sky-error" role="alert">{error}</p>}
        <button type="button" className="btn pill pill-primary sky-start" onClick={start} disabled={phase === 'starting'}>{phase === 'starting' ? t('sky.starting') : t('sky.start')}</button>
      </div>
    );
  }

  const horizon = pose ? cy + pose.el * view.ppd : null;
  return (
    <div className="sky sky-live">
      <video ref={video} playsInline muted autoPlay className="sky-video" style={{ filter: boostCss(boost) }} />
      <svg className="sky-overlay" width={view.w} height={view.h} aria-hidden="true">
        {pose && (
          <g transform={`rotate(${pose.roll} ${cx} ${cy})`}>
            {horizon !== null && <line x1={-view.w} x2={view.w * 2} y1={horizon} y2={horizon} className="sky-horizon" />}
            {pose.az !== null && Array.from({ length: 72 }, (_, i) => i * 5).filter(az => (az % 10 === 0 || az % 45 === 0) && inView(az)).map(az => {
              const p = at(az, 0)!, major = az % 45 === 0;
              return (
                <g key={az}>
                  <line x1={p.x} x2={p.x} y1={p.y - (major ? 14 : 7)} y2={p.y + (major ? 14 : 7)} className="sky-tick" />
                  {major && <text x={p.x} y={p.y + 34} className="sky-label">{t(`sky.dir.${point16(az)}`)}</text>}
                </g>
              );
            })}
            {band.filter(s => inView(s.az)).map(s => {
              const a = at(s.az - 2.5, s.high)!, b = at(s.az + 2.5, s.low)!;
              return <rect key={s.az} x={a.x} y={a.y} width={b.x - a.x + 0.5} height={Math.max(2, b.y - a.y)} className="sky-band" style={{ opacity: Math.min(0.55, 0.12 + s.p / 120) }} />;
            })}
            {(['high', 'low'] as const).map(k => (
              <polyline key={k} className="sky-band-edge" points={band.filter(s => inView(s.az)).sort((x, y) => wrap180(x.az - pose.az!) - wrap180(y.az - pose.az!)).map(s => { const p = at(s.az, s[k])!; return `${p.x},${p.y}`; }).join(' ')} />
            ))}
            {edge.length > 1 && pose.az !== null && (
              <polyline className="sky-edge" points={edge.filter(e => inView(e.az)).sort((x, y) => wrap180(x.az - pose.az!) - wrap180(y.az - pose.az!)).map(e => { const p = at(e.az, e.el)!; return `${p.x},${p.y}`; }).join(' ')} />
            )}
            {moon && moon.alt > -1 && inView(moon.az) && (() => { const p = at(moon.az, moon.alt)!; return (
              <g><circle cx={p.x} cy={p.y} r={Math.max(9, view.ppd * 0.5)} className="sky-moon" /><text x={p.x} y={p.y - Math.max(9, view.ppd * 0.5) - 8} className="sky-label">{t('sky.moon')}</text></g>
            ); })()}
          </g>
        )}
        <circle cx={cx} cy={cy} r={5} className="sky-centre" />
      </svg>

      <div className="sky-top">
        <button type="button" className="btn sky-round" onClick={() => go('home')} aria-label={t('sky.close')}>×</button>
        <div className="sky-readout" role="status">
          {pose?.az != null ? <b>{t('sky.facing', { dir: t(`sky.dir.${point16(pose.az)}`), deg: Math.round(pose.az), el: Math.round(pose.el) })}</b> : <b>{t('sky.noHeading')}</b>}
          <span>{peak ? t('sky.lookTo', { dir: t(`sky.dir.${point16(peak.az)}`), el: Math.round(Math.max(0, peak.low)), pct: Math.round(peak.p) }) : field ? t('sky.noAurora') : t('sky.loadingAurora')}</span>
        </div>
      </div>
      {compass !== 'ok' && <p className="sky-hint" role="status">{compass === 'calibrate' ? t('sky.calibrate') : t('sky.noCompass')}</p>}
      {here?.name && <p className="sky-hint sky-hint-place">{t('sky.usingPlace', { place: here.name })}</p>}

      <div className="sky-bottom">
        <label className="sky-boost">
          <span>{t('sky.boost')}</span>
          <input type="range" min={0} max={3} step={1} value={boost} onChange={e => setBoost(+e.target.value)} aria-valuetext={t(`sky.boost.${boost as 0 | 1 | 2 | 3}`)} />
        </label>
        <div className="sky-actions">
          <label className="sky-caption"><input type="checkbox" checked={caption} onChange={e => setCaption(e.target.checked)} />{t('sky.caption')}</label>
          <button type="button" className="btn sky-shutter" onClick={capture} disabled={busy} aria-label={t('sky.capture')}><span /></button>
          {shot ? (
            <button type="button" className="btn sky-thumb" onClick={share} aria-label={t('sky.share')}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={shot.url} alt="" />
            </button>
          ) : <span className="sky-thumb sky-thumb-empty" />}
        </div>
        <p className="sky-small">{error || t('sky.photoNote')}</p>
      </div>
    </div>
  );
}
