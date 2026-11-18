'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useI18n } from '../i18n/I18n';
import { INTL_TAG } from '../i18n/config';
import { SKY_CAMERAS, type SkyCamera } from '../lib/skycams';
import { panelModel, type FrameStatus, type PanelItem, type PanelModel } from '../lib/skycamLogic';

/** Refreshing stops after this long without any interaction (resumes on the next one). */
const IDLE_MS = 30 * 6e4;

const box = { position: 'relative', width: '100%', aspectRatio: '1 / 1', borderRadius: 12, overflow: 'hidden', background: '#050807', display: 'flex', alignItems: 'center', justifyContent: 'center' } as const;
const small = { fontSize: 13, color: 'var(--muted)', margin: 0, lineHeight: 1.45 } as const;
const link = { color: 'var(--green)' } as const;

/** The panel's markup for a model (pure; rendered by component tests too). */
export function SkyCamsView({ model, onResume, paused }: { model: PanelModel; onResume?: () => void; paused?: boolean }) {
  const { t, num, locale } = useI18n();
  if (!model.visible) return null;
  const utc = (ms: number) => new Date(ms).toISOString().slice(11, 16);
  const local = (ms: number) => new Intl.DateTimeFormat(INTL_TAG[locale], { hour: '2-digit', minute: '2-digit' }).format(ms);
  const km = (k: number) => t('skycam.distance', { km: num(Math.round(k)) });
  const sourceLink = (cam: SkyCamera, label: string) => <a href={cam.sourcePageUrl} target="_blank" rel="noopener noreferrer" style={link}>{label}</a>;

  const item = (it: PanelItem) => {
    const { cam } = it;
    const head = <p style={{ margin: 0, fontWeight: 700 }}>{cam.name} <span style={{ fontWeight: 400, color: 'var(--muted)' }}>· {km(it.km)}</span></p>;
    if (it.kind === 'link') {
      return (
        <li key={cam.id} className="card" data-state="link" style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 4 }}>
          {head}
          <p style={small}>{cam.operator}</p>
          <p style={{ margin: 0, fontSize: 14 }}>{sourceLink(cam, t('skycam.openLive'))}</p>
        </li>
      );
    }
    const status = it.kind === 'loading' ? t('skycam.loading') : it.kind === 'offline' ? t('skycam.offline') : it.kind === 'error' ? t('skycam.error') : null;
    return (
      <li key={cam.id} data-state={it.kind} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <figure style={{ margin: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={box}>
            {it.kind === 'image'
              // eslint-disable-next-line @next/next/no-img-element -- a same-origin blob URL of the camera frame, served unaltered
              ? <img src={it.src} alt={t('skycam.alt', { name: cam.name, time: it.capturedAt ? utc(it.capturedAt) : '–' })} width={480} height={480} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
              : <p role="status" style={{ ...small, color: 'var(--soft)', padding: 16, textAlign: 'center' }}>{status}</p>}
          </div>
          <figcaption style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {head}
            {it.kind === 'image' && it.capturedAt && <p style={small}>{t('skycam.captured', { utc: utc(it.capturedAt), local: local(it.capturedAt) })}</p>}
            {it.kind === 'image' ? (
              <p style={small}>
                {t('skycam.credit')} <a href={cam.credit.url} target="_blank" rel="noopener noreferrer" style={link}>{cam.credit.text}</a>
                {cam.license.licenseUrl && <> · <a href={cam.license.licenseUrl} target="_blank" rel="noopener noreferrer" style={link}>{cam.license.kind === 'CC-BY-4.0' ? 'CC BY 4.0' : t('skycam.licence')}</a></>}
                {' · '}{t('skycam.notAltered')}
              </p>
            ) : <p style={small}>{sourceLink(cam, t('skycam.openLive'))}</p>}
          </figcaption>
        </figure>
      </li>
    );
  };

  return (
    <section className="card skycams" aria-labelledby="skycams-h" style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <h2 id="skycams-h" className="label" style={{ margin: 0 }}>{t('skycam.title')}</h2>
      <p style={small}>{t('skycam.explainer')}</p>
      {paused && onResume && <button type="button" className="btn" onClick={onResume} style={{ ...small, ...link, textAlign: 'left' }}>{t('skycam.paused')}</button>}
      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(240px, 100%), 1fr))', gap: 16 }}>
        {model.items.map(item)}
      </ul>
    </section>
  );
}

/**
 * "Live sky cams": the nearest all-sky cameras to `place` while it is dark at them. Images come only from
 * /api/skycam/:id (never from an operator directly), refresh once per camera cadence while the tab is visible,
 * and stop after 30 minutes without interaction.
 */
export function SkyCams({ place, cams = SKY_CAMERAS }: { place: { lat: number; lon: number } | null; cams?: SkyCamera[] }) {
  const [now, setNow] = useState<number | null>(null);
  const [frames, setFrames] = useState<Record<string, FrameStatus>>({});
  const [paused, setPaused] = useState(false);
  const lastInput = useRef(0);
  const urls = useRef<Record<string, string>>({});

  // The clock starts after mount, so the server render and hydration agree (nothing is shown until then).
  // A slow tick re-checks darkness (cameras come and go at dusk and dawn) even when no frame is fetched.
  useEffect(() => {
    lastInput.current = Date.now();
    setNow(Date.now()); // eslint-disable-line react-hooks/set-state-in-effect -- read the clock once after mount
    const id = setInterval(() => setNow(Date.now()), 5 * 6e4);
    return () => clearInterval(id);
  }, []);

  const model = useMemo(() => (now === null ? null : panelModel(place, now, cams, frames)), [place, now, cams, frames]);
  const wanted = useMemo(() => (model?.visible ? model.items.filter(i => i.kind !== 'link').map(i => i.cam) : []), [model]);
  const wantedKey = wanted.map(c => c.id).join(',');

  useEffect(() => {
    if (!wanted.length) return;
    let live = true;
    const load = async () => {
      if (!live || document.visibilityState !== 'visible') return;
      if (Date.now() - lastInput.current > IDLE_MS) { setPaused(true); return; }
      await Promise.all(wanted.map(async cam => {
        try {
          const res = await fetch(`/api/skycam/${encodeURIComponent(cam.id)}`);
          if (!res.ok) throw new Error(String(res.status));
          const captured = Date.parse(res.headers.get('x-skycam-captured') ?? '');
          const src = URL.createObjectURL(await res.blob());
          if (!live) { URL.revokeObjectURL(src); return; }
          const old = urls.current[cam.id];
          urls.current[cam.id] = src;
          setFrames(f => ({ ...f, [cam.id]: { kind: 'frame', capturedAt: Number.isFinite(captured) ? captured : null, src } }));
          if (old) setTimeout(() => URL.revokeObjectURL(old), 1000);
        } catch {
          if (live) setFrames(f => ({ ...f, [cam.id]: { kind: 'error' } }));
        }
      }));
      if (live) setNow(Date.now());
    };
    void load();
    const every = Math.max(30, Math.min(...wanted.map(c => c.cadenceSeconds ?? 300))) * 1000;
    const id = setInterval(load, every);
    const onVisible = () => { if (document.visibilityState === 'visible') { lastInput.current = Date.now(); setPaused(false); void load(); } };
    const onInput = () => { lastInput.current = Date.now(); };
    document.addEventListener('visibilitychange', onVisible);
    for (const ev of ['pointerdown', 'keydown', 'scroll', 'touchstart'] as const) window.addEventListener(ev, onInput, { passive: true });
    return () => {
      live = false;
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
      for (const ev of ['pointerdown', 'keydown', 'scroll', 'touchstart'] as const) window.removeEventListener(ev, onInput);
    };
  }, [wantedKey, paused]); // eslint-disable-line react-hooks/exhaustive-deps -- restart only when the set of cameras changes or on resume

  useEffect(() => () => { for (const u of Object.values(urls.current)) URL.revokeObjectURL(u); }, []);

  if (!model) return null;
  return <SkyCamsView model={model} paused={paused} onResume={() => { lastInput.current = Date.now(); setPaused(false); }} />;
}
