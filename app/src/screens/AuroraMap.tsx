'use client';

import 'leaflet/dist/leaflet.css';
import { useEffect, useRef, useState } from 'react';
import type * as Leaflet from 'leaflet';
import type { Topology, GeometryCollection } from 'topojson-specification';
import { C } from '../data';
import { kpColor, kpLine, rgb } from '../lib/kpLines';
import { useLocations } from '../lib/locations';
import { cloudify } from '../lib/cloudify';
import { Globe } from '../components/Globe';
import { AURORA_RAMP, auroraColor } from '../lib/auroraColor';
import { sampleOval, smoothOval } from '../lib/ovalSmooth';
import type { OvalGrid } from '../app/api/oval/route';
import { SITE } from '../lib/site';
import { useI18n } from '../i18n/I18n';
import type { MessageKey } from '../i18n/core';

type Mode = 'prob' | 'kp' | 'both';

const LAT_MAX = 85;
/** Longitude offsets of the world copies drawn side by side for seamless wrapping. */
const COPIES = [-360, 0, 360];
const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;

/** Render the smoothed OVATION field into a Web-Mercator canvas so it lines up with Leaflet. */
function renderOval(grid: Uint8Array): string {
  const W = 1440;
  const yMax = Math.log(Math.tan(Math.PI / 4 + rad(LAT_MAX) / 2));
  const H = Math.round((W * 2 * yMax) / (2 * Math.PI));
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(W, H);
  const field = smoothOval(grid);
  for (let py = 0; py < H; py++) {
    const y = yMax - ((py + 0.5) / H) * 2 * yMax;
    const lat = deg(2 * Math.atan(Math.exp(y)) - Math.PI / 2);
    if (Math.abs(lat) < 30) continue; // OVATION never reaches this far from the poles
    for (let px = 0; px < W; px++) {
      const p = sampleOval(field, lat, -180 + ((px + 0.5) / W) * 360);
      if (p < 1.5) continue;
      // Same colour scale as the globe: the colour at an opacity that grows with probability.
      const { rgb: [r, g, b], alpha } = auroraColor(p);
      if (alpha < 0.01) continue;
      const o = (py * W + px) * 4;
      img.data[o] = r; img.data[o + 1] = g; img.data[o + 2] = b; img.data[o + 3] = Math.round(255 * alpha);
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas.toDataURL('image/png');
}

const hhmm = (t: number) => new Date(t).toISOString().slice(11, 16);

/** Imagery refreshes hourly; a 15-minute stamp keeps tiles current without refetching on every visit. */
const cloudStamp = () => Math.floor(Date.now() / 9e5);

const HOUSE = '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M3 11.5 12 4l9 7.5M5.5 9.5V20h5v-6h3v6h5V9.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/></svg>';

const VIEW_KEY = 'pl.map.view';

export function AuroraMap({ kp }: { kp: number | null }) {
  const box = useRef<HTMLDivElement>(null);
  const mapRef = useRef<Leaflet.Map | null>(null);
  const layers = useRef<{ prob?: Leaflet.Layer; kp?: Leaflet.LayerGroup; marker?: Leaflet.Layer; clouds?: Leaflet.GridLayer }>({});
  const LRef = useRef<typeof Leaflet | null>(null);
  const cityMarkers = useRef<{ lat: number; lon: number; m: Leaflet.Marker }[]>([]);
  const [mode, setMode] = useState<Mode>('prob');
  // Phone layers menu: closes on Escape or a tap outside it.
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!menuOpen) return;
    const away = (e: PointerEvent) => { if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenuOpen(false); };
    document.addEventListener('pointerdown', away);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('pointerdown', away); document.removeEventListener('keydown', esc); };
  }, [menuOpen]);
  const { t, num } = useI18n();
  // Status and notice hold message keys; '' hides them.
  const [status, setStatus] = useState<MessageKey | ''>('map.loading');
  const [forecast, setForecast] = useState<number | null>(null);
  const [ready, setReady] = useState(false);
  const [clouds, setClouds] = useState(false);
  const [notice, setNotice] = useState<MessageKey | ''>('');
  // 2D map or 3D globe; the last choice is remembered on this device.
  const [view, setView] = useState<'2d' | '3d'>('2d');
  const [globeStatus, setGlobeStatus] = useState<MessageKey | ''>('globe.loading');
  useEffect(() => { try { if (localStorage.getItem(VIEW_KEY) === '3d') setView('3d'); } catch { /* storage unavailable */ } }, []);
  const chooseView = (v: '2d' | '3d') => {
    setView(v);
    try { localStorage.setItem(VIEW_KEY, v); } catch { /* storage unavailable */ }
  };
  // Leaflet measures its container, so it needs a nudge after being hidden.
  useEffect(() => { if (view === '2d') setTimeout(() => mapRef.current?.invalidateSize(), 0); }, [view]);
  const { shownPlace, locations, load } = useLocations();
  const current = kp === null ? null : Math.max(1, Math.min(9, Math.round(kp)));

  useEffect(() => { load(); }, [load]);
  // Start with the legend collapsed on phones so it doesn't cover the map.
  const legend = useRef<HTMLDetailsElement>(null);
  useEffect(() => { if (legend.current && window.matchMedia('(max-width: 640px)').matches) legend.current.open = false; }, []);

  // The Home button reads the latest saved locations through this ref.
  const goHome = useRef<() => void>(() => {});
  const noticeTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  goHome.current = () => {
    const map = mapRef.current;
    if (!map) return;
    const home = locations.find(l => l.isHome);
    clearTimeout(noticeTimer.current);
    if (!home) {
      setNotice('map.noHome');
      noticeTimer.current = setTimeout(() => setNotice(''), 4000);
      return;
    }
    setNotice('');
    // Fly to the copy of Home nearest the current view, so the map doesn't sweep across the world.
    const lon = home.lon + 360 * Math.round((map.getCenter().lng - home.lon) / 360);
    map.flyTo([home.lat, lon], Math.max(map.getZoom(), 6), { duration: 1.2 });
  };
  useEffect(() => () => clearTimeout(noticeTimer.current), []);

  // Build the map once.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const L = (await import('leaflet')).default;
      const topo = await import('topojson-client');
      if (cancelled || !box.current || mapRef.current) return;
      LRef.current = L;
      const map = L.map(box.current, {
        // worldCopyJump recentres the view when it crosses ±180°; every layer is drawn
        // three times (COPIES) so panning left or right is seamless.
        minZoom: 2, maxZoom: 9, zoomSnap: 0.5, worldCopyJump: true,
        maxBounds: [[-LAT_MAX, -1e5], [LAT_MAX, 1e5]], maxBoundsViscosity: 1, attributionControl: true,
      }).setView([58, -95], 3);
      mapRef.current = map;
      map.attributionControl.setPrefix(false);
      map.attributionControl.addAttribution('Natural Earth · NOAA SWPC OVATION');
      const HomeControl = L.Control.extend({
        onAdd() {
          const bar = L.DomUtil.create('div', 'leaflet-bar leaflet-control map-home');
          const a = L.DomUtil.create('a', '', bar);
          a.href = '#'; a.innerHTML = HOUSE; a.title = t('map.zoomHome');
          a.setAttribute('role', 'button'); a.setAttribute('aria-label', t('map.zoomHome'));
          L.DomEvent.disableClickPropagation(bar);
          L.DomEvent.on(a, 'click', e => { L.DomEvent.preventDefault(e); goHome.current(); });
          return bar;
        },
      });
      new HomeControl({ position: 'topleft' }).addTo(map);
      map.createPane('land').style.zIndex = '200';
      // Clouds sit above the land and below the aurora, so the aurora colours stay readable.
      map.createPane('clouds').style.zIndex = '350';
      map.createPane('aurora').style.zIndex = '400';
      map.createPane('kplines').style.zIndex = '450';
      map.createPane('labels').style.zIndex = '500';
      // Canvas keeps three copies of the basemap fast on phones.
      const landCanvas = L.canvas({ pane: 'land', padding: 0.5 });
      // GeoJSON layers forward `renderer` to each shape; Leaflet's typings just don't list it.
      const onCanvas: object = { renderer: landCanvas };

      try {
        const world = await (await fetch('/geo/countries-50m.json')).json() as Topology<{ countries: GeometryCollection }>;
        const land = fixPolygons(topo.feature(world, world.objects.countries) as unknown as GeoJSON.FeatureCollection);
        const borders = fixLines(topo.mesh(world, world.objects.countries, (a, b) => a !== b) as GeoJSON.MultiLineString);
        L.geoJSON(repeat(land) as never, { pane: 'land', ...onCanvas, interactive: false, style: { stroke: false, fillColor: '#2b2e2c', fillOpacity: 1 } }).addTo(map);
        // Lakes (Natural Earth 1:50m) are filled like the sea, then borders go on top.
        try {
          const lakes = await (await fetch('/geo/lakes-50m.geo.json')).json() as GeoJSON.FeatureCollection;
          L.geoJSON(repeatCollection(lakes) as never, { pane: 'land', ...onCanvas, interactive: false, style: { stroke: false, fillColor: '#000', fillOpacity: 1 } }).addTo(map);
        } catch { /* lakes are optional */ }
        L.geoJSON(repeat(borders) as never, { pane: 'land', ...onCanvas, interactive: false, style: { color: '#4a504c', weight: 0.7, fill: false } }).addTo(map);
      } catch { setStatus('map.basemapFailed'); }

      L.polyline([[66.563, -540], [66.563, 540]], { pane: 'land', renderer: landCanvas, color: C.muted, weight: 1, dashArray: '6 6', interactive: false }).addTo(map);
      for (const dx of COPIES) {
        L.marker([66.563, -30 + dx], { pane: 'labels', interactive: false, keyboard: false, icon: L.divIcon({ className: 'map-label map-label-dim', html: escapeHtml(t('map.arcticCircle')), iconSize: undefined }) }).addTo(map);
        for (const [name, lat, lon] of MAP_CITIES) {
          const m = L.marker([lat, lon + dx], { pane: 'labels', interactive: false, keyboard: false, icon: L.divIcon({ className: 'map-city', html: `<i></i><span>${name}</span>`, iconSize: undefined }) }).addTo(map);
          cityMarkers.current.push({ lat, lon, m });
        }
      }

      // Kp reach lines (both hemispheres), coloured on the same scale.
      const group = L.layerGroup();
      for (let k = 1; k <= 9; k++) {
        const on = k === current;
        const style = { pane: 'kplines', color: rgb(kpColor(k)), weight: on ? 3 : 1.4, opacity: on ? 1 : 0.75, dashArray: on ? undefined : '3 5', interactive: false };
        const north = kpLine(k), south = kpLine(k, true);
        const label = north.find(p => p[1] === -60);
        for (const dx of COPIES) {
          L.polyline(north.map(([la, lo]) => [la, lo + dx] as [number, number]), style).addTo(group);
          L.polyline(south.map(([la, lo]) => [la, lo + dx] as [number, number]), style).addTo(group);
          if (label) L.marker([label[0], label[1] + dx], { pane: 'labels', interactive: false, keyboard: false, icon: L.divIcon({ className: on ? 'map-kp map-kp-on' : 'map-kp', html: `<span style="color:${rgb(kpColor(k))}">Kp ${k}</span>`, iconSize: undefined }) }).addTo(group);
        }
      }
      layers.current.kp = group;

      // GridLayer wraps tile columns itself, so clouds repeat across every world copy.
      const CloudLayer = L.GridLayer.extend({
        createTile(coords: Leaflet.Coords, done: Leaflet.DoneCallback) {
          const tile = document.createElement('canvas');
          tile.width = tile.height = 256;
          const img = new Image();
          img.onload = () => { try { cloudify(img, tile); done(undefined, tile); } catch (e) { done(e as Error, tile); } };
          img.onerror = () => done(new Error('cloud tile'), tile);
          img.src = `/api/clouds?z=${coords.z}&x=${coords.x}&y=${coords.y}&t=${cloudStamp()}`;
          return tile;
        },
      });
      layers.current.clouds = new (CloudLayer as unknown as new (o: Leaflet.GridLayerOptions) => Leaflet.GridLayer)({ pane: 'clouds', maxNativeZoom: 6, attribution: 'EUMETSAT', updateWhenIdle: true });

      try {
        const res = await fetch('/api/oval');
        if (!res.ok) throw new Error();
        const grid = await res.json() as OvalGrid;
        const bytes = Uint8Array.from(atob(grid.data), ch => ch.charCodeAt(0));
        const url = renderOval(bytes);
        layers.current.prob = L.layerGroup(COPIES.map(dx => L.imageOverlay(url, [[-LAT_MAX, -180 + dx], [LAT_MAX, 180 + dx]], { pane: 'aurora', interactive: false })));
        setForecast(grid.forecast);
        setStatus('');
      } catch { setStatus('map.auroraUnavailable'); }
      if (!cancelled) setReady(true);
    })();
    return () => { cancelled = true; mapRef.current?.remove(); mapRef.current = null; cityMarkers.current = []; };
  }, [current]); // eslint-disable-line react-hooks/exhaustive-deps -- t is fixed for the page's lifetime

  // Show the chosen layers.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const { prob, kp: kpl } = layers.current;
    if (prob) { if (mode !== 'kp') prob.addTo(map); else prob.remove(); }
    if (kpl) { if (mode !== 'prob') kpl.addTo(map); else kpl.remove(); }
  }, [mode, ready]);

  useEffect(() => {
    const map = mapRef.current, layer = layers.current.clouds;
    if (!map || !ready || !layer) return;
    if (clouds) layer.addTo(map); else layer.remove();
  }, [clouds, ready]);

  // Marker for the location set on the Now page, and centre on it the first time.
  const centred = useRef(false);
  useEffect(() => {
    const map = mapRef.current, L = LRef.current;
    if (!map || !L || !ready) return;
    layers.current.marker?.remove();
    // Hide reference-city labels that would sit under the chosen place's own label.
    for (const c of cityMarkers.current) {
      const near = !!shownPlace && Math.abs(c.lat - shownPlace.lat) < 0.8 && Math.abs(((c.lon - shownPlace.lon + 540) % 360) - 180) < 1.6;
      c.m.setOpacity(near ? 0 : 1);
    }
    if (!shownPlace) return;
    const label = shownPlace.isHome ? t('map.placeHome', { place: shownPlace.name.split(',')[0] }) : shownPlace.name.split(',')[0];
    layers.current.marker = L.layerGroup(COPIES.map(dx => L.marker([shownPlace.lat, shownPlace.lon + dx], {
      pane: 'labels', keyboard: false,
      icon: L.divIcon({ className: 'map-you', html: `<i class="map-pulse-ring"></i><b></b><span>${escapeHtml(label)}</span>`, iconSize: [0, 0] }),
    }))).addTo(map);
    if (!centred.current) { centred.current = true; map.setView([shownPlace.lat, shownPlace.lon], 4); }
  }, [shownPlace, ready]); // eslint-disable-line react-hooks/exhaustive-deps

  const seg = (m: Mode, label: string) => (
    <button type="button" className="btn" aria-pressed={mode === m} onClick={() => setMode(m)}
      style={{ flex: 1, padding: '10px 8px', borderRadius: 999, fontWeight: 700, fontSize: 14, background: mode === m ? '#3a3f3c' : 'transparent', color: mode === m ? '#fff' : C.soft, whiteSpace: 'nowrap' }}>
      {label}
    </button>
  );

  return (
    <main data-screen-label="Aurora map" style={{ display: 'flex', flexDirection: 'column' }}>
      {/* On phones this row is hidden (the title stays for screen readers) and the layers menu on the map takes over. */}
      <div className="wrap map-head" style={{ width: '100%', padding: '16px var(--gutter)', display: 'flex', gap: 12, alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <h1 className="display" style={{ fontSize: 'clamp(28px, 7vw, 40px)', lineHeight: 1 }}>{t('map.h1a')} <span className="hl">{t('map.h1b')}</span></h1>
          <div role="group" aria-label={t('map.view')} style={{ display: 'flex', padding: 3, border: '1px solid var(--line-2)', borderRadius: 999, background: '#111', flex: 'none' }}>
            {(['2d', '3d'] as const).map(v => (
              <button key={v} type="button" className="btn mono" aria-pressed={view === v} onClick={() => chooseView(v)}
                style={{ minWidth: 44, padding: '7px 11px', borderRadius: 999, fontWeight: 700, fontSize: 13, background: view === v ? '#fff' : 'transparent', color: view === v ? '#000' : C.soft }}>
                {v.toUpperCase()}
              </button>
            ))}
          </div>
        </div>
        <div role="group" aria-label={t('map.layers')} style={{ display: 'flex', alignItems: 'center', padding: 4, border: '1px solid var(--line-2)', borderRadius: 999, background: '#111', flex: '1 1 340px', maxWidth: 560 }}>
          {seg('prob', t('map.mode.prob'))}{seg('kp', t('map.mode.kp'))}{seg('both', t('map.mode.both'))}
          <span aria-hidden="true" style={{ width: 1, height: 22, background: 'var(--line-2)', margin: '0 4px', flex: 'none' }} />
          {/* Clouds is an overlay that combines with any of the views above, so it toggles on its own. */}
          <button type="button" className="btn" aria-pressed={clouds} onClick={() => setClouds(on => !on)}
            style={{ flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 5, padding: '10px 8px', borderRadius: 999, fontWeight: 700, fontSize: 14, background: clouds ? '#3a3f3c' : 'transparent', color: clouds ? '#fff' : C.soft, whiteSpace: 'nowrap' }}>
            <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true"><path d="M7 18.5h10.5a4 4 0 0 0 .4-8A6 6 0 0 0 6.4 9.2 4.7 4.7 0 0 0 7 18.5Z" fill={clouds ? '#fff' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinejoin="round" /></svg>
            {t('map.clouds')}
          </button>
        </div>
      </div>
      <div style={{ position: 'relative' }}>
        {/* Phones have no header, so the map carries the logo. */}
        <img className="map-logo" src="/icons/logo.svg" alt={SITE.name} width={56} height={43} />
        <div className="map-menu" ref={menuRef}>
          <button type="button" className="btn map-menu-btn" aria-expanded={menuOpen} aria-controls="map-menu" onClick={() => setMenuOpen(o => !o)}>
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="m12 3 9 5-9 5-9-5 9-5Zm-9 9 9 5 9-5M3 16l9 5 9-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" /></svg>
            {t('map.layersButton')}
          </button>
          {menuOpen && (
            <div id="map-menu" className="map-menu-panel" role="group" aria-label={t('map.layers')}>
              <fieldset>
                <legend>{t('map.view')}</legend>
                {(['2d', '3d'] as const).map(v => (
                  <label key={v}><input type="radio" name="map-view" checked={view === v} onChange={() => chooseView(v)} /><span>{v.toUpperCase()}</span></label>
                ))}
              </fieldset>
              <fieldset>
                <legend>{t('map.aurora')}</legend>
                {([['prob', 'map.mode.prob'], ['kp', 'map.mode.kp'], ['both', 'map.mode.both']] as const).map(([m, key]) => (
                  <label key={m}><input type="radio" name="map-mode" checked={mode === m} onChange={() => setMode(m)} /><span>{t(key)}</span></label>
                ))}
              </fieldset>
              <fieldset>
                <legend>{t('map.overlays')}</legend>
                <label><input type="checkbox" checked={clouds} onChange={e => setClouds(e.target.checked)} /><span>{t('map.clouds')}</span></label>
              </fieldset>
            </div>
          )}
        </div>
        <div ref={box} className="aurora-map" role="application" aria-label={t('map.aria')} style={view === '3d' ? { display: 'none' } : undefined} />
        {view === '3d' && <Globe clouds={clouds} aurora={mode !== 'kp'} kpLines={mode !== 'prob'} kp={kp} place={shownPlace} home={locations.find(l => l.isHome) ?? null} onStatus={setGlobeStatus} onForecast={setForecast} />}
        {view === '2d' && (notice || status) && <div className="map-status" role="status">{t((notice || status) as MessageKey)}</div>}
        {view === '3d' && globeStatus && <div className="map-status" role="status">{t(globeStatus)}</div>}
        <details className="map-legend" ref={legend} open>
          <summary>{t('map.legend')}</summary>
          {mode !== 'kp' && (
            <div>
              <span className="label">{t('map.legend.prob')}{forecast ? ` · ${hhmm(forecast)} UT` : ''}</span>
              <div style={{ height: 10, borderRadius: 5, margin: '6px 0 4px', background: AURORA_RAMP }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: C.muted }}><span>5%</span><span>30%</span><span>60%</span><span>90%</span></div>
            </div>
          )}
          {mode !== 'prob' && (
            <div>
              <span className="label">{t('map.legend.kp')}</span>
              <div style={{ display: 'flex', gap: 4, marginTop: 6 }}>
                {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(k => (
                  <span key={k} style={{ flex: 1, textAlign: 'center', fontSize: 11, fontWeight: 700, padding: '3px 0', borderRadius: 4, color: '#000', background: rgb(kpColor(k)), outline: k === current ? '2px solid #fff' : 'none' }}>{k}</span>
                ))}
              </div>
              <span style={{ display: 'block', fontSize: 11, color: C.muted, marginTop: 4 }}>{kp === null ? t('map.legend.kpUnavailable') : t('map.legend.kpNow', { kp: num(kp, 2) })}</span>
            </div>
          )}
          {clouds && (
            <div>
              <span className="label">{t('map.legend.clouds')}</span>
              <div style={{ height: 10, borderRadius: 5, margin: '6px 0 4px', background: 'linear-gradient(90deg, rgba(236,241,246,0), rgba(236,241,246,.82))', border: '1px solid var(--line-2)' }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: C.muted }}><span>{t('map.legend.clear')}</span><span>{t('map.legend.thick')}</span></div>
              <span style={{ display: 'block', fontSize: 11, color: C.muted, marginTop: 4 }}>{t('map.legend.cloudNote')}</span>
            </div>
          )}
          {view === '3d' && <span style={{ display: 'block', fontSize: 11, color: C.muted }}>{t('globe.legend')}</span>}
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

// ---------------------------------------------------------------------------
// Leaflet draws a straight edge between +180° and −180°, so rings that cross the
// antimeridian (Russia's far east, Fiji, Antarctica) would streak across the map.
// Unwrap their longitudes and add a copy shifted by 360° for the part off the edge.

function unwrap(ring: GeoJSON.Position[]): GeoJSON.Position[] {
  const out: GeoJSON.Position[] = [];
  let shift = 0;
  ring.forEach((pt, i) => {
    if (i) {
      const d = pt[0] + shift - out[i - 1][0];
      if (d > 180) shift -= 360; else if (d < -180) shift += 360;
    }
    out.push([pt[0] + shift, pt[1]]);
  });
  return out;
}

function fixPolygons(fc: GeoJSON.FeatureCollection): GeoJSON.MultiPolygon {
  const polys: GeoJSON.Position[][][] = [];
  const add = (poly: GeoJSON.Position[][]) => {
    const rings = poly.map(unwrap);
    const lons = rings[0].map(p => p[0]);
    const min = Math.min(...lons), max = Math.max(...lons);
    // Antarctica wraps the whole globe; close it along the bottom edge instead.
    if (max - min >= 359) {
      const r = rings[0];
      polys.push([[...r, [r[r.length - 1][0], -90], [r[0][0], -90], r[0]]]);
      return;
    }
    polys.push(rings);
    if (max > 180) polys.push(rings.map(r => r.map(p => [p[0] - 360, p[1]])));
    if (min < -180) polys.push(rings.map(r => r.map(p => [p[0] + 360, p[1]])));
  };
  for (const f of fc.features) {
    const g = f.geometry;
    if (g?.type === 'Polygon') add(g.coordinates);
    else if (g?.type === 'MultiPolygon') g.coordinates.forEach(add);
  }
  return { type: 'MultiPolygon', coordinates: polys };
}

function fixLines(ml: GeoJSON.MultiLineString): GeoJSON.MultiLineString {
  const out: GeoJSON.Position[][] = [];
  for (const line of ml.coordinates) {
    let cur: GeoJSON.Position[] = [];
    line.forEach((pt, i) => {
      if (i && Math.abs(pt[0] - line[i - 1][0]) > 180) { if (cur.length > 1) out.push(cur); cur = []; }
      cur.push(pt);
    });
    if (cur.length > 1) out.push(cur);
  }
  return { type: 'MultiLineString', coordinates: out };
}

/** Copies of a geometry shifted by each world offset. */
function shiftPos(c: unknown, dx: number): unknown {
  return typeof (c as number[])[0] === 'number' ? [(c as number[])[0] + dx, (c as number[])[1]] : (c as unknown[]).map(x => shiftPos(x, dx));
}
function repeat(g: GeoJSON.MultiPolygon | GeoJSON.MultiLineString): GeoJSON.FeatureCollection {
  return { type: 'FeatureCollection', features: COPIES.map(dx => ({ type: 'Feature', properties: {}, geometry: { ...g, coordinates: shiftPos(g.coordinates, dx) } as GeoJSON.Geometry })) };
}
function repeatCollection(fc: GeoJSON.FeatureCollection): GeoJSON.FeatureCollection {
  return { type: 'FeatureCollection', features: COPIES.flatMap(dx => fc.features.map(f => ({ ...f, geometry: { ...f.geometry, coordinates: shiftPos((f.geometry as GeoJSON.Polygon).coordinates, dx) } as GeoJSON.Geometry }))) };
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]!));
}
