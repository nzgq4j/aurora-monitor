'use client';

import { useEffect, useRef, useState } from 'react';
import type * as THREE from 'three';
import { subsolarPoint } from '../lib/astro';
import { cloudify } from '../lib/cloudify';
import { createTileLayer } from '../lib/globeTiles';
import { kpColor, kpLine } from '../lib/kpLines';
import { OVAL_H, OVAL_W, smoothOval } from '../lib/ovalSmooth';
import type { Place } from '../lib/locations';
import type { OvalGrid } from '../app/api/oval/route';
import { useI18n } from '../i18n/I18n';
import type { MessageKey } from '../i18n/core';

const HOUSE = '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M3 11.5 12 4l9 7.5M5.5 9.5V20h5v-6h3v6h5V9.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/></svg>';

/** Shell radii (Earth = 1): Kp lines on the ground, clouds just above, the aurora above them. */
const R = { kpLines: 1.003, clouds: 1.006, aurora: 1.014, auroraGlow: 1.03, marker: 1.016 };
/** Radius the opening framing is measured against (a little beyond the ground). */
const FRAME_R = 1.15;
/**
 * Opening camera distance for this aspect ratio: close enough that the globe fills the view
 * (its edges just outside it), so the aurora zone is large; zoom out to see the whole Earth.
 */
function fitDistance(fovDeg: number, aspect: number) {
  const half = Math.min(fovDeg / 2, (Math.atan(Math.tan(((fovDeg / 2) * Math.PI) / 180) * aspect) * 180) / Math.PI);
  // Portrait screens (phones) open closer still, so the aurora zone fills the width.
  return (FRAME_R / Math.sin((half * Math.PI) / 180)) * (aspect < 1 ? 0.55 : 0.72);
}

/**
 * Point on a sphere matching three.js SphereGeometry's UV layout, so equirectangular textures
 * (u = 0 at 180° W) line up with these coordinates.
 */
function toVector(T: typeof THREE, lat: number, lon: number, r = 1) {
  const theta = ((90 - lat) * Math.PI) / 180, phi = ((lon + 180) * Math.PI) / 180;
  return new T.Vector3(-Math.cos(phi) * Math.sin(theta) * r, Math.cos(theta) * r, Math.sin(phi) * Math.sin(theta) * r);
}

/** Latitude the camera looks from for a place: well towards the equator, but on the place's side of it. */
const viewLat = (lat: number) => Math.max(-48, Math.min(48, lat * 0.72));

/**
 * The smoothed OVATION field as a texture, stored as 0–255 for 0–100 % so the edge of the oval
 * doesn't step through few grey levels.
 */
function ovalTexture(T: typeof THREE, grid: Uint8Array) {
  const W = OVAL_W, H = OVAL_H;
  const cur = smoothOval(grid);
  const data = Uint8Array.from(cur, v => Math.round(Math.min(100, v) * 2.55));
  const tex = new T.DataTexture(data, W, H, T.RedFormat, T.UnsignedByteType);
  tex.magFilter = T.LinearFilter;
  tex.minFilter = T.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.wrapS = T.RepeatWrapping;
  tex.needsUpdate = true;
  return tex;
}

const VERT = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vNormal;
  void main() {
    vUv = uv;
    vNormal = normalize(mat3(modelMatrix) * normal);
    vec4 world = modelMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * viewMatrix * world;
  }`;

// Day imagery lit by the Sun, city lights on a dark night side, a soft twilight band between.
// Textures are sRGB and decoded to linear when sampled, so each shader ends by converting back
// (colorspace_fragment); without it everything renders far too dark.
const EARTH_FRAG = /* glsl */ `
  uniform sampler2D dayMap;
  uniform sampler2D nightMap;
  uniform vec3 sunDir;
  // x: night shading on (else daylight everywhere); y: city lights on the night side (else dim ground).
  uniform vec2 shade;
  // Part of each image this surface shows (offset xy, size zw): the whole image for the Earth,
  // a sub-rectangle for zoom tiles (see lib/globeTiles).
  uniform vec4 dayRect;
  uniform vec4 nightRect;
  varying vec2 vUv;
  varying vec3 vNormal;
  void main() {
    float d = dot(normalize(vNormal), sunDir);
    float day = mix(1.0, smoothstep(-0.1, 0.1, d), shade.x);
    vec3 tex = texture2D(dayMap, dayRect.xy + vUv * dayRect.zw).rgb;
    vec3 dayCol = tex * mix(1.05, 0.75 + 0.6 * max(d, 0.0), shade.x);
    vec3 lights = texture2D(nightMap, nightRect.xy + vUv * nightRect.zw).rgb * vec3(1.1, 0.95, 0.75);
    vec3 nightCol = mix(tex * 0.16, lights + tex * 0.07, shade.y);
    gl_FragColor = vec4(mix(nightCol, dayCol, day), 1.0);
    #include <colorspace_fragment>
  }`;

// OVATION probability (0–100 %) as aurora light: green, through yellow, to red at the strongest.
// Dimmer on the day side, where it can't be seen.
const AURORA_FRAG = /* glsl */ `
  uniform sampler2D oval;
  uniform vec3 sunDir;
  uniform float strength;
  varying vec2 vUv;
  varying vec3 vNormal;
  void main() {
    // Sub-level dither hides the 8-bit steps as faint contour rings in the dim edge of the oval.
    float dither = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) - 0.5;
    float p = texture2D(oval, vUv).r * 100.0 + dither * 0.4;
    float a = smoothstep(3.0, 30.0, p);
    if (a <= 0.001) discard;
    vec3 col = mix(vec3(0.35, 1.0, 0.23), vec3(1.0, 0.88, 0.3), smoothstep(35.0, 65.0, p));
    col = mix(col, vec3(1.0, 0.3, 0.3), smoothstep(65.0, 95.0, p));
    float night = 1.0 - smoothstep(-0.1, 0.15, dot(normalize(vNormal), sunDir));
    gl_FragColor = vec4(col * a * strength * mix(0.35, 1.0, night), 1.0);
    #include <colorspace_fragment>
  }`;

const CLOUD_FRAG = /* glsl */ `
  uniform sampler2D clouds;
  uniform vec3 sunDir;
  varying vec2 vUv;
  varying vec3 vNormal;
  void main() {
    vec4 c = texture2D(clouds, vUv);
    float lit = mix(0.3, 1.0, smoothstep(-0.15, 0.2, dot(normalize(vNormal), sunDir)));
    gl_FragColor = vec4(c.rgb * lit, c.a * 0.9);
    #include <colorspace_fragment>
  }`;

interface Props {
  /** Show the satellite cloud layer. */
  clouds: boolean;
  /** Shade the night side (else daylight all round), and show city lights there. */
  night: boolean;
  lights: boolean;
  /** Best spots now (aurora, dark and clear) as an equirectangular overlay, or null. */
  best: HTMLCanvasElement | null;
  /** Saved locations, marked with small dots. */
  saved: Place[];
  /** A past aurora frame from the time slider (raw OVATION bytes), or null for the live one. */
  frame?: Uint8Array | null;
  /** Best places now: light-blue dots with name labels that hide round the back; tap one to pick it. */
  places: { name: string; country: string; lat: number; lon: number }[];
  /** Show the OVATION aurora. */
  aurora: boolean;
  /** Show the Kp reach lines; the line for the current Kp is drawn bold. */
  kpLines: boolean;
  kp: number | null;
  /** Place to mark (and centre on first), e.g. Home. */
  place: Place | null;
  /** Home location for the zoom-to-Home button; null shows a hint instead. */
  home: Place | null;
  /** Point picked on the map (shown with a pin), and a tap on the Earth to pick one. */
  pick?: { lat: number; lon: number } | null;
  onPick?: (lat: number, lon: number, name?: string) => void;
  /** Called with a message key while something is loading or unavailable, '' when ready. */
  onStatus: (status: MessageKey | '') => void;
  onForecast: (t: number | null) => void;
}

/** Interactive 3D Earth with the live OVATION aurora, the day/night line, satellite clouds and your location. */
export function Globe({ clouds, night, lights, best, saved, places, frame = null, aurora, kpLines, kp, place, home, pick = null, onPick, onStatus, onForecast }: Props) {
  const { t } = useI18n();
  const box = useRef<HTMLDivElement>(null);
  const label = useRef<HTMLDivElement>(null);
  const api = useRef<{ setClouds: (on: boolean) => void; setAurora: (on: boolean) => void; setKp: (on: boolean, kp: number | null) => void; setPlace: (p: Place | null) => void; setPick: (p: { lat: number; lon: number } | null) => void; setShade: (night: boolean, lights: boolean) => void; setBest: (c: HTMLCanvasElement | null) => void; setSaved: (s: Place[]) => void; setPlaces: (p: { lat: number; lon: number }[]) => void; setFrame: (f: Uint8Array | null) => void; flyTo: (p: Place) => void } | null>(null);
  // Latest layer choices, applied once the scene is built (props can change while it loads).
  const latest = useRef({ aurora, kpLines, kp, pick, onPick, night, lights, best, saved, places, frame });
  latest.current = { aurora, kpLines, kp, pick, onPick, night, lights, best, saved, places, frame };
  const placeLabels = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    let disposed = false;
    const cleanups: (() => void)[] = [];
    (async () => {
      const T = await import('three');
      const [{ OrbitControls }, { Line2 }, { LineGeometry }, { LineMaterial }] = await Promise.all([
        import('three/examples/jsm/controls/OrbitControls.js'),
        import('three/examples/jsm/lines/Line2.js'),
        import('three/examples/jsm/lines/LineGeometry.js'),
        import('three/examples/jsm/lines/LineMaterial.js'),
      ]);
      const el = box.current;
      if (disposed || !el) return;

      let renderer: THREE.WebGLRenderer;
      try {
        renderer = new T.WebGLRenderer({ antialias: true, alpha: true });
      } catch {
        setFailed(true); onStatus('globe.noWebgl'); return;
      }
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.domElement.style.display = 'block';
      renderer.domElement.style.touchAction = 'none';
      el.appendChild(renderer.domElement);
      cleanups.push(() => { renderer.dispose(); renderer.domElement.remove(); });

      const scene = new T.Scene();
      const camera = new T.PerspectiveCamera(38, 1, 0.1, 200);
      const sunDir = new T.Vector3();
      const updateSun = () => { const s = subsolarPoint(Date.now()); sunDir.copy(toVector(T, s.lat, s.lon)).normalize(); };
      updateSun();

      // Stars, fixed far away.
      const starPos = new Float32Array(1800 * 3);
      for (let i = 0; i < 1800; i++) {
        const v = new T.Vector3().randomDirection().multiplyScalar(60 + Math.random() * 20);
        starPos.set([v.x, v.y, v.z], i * 3);
      }
      const starGeo = new T.BufferGeometry();
      starGeo.setAttribute('position', new T.BufferAttribute(starPos, 3));
      scene.add(new T.Points(starGeo, new T.PointsMaterial({ color: 0xffffff, size: 0.12, sizeAttenuation: true, transparent: true, opacity: 0.75 })));

      // Earth.
      const loader = new T.TextureLoader();
      const loadTex = (url: string) => new Promise<THREE.Texture>((res, rej) => loader.load(url, tex => { tex.colorSpace = T.SRGBColorSpace; tex.anisotropy = 4; res(tex); }, undefined, rej));
      onStatus('globe.loading');
      const [day, night] = await Promise.all([loadTex('/globe/earth-day.jpg'), loadTex('/globe/earth-night.jpg')]).catch(() => [null, null]);
      if (disposed) return;
      if (!day || !night) { onStatus('map.basemapFailed'); return; }
      const sphere = (r: number) => new T.SphereGeometry(r, 128, 64);
      const earthMat = new T.ShaderMaterial({ uniforms: { dayMap: { value: day }, nightMap: { value: night }, sunDir: { value: sunDir }, dayRect: { value: new T.Vector4(0, 0, 1, 1) }, nightRect: { value: new T.Vector4(0, 0, 1, 1) }, shade: { value: new T.Vector2(1, 1) } }, vertexShader: VERT, fragmentShader: EARTH_FRAG });
      scene.add(new T.Mesh(sphere(1), earthMat));
      // Desktop (fine pointer, wide screen): swap in 4K imagery once it has loaded. Phones keep the 2K
      // images, which are sharp at their size and save the download.
      const desktop = window.matchMedia('(pointer: fine) and (min-width: 900px)').matches;
      // Desktop: NASA zoom tiles for sharper detail as the user zooms in (see lib/globeTiles).
      const tileLayer = desktop
        ? createTileLayer(T, { scene, vertexShader: VERT, fragmentShader: EARTH_FRAG, nightMap: earthMat.uniforms.nightMap, sunDir: earthMat.uniforms.sunDir, shade: earthMat.uniforms.shade, anisotropy: renderer.capabilities.getMaxAnisotropy() })
        : null;
      if (tileLayer) cleanups.push(() => tileLayer.dispose());
      if (desktop && renderer.capabilities.maxTextureSize >= 4096) {
        Promise.all([loadTex('/globe/earth-day-4k.jpg'), loadTex('/globe/earth-night-4k.jpg')]).then(([day4, night4]) => {
          if (disposed) { day4.dispose(); night4.dispose(); return; }
          for (const t of [day4, night4]) t.anisotropy = renderer.capabilities.getMaxAnisotropy();
          earthMat.uniforms.dayMap.value = day4;
          earthMat.uniforms.nightMap.value = night4;
          day.dispose(); night.dispose();
        }, () => { /* keep the 2K imagery */ });
      }

      // Clouds (loaded the first time they're switched on).
      const cloudMat = new T.ShaderMaterial({ uniforms: { clouds: { value: null }, sunDir: { value: sunDir } }, vertexShader: VERT, fragmentShader: CLOUD_FRAG, transparent: true, depthWrite: false });
      const cloudMesh = new T.Mesh(sphere(R.clouds), cloudMat);
      cloudMesh.visible = false;
      scene.add(cloudMesh);
      let cloudsLoading = false, cloudsWanted = clouds;
      const setClouds = (on: boolean) => {
        cloudMesh.visible = on && !!cloudMat.uniforms.clouds.value;
        if (!on || cloudMat.uniforms.clouds.value || cloudsLoading) return;
        cloudsLoading = true;
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
          const canvas = document.createElement('canvas');
          canvas.width = 2048; canvas.height = 1024;
          cloudify(img, canvas);
          const tex = new T.CanvasTexture(canvas);
          tex.colorSpace = T.SRGBColorSpace;
          cloudMat.uniforms.clouds.value = tex;
          cloudMesh.visible = cloudsWanted;
        };
        img.onerror = () => { cloudsLoading = false; };
        img.src = `/api/clouds?world=1&t=${Math.floor(Date.now() / 9e5)}`;
      };

      // Aurora: the OVATION probability grid as a glowing shell, plus a fainter, wider halo.
      const auroraMeshes: THREE.Mesh[] = [];
      let liveTex: THREE.Texture | null = null;
      // Show a past frame's grid (time slider), or go back to the live one.
      const setFrame = (f: Uint8Array | null) => {
        const tex = f ? ovalTexture(T, f) : liveTex;
        if (!tex) return;
        for (const m of auroraMeshes) {
          const u = (m.material as THREE.ShaderMaterial).uniforms.oval;
          if (u.value !== liveTex && u.value !== tex) (u.value as THREE.Texture).dispose();
          u.value = tex;
        }
      };
      try {
        const res = await fetch('/api/oval');
        if (!res.ok) throw new Error();
        const grid = await res.json() as OvalGrid;
        if (disposed) return;
        const tex = liveTex = ovalTexture(T, Uint8Array.from(atob(grid.data), ch => ch.charCodeAt(0)));
        for (const [r, strength] of [[R.aurora, 1.1], [R.auroraGlow, 0.35]] as const) {
          const m = new T.ShaderMaterial({ uniforms: { oval: { value: tex }, sunDir: { value: sunDir }, strength: { value: strength } }, vertexShader: VERT, fragmentShader: AURORA_FRAG, transparent: true, depthWrite: false, blending: T.AdditiveBlending });
          const mesh = new T.Mesh(sphere(r), m);
          auroraMeshes.push(mesh);
          scene.add(mesh);
        }
        onForecast(grid.forecast);
        onStatus('');
      } catch {
        onStatus('map.auroraUnavailable');
      }

      // Kp reach lines, both hemispheres, on the same colours as the 2D map. Drawn in screen pixels so they
      // stay crisp at any zoom; hidden behind the Earth by the depth test.
      const kpGroup = new T.Group();
      const kpMats: InstanceType<typeof LineMaterial>[] = [];
      const kpLinesByK = new Map<number, InstanceType<typeof Line2>[]>();
      for (let k = 1; k <= 9; k++) {
        const [r, g, b] = kpColor(k);
        for (const south of [false, true]) {
          const pos = kpLine(k, south).flatMap(([la, lo]) => toVector(T, la, lo, R.kpLines).toArray());
          const geo = new LineGeometry();
          geo.setPositions(pos);
          const mat = new LineMaterial({ color: new T.Color().setRGB(r / 255, g / 255, b / 255, T.SRGBColorSpace).getHex(), linewidth: 1.4, transparent: true, opacity: 0.75, dashed: true, dashSize: 0.012, gapSize: 0.02 });
          const line = new Line2(geo, mat);
          line.computeLineDistances();
          kpMats.push(mat);
          kpLinesByK.set(k, [...(kpLinesByK.get(k) ?? []), line]);
          kpGroup.add(line);
        }
      }
      kpGroup.visible = false;
      scene.add(kpGroup);
      const setKp = (on: boolean, now: number | null) => {
        kpGroup.visible = on;
        const current = now === null ? null : Math.max(1, Math.min(9, Math.round(now)));
        for (const [k, lines] of kpLinesByK) for (const line of lines) {
          const bold = k === current, mat = line.material;
          mat.linewidth = bold ? 3 : 1.4;
          mat.opacity = bold ? 1 : 0.75;
          mat.dashed = !bold;
        }
      };
      const setAurora = (on: boolean) => { for (const m of auroraMeshes) m.visible = on; };

      // Location marker: a bright dot with a soft halo; its label is an HTML overlay that hides on the far side.
      const marker = new T.Group();
      marker.add(new T.Mesh(new T.SphereGeometry(0.012, 16, 8), new T.MeshBasicMaterial({ color: 0x6cff2b })));
      marker.add(new T.Mesh(new T.SphereGeometry(0.03, 16, 8), new T.MeshBasicMaterial({ color: 0x6cff2b, transparent: true, opacity: 0.25, depthWrite: false })));
      marker.visible = false;
      scene.add(marker);
      let markerName = '';
      const setPlace = (p: Place | null) => {
        marker.visible = !!p;
        markerName = p ? p.name.split(',')[0] : '';
        if (p) marker.position.copy(toVector(T, p.lat, p.lon, R.marker));
        if (label.current) label.current.textContent = markerName;
      };

      // Picked point: a white pin, so it reads apart from the green location marker.
      const pin = new T.Group();
      pin.add(new T.Mesh(new T.SphereGeometry(0.011, 16, 8), new T.MeshBasicMaterial({ color: 0xffffff })));
      pin.add(new T.Mesh(new T.SphereGeometry(0.026, 16, 8), new T.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.22, depthWrite: false })));
      pin.visible = false;
      scene.add(pin);
      const setPick = (p: { lat: number; lon: number } | null) => {
        pin.visible = !!p;
        if (p) pin.position.copy(toVector(T, p.lat, p.lon, R.marker));
      };

      // Best spots: a transparent shell just above the clouds, painted by the map screen.
      const bestMat = new T.MeshBasicMaterial({ transparent: true, depthWrite: false, opacity: 0.9 });
      const bestMesh = new T.Mesh(sphere(R.clouds + 0.002), bestMat);
      bestMesh.visible = false;
      scene.add(bestMesh);
      const setBest = (c: HTMLCanvasElement | null) => {
        bestMat.map?.dispose();
        bestMat.map = c ? new T.CanvasTexture(c) : null;
        if (bestMat.map) bestMat.map.colorSpace = T.SRGBColorSpace;
        bestMat.needsUpdate = true;
        bestMesh.visible = !!c;
      };
      const setShade = (n: boolean, l: boolean) => { (earthMat.uniforms.shade.value as THREE.Vector2).set(n ? 1 : 0, l ? 1 : 0); };

      // Saved locations: small green dots.
      const savedGroup = new T.Group();
      scene.add(savedGroup);
      const dotGeo = new T.SphereGeometry(0.008, 12, 6), dotMat = new T.MeshBasicMaterial({ color: 0x6cff2b, transparent: true, opacity: 0.85 });
      const setSaved = (s: Place[]) => {
        savedGroup.clear();
        for (const p of s) { const m = new T.Mesh(dotGeo, dotMat); m.position.copy(toVector(T, p.lat, p.lon, R.marker)); savedGroup.add(m); }
      };

      // Best places: light-blue dots; their labels are HTML (see placeLabels), positioned each frame.
      const placeGroup = new T.Group();
      scene.add(placeGroup);
      const placeMat = new T.MeshBasicMaterial({ color: 0x7fd4ff });
      const setPlaces = (ps: { lat: number; lon: number }[]) => {
        placeGroup.clear();
        for (const p of ps) { const m = new T.Mesh(dotGeo, placeMat); m.position.copy(toVector(T, p.lat, p.lon, R.marker)); placeGroup.add(m); }
      };

      // Camera: face the marked place (or the North Atlantic aurora zone) from mid-latitudes, so the
      // auroral oval sits on the upper part of the globe instead of being seen from over the pole.
      const start = place ?? { lat: 62, lon: -20 };
      camera.position.copy(toVector(T, viewLat(start.lat), start.lon, 4));
      const controls = new OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;
      controls.dampingFactor = 0.08;
      controls.enablePan = false;
      controls.rotateSpeed = 0.45;
      controls.zoomSpeed = 0.7;
      // Desktop can zoom close to the ground, where the zoom tiles carry the detail (and the near plane
      // has to come in so the surface isn't clipped).
      controls.minDistance = desktop ? 1.06 : 1.35;
      if (desktop) { camera.near = 0.01; camera.updateProjectionMatrix(); }
      controls.maxDistance = 7;
      // Keep the view off the poles, where turning the globe spins it in place.
      controls.minPolarAngle = (12 * Math.PI) / 180;
      controls.maxPolarAngle = (168 * Math.PI) / 180;
      // A slow turn until the first touch, unless the user prefers reduced motion.
      controls.autoRotate = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      controls.autoRotateSpeed = 0.35;
      let touched = false;
      controls.addEventListener('start', () => { controls.autoRotate = false; flight = null; touched = true; });
      cleanups.push(() => controls.dispose());

      // Smooth flight to a place (Home button).
      let flight: { from: THREE.Vector3; to: THREE.Vector3; t0: number } | null = null;
      const flyTo = (p: Place) => {
        controls.autoRotate = false;
        touched = true;
        const dist = Math.min(camera.position.length(), 2.6);
        flight = { from: camera.position.clone(), to: toVector(T, viewLat(p.lat), p.lon, dist), t0: performance.now() };
      };

      let fit = 4, viewH = 0, lastShift = NaN;
      const resize = () => {
        const w = el.clientWidth, h = el.clientHeight;
        if (!w || !h) return;
        renderer.setSize(w, h, false);
        for (const m of kpMats) m.resolution.set(w, h);
        renderer.domElement.style.width = '100%';
        renderer.domElement.style.height = '100%';
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        viewH = h;
        lastShift = NaN;
        // Keep the whole globe in view until the user has zoomed themselves.
        fit = fitDistance(camera.fov, camera.aspect);
        controls.maxDistance = Math.max(7, fit * 2);
        if (!touched && !flight) camera.position.setLength(fit);
      };
      const ro = new ResizeObserver(resize);
      ro.observe(el);
      resize();
      cleanups.push(() => ro.disconnect());

      // A tap (not a drag) on the Earth picks that point: cast a ray from the camera to the unit sphere.
      const ray = new T.Raycaster(), earth = new T.Sphere(new T.Vector3(), 1), hit = new T.Vector3(), ndc = new T.Vector2();
      let down: { x: number; y: number; t: number } | null = null;
      const onDown = (e: PointerEvent) => { down = e.isPrimary ? { x: e.clientX, y: e.clientY, t: performance.now() } : null; };
      const onUp = (e: PointerEvent) => {
        const d = down; down = null;
        if (!d || !latest.current.onPick || Math.hypot(e.clientX - d.x, e.clientY - d.y) > 6 || performance.now() - d.t > 600) return;
        const r = renderer.domElement.getBoundingClientRect();
        ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
        ray.setFromCamera(ndc, camera);
        if (!ray.ray.intersectSphere(earth, hit)) return;
        hit.normalize();
        const lat = 90 - (Math.acos(Math.max(-1, Math.min(1, hit.y))) * 180) / Math.PI;
        const lon = ((((Math.atan2(hit.z, -hit.x) * 180) / Math.PI - 180) % 360) + 540) % 360 - 180;
        latest.current.onPick(lat, lon);
      };
      renderer.domElement.addEventListener('pointerdown', onDown);
      renderer.domElement.addEventListener('pointerup', onUp);
      cleanups.push(() => { renderer.domElement.removeEventListener('pointerdown', onDown); renderer.domElement.removeEventListener('pointerup', onUp); });

      const sunTimer = setInterval(updateSun, 6e4);
      cleanups.push(() => clearInterval(sunTimer));

      const tmp = new T.Vector3();
      let frame = 0;
      let tilesAt = 0;
      const tick = (now: number) => {
        frame = requestAnimationFrame(tick);
        if (document.hidden) return;
        if (flight) {
          const k = Math.min(1, (now - flight.t0) / 1400), e = k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2;
          // Along the great circle, so the camera arcs over the globe rather than cutting through it.
          const len = flight.from.length() + (flight.to.length() - flight.from.length()) * e;
          camera.position.copy(flight.from).normalize().lerp(tmp.copy(flight.to).normalize(), e).normalize().multiplyScalar(len);
          if (k >= 1) flight = null;
        }
        // Desktop: turning slows as the camera nears the ground, so a drag moves the view a similar distance.
        if (desktop) controls.rotateSpeed = 0.45 * Math.max(0.04, Math.min(1, (camera.position.length() - 1) / 1.5));
        controls.update();
        if (tileLayer && now - tilesAt > 150) {
          tilesAt = now;
          tileLayer.update(camera, viewH, renderer.getPixelRatio(), 360 / ((earthMat.uniforms.dayMap.value as THREE.Texture).image as { width: number }).width);
        }
        // At the opening zoom the globe is cropped, so shift it away from the pole facing the viewer
        // to keep the auroral oval on screen. Fades out on zooming in; the orbit stays centred.
        const len = camera.position.length();
        const zoom = Math.max(0, Math.min(1, (len - controls.minDistance) / (fit - controls.minDistance)));
        const shift = Math.round((camera.aspect < 1 ? 0.17 : 0.14) * viewH * zoom * Math.max(-1, Math.min(1, (camera.position.y / len) * 3)));
        if (shift !== lastShift) {
          lastShift = shift;
          camera.setViewOffset(el.clientWidth, viewH, 0, -shift, el.clientWidth, viewH);
        }
        renderer.render(scene, camera);
        // Label follows the marker; hidden when the marker is round the back of the Earth.
        const lab = label.current;
        if (lab) {
          const facing = marker.visible && marker.position.dot(tmp.copy(camera.position).sub(marker.position)) > 0;
          if (facing) {
            tmp.copy(marker.position).project(camera);
            lab.style.transform = `translate(${((tmp.x + 1) / 2) * el.clientWidth + 10}px, ${((1 - tmp.y) / 2) * el.clientHeight - 10}px)`;
          }
          lab.style.opacity = facing && markerName ? '1' : '0';
        }
        const labs = placeLabels.current?.children;
        if (labs) for (let i = 0; i < labs.length; i++) {
          const dot = placeGroup.children[i], el2 = labs[i] as HTMLElement;
          const front = !!dot && dot.position.dot(tmp.copy(camera.position).sub(dot.position)) > 0;
          if (front) {
            tmp.copy(dot.position).project(camera);
            el2.style.transform = `translate(${((tmp.x + 1) / 2) * el.clientWidth + 8}px, ${((1 - tmp.y) / 2) * el.clientHeight - 9}px)`;
          }
          el2.style.visibility = front ? 'visible' : 'hidden';
        }
      };
      frame = requestAnimationFrame(tick);
      cleanups.push(() => cancelAnimationFrame(frame));

      api.current = {
        setClouds: on => { cloudsWanted = on; setClouds(on); },
        setAurora,
        setKp,
        setPlace,
        setPick,
        setShade,
        setBest,
        setSaved,
        setPlaces,
        setFrame,
        flyTo,
      };
      if (latest.current.frame) setFrame(latest.current.frame);
      setPlaces(latest.current.places);
      setShade(latest.current.night, latest.current.lights);
      setBest(latest.current.best);
      setSaved(latest.current.saved);
      setPlace(place);
      setPick(latest.current.pick);
      setClouds(clouds);
      setAurora(latest.current.aurora);
      setKp(latest.current.kpLines, latest.current.kp);
      cleanups.push(() => {
        scene.traverse(o => {
          const mesh = o as THREE.Mesh;
          mesh.geometry?.dispose();
          const mats = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : [];
          for (const m of mats) {
            for (const v of Object.values((m as THREE.ShaderMaterial).uniforms ?? {})) (v.value as THREE.Texture | null)?.dispose?.();
            m.dispose();
          }
        });
        day.dispose(); night.dispose();
      });
    })();
    return () => { disposed = true; api.current = null; cleanups.reverse().forEach(f => f()); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- the scene is built once; props flow in through `api`

  useEffect(() => { api.current?.setClouds(clouds); }, [clouds]);
  useEffect(() => { api.current?.setAurora(aurora); }, [aurora]);
  useEffect(() => { api.current?.setKp(kpLines, kp); }, [kpLines, kp]);
  useEffect(() => { api.current?.setPlace(place); }, [place]);
  useEffect(() => { api.current?.setPick(pick); }, [pick]);
  useEffect(() => { api.current?.setShade(night, lights); }, [night, lights]);
  useEffect(() => { api.current?.setBest(best); }, [best]);
  useEffect(() => { api.current?.setSaved(saved); }, [saved]);
  useEffect(() => { api.current?.setPlaces(places); }, [places]);
  useEffect(() => { api.current?.setFrame(frame); }, [frame]);

  const goHome = () => {
    if (!home) { setNotice(t('map.noHome')); setTimeout(() => setNotice(''), 4000); return; }
    setNotice('');
    api.current?.flyTo(home);
  };

  return (
    <div style={{ position: 'relative', overflow: 'hidden' }}>
      <div ref={box} className="aurora-map globe" role="img" aria-label={t('globe.aria')} />
      <div ref={label} className="globe-label" aria-hidden="true" />
      <div ref={placeLabels}>
        {places.map(p => (
          <button key={`${p.lat},${p.lon}`} type="button" className="btn globe-place" onClick={() => onPick?.(p.lat, p.lon, `${p.name}, ${p.country}`)}>{p.name}</button>
        ))}
      </div>
      {!failed && (
        <button type="button" className="globe-home" onClick={goHome} title={t('map.zoomHome')} aria-label={t('map.zoomHome')}
          dangerouslySetInnerHTML={{ __html: HOUSE }} />
      )}
      {notice && <div className="map-status" role="status">{notice}</div>}
    </div>
  );
}
