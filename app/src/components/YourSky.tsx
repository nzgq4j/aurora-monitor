'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { C } from '../data';
import { moon, type MoonState } from '../lib/astro';
import { devicePlace, searchPlaces, useLocations, type Place, type PlaceResult } from '../lib/locations';
import { useConditions } from '../lib/useConditions';
import { useStore } from '../store';
import { useI18n, type I18n } from '../i18n/I18n';
import { Explain } from './Explain';
import { headLead } from '../i18n/core';

const hhmmUT = (t: number) => `${new Date(t).toISOString().slice(11, 16)} UT`;

/** How much the Moon will get in the way right now. */
function moonEffect(m: MoonState, { t }: I18n): { text: string; c: string } {
  if (!m.up) return { text: t('moon.effect.none'), c: C.green };
  if (m.illumination < 0.25) return { text: t('moon.effect.faint'), c: C.green };
  if (m.illumination < 0.6) return { text: t('moon.effect.hides'), c: C.amber };
  return { text: t('moon.effect.bright'), c: C.red };
}

/** The Moon's disc with its lit part, mirrored for the southern hemisphere. */
function MoonDisc({ m, south, size = 44 }: { m: MoonState; south: boolean; size?: number }) {
  const { t } = useI18n();
  const r = 20, k = m.illumination;
  const litRight = m.waxing !== south;
  const rx = Math.abs(1 - 2 * k) * r;
  // Outer limb on the lit side, then back along the terminator (bulging out for a crescent, in for gibbous).
  const limb = litRight ? 1 : 0;
  const term = (k < 0.5) === litRight ? 0 : 1;
  const d = `M24 ${24 - r} A${r} ${r} 0 0 ${limb} 24 ${24 + r} A${rx.toFixed(2)} ${r} 0 0 ${term} 24 ${24 - r}Z`;
  return (
    <svg viewBox="0 0 48 48" width={size} height={size} role="img" aria-label={t('moon.aria', { phase: t(`moon.${m.name}`), pct: Math.round(k * 100) })} style={{ flex: 'none' }}>
      <circle cx="24" cy="24" r={r} style={{ fill: '#1b1f1c', stroke: '#3a403c' }} />
      {k > 0.01 && <path d={d} style={{ fill: '#F2F0E6' }} />}
    </svg>
  );
}

/** "Your sky" panel on Now: pick a location (device or search), optionally save it as Home, and see its live conditions. */
export function YourSky({ kp }: { kp: number | null }) {
  const { plan } = useStore();
  const i18n = useI18n();
  const { t, tx, tn, num } = i18n;
  const planName = t(`tier.${plan.id}`);
  const { locations, load, saveAsHome, error: locError, viewPlace: view, setViewPlace, shownPlace: shown } = useLocations();
  const [picking, setPicking] = useState(false);
  const [saveHome, setSaveHome] = useState(true);
  const [q, setQ] = useState('');
  const [results, setResults] = useState<PlaceResult[] | null>(null);
  const [busy, setBusy] = useState<'device' | 'search' | 'save' | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => { load(); }, [load]);

  const home = locations.find(l => l.isHome) ?? null;
  const { data: cond, loading } = useConditions(shown?.lat, shown?.lon);

  // Moon position and phase, worked out here and refreshed every five minutes.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 3e5); return () => clearInterval(id); }, []);
  const m = shown ? moon(now, shown.lat, shown.lon) : null;
  const effect = m ? moonEffect(m, i18n) : null;

  const choose = async (place: Place, source: 'manual' | 'device') => {
    setMsg(null);
    if (saveHome) {
      setBusy('save');
      const saved = await saveAsHome({ ...place, source }, plan.locs);
      setBusy(null);
      if (!saved) return;
      setViewPlace(null);
    } else {
      setViewPlace(place);
    }
    setPicking(false); setResults(null); setQ('');
  };

  const useDevice = async () => {
    setBusy('device'); setMsg(null);
    try { const p = await devicePlace(); setBusy(null); await choose(p, 'device'); }
    catch (e) { setBusy(null); setMsg(tx((e as Error).message)); }
  };

  const search = async (e: FormEvent) => {
    e.preventDefault();
    setBusy('search'); setMsg(null);
    try { const r = await searchPlaces(q); setResults(r); if (!r.length) setMsg(t('search.none')); }
    catch { setMsg(t('search.unavailable')); }
    finally { setBusy(null); }
  };

  const openPicker = () => { setPicking(true); setMsg(null); setSaveHome(true); };

  // Verdict: current Kp against what this spot needs, then darkness and cloud.
  const need = cond?.kpNeeded ?? null;
  const dark = cond?.sun.dark ?? null;
  // Cloud that matters for aurora: low and mid in full, thin high cloud at half weight.
  const cloud = cond?.cloud?.aurora ?? null;
  const layers = cond?.cloud?.layers ?? null;
  const sat = cond?.satellite?.pct ?? null;
  const south = !!shown && shown.lat < 0;
  const look = south ? 'south' : 'north';
  const aur = cond?.aurora?.nearby ?? null;
  let verdict = '', vc: string = C.muted;
  if (kp !== null && need !== null) {
    const v = { kp: num(kp, 1), need };
    if (kp >= need) {
      // Marginal: within one step of this sky's threshold, or Kp below 2 anywhere (any aurora is faint).
      const marginal = kp < need + 1 || kp < 2;
      // Below Kp 2 the reason is the low activity, not this sky's threshold.
      const lead = t(kp < need + 1 ? 'sky.v.marginal' : kp < 2 ? 'sky.v.low' : 'sky.v.enough', v);
      // "and" after a marginal reading, "but" after an otherwise good one.
      const mode = marginal ? 'and' : 'but';
      if (dark === false) { verdict = t(`sky.v.${mode}.notDark`, { lead }); vc = C.amber; }
      else if (cloud !== null && cloud >= 60) { verdict = t(`sky.v.${mode}.cloud`, { lead, cloud }); vc = C.amber; }
      // The OVATION model sees little within reach right now (it accounts for the time of night, which Kp doesn't).
      else if (aur !== null && aur < 10) { verdict = t('sky.v.ovationLow', { lead, pct: aur }); vc = C.amber; }
      else if (m && m.up && m.illumination >= 0.6) { verdict = t(`sky.v.${mode}.moon.${look}`, { lead, pct: Math.round(m.illumination * 100) }); vc = C.amber; }
      else if (marginal) { verdict = t(`sky.v.faint.${look}`, { lead }); vc = C.amber; }
      else { verdict = t(`sky.v.good.${look}`, { lead }); vc = C.green; }
    } else verdict = t('sky.v.below', v);
  }

  const stats = [
    { label: t('sky.stat.aurora'), info: t('sky.info.aurora'), value: aur === null ? '—' : `${aur}`, unit: aur === null ? '' : '%', note: t(`sky.auroraNote.${look}`), c: aur !== null && aur >= 10 ? C.green : C.soft },
    { label: t('sky.stat.cloud'), info: t('sky.info.cloud'), value: cloud === null ? '—' : `${cloud}`, unit: cloud === null ? '' : '%', note: !layers ? t('common.noData') : t('sky.cloud.layers', { ...layers }), c: cloud !== null && cloud < 30 ? C.green : C.soft },
    { label: t('sky.stat.dark'), info: t('sky.info.dark'), value: dark === null ? '—' : dark ? t('sky.dark.now') : cond?.sun.changesAt ? hhmmUT(cond.sun.changesAt).slice(0, 5) : t('sky.dark.no'), unit: dark === false && cond?.sun.changesAt ? 'UT' : '', note: dark === null ? (loading ? t('sky.checking') : t('common.noData')) : dark ? (cond?.sun.changesAt ? t('sky.dark.until', { time: hhmmUT(cond.sun.changesAt) }) : t('sky.dark.allNight')) : t('sky.dark.rule'), c: dark ? C.green : C.soft },
    { label: t('sky.stat.needs'), info: t('sky.info.needs'), value: need === null ? '—' : `Kp ${need}`, unit: '', note: cond ? t('sky.magLat', { lat: num(cond.magLat, 1) }) : t('sky.approx'), c: C.soft },
  ];

  const pill = { fontSize: 14, padding: '11px 18px', whiteSpace: 'nowrap' as const };

  return (
    <section aria-labelledby="your-sky" className="rule-top" style={{ display: 'flex', flexDirection: 'column', gap: 16, paddingTop: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 16, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
          <h2 id="your-sky" className="display" style={{ fontSize: 'var(--h-section)', lineHeight: 1 }}>{headLead(t('sky.h2a'))}<span className="hl">{t('sky.h2b')}</span></h2>
          {shown && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <span style={{ fontWeight: 700, fontSize: 18 }}>{shown.name}</span>
              <span style={{ fontSize: 11, fontWeight: 700, padding: '4px 8px', borderRadius: 999, border: `1px solid ${shown.isHome ? C.green : C.line2}`, color: shown.isHome ? C.green : C.muted }}>
                {shown.isHome ? t('sky.tag.home') : t('sky.tag.notSaved')}
              </span>
            </div>
          )}
        </div>
        {!picking && (
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {view && home && <button type="button" className="btn pill pill-ghost" style={pill} onClick={() => setViewPlace(null)}>{t('sky.backHome')}</button>}
            <button type="button" className="btn pill pill-primary" style={pill} onClick={openPicker}>{shown ? t('sky.change') : t('sky.set')}</button>
          </div>
        )}
      </div>

      {picking && (
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: 20 }}>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <button type="button" className="btn pill pill-primary" disabled={!!busy} onClick={useDevice} style={{ ...pill, opacity: busy ? .6 : 1 }}>
              {busy === 'device' ? t('loc.finding') : t('loc.useCurrent')}
            </button>
            <span style={{ fontSize: 13, color: 'var(--muted)' }}>{t('common.or')}</span>
            <form onSubmit={search} style={{ display: 'flex', gap: 8, flex: '1 1 260px', minWidth: 0 }}>
              <input className="input" value={q} onChange={e => setQ(e.target.value)} placeholder={t('search.placeholder')} aria-label={t('search.placeholder')} style={{ padding: 11 }} />
              <button type="submit" className="btn pill pill-ghost" disabled={!!busy || q.trim().length < 2} style={{ fontSize: 14, padding: '0 16px', flex: 'none' }}>{busy === 'search' ? '…' : t('search.button')}</button>
            </form>
          </div>
          {results && results.length > 0 && (
            <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              {results.map(r => (
                <li key={`${r.lat},${r.lon}`}>
                  <button type="button" className="btn" disabled={!!busy} onClick={() => choose({ name: r.detail ? `${r.name}, ${r.detail.split(', ')[0]}` : r.name, lat: r.lat, lon: r.lon }, 'manual')}
                    style={{ width: '100%', display: 'flex', justifyContent: 'space-between', gap: 8, padding: '10px 0', borderTop: '1px solid var(--line)' }}>
                    <span style={{ fontWeight: 700 }}>{r.name}</span><span style={{ fontSize: 13, color: 'var(--muted)', textAlign: 'right' }}>{r.detail}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 15, fontWeight: 600, cursor: 'pointer' }}>
            <input type="checkbox" checked={saveHome} onChange={e => setSaveHome(e.target.checked)} style={{ width: 18, height: 18, accentColor: C.green }} />
            {t('sky.saveHome')}
          </label>
          <span style={{ fontSize: 13, color: 'var(--muted)', marginTop: -8 }}>
            {saveHome
              ? (locations.length >= plan.locs
                ? t('sky.replacesHome', { plan: planName, locs: tn('sky.locs', plan.locs) })
                : t('sky.adds'))
              : t('sky.visitOnly')}
          </span>
          {(msg || locError) && <span role="status" style={{ fontSize: 14, color: C.amber }}>{msg || locError}</span>}
          <button type="button" className="btn" onClick={() => { setPicking(false); setResults(null); setMsg(null); }} style={{ alignSelf: 'flex-start', fontSize: 14, fontWeight: 600, color: 'var(--muted)' }}>{t('common.cancel')}</button>
        </div>
      )}

      {shown ? (
        <>
          <div className="now-stats">
            {stats.map(s => (
              <div key={s.label} className="now-stat">
                <span className="label">{s.label}</span>
                <span className="stat-value" style={{ fontSize: 30, whiteSpace: 'nowrap' }}>
                  {s.value}{s.unit && <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--muted)', marginLeft: 4 }}>{s.unit}</span>}
                </span>
                <span style={{ fontSize: 13, fontWeight: 600, color: s.c }}>{s.note}</span>
                <Explain>{s.info}</Explain>
              </div>
            ))}
          </div>
          {sat !== null && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              <span className="label">{t('sky.sat.label')}</span>
              <span style={{ fontWeight: 700, fontSize: 16 }}>
                {t(sat < 20 ? 'sky.sat.clear' : sat < 60 ? 'sky.sat.some' : 'sky.sat.cloudy', { pct: sat })}
              </span>
              <Explain>{t('sky.info.sat')}</Explain>
            </div>
          )}
          {m && effect && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '2px 0 4px' }}>
              <MoonDisc m={m} south={shown.lat < 0} />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
                <span className="label">{t('moon.label')}</span>
                <span style={{ fontWeight: 700, fontSize: 16 }}>
                  {t(`moon.${m.name}`)} · {t('moon.lit', { pct: Math.round(m.illumination * 100) })}
                  <span style={{ fontWeight: 500, color: 'var(--muted)' }}>
                    {' · '}{m.next ? t(`moon.${m.up ? 'up' : 'down'}.${m.next.event}`, { time: hhmmUT(m.next.t) }) : t(m.up ? 'moon.up.allDay' : 'moon.down.allDay')}
                  </span>
                </span>
                <span style={{ fontSize: 13, fontWeight: 600, color: effect.c }}>{effect.text}</span>
              </div>
            </div>
          )}
          {verdict && <span style={{ fontSize: 16, fontWeight: 600, color: vc }}>{verdict}</span>}
          {cloud !== null && <span style={{ fontSize: 12, color: 'var(--dim)' }}>{t('sky.cloud.weighting')}</span>}
        </>
      ) : !picking && (
        <span style={{ fontSize: 16, color: 'var(--soft)' }}>{t('sky.empty')}</span>
      )}
    </section>
  );
}
