'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { C } from '../data';
import { devicePlace, searchPlaces, useLocations, type Place, type PlaceResult } from '../lib/locations';
import { useConditions } from '../lib/useConditions';
import { useStore } from '../store';

const hhmmUT = (t: number) => `${new Date(t).toISOString().slice(11, 16)} UT`;

/** "Your sky" panel on Now: pick a location (device or search), optionally save it as Home, and see its live conditions. */
export function YourSky({ kp }: { kp: number | null }) {
  const { plan } = useStore();
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
    catch (e) { setBusy(null); setMsg((e as Error).message); }
  };

  const search = async (e: FormEvent) => {
    e.preventDefault();
    setBusy('search'); setMsg(null);
    try { const r = await searchPlaces(q); setResults(r); if (!r.length) setMsg('No places found.'); }
    catch { setMsg('Search is unavailable right now.'); }
    finally { setBusy(null); }
  };

  const openPicker = () => { setPicking(true); setMsg(null); setSaveHome(true); };

  // Verdict: current Kp against what this spot needs, then darkness and cloud.
  const need = cond?.kpNeeded ?? null;
  const dark = cond?.sun.dark ?? null;
  const cloud = cond?.cloud?.now ?? null;
  const look = shown && shown.lat < 0 ? 'south' : 'north';
  let verdict = '', vc: string = C.muted;
  if (kp !== null && need !== null) {
    if (kp >= need) {
      if (dark === false) { verdict = `Kp ${kp.toFixed(1)} is enough for this sky (≈ Kp ${need} needed), but it isn’t dark yet.`; vc = C.amber; }
      else if (cloud !== null && cloud >= 60) { verdict = `Kp ${kp.toFixed(1)} is enough for this sky, but ${cloud}% cloud may hide it.`; vc = C.amber; }
      else { verdict = `Kp ${kp.toFixed(1)} meets the ≈ Kp ${need} this sky needs. Look ${look}.`; vc = C.green; }
    } else verdict = `Kp ${kp.toFixed(1)} is below the ≈ Kp ${need} needed here.`;
  }

  const aur = cond?.aurora?.nearby ?? null;
  const stats = [
    { label: 'AURORA', value: aur === null ? '—' : `${aur}`, unit: aur === null ? '' : '%', note: 'OVATION, overhead to ~6° ' + look, c: aur !== null && aur >= 10 ? C.green : C.soft },
    { label: 'CLOUD', value: cloud === null ? '—' : `${cloud}`, unit: cloud === null ? '' : '%', note: cloud === null ? 'No data' : cloud < 30 ? 'Mostly clear' : cloud < 70 ? 'Partly cloudy' : 'Overcast', c: cloud !== null && cloud < 30 ? C.green : C.soft },
    { label: 'DARK', value: dark === null ? '—' : dark ? 'Now' : cond?.sun.changesAt ? hhmmUT(cond.sun.changesAt).slice(0, 5) : 'No', unit: dark === false && cond?.sun.changesAt ? 'UT' : '', note: dark === null ? (loading ? 'Checking…' : 'No data') : dark ? (cond?.sun.changesAt ? `Until ${hhmmUT(cond.sun.changesAt)}` : 'All night') : 'Sun 12° below horizon', c: dark ? C.green : C.soft },
    { label: 'NEEDS', value: need === null ? '—' : `Kp ${need}`, unit: '', note: cond ? `Mag. lat ${cond.magLat.toFixed(1)}°` : 'Approximate', c: C.soft },
  ];

  const pill = { fontSize: 14, padding: '11px 18px', whiteSpace: 'nowrap' as const };

  return (
    <section aria-labelledby="your-sky" className="rule-top" style={{ display: 'flex', flexDirection: 'column', gap: 16, paddingTop: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 16, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
          <h2 id="your-sky" className="display" style={{ fontSize: 'var(--h-section)', lineHeight: 1 }}>Your <span className="hl">sky</span></h2>
          {shown && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <span style={{ fontWeight: 700, fontSize: 18 }}>{shown.name}</span>
              <span style={{ fontSize: 11, fontWeight: 700, padding: '4px 8px', borderRadius: 999, border: `1px solid ${shown.isHome ? C.green : C.line2}`, color: shown.isHome ? C.green : C.muted }}>
                {shown.isHome ? 'HOME' : 'NOT SAVED'}
              </span>
            </div>
          )}
        </div>
        {!picking && (
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {view && home && <button type="button" className="btn pill pill-ghost" style={pill} onClick={() => setViewPlace(null)}>Back to Home</button>}
            <button type="button" className="btn pill pill-primary" style={pill} onClick={openPicker}>{shown ? 'Change location' : 'Set location'}</button>
          </div>
        )}
      </div>

      {picking && (
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: 20 }}>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <button type="button" className="btn pill pill-primary" disabled={!!busy} onClick={useDevice} style={{ ...pill, opacity: busy ? .6 : 1 }}>
              {busy === 'device' ? 'Finding you…' : 'Use my current location'}
            </button>
            <span style={{ fontSize: 13, color: 'var(--muted)' }}>or</span>
            <form onSubmit={search} style={{ display: 'flex', gap: 8, flex: '1 1 260px', minWidth: 0 }}>
              <input className="input" value={q} onChange={e => setQ(e.target.value)} placeholder="Search a town" aria-label="Search a town" style={{ padding: 11 }} />
              <button type="submit" className="btn pill pill-ghost" disabled={!!busy || q.trim().length < 2} style={{ fontSize: 14, padding: '0 16px', flex: 'none' }}>{busy === 'search' ? '…' : 'Search'}</button>
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
            Save as Home
          </label>
          <span style={{ fontSize: 13, color: 'var(--muted)', marginTop: -8 }}>
            {saveHome
              ? (locations.length >= plan.locs
                ? `Your ${plan.name} plan holds ${plan.locs} location${plan.locs === 1 ? '' : 's'}; this replaces your current Home.`
                : 'Adds it to your saved locations and uses it for alerts.')
              : 'Shows it here for this visit without saving it.'}
          </span>
          {(msg || locError) && <span role="status" style={{ fontSize: 14, color: C.amber }}>{msg || locError}</span>}
          <button type="button" className="btn" onClick={() => { setPicking(false); setResults(null); setMsg(null); }} style={{ alignSelf: 'flex-start', fontSize: 14, fontWeight: 600, color: 'var(--muted)' }}>Cancel</button>
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
              </div>
            ))}
          </div>
          {verdict && <span style={{ fontSize: 16, fontWeight: 600, color: vc }}>{verdict}</span>}
        </>
      ) : !picking && (
        <span style={{ fontSize: 16, color: 'var(--soft)' }}>Set a location to see aurora probability, cloud cover and darkness for your own sky.</span>
      )}
    </section>
  );
}
