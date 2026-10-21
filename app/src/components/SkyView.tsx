'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { OvalGrid } from '../app/api/oval/route';
import { moonPosition, sunAltitude } from '../lib/astro';
import { longestExposure, nightShot, sceneBrightness } from '../lib/nightShot';
import { BottomSheet } from './BottomSheet';
import { nativePlugin } from '../lib/native';
import { useLocations } from '../lib/locations';
import { sampleOval, smoothOval } from '../lib/ovalSmooth';
import { auroraBand, bandPeak, cameraPose, kpEdge, point16, wrap180, type BandSlice } from '../lib/skyView';
import { SITE } from '../lib/site';
import { ENTITLEMENTS } from '../data';
import { useStore } from '../store';
import { INTL_TAG } from '../i18n/config';
import { useI18n } from '../i18n/I18n';
import { MoonIcon, useNightMode } from './NightMode';
import { SkyGallery } from './SkyGallery';
import { addPhoto, listPhotos } from '../lib/gallery';

/** Horizontal angle the rear main camera sees along the long side of its picture (typical phones: 63–70°). */
const CAMERA_FOV = 66;
/** Photos are saved at least this many pixels on the long side, so the caption is sharp on small cameras. */
const PHOTO_MIN_EDGE = 1920;

type Phase = 'intro' | 'starting' | 'live' | 'error';
/** Night shot: always, never, or when it's dark (the Sun is down at the place, or the picture is dark). */
type NightPref = 'auto' | 'on' | 'off';
const NIGHT_PREF = 'pl.nightShot', NIGHT_LEN = 'pl.nightShotLen';
const LENGTHS = [3, 6, 10] as const;
/** Below this average brightness (0–1) the picture counts as dark. */
const DARK_SCENE = 0.12;
/**
 * The Android app's long-exposure camera (LongExposurePlugin.java): one still with a manual exposure of up
 * to the phone's limit. Used for night shots when the phone allows at least MIN_NATIVE_MS.
 */
type LongExposure = {
  capabilities: () => Promise<{ available: boolean; maxExposureMs?: number; minIso?: number; maxIso?: number }>;
  capture: (o: { exposureMs: number; iso: number }) => Promise<{ dataUrl: string; exposureMs: number; iso: number }>;
};
type NativeCaps = { maxExposureMs: number; minIso: number; maxIso: number };
const MIN_NATIVE_MS = 1000;
/** ISO for an exposure: about ISO 1600 at 10 s, more for shorter ones, at most ISO 6400 (noise). */
const isoFor = (ms: number, c: NativeCaps) => Math.max(c.minIso, Math.min(c.maxIso, 6400, Math.round(16000 / (ms / 1000))));
const readPref = <T,>(k: string, ok: readonly T[], d: T): T => { try { const v = localStorage.getItem(k); const x = ok.find(o => String(o) === v); return x ?? d; } catch { return d; } };
const writePref = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* storage unavailable */ } };
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
 * over it, and a photo button that never uses the flash. Phones only.
 */
export function SkyView({ kp }: { kp: number | null }) {
  const { t, num, locale } = useI18n();
  const { go, planIndex } = useStore();
  // Free photos always carry the caption (rounded location, time, direction, Kp, Made with); Chaser chooses (#93).
  const markOptional = planIndex >= ENTITLEMENTS.photoMarkOff;
  const { shownPlace } = useLocations();
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const [phase, setPhase] = useState<Phase>('intro');
  const [error, setError] = useState('');
  // Off until the user turns it up: photos and the live picture are unprocessed by default.
  const [caption, setCaption] = useState(false);
  const [pose, setPose] = useState<Pose | null>(null);
  const [compass, setCompass] = useState<'ok' | 'calibrate' | 'none'>('ok');
  const [here, setHere] = useState<{ lat: number; lon: number; name: string | null } | null>(null);
  const [field, setField] = useState<Float32Array | null>(null);
  const [view, setView] = useState({ w: 390, h: 844, ppd: 12 });
  // The latest photo in the gallery, for the thumbnail by the shutter.
  const [shot, setShot] = useState<string | null>(null);
  const [saveNote, setSaveNote] = useState('');
  const [gallery, setGallery] = useState(false);
  const [busy, setBusy] = useState(false);
  // The camera turns on with the view (the overlay itself comes from the motion sensors, compass and location).
  const [cam, setCam] = useState<'off' | 'starting' | 'on'>('off');
  const night = useNightMode();
  // Night shot settings (remembered on this device) and whether it's dark enough for Auto to use it.
  const [nightPref, setNightPref] = useState<NightPref>('auto');
  const [nightLen, setNightLen] = useState<(typeof LENGTHS)[number]>(6);
  const [dark, setDark] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [nightSheet, setNightSheet] = useState(false);
  const closeNightSheet = useCallback(() => setNightSheet(false), []);
  // In the Android app on a phone that allows exposures of a second or more: true long exposures.
  const [native, setNative] = useState<NativeCaps | null>(null);
  useEffect(() => {
    nativePlugin<LongExposure>('LongExposure')?.capabilities().then(c => {
      if (c.available && (c.maxExposureMs ?? 0) >= MIN_NATIVE_MS) setNative({ maxExposureMs: c.maxExposureMs!, minIso: c.minIso ?? 100, maxIso: c.maxIso ?? 3200 });
    }).catch(() => { /* stacked night shots */ });
  }, []);
  useEffect(() => {
    setNightPref(readPref<NightPref>(NIGHT_PREF, ['auto', 'on', 'off'], 'auto'));
    setNightLen(readPref(NIGHT_LEN, LENGTHS, 6));
  }, []);

  // The aurora forecast grid (the same one as the map), smoothed for sampling.
  useEffect(() => {
    fetch('/api/oval').then(r => (r.ok ? r.json() : null)).then((g: OvalGrid | null) => {
      if (g) setField(smoothOval(Uint8Array.from(atob(g.data), c => c.charCodeAt(0))));
    }).catch(() => { /* the overlay works without the band */ });
  }, []);

  /** Turn the camera on; true once its picture is playing. */
  // While the camera is starting, everyone waits on the same start (the shutter can be pressed meanwhile).
  const opening = useRef<Promise<boolean> | null>(null);
  const openCamera = () => (opening.current ??= startCamera().finally(() => { opening.current = null; }));
  const startCamera = async () => {
    if (stream.current) return true;
    setCam('starting');
    setError('');
    try {
      stream.current = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1920 } } });
    } catch {
      setCam('off'); setError(t('sky.err.camera')); return false;
    }
    // Make sure no torch is on: the view and photos never light the scene.
    const track = stream.current.getVideoTracks()[0];
    track.applyConstraints({ advanced: [{ torch: false } as MediaTrackConstraintSet] }).catch(() => { /* no torch control */ });
    const v = video.current;
    if (v) {
      v.srcObject = stream.current;
      const ready = new Promise<void>(res => { if (v.readyState >= 2) res(); else v.addEventListener('loadeddata', () => res(), { once: true }); setTimeout(res, 3000); });
      await v.play().catch(() => { /* muted + playsInline may autoplay; the frame wait below still applies */ });
      await ready;
    }
    setCam('on');
    return true;
  };

  const start = async () => {
    setPhase('starting');
    setError('');
    const motionOk = await askMotion();
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

  // The live camera picture from the start.
  const camStarted = useRef(false);
  useEffect(() => {
    if (phase !== 'live' || camStarted.current) return;
    camStarted.current = true;
    void openCamera();
  }, [phase]); // eslint-disable-line react-hooks/exhaustive-deps

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
  }, [phase, cam]);

  const band = useMemo<BandSlice[]>(() => (field && here ? auroraBand((la, lo) => sampleOval(field, la, lo), here.lat, here.lon) : []), [field, here]);
  const edge = useMemo(() => (kp !== null && here ? kpEdge(kp, here.lat, here.lon) : []), [kp, here]);
  const moon = useMemo(() => (here ? moonPosition(Date.now(), here.lat, here.lon) : null), [here]);
  const peak = bandPeak(band);

  // Auto: dark when the Sun is more than 6° below the horizon here, or the camera picture is dark.
  useEffect(() => {
    if (cam !== 'on') return;
    const check = () => {
      const sunDown = here ? sunAltitude(Date.now(), here.lat, here.lon) < -6 : false;
      const b = video.current ? sceneBrightness(video.current) : null;
      setDark(sunDown || (b !== null && b < DARK_SCENE));
    };
    check();
    const id = setInterval(check, 3000);
    return () => clearInterval(id);
  }, [cam, here]);
  const nightOn = nightPref === 'on' || (nightPref === 'auto' && dark);

  const capture = async () => {
    if (busy) return;
    setBusy(true);
    try {
      // Camera not running (e.g. not allowed at first): try again for the shot, and let its exposure settle.
      if (opening.current) await opening.current;
      if (!stream.current) {
        if (!(await openCamera())) return;
        await new Promise(res => setTimeout(res, 800));
      }
      const v = video.current;
      if (!v || !v.videoWidth) { setError(t('sky.err.photo')); return; }
      let source: CanvasImageSource = v, w = v.videoWidth, h = v.videoHeight;
      // Full-resolution still where the browser offers it (Chrome on Android), flash explicitly off.
      const IC = (window as unknown as { ImageCapture?: new (t: MediaStreamTrack) => { takePhoto: (s?: object) => Promise<Blob> } }).ImageCapture;
      const track = stream.current?.getVideoTracks()[0];
      let longShot: HTMLImageElement | null = null;
      if (nightOn && native) {
        // A true long exposure from the app's camera: the web view hands the camera over for the shot.
        const exposureMs = Math.min(nightLen * 1000, native.maxExposureMs);
        stream.current?.getTracks().forEach(tr => tr.stop());
        stream.current = null;
        setCam('off');
        const began = Date.now();
        setProgress(0);
        const tick = setInterval(() => setProgress(Math.min(1, (Date.now() - began) / exposureMs)), 100);
        try {
          const r = await nativePlugin<LongExposure>('LongExposure')!.capture({ exposureMs, iso: isoFor(exposureMs, native) });
          const img = new Image();
          img.src = r.dataUrl;
          await img.decode();
          longShot = img;
        } catch { /* stacked instead, below */ }
        finally {
          clearInterval(tick);
          setProgress(null);
        }
        if (!(await openCamera())) return;
        if (!longShot) await new Promise(res => setTimeout(res, 800));
      }
      const cur = video.current ?? v;
      if (longShot) {
        source = longShot; w = longShot.naturalWidth; h = longShot.naturalHeight;
      } else if (nightOn) {
        // Night shot: a few seconds of frames, lined up, averaged and brightened.
        const tr = stream.current?.getVideoTracks()[0];
        const restore = tr ? await longestExposure(tr) : () => {};
        setProgress(0);
        try {
          const r = await nightShot(cur, nightLen * 1000, setProgress);
          source = r.canvas; w = r.canvas.width; h = r.canvas.height;
        } finally {
          restore();
          setProgress(null);
        }
      } else if (IC && track) {
        try {
          // Some cameras never answer takePhoto; after 4 s the live frame is used instead.
          const blob = await Promise.race([new IC(track).takePhoto({ fillLightMode: 'off' }), new Promise<never>((_, no) => setTimeout(() => no(new Error('timeout')), 4000))]);
          const bmp = await createImageBitmap(blob);
          source = bmp; w = bmp.width; h = bmp.height;
        } catch { /* fall back to the live frame */ }
      }
      // Small camera pictures (some phones, the emulator) are scaled up so the caption text stays sharp.
      const k = Math.max(1, PHOTO_MIN_EDGE / Math.max(w, h));
      w = Math.round(w * k); h = Math.round(h * k);
      // Caption: location, time, direction and Kp, with the Made with mark. Sized from the long edge; on
      // one line when it fits (mark on the right), otherwise wrapped and left-aligned with the mark last.
      const unit = caption || !markOptional ? Math.round(Math.max(w, h) * 0.045) : 0;
      const font = `600 ${Math.round(unit * 0.42)}px system-ui, sans-serif`, pad = unit * 0.4, lineH = unit * 0.62;
      const lines: { text: string; mark: string }[] = [];
      let markLine = -1;
      if (unit) {
        const m = document.createElement('canvas').getContext('2d')!;
        m.font = font;
        const when = new Date().toLocaleString(INTL_TAG[locale], { dateStyle: 'medium', timeStyle: 'short' });
        const facing = pose?.az != null ? `${t(`sky.dir.${point16(pose.az)}`)} ${Math.round(pose.az) % 360}°` : '';
        // Rounded to 0.1° (about 10 km), as sightings are, so a photo never gives away an exact spot.
        const where = here ? `${num(Math.abs(here.lat), 1)}°${here.lat >= 0 ? 'N' : 'S'} ${num(Math.abs(here.lon), 1)}°${here.lon >= 0 ? 'E' : 'W'}` : '';
        const mark = t('sky.madeWith', { site: SITE.domain });
        const room = w - 2 * pad, gap = unit;
        let cur = '';
        for (const item of [where, when, facing, kp !== null ? `Kp ${num(kp, 1)}` : ''].filter(Boolean)) {
          const next = cur ? `${cur}  ·  ${item}` : item;
          if (cur && m.measureText(next).width > room) { lines.push({ text: cur, mark: '' }); cur = item; } else cur = next;
        }
        if (!lines.length && m.measureText(cur).width + gap + m.measureText(mark).width <= room) lines.push({ text: cur, mark });
        else lines.push({ text: cur, mark: '' }, { text: mark, mark: '' }), markLine = lines.length - 1;
      }
      const strip = unit ? Math.round(unit + (lines.length - 1) * lineH) : 0;
      const c = document.createElement('canvas');
      c.width = w; c.height = h + strip;
      const ctx = c.getContext('2d')!;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(source, 0, 0, w, h);
      if (strip) {
        ctx.fillStyle = '#000'; ctx.fillRect(0, h, w, strip);
        ctx.font = font; ctx.textBaseline = 'middle';
        lines.forEach((l, i) => {
          const y = h + unit / 2 + i * lineH;
          if (l.mark) { ctx.textAlign = 'right'; ctx.fillStyle = '#6CFF2B'; ctx.fillText(l.mark, w - pad, y, w - 2 * pad); }
          if (l.text) { ctx.textAlign = 'left'; ctx.fillStyle = i === markLine ? '#6CFF2B' : '#fff'; ctx.fillText(l.text, pad, y, w - 2 * pad); }
        });
      }
      const blob = await new Promise<Blob | null>(res => c.toBlob(res, 'image/jpeg', 0.92));
      if (!blob) throw new Error('encode');
      // Straight into the gallery, as a camera app does; saving to Photos or sharing happens from there.
      const p = await addPhoto(blob, `polar-lights-sky-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.jpg`);
      showLatest(p.thumb);
      setSaveNote(t('gallery.added'));
    } catch {
      setError(t('sky.err.photo'));
    } finally {
      setBusy(false);
    }
  };

  const showLatest = (thumb: Blob | null) => setShot(s => { if (s) URL.revokeObjectURL(s); return thumb ? URL.createObjectURL(thumb) : null; });
  const refreshLatest = () => listPhotos().then(ps => showLatest(ps[0]?.thumb ?? null)).catch(() => {});
  useEffect(() => { void refreshLatest(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const closeGallery = () => { setGallery(false); setSaveNote(''); void refreshLatest(); };

  // Screen position of a point in the sky (before the roll is applied to the whole overlay).
  const cx = view.w / 2, cy = view.h / 2;
  const at = (az: number, el: number) => (pose && pose.az !== null ? { x: cx + wrap180(az - pose.az) * view.ppd, y: cy - (el - pose.el) * view.ppd } : null);
  const inView = (az: number) => pose?.az != null && Math.abs(wrap180(az - pose.az)) < 100;

  const galleryView = gallery && <SkyGallery onClose={closeGallery} />;

  if (phase !== 'live') {
    return (
      <div className="sky sky-intro">
        <button type="button" className="btn sky-close" onClick={() => go('home')} aria-label={t('sky.close')}>×</button>
        <h1 className="display">{t('sky.title')}</h1>
        <p>{t('sky.intro')}</p>
        <ul>
          <li>{t('sky.intro.overlay')}</li>
          <li>{t('sky.intro.photo')}</li>
        </ul>
        {!markOptional && <p className="sky-small">{t('sky.intro.mark')}</p>}
        <p className="sky-small">{t('sky.permissions')}</p>
        {error && <p className="sky-error" role="alert">{error}</p>}
        <button type="button" className="btn pill pill-primary sky-start" onClick={start} disabled={phase === 'starting'}>{phase === 'starting' ? t('sky.starting') : t('sky.start')}</button>
        {shot && <button type="button" className="btn pill sky-gallery-open" onClick={() => setGallery(true)}>{t('gallery.open')}</button>}
        {galleryView}
      </div>
    );
  }

  const horizon = pose ? cy + pose.el * view.ppd : null;
  return (
    <div className="sky sky-live">
      {/* Always in the page (hidden until the camera is running), so the stream has somewhere to play. */}
      <video ref={video} playsInline muted autoPlay className="sky-video" style={{ opacity: cam === 'on' ? 1 : 0 }} />
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
          {pose?.az != null ? <b>{t('sky.facing', { dir: t(`sky.dir.${point16(pose.az)}`), deg: Math.round(pose.az) % 360, el: Math.round(pose.el) })}</b> : <b>{t('sky.noHeading')}</b>}
          <span>{peak ? t('sky.lookTo', { dir: t(`sky.dir.${point16(peak.az)}`), el: Math.round(Math.max(0, peak.low)), pct: Math.round(peak.p) }) : field ? t('sky.noAurora') : t('sky.loadingAurora')}</span>
        </div>
        <div className="sky-top-buttons">
          <button type="button" className="btn sky-round" aria-pressed={night.active} onClick={night.toggle} aria-label={t('night.toggle')} title={t('night.toggle')}>
            <MoonIcon on={night.active} size={22} />
          </button>
        </div>
      </div>
      {progress !== null && <p className="sky-hold" role="status">{t('sky.night.hold', { n: Math.max(1, Math.ceil(nightLen * (1 - progress))) })}</p>}
      {compass !== 'ok' && <p className="sky-hint" role="status">{compass === 'calibrate' ? t('sky.calibrate') : t('sky.noCompass')}</p>}
      {here?.name && <p className="sky-hint sky-hint-place">{t('sky.usingPlace', { place: here.name })}</p>}

      <div className="sky-bottom">
        <div className="sky-actions">
          {markOptional
            ? <label className="sky-caption"><input type="checkbox" checked={caption} onChange={e => setCaption(e.target.checked)} />{t('sky.caption')}</label>
            : <button type="button" className="btn sky-caption" onClick={() => go('plans')} title={t('sky.markFree')}>
                <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path d="M7 11V8a5 5 0 0 1 10 0v3M5.5 11h13v9.5h-13z" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round" /></svg>
                {t('sky.captionOn')}
              </button>}
          <div className="sky-shutter-wrap">
            <button type="button" className={'btn sky-night-chip' + (nightOn ? ' on' : '')} onClick={() => setNightSheet(true)} aria-haspopup="dialog"
              aria-label={t('sky.night.label', { state: nightOn ? t('sky.night.chipOn', { n: nightLen }) : t(`sky.night.${nightPref}`) })}>
              <MoonIcon on={nightOn} size={14} />{nightOn ? t('sky.night.chipOn', { n: nightLen }) : nightPref === 'off' ? t('sky.night.chipOff') : t('sky.night.chipAuto')}
            </button>
            <button type="button" className="btn sky-shutter" onClick={capture} disabled={busy} aria-label={nightOn ? t('sky.night.capture', { n: nightLen }) : t('sky.capture')}
              style={progress !== null ? { background: `conic-gradient(var(--green) ${Math.round(progress * 360)}deg, transparent 0)` } : undefined}><span /></button>
          </div>
          {shot ? (
            <button type="button" className="btn sky-thumb" onClick={() => setGallery(true)} aria-label={t('gallery.open')}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={shot} alt="" />
            </button>
          ) : <button type="button" className="btn sky-thumb sky-thumb-empty" onClick={() => setGallery(true)} aria-label={t('gallery.open')} />}
        </div>
        <p className="sky-small" role="status">{error || saveNote || t('sky.photoNote')}</p>
      </div>
      {nightSheet && (
        <BottomSheet title={t('sky.night.title')} onClose={closeNightSheet}>
          <span className="you-sheet-text">{t('sky.night.body')}</span>
          {native && <span className="you-sheet-text">{t('sky.night.native', { s: Math.round(native.maxExposureMs / 100) / 10 })}</span>}
          <div className="you-group-rows">
            {(['auto', 'on', 'off'] as NightPref[]).map(m => (
              <button key={m} type="button" className="btn you-row" aria-pressed={nightPref === m} onClick={() => { setNightPref(m); writePref(NIGHT_PREF, m); }}>
                <span className="you-row-label sun-lapse-option"><b>{t(`sky.night.${m}`)}</b>{m === 'auto' && <small>{t('sky.night.autoBody')}</small>}</span>
                {nightPref === m && <Check />}
              </button>
            ))}
          </div>
          <span className="you-group-label">{t('sky.night.length')}</span>
          <div className="you-group-rows">
            {LENGTHS.map(n => (
              <button key={n} type="button" className="btn you-row" aria-pressed={nightLen === n} onClick={() => { setNightLen(n); writePref(NIGHT_LEN, String(n)); }}>
                <span className="you-row-label">{t('sky.night.seconds', { n })}</span>
                {nightLen === n && <Check />}
              </button>
            ))}
          </div>
        </BottomSheet>
      )}
      {galleryView}
    </div>
  );
}

const Check = () => (
  <span style={{ color: 'var(--green)', display: 'flex' }}><svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg></span>
);
