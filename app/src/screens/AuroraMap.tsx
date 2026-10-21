'use client';

import 'leaflet/dist/leaflet.css';
import { startTransition, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type * as Leaflet from 'leaflet';
import type { Topology, GeometryCollection } from 'topojson-specification';
import { C } from '../data';
import { kpColor, kpLine, rgb } from '../lib/kpLines';
import { placeName, useLocations, type Place } from '../lib/locations';
import type { KpPoint } from '../lib/feeds';
import { MapPanel } from '../components/MapPanel';
import { BottomSheet } from '../components/BottomSheet';
import { TimeSlider } from '../components/TimeSlider';
import type { Frame } from '../lib/ovalFrames';
import { recentSightings, type Sighting } from '../lib/sightings';
import { bestCandidates, loadPlaces, spacingKm, thinPlaces, type BestPlace, type PlaceRow } from '../lib/bestPlaces';
import { cloudify } from '../lib/cloudify';
import { Globe } from '../components/Globe';
import { useOnline } from '../lib/useOnline';
import { SITE } from '../lib/site';
import { AURORA_RAMP, auroraColor } from '../lib/auroraColor';
import { sampleOval, smoothOval } from '../lib/ovalSmooth';
import { BEST_RGB, LIGHTS_URL, afterPaint, bestAlpha, bestScore, loadCloudGrid, nightShade, paintEquirect, paintMercator, readLayers, sunAltitudeAt, writeLayers, type CloudGrid, type LayerId, type Layers, DEFAULT_LAYERS } from '../lib/mapLayers';
import type { OvalGrid } from '../app/api/oval/route';
import { useI18n } from '../i18n/I18n';
import type { MessageKey } from '../i18n/core';

const LAT_MAX = 85;
/** Longitude offsets of the world copies drawn side by side for seamless wrapping. */
const COPIES = [-360, 0, 360];
const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;

/** Render the smoothed OVATION field into a Web-Mercator canvas so it lines up with Leaflet. */
function renderOval(field: Float32Array): string {
  const W = 1440;
  const yMax = Math.log(Math.tan(Math.PI / 4 + rad(LAT_MAX) / 2));
  const H = Math.round((W * 2 * yMax) / (2 * Math.PI));
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(W, H);
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
const NO_PLACES: Place[] = [];

export function AuroraMap({ kp, series }: { kp: number | null; series: KpPoint[] }) {
  const box = useRef<HTMLDivElement>(null);
  const mapRef = useRef<Leaflet.Map | null>(null);
  const layers = useRef<{ prob?: Leaflet.Layer; kp?: Leaflet.LayerGroup; marker?: Leaflet.Layer; pin?: Leaflet.Layer; clouds?: Leaflet.GridLayer; lights?: Leaflet.TileLayer; night?: Leaflet.Layer; best?: Leaflet.Layer; places?: Leaflet.Layer; saved?: Leaflet.Layer; sightings?: Leaflet.Layer }>({});
  // Smoothed OVATION field, kept for the best-spots layer.
  const oval = useRef<Float32Array | null>(null);
  const LRef = useRef<typeof Leaflet | null>(null);
  const cityMarkers = useRef<{ lat: number; lon: number; m: Leaflet.Marker }[]>([]);
  // Layers (shared by 2D and 3D), remembered on this device.
  const [on, setOn] = useState<Layers>(DEFAULT_LAYERS);
  useEffect(() => { setOn(readLayers()); }, []);
  const toggle = (id: LayerId) => setOn(prev => { const next = { ...prev, [id]: !prev[id] }; writeLayers(next); return next; });
  const { t, tn, num } = useI18n();
  // A point tapped on the map (2D or 3D); the panel shows its verdict. Named by coordinates until
  // reverse geocoding answers.
  const [pick, setPick] = useState<Place | null>(null);
  // Phones: the layers or map-view sheet opened from the panel.
  const [sheet, setSheet] = useState<null | 'layers' | 'view'>(null);
  const closeSheet = useCallback(() => setSheet(null), []);
  const pickAt = useRef<(lat: number, lon: number) => void>(() => {});
  pickAt.current = (lat, lon) => {
    lat = Math.round(lat * 1000) / 1000;
    lon = Math.round((((lon + 540) % 360) - 180) * 1000) / 1000;
    const coords = `${num(Math.abs(lat), 2)}°${t(lat >= 0 ? 'dir.N' : 'dir.S')} ${num(Math.abs(lon), 2)}°${t(lon >= 0 ? 'dir.E' : 'dir.W')}`;
    setPick({ name: coords, lat, lon });
    placeName(lat, lon).then(name => setPick(p => (p && p.lat === lat && p.lon === lon && !/°/.test(name) ? { ...p, name } : p)));
  };
  // Status and notice hold message keys; '' hides them.
  const [status, setStatus] = useState<MessageKey | ''>('map.loading');
  const [forecast, setForecast] = useState<number | null>(null);
  const [ready, setReady] = useState(false);
  // Time slider (#43): saved half-hourly frames from the last day, and which one is shown (frames.length = Live).
  const liveOval = useRef<{ url: string; forecast: number | null } | null>(null);
  const [frames, setFrames] = useState<Frame[]>([]);
  const [fi, setFi] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [frameBytes, setFrameBytes] = useState<Uint8Array | null>(null);
  useEffect(() => {
    fetch('/api/oval/frames').then(r => (r.ok ? r.json() : { frames: [] })).then((j: { frames: Frame[] }) => {
      // Drop a frame that is the live oval itself.
      const fs = j.frames.filter(f => f.forecast !== liveOval.current?.forecast);
      setFrames(fs); setFi(fs.length);
    }).catch(() => {});
  }, []);
  const frameCache = useRef(new Map<number, Promise<Uint8Array | null>>());
  const getBytes = (t: number) => {
    let p = frameCache.current.get(t);
    if (!p) {
      p = fetch(`/api/oval?t=${t}`).then(r => (r.ok ? r.json() : null)).then((g: OvalGrid | null) => (g ? Uint8Array.from(atob(g.data), ch => ch.charCodeAt(0)) : null)).catch(() => null);
      frameCache.current.set(t, p);
    }
    return p;
  };
  const urlCache = useRef(new Map<number, string>());
  useEffect(() => {
    const f = frames[fi];
    if (!f) { setFrameBytes(null); return; }
    let live = true;
    getBytes(f.forecast).then(b => { if (live) setFrameBytes(b); });
    if (playing && frames[fi + 1]) void getBytes(frames[fi + 1].forecast);
    return () => { live = false; };
  }, [fi, frames, playing]); // eslint-disable-line react-hooks/exhaustive-deps
  // 2D: swap the aurora image for the frame's (rendered once per frame and kept).
  useEffect(() => {
    const prob = layers.current.prob as Leaflet.LayerGroup | undefined;
    const f = frames[fi];
    if (!prob || !liveOval.current) return;
    const live = liveOval.current;
    return afterPaint(() => {
      let url = live.url;
      if (f && frameBytes) {
        url = urlCache.current.get(f.forecast) ?? renderOval(smoothOval(frameBytes));
        urlCache.current.set(f.forecast, url);
      }
      prob.eachLayer(l => (l as Leaflet.ImageOverlay).setUrl(url));
      setForecast(f ? f.forecast : live.forecast);
    });
  }, [frameBytes, ready]); // eslint-disable-line react-hooks/exhaustive-deps
  const [notice, setNotice] = useState<MessageKey | ''>('');
  // 2D map or 3D globe; the last choice is remembered on this device.
  const [view, setView] = useState<'2d' | '3d'>('2d');
  const [globeStatus, setGlobeStatus] = useState<MessageKey | ''>('globe.loading');
  useEffect(() => { try { if (localStorage.getItem(VIEW_KEY) === '3d') setView('3d'); } catch { /* storage unavailable */ } }, []);
  // The globe is built the first time it's shown and then kept (hidden on 2D), so later switches are instant.
  const [globeBuilt, setGlobeBuilt] = useState(false);
  if (view === '3d' && !globeBuilt) setGlobeBuilt(true);
  const chooseView = (v: '2d' | '3d') => {
    // A transition, so the button responds at once and the swap renders after.
    startTransition(() => setView(v));
    try { localStorage.setItem(VIEW_KEY, v); } catch { /* storage unavailable */ }
  };
  // Zooming the globe in past its imagery's resolution switches to the 2D map at the same place and
  // scale (not remembered: the globe stays the choice next time).
  const handOff = useRef<{ lat: number; lon: number; zoom: number } | null>(null);
  const zoomPast = useCallback((lat: number, lon: number, zoom: number) => {
    handOff.current = { lat, lon, zoom: Math.max(2, Math.min(9, Math.round(zoom * 2) / 2)) };
    setView('2d');
  }, []);
  // Leaflet measures its container, so it needs a nudge after being hidden.
  useEffect(() => {
    if (view !== '2d') return;
    setTimeout(() => {
      const map = mapRef.current;
      if (!map) return;
      map.invalidateSize();
      const h = handOff.current;
      if (h) { handOff.current = null; map.setView([h.lat, h.lon], h.zoom, { animate: false }); }
    }, 0);
  }, [view]);
  const { shownPlace, locations, load } = useLocations();
  const online = useOnline();
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
        // Half a zoom level per wheel notch (Leaflet's default is a whole level).
        wheelPxPerZoomLevel: 120,
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
      map.on('click', e => pickAt.current(e.latlng.lat, e.latlng.lng));
      map.on('zoomend', () => setZoom(map.getZoom()));
      map.createPane('land').style.zIndex = '200';
      // City lights brighten the land (screen blend), night shading darkens it, then clouds and aurora.
      const lightsPane = map.createPane('lights');
      lightsPane.style.zIndex = '250';
      lightsPane.style.mixBlendMode = 'screen';
      map.createPane('night').style.zIndex = '300';
      map.createPane('best').style.zIndex = '420';
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
      layers.current.lights = L.tileLayer(LIGHTS_URL, { pane: 'lights', maxNativeZoom: 8, opacity: 0.9, attribution: 'NASA Black Marble', crossOrigin: true });
      layers.current.clouds = new (CloudLayer as unknown as new (o: Leaflet.GridLayerOptions) => Leaflet.GridLayer)({ pane: 'clouds', maxNativeZoom: 6, attribution: 'EUMETSAT', updateWhenIdle: true });

      try {
        const res = await fetch('/api/oval');
        if (!res.ok) throw new Error();
        const grid = await res.json() as OvalGrid;
        const bytes = Uint8Array.from(atob(grid.data), ch => ch.charCodeAt(0));
        oval.current = smoothOval(bytes);
        const url = renderOval(oval.current);
        layers.current.prob = L.layerGroup(COPIES.map(dx => L.imageOverlay(url, [[-LAT_MAX, -180 + dx], [LAT_MAX, 180 + dx]], { pane: 'aurora', interactive: false })));
        liveOval.current = { url, forecast: grid.forecast };
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
    const { prob, kp: kpl, clouds, lights } = layers.current;
    const show = (layer: Leaflet.Layer | undefined, yes: boolean) => { if (layer) { if (yes) layer.addTo(map); else layer.remove(); } };
    show(prob, on.aurora); show(kpl, on.kp); show(clouds, on.clouds); show(lights, on.lights);
  }, [on.aurora, on.kp, on.clouds, on.lights, ready]);

  // Night shading and best spots depend on the time: redrawn every five minutes while shown.
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!on.night && !on.best) return;
    const id = setInterval(() => setTick(n => n + 1), 3e5);
    return () => clearInterval(id);
  }, [on.night, on.best]);
  const overlay = (url: string) => {
    const L = LRef.current!;
    return L.layerGroup(COPIES.map(dx => L.imageOverlay(url, [[-LAT_MAX, -180 + dx], [LAT_MAX, 180 + dx]], { pane: 'night', interactive: false })));
  };
  useEffect(() => {
    const map = mapRef.current;
    layers.current.night?.remove();
    layers.current.night = undefined;
    if (!map || !ready || !on.night || view !== '2d') return;
    // A smooth gradient, so half the width of the other overlays is plenty.
    return afterPaint(() => {
      const alt = sunAltitudeAt(Date.now());
      layers.current.night = overlay(paintMercator(360, LAT_MAX, (la, lo) => [2, 6, 18, 0.62 * nightShade(alt(la, lo))])).addTo(map);
    });
  }, [on.night, ready, tick, view]); // eslint-disable-line react-hooks/exhaustive-deps

  // Best spots: aurora × darkness × clear sky, painted for the 2D map and (as a texture) for the globe.
  const [cloudGrid, setCloudGrid] = useState<CloudGrid | null | undefined>(undefined);
  useEffect(() => { if (on.best && cloudGrid === undefined) loadCloudGrid().then(setCloudGrid); }, [on.best, cloudGrid]);
  const [bestGlobe, setBestGlobe] = useState<HTMLCanvasElement | null>(null);
  // Best places (named towns and cities, #54): the gazetteer, the places that qualify now, and the map zoom for spacing.
  const [places, setPlaces] = useState<PlaceRow[] | null>(null);
  useEffect(() => { if (on.best && !places) loadPlaces().then(setPlaces); }, [on.best, places]);
  const [cands, setCands] = useState<BestPlace[]>([]);
  const [zoom, setZoom] = useState(3);
  useEffect(() => {
    const map = mapRef.current, L = LRef.current;
    layers.current.best?.remove();
    layers.current.best = undefined;
    if (!on.best || !ready || !oval.current || cloudGrid === undefined) { setBestGlobe(null); setCands([]); return; }
    const field = oval.current;
    return afterPaint(() => {
      const score = bestScore(field, cloudGrid, Date.now());
      setCands(places ? bestCandidates(places, score) : []);
      const paint = (la: number, lo: number): [number, number, number, number] | null => {
        if (Math.abs(la) < 40) return null;
        const a = bestAlpha(score(la, lo));
        return a ? [...BEST_RGB, a] : null;
      };
      if (view === '3d') { setBestGlobe(paintEquirect(720, 360, paint)); return; }
      setBestGlobe(null);
      if (!map || !L) return;
      const url = paintMercator(720, LAT_MAX, paint);
      layers.current.best = L.layerGroup(COPIES.map(dx => L.imageOverlay(url, [[-LAT_MAX, -180 + dx], [LAT_MAX, 180 + dx]], { pane: 'best', interactive: false }))).addTo(map);
    });
  }, [on.best, ready, cloudGrid, tick, view, places]);

  // Best places on the 2D map: name labels, at most 12 on phones and 24 on larger screens, spaced for the zoom.
  const phone = typeof window !== 'undefined' && window.matchMedia('(max-width: 640px)').matches;
  const limit = phone ? 12 : 24;
  useEffect(() => {
    const map = mapRef.current, L = LRef.current;
    layers.current.places?.remove();
    layers.current.places = undefined;
    if (!map || !L || !ready || view !== '2d' || !cands.length) return;
    const shown = thinPlaces(cands, limit, spacingKm(zoom));
    layers.current.places = L.layerGroup(shown.flatMap(pl => COPIES.map(dx => L.marker([pl.lat, pl.lon + dx], {
      pane: 'labels', keyboard: false, bubblingMouseEvents: false,
      icon: L.divIcon({ className: 'map-best', html: `<b></b><span>${escapeHtml(pl.name)}</span>`, iconSize: [0, 0] }),
    }).on('click', () => setPick({ name: `${pl.name}, ${pl.country}`, lat: pl.lat, lon: pl.lon }))))).addTo(map);
  }, [cands, zoom, ready, view, limit]);
  const globePlaces = useMemo(() => (view === '3d' ? thinPlaces(cands, limit, 300) : []), [cands, limit, view]);

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

  // Pin for the tapped point.
  useEffect(() => {
    const map = mapRef.current, L = LRef.current;
    if (!map || !L || !ready) return;
    layers.current.pin?.remove();
    if (!pick) return;
    layers.current.pin = L.layerGroup(COPIES.map(dx => L.marker([pick.lat, pick.lon + dx], {
      pane: 'labels', keyboard: false, interactive: false,
      icon: L.divIcon({ className: 'map-pick', html: '<b></b>', iconSize: [0, 0] }),
    }))).addTo(map);
  }, [pick, ready]);

  // Sightings ("I saw it", #67) from the last 3 hours, refreshed every five minutes while shown.
  const [sightings, setSightings] = useState<Sighting[]>([]);
  useEffect(() => {
    if (!on.sightings) { setSightings([]); return; }
    let live = true;
    const load = () => recentSightings(3).then(s => { if (live) setSightings(s); });
    load();
    const id = setInterval(load, 3e5);
    return () => { live = false; clearInterval(id); };
  }, [on.sightings]);
  useEffect(() => {
    const map = mapRef.current, L = LRef.current;
    layers.current.sightings?.remove();
    layers.current.sightings = undefined;
    if (!map || !L || !ready || !sightings.length) return;
    layers.current.sightings = L.layerGroup(sightings.flatMap(s => COPIES.map(dx => L.marker([s.lat, s.lon + dx], {
      pane: 'labels', keyboard: false, interactive: false,
      icon: L.divIcon({ className: 'map-sight', html: '<b></b>', iconSize: [0, 0] }),
    })))).addTo(map);
  }, [sightings, ready]);
  const globeSightings = useMemo(() => sightings.map(s => ({ lat: s.lat, lon: s.lon })), [sightings]);

  // Saved locations (other than the one already marked): small dots with names; tap one for its verdict.
  // Memoised, so re-renders (e.g. a tap) don't make the globe rebuild its saved-spot dots.
  const others = useMemo(() => locations.filter(l => !shownPlace || Math.abs(l.lat - shownPlace.lat) > 0.01 || Math.abs(l.lon - shownPlace.lon) > 0.01), [locations, shownPlace]);
  useEffect(() => {
    const map = mapRef.current, L = LRef.current;
    layers.current.saved?.remove();
    if (!map || !L || !ready || !on.saved) return;
    layers.current.saved = L.layerGroup(others.flatMap(l => COPIES.map(dx => L.marker([l.lat, l.lon + dx], {
      pane: 'labels', keyboard: false, bubblingMouseEvents: false,
      icon: L.divIcon({ className: 'map-saved', html: `<b></b><span>${escapeHtml(l.name.split(',')[0])}</span>`, iconSize: [0, 0] }),
    }).on('click', () => setPick({ name: l.name, lat: l.lat, lon: l.lon }))))).addTo(map);
  }, [locations, shownPlace, on.saved, ready]); // eslint-disable-line react-hooks/exhaustive-deps
  const ICON: Record<LayerId | 'globe', string> = {
    aurora: 'M3 17c3-7 6-10 9-10s6 3 9 10M6 17c1.8-3.8 3.8-6 6-6s4.2 2.2 6 6',
    kp: 'M3 8c4-2 14-2 18 0M3 13c4-2 14-2 18 0M3 18c4-2 14-2 18 0',
    clouds: 'M7 18.5h10.5a4 4 0 0 0 .4-8A6 6 0 0 0 6.4 9.2 4.7 4.7 0 0 0 7 18.5Z',
    night: 'M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5Z',
    best: 'm12 3 2.6 5.6 6.1.7-4.5 4.2 1.2 6L12 16.6 6.6 19.5l1.2-6-4.5-4.2 6.1-.7L12 3Z',
    sightings: 'M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12Zm10 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z',
    saved: 'M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11Zm0-8.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z',
    lights: 'M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2V16h5v-.1c0-.8.4-1.5 1-2A6 6 0 0 0 12 3Z',
    globe: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm-9 9h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3Z',
  };
  const LABEL: Record<LayerId | 'globe', MessageKey> = {
    aurora: 'map.layer.aurora', kp: 'map.layer.kp', clouds: 'map.clouds', night: 'map.layer.night',
    best: 'map.layer.best', sightings: 'map.layer.sightings', saved: 'map.layer.saved', lights: 'map.layer.lights', globe: 'map.layer.globe',
  };
  const ORDER: (LayerId | 'globe')[] = ['aurora', 'clouds', 'night', 'best', 'sightings', 'kp', 'saved', 'lights', 'globe'];
  const pressed = (id: LayerId | 'globe') => (id === 'globe' ? view === '3d' : on[id]);
  const press = (id: LayerId | 'globe') => (id === 'globe' ? chooseView(view === '3d' ? '2d' : '3d') : toggle(id));
  const icon = (id: LayerId | 'globe', size: number) => (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true"><path d={ICON[id]} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
  );
  // Phones: two settings rows in the panel, each opening a sheet (layers with switches, flat map or globe).
  // Larger screens: a row of toggles above the map (2D/3D stays its own switch).
  const onNames = ORDER.filter(id => id !== 'globe' && pressed(id)).map(id => t(LABEL[id]));
  const layerTiles = (
    <div className="you-group-rows">
      <button type="button" className="btn you-row" aria-haspopup="dialog" onClick={() => setSheet('layers')}>
        <span className="you-row-label">{t('map.layers')}</span><span className="you-row-value">{onNames.length ? onNames.join(', ') : t('map.layersNone')}</span><Chevron />
      </button>
      <button type="button" className="btn you-row" aria-haspopup="dialog" onClick={() => setSheet('view')}>
        <span className="you-row-label">{t('map.view')}</span><span className="you-row-value">{t(view === '3d' ? 'map.layer.globe' : 'map.flat')}</span><Chevron />
      </button>
    </div>
  );
  const layerSheets = (
    <>
      {sheet === 'layers' && (
        <BottomSheet title={t('map.layers')} onClose={closeSheet}>
          <div className="you-group-rows">
            {ORDER.filter(id => id !== 'globe').map(id => (
              <button key={id} type="button" className="btn you-row map-layer-row" role="switch" aria-checked={!!pressed(id)} onClick={() => press(id)}>
                {icon(id, 22)}<span className="you-row-label">{t(LABEL[id])}</span>
                <span className={'switch' + (pressed(id) ? ' on' : '')} aria-hidden="true"><span className="switch-knob" /></span>
              </button>
            ))}
          </div>
        </BottomSheet>
      )}
      {sheet === 'view' && (
        <BottomSheet title={t('map.view')} onClose={closeSheet}>
          <div className="you-group-rows">
            {(['2d', '3d'] as const).map(v => (
              <button key={v} type="button" className="btn you-row map-layer-row" aria-pressed={view === v} onClick={() => { chooseView(v); closeSheet(); }}>
                {icon(v === '3d' ? 'globe' : 'aurora', 22)}<span className="you-row-label">{t(v === '3d' ? 'map.layer.globe' : 'map.flat')}</span>
                {view === v && <span style={{ color: 'var(--green)', display: 'flex' }}><svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg></span>}
              </button>
            ))}
          </div>
        </BottomSheet>
      )}
    </>
  );
  const layerRow = (
    <div className="map-toggles" role="group" aria-label={t('map.layers')}>
      {ORDER.filter(id => id !== 'globe').map(id => (
        // The label hides on narrower screens (icon only), so the name is also the button's accessible name and tooltip.
        <button key={id} type="button" className="btn map-toggle" aria-pressed={pressed(id)} onClick={() => press(id)} aria-label={t(LABEL[id])} title={t(LABEL[id])}>
          {icon(id, 15)}<span className="map-toggle-label">{t(LABEL[id])}</span>
        </button>
      ))}
    </div>
  );

  const timeSlider = <TimeSlider frames={frames} index={fi} onIndex={setFi} playing={playing} onPlaying={setPlaying} />;

  const legendBody = (
    <>
      {on.aurora && (
        <div>
          <span className="label">{t('map.legend.prob')}{forecast ? ` · ${hhmm(forecast)} UT` : ''}</span>
          <div style={{ height: 10, borderRadius: 5, margin: '6px 0 4px', background: AURORA_RAMP }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: C.muted }}><span>5%</span><span>30%</span><span>60%</span><span>90%</span></div>
        </div>
      )}
      {on.kp && (
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
      {on.clouds && (
        <div>
          <span className="label">{t('map.legend.clouds')}</span>
          <div style={{ height: 10, borderRadius: 5, margin: '6px 0 4px', background: 'linear-gradient(90deg, rgba(236,241,246,0), rgba(236,241,246,.82))', border: '1px solid var(--line-2)' }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: C.muted }}><span>{t('map.legend.clear')}</span><span>{t('map.legend.thick')}</span></div>
          <span style={{ display: 'block', fontSize: 11, color: C.muted, marginTop: 4 }}>{t('map.legend.cloudNote')}</span>
        </div>
      )}
      {on.night && (
        <div>
          <span className="label">{t('map.legend.night')}</span>
          <div style={{ height: 10, borderRadius: 5, margin: '6px 0 4px', background: 'linear-gradient(90deg, rgba(2,6,18,0), rgba(2,6,18,.62))', border: '1px solid var(--line-2)' }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: C.muted }}><span>{t('map.legend.day')}</span><span>{t('map.legend.twilight')}</span><span>{t('map.legend.dark')}</span></div>
        </div>
      )}
      {on.best && (
        <div>
          <span className="label">{t('map.layer.best')}</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
            <span style={{ width: 28, height: 10, borderRadius: 5, background: `rgba(${BEST_RGB.join(',')},.7)`, flex: 'none' }} />
            <span style={{ fontSize: 11, color: C.muted }}>{cloudGrid === null ? t('map.legend.bestNoCloud') : t('map.legend.best')}</span>
          </div>
          <span style={{ display: 'block', fontSize: 11, color: C.muted, marginTop: 4 }}>{cands.length ? t('map.legend.places') : t('map.legend.noPlaces')}</span>
        </div>
      )}
      {on.sightings && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="map-sight-key" aria-hidden="true" />
          <span style={{ fontSize: 11, color: C.muted }}>{sightings.length ? tn('map.legend.sightings', sightings.length) : t('map.legend.sightingsNone')}</span>
        </div>
      )}
      {on.lights && <span style={{ display: 'block', fontSize: 11, color: C.muted }}>{t('map.legend.lights')}</span>}
      {view === '3d' && on.night && on.lights && <span style={{ display: 'block', fontSize: 11, color: C.muted }}>{t('globe.legend')}</span>}
    </>
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
        {layerRow}
        {frames.length > 0 && <div className="map-head-time">{timeSlider}</div>}
      </div>
      <div style={{ position: 'relative' }}>
        {/* Phones have no header, so the map (and globe) carries the logo. */}
        <img className="map-logo" src="/icons/logo.svg" alt={SITE.name} width={56} height={43} />
        <div ref={box} className="aurora-map" role="application" aria-label={t('map.aria')} style={view === '3d' ? { display: 'none' } : undefined} />
        {globeBuilt && <Globe active={view === '3d'} clouds={on.clouds} night={on.night} lights={on.lights} best={bestGlobe} saved={on.saved ? others : NO_PLACES} places={globePlaces} sightings={globeSightings} aurora={on.aurora} kpLines={on.kp} kp={kp} place={shownPlace} home={locations.find(l => l.isHome) ?? null}
          frame={frames[fi] ? frameBytes : null} pick={pick} onPick={(la, lo, name) => (name ? setPick({ name, lat: la, lon: lo }) : pickAt.current(la, lo))} onStatus={setGlobeStatus} onForecast={setForecast} onZoomPast={zoomPast} />}
        {view === '2d' && (notice || status) && <div className="map-status" role="status">{t((notice || status) as MessageKey)}</div>}
        {view === '3d' && globeStatus && <div className="map-status" role="status">{t(globeStatus)}</div>}
        {!online && !(view === '2d' ? notice || status : globeStatus) && <div className="map-status" role="status">{t('map.offline')}</div>}
        <details className="map-legend" ref={legend} open>
          <summary>{t('map.legend')}</summary>
          {legendBody}
        </details>
        <MapPanel kp={kp} series={series} pick={pick} onClear={() => setPick(null)} layers={layerTiles} slider={frames.length > 0 ? timeSlider : null}
          legend={<div className="map-panel-section map-panel-legend"><span className="label">{t('map.legend')}</span>{legendBody}</div>} />
        {layerSheets}
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

const Chevron = () => (
  <span className="you-chevron"><svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M9 6l6 6-6 6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg></span>
);
