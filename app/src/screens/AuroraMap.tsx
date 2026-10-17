'use client';

import 'leaflet/dist/leaflet.css';
import { useEffect, useRef, useState } from 'react';
import type * as Leaflet from 'leaflet';
import type { Topology, GeometryCollection } from 'topojson-specification';
import { C } from '../data';
import { magLat } from '../lib/astro';
import { useLocations } from '../lib/locations';
import type { OvalGrid } from '../app/api/oval/route';

type Mode = 'prob' | 'kp' | 'both';

// Light blue → green → yellow → red, used for both probability and Kp.
const STOPS: [number, [number, number, number]][] = [
  [0, [127, 212, 255]], [0.33, [89, 255, 58]], [0.66, [255, 225, 77]], [1, [255, 77, 77]],
];
function ramp(t: number): [number, number, number] {
  const x = Math.max(0, Math.min(1, t));
  for (let i = 1; i < STOPS.length; i++) {
    const [t1, c1] = STOPS[i], [t0, c0] = STOPS[i - 1];
    if (x <= t1) { const k = (x - t0) / (t1 - t0); return [0, 1, 2].map(j => Math.round(c0[j] + (c1[j] - c0[j]) * k)) as [number, number, number]; }
  }
  return STOPS[STOPS.length - 1][1];
}
const rgb = (c: [number, number, number]) => `rgb(${c[0]},${c[1]},${c[2]})`;
/** Probability (%) → gradient position: 5% is light blue, 90% and above is red. */
const probT = (p: number) => (p - 5) / 85;
const kpT = (k: number) => (k - 1) / 8;

const LAT_MAX = 85;
const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;

/** Render the OVATION grid into a Web-Mercator canvas so it lines up with Leaflet. */
function renderOval(grid: Uint8Array): string {
  const W = 1440;
  const yMax = Math.log(Math.tan(Math.PI / 4 + rad(LAT_MAX) / 2));
  const H = Math.round((W * 2 * yMax) / (2 * Math.PI));
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(W, H);
  const at = (i: number, j: number) => grid[Math.max(0, Math.min(180, i)) * 360 + (((j % 360) + 360) % 360)];
  for (let py = 0; py < H; py++) {
    const y = yMax - ((py + 0.5) / H) * 2 * yMax;
    const lat = deg(2 * Math.atan(Math.exp(y)) - Math.PI / 2);
    if (Math.abs(lat) < 30) continue; // OVATION never reaches this far from the poles
    const fi = lat + 90, i0 = Math.floor(fi), di = fi - i0;
    for (let px = 0; px < W; px++) {
      const lon = -180 + ((px + 0.5) / W) * 360;
      const fj = (lon + 360) % 360, j0 = Math.floor(fj), dj = fj - j0;
      const p = (at(i0, j0) * (1 - dj) + at(i0, j0 + 1) * dj) * (1 - di) + (at(i0 + 1, j0) * (1 - dj) + at(i0 + 1, j0 + 1) * dj) * di;
      if (p < 1.5) continue;
      const [r, g, b] = ramp(probT(p));
      const o = (py * W + px) * 4;
      // Fade in over the faintest values so the oval's outer edge is soft rather than stepped.
      const fade = Math.min(1, (p - 1.5) / 8);
      img.data[o] = r; img.data[o + 1] = g; img.data[o + 2] = b;
      img.data[o + 3] = Math.round(255 * fade * Math.min(0.78, 0.22 + 0.6 * Math.max(0, probT(p))));
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas.toDataURL('image/png');
}

/** Geographic line where geomagnetic latitude equals the oval's equatorward edge for this Kp (≈ 66° − 2·Kp). */
function kpLine(k: number, south = false): [number, number][] {
  const target = (66 - 2 * k) * (south ? -1 : 1);
  const pts: [number, number][] = [];
  for (let lon = -180; lon <= 180; lon += 2) {
    let lo = south ? -89.9 : 0, hi = south ? 0 : 89.9;
    for (let n = 0; n < 40; n++) {
      const mid = (lo + hi) / 2;
      if (magLat(mid, lon) < target) lo = mid; else hi = mid;
    }
    pts.push([(lo + hi) / 2, lon]);
  }
  return pts;
}

const hhmm = (t: number) => new Date(t).toISOString().slice(11, 16);

export function AuroraMap({ kp }: { kp: number | null }) {
  const box = useRef<HTMLDivElement>(null);
  const mapRef = useRef<Leaflet.Map | null>(null);
  const layers = useRef<{ prob?: Leaflet.Layer; kp?: Leaflet.LayerGroup; marker?: Leaflet.Layer }>({});
  const LRef = useRef<typeof Leaflet | null>(null);
  const [mode, setMode] = useState<Mode>('both');
  const [status, setStatus] = useState<string>('Loading map…');
  const [forecast, setForecast] = useState<number | null>(null);
  const [ready, setReady] = useState(false);
  const { shownPlace, load } = useLocations();
  const current = kp === null ? null : Math.max(1, Math.min(9, Math.round(kp)));

  useEffect(() => { load(); }, [load]);
  // Start with the legend collapsed on phones so it doesn't cover the map.
  const legend = useRef<HTMLDetailsElement>(null);
  useEffect(() => { if (legend.current && window.matchMedia('(max-width: 640px)').matches) legend.current.open = false; }, []);

  // Build the map once.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const L = (await import('leaflet')).default;
      const topo = await import('topojson-client');
      if (cancelled || !box.current || mapRef.current) return;
      LRef.current = L;
      const map = L.map(box.current, {
        minZoom: 2, maxZoom: 9, zoomSnap: 0.5, worldCopyJump: false,
        maxBounds: [[-LAT_MAX, -200], [LAT_MAX, 200]], maxBoundsViscosity: 1, attributionControl: true,
      }).setView([58, -95], 3);
      mapRef.current = map;
      map.attributionControl.setPrefix(false);
      map.attributionControl.addAttribution('Natural Earth · NOAA SWPC OVATION');
      map.createPane('land').style.zIndex = '200';
      map.createPane('aurora').style.zIndex = '400';
      map.createPane('kplines').style.zIndex = '450';
      map.createPane('labels').style.zIndex = '500';

      try {
        const world = await (await fetch('/geo/countries-50m.json')).json() as Topology<{ countries: GeometryCollection }>;
        const land = topo.merge(world, world.objects.countries.geometries as never);
        const borders = topo.mesh(world, world.objects.countries, (a, b) => a !== b);
        L.geoJSON(land as never, { pane: 'land', interactive: false, style: { stroke: false, fillColor: '#2b2e2c', fillOpacity: 1 } }).addTo(map);
        L.geoJSON(borders as never, { pane: 'land', interactive: false, style: { color: '#4a504c', weight: 0.7, fill: false } }).addTo(map);
      } catch { setStatus('Basemap failed to load.'); }

      L.polyline([[66.563, -180], [66.563, 180]], { pane: 'land', color: C.muted, weight: 1, dashArray: '6 6', interactive: false }).addTo(map);
      L.marker([66.563, -30], { pane: 'labels', interactive: false, icon: L.divIcon({ className: 'map-label map-label-dim', html: 'Arctic Circle', iconSize: undefined }) }).addTo(map);
      for (const [name, lat, lon] of MAP_CITIES) {
        L.marker([lat, lon], { pane: 'labels', interactive: false, icon: L.divIcon({ className: 'map-city', html: `<i></i><span>${name}</span>`, iconSize: undefined }) }).addTo(map);
      }

      // Kp reach lines (both hemispheres), coloured on the same scale.
      const group = L.layerGroup();
      for (let k = 1; k <= 9; k++) {
        const on = k === current;
        const style = { pane: 'kplines', color: rgb(ramp(kpT(k))), weight: on ? 3 : 1.4, opacity: on ? 1 : 0.75, dashArray: on ? undefined : '3 5', interactive: false };
        L.polyline(kpLine(k), style).addTo(group);
        L.polyline(kpLine(k, true), style).addTo(group);
        const label = kpLine(k).find(p => p[1] === -60);
        if (label) L.marker(label, { pane: 'labels', interactive: false, icon: L.divIcon({ className: on ? 'map-kp map-kp-on' : 'map-kp', html: `<span style="color:${rgb(ramp(kpT(k)))}">Kp ${k}</span>`, iconSize: undefined }) }).addTo(group);
      }
      layers.current.kp = group;

      try {
        const res = await fetch('/api/oval');
        if (!res.ok) throw new Error();
        const grid = await res.json() as OvalGrid;
        const bytes = Uint8Array.from(atob(grid.data), ch => ch.charCodeAt(0));
        layers.current.prob = L.imageOverlay(renderOval(bytes), [[-LAT_MAX, -180], [LAT_MAX, 180]], { pane: 'aurora', interactive: false });
        setForecast(grid.forecast);
        setStatus('');
      } catch { setStatus('Aurora data is unavailable right now.'); }
      if (!cancelled) setReady(true);
    })();
    return () => { cancelled = true; mapRef.current?.remove(); mapRef.current = null; };
  }, [current]);

  // Show the chosen layers.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const { prob, kp: kpl } = layers.current;
    if (prob) { if (mode !== 'kp') prob.addTo(map); else prob.remove(); }
    if (kpl) { if (mode !== 'prob') kpl.addTo(map); else kpl.remove(); }
  }, [mode, ready]);

  // Marker for the location set on the Now page, and centre on it the first time.
  const centred = useRef(false);
  useEffect(() => {
    const map = mapRef.current, L = LRef.current;
    if (!map || !L || !ready) return;
    layers.current.marker?.remove();
    if (!shownPlace) return;
    const label = shownPlace.isHome ? `${shownPlace.name.split(',')[0]} · Home` : shownPlace.name.split(',')[0];
    layers.current.marker = L.marker([shownPlace.lat, shownPlace.lon], {
      pane: 'labels', keyboard: false,
      icon: L.divIcon({ className: 'map-you', html: `<i class="map-pulse-ring"></i><b></b><span>${escapeHtml(label)}</span>`, iconSize: [0, 0] }),
    }).addTo(map);
    if (!centred.current) { centred.current = true; map.setView([shownPlace.lat, shownPlace.lon], 4); }
  }, [shownPlace, ready]);

  const seg = (m: Mode, label: string) => (
    <button type="button" className="btn" aria-pressed={mode === m} onClick={() => setMode(m)}
      style={{ flex: 1, padding: '10px 12px', borderRadius: 999, fontWeight: 700, fontSize: 14, background: mode === m ? '#3a3f3c' : 'transparent', color: mode === m ? '#fff' : C.soft, whiteSpace: 'nowrap' }}>
      {label}
    </button>
  );

  return (
    <main data-screen-label="Aurora map" style={{ display: 'flex', flexDirection: 'column' }}>
      <div className="wrap" style={{ width: '100%', padding: '16px var(--gutter)', display: 'flex', gap: 12, alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <h1 className="display" style={{ fontSize: 'clamp(28px, 7vw, 40px)', lineHeight: 1 }}>Aurora <span className="hl">map</span></h1>
        <div role="group" aria-label="Map layers" style={{ display: 'flex', padding: 4, border: '1px solid var(--line-2)', borderRadius: 999, background: '#111', flex: '1 1 320px', maxWidth: 460 }}>
          {seg('prob', 'Probability')}{seg('kp', 'Kp reach')}{seg('both', 'Both')}
        </div>
      </div>
      <div style={{ position: 'relative' }}>
        <div ref={box} className="aurora-map" role="application" aria-label="Zoomable aurora map. Drag to pan, scroll or pinch to zoom." />
        {status && <div className="map-status">{status}</div>}
        <details className="map-legend" ref={legend} open>
          <summary>Legend</summary>
          {mode !== 'kp' && (
            <div>
              <span className="label">AURORA PROBABILITY{forecast ? ` · ${hhmm(forecast)} UT` : ''}</span>
              <div style={{ height: 10, borderRadius: 5, margin: '6px 0 4px', background: `linear-gradient(90deg, ${STOPS.map(([t, c]) => `${rgb(c)} ${t * 100}%`).join(', ')})` }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: C.muted }}><span>5%</span><span>30%</span><span>60%</span><span>90%</span></div>
            </div>
          )}
          {mode !== 'prob' && (
            <div>
              <span className="label">KP REACH · EQUATORWARD EDGE</span>
              <div style={{ display: 'flex', gap: 4, marginTop: 6 }}>
                {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(k => (
                  <span key={k} style={{ flex: 1, textAlign: 'center', fontSize: 11, fontWeight: 700, padding: '3px 0', borderRadius: 4, color: '#000', background: rgb(ramp(kpT(k))), outline: k === current ? '2px solid #fff' : 'none' }}>{k}</span>
                ))}
              </div>
              <span style={{ display: 'block', fontSize: 11, color: C.muted, marginTop: 4 }}>{kp === null ? 'Current Kp unavailable' : `Now: Kp ${kp.toFixed(2)} (solid line)`}</span>
            </div>
          )}
        </details>
      </div>
    </main>
  );
}

/** Reference cities for orientation (lat, lon). */
const MAP_CITIES: [string, number, number][] = [
  ['Fairbanks', 64.84, -147.72], ['Anchorage', 61.22, -149.9], ['Yellowknife', 62.45, -114.37], ['Churchill', 58.77, -94.17],
  ['Edmonton', 53.55, -113.49], ['Winnipeg', 49.9, -97.14], ['Seattle', 47.61, -122.33], ['Minneapolis', 44.98, -93.27],
  ['Montreal', 45.5, -73.57], ['Chicago', 41.88, -87.63], ['Reykjavík', 64.15, -21.94], ['Tromsø', 69.65, 18.96],
  ['Oslo', 59.91, 10.75], ['Stockholm', 59.33, 18.07], ['Helsinki', 60.17, 24.94], ['Edinburgh', 55.95, -3.19], ['Rovaniemi', 66.5, 25.73],
];

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]!));
}
