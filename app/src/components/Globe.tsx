'use client';

import { useEffect, useRef, useState } from 'react';
import type * as THREE from 'three';
import { subsolarPoint } from '../lib/astro';
import { cloudify } from '../lib/cloudify';
import type { Place } from '../lib/locations';
import type { OvalGrid } from '../app/api/oval/route';
import { useI18n } from '../i18n/I18n';
import type { MessageKey } from '../i18n/core';

const HOUSE = '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M3 11.5 12 4l9 7.5M5.5 9.5V20h5v-6h3v6h5V9.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/></svg>';

/** Shell radii (Earth = 1): clouds just above the ground, the aurora above them, then the atmosphere glow. */
const R = { clouds: 1.006, aurora: 1.014, auroraGlow: 1.03, atmosphere: 1.12, marker: 1.016 };
/**
 * Opening camera distance for this aspect ratio: close enough that the globe fills the view
 * (its edges just outside it), so the aurora zone is large; zoom out to see the whole Earth.
 */
function fitDistance(fovDeg: number, aspect: number) {
  const half = Math.min(fovDeg / 2, (Math.atan(Math.tan(((fovDeg / 2) * Math.PI) / 180) * aspect) * 180) / Math.PI);
  return ((R.atmosphere * 1.03) / Math.sin((half * Math.PI) / 180)) * 0.72;
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
 * OVATION grid (row = latitude −90…90, column = longitude 0…359 °E) re-laid out as an equirectangular
 * texture, smoothed so the 1° cells don't show as steps. The longitude blur widens towards the poles,
 * where a degree of longitude is short, so the smoothing covers about the same ground everywhere.
 */
function ovalTexture(T: typeof THREE, grid: Uint8Array) {
  let cur = new Float32Array(360 * 181);
  for (let row = 0; row < 181; row++) for (let c = 0; c < 360; c++) cur[row * 360 + c] = grid[row * 360 + ((c + 180) % 360)];
  for (let pass = 0; pass < 3; pass++) {
    const along = new Float32Array(cur.length);
    for (let row = 0; row < 181; row++) {
      const span = Math.min(30, Math.round(1.5 / Math.max(0.05, Math.cos(((row - 90) * Math.PI) / 180))));
      for (let c = 0; c < 360; c++) {
        let sum = 0;
        for (let dc = -span; dc <= span; dc++) sum += cur[row * 360 + ((c + dc + 360) % 360)];
        along[row * 360 + c] = sum / (2 * span + 1);
      }
    }
    const next = new Float32Array(cur.length);
    for (let row = 0; row < 181; row++) for (let c = 0; c < 360; c++) {
      let sum = 0, n = 0;
      for (let r = Math.max(0, row - 1); r <= Math.min(180, row + 1); r++) { sum += along[r * 360 + c]; n++; }
      next[row * 360 + c] = sum / n;
    }
    cur = next;
  }
  const data = Uint8Array.from(cur, v => Math.round(v));
  const tex = new T.DataTexture(data, 360, 181, T.RedFormat, T.UnsignedByteType);
  tex.magFilter = tex.minFilter = T.LinearFilter;
  tex.wrapS = T.RepeatWrapping;
  tex.needsUpdate = true;
  return tex;
}

const VERT = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vView;
  void main() {
    vUv = uv;
    vNormal = normalize(mat3(modelMatrix) * normal);
    vec4 world = modelMatrix * vec4(position, 1.0);
    vView = normalize(cameraPosition - world.xyz);
    gl_Position = projectionMatrix * viewMatrix * world;
  }`;

// Day imagery lit by the Sun, city lights on a dark night side, a soft twilight band between.
// Textures are sRGB and decoded to linear when sampled, so each shader ends by converting back
// (colorspace_fragment); without it everything renders far too dark.
const EARTH_FRAG = /* glsl */ `
  uniform sampler2D dayMap;
  uniform sampler2D nightMap;
  uniform vec3 sunDir;
  varying vec2 vUv;
  varying vec3 vNormal;
  void main() {
    float d = dot(normalize(vNormal), sunDir);
    float day = smoothstep(-0.1, 0.1, d);
    vec3 dayCol = texture2D(dayMap, vUv).rgb * (0.75 + 0.6 * max(d, 0.0));
    vec3 nightCol = texture2D(nightMap, vUv).rgb * vec3(1.1, 0.95, 0.75) + texture2D(dayMap, vUv).rgb * 0.012;
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
    float p = texture2D(oval, vUv).r * 255.0;
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

// Thin blue rim, brighter towards the limb and on the sunlit side.
const ATMOS_FRAG = /* glsl */ `
  uniform vec3 sunDir;
  varying vec3 vNormal;
  varying vec3 vView;
  void main() {
    vec3 n = normalize(vNormal);
    float rim = pow(clamp(1.0 - abs(dot(n, normalize(vView))), 0.0, 1.0), 3.0);
    float lit = mix(0.25, 1.0, smoothstep(-0.3, 0.4, dot(-n, sunDir)));
    gl_FragColor = vec4(vec3(0.35, 0.6, 1.0) * rim * lit, rim * lit);
    #include <colorspace_fragment>
  }`;

interface Props {
  /** Show the satellite cloud layer. */
  clouds: boolean;
  /** Place to mark (and centre on first), e.g. Home. */
  place: Place | null;
  /** Home location for the zoom-to-Home button; null shows a hint instead. */
  home: Place | null;
  /** Called with a message key while something is loading or unavailable, '' when ready. */
  onStatus: (status: MessageKey | '') => void;
  onForecast: (t: number | null) => void;
}

/** Interactive 3D Earth with the live OVATION aurora, the day/night line, satellite clouds and your location. */
export function Globe({ clouds, place, home, onStatus, onForecast }: Props) {
  const { t } = useI18n();
  const box = useRef<HTMLDivElement>(null);
  const label = useRef<HTMLDivElement>(null);
  const api = useRef<{ setClouds: (on: boolean) => void; setPlace: (p: Place | null) => void; flyTo: (p: Place) => void } | null>(null);
  const [failed, setFailed] = useState(false);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    let disposed = false;
    const cleanups: (() => void)[] = [];
    (async () => {
      const T = await import('three');
      const { OrbitControls } = await import('three/examples/jsm/controls/OrbitControls.js');
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
      const earthMat = new T.ShaderMaterial({ uniforms: { dayMap: { value: day }, nightMap: { value: night }, sunDir: { value: sunDir } }, vertexShader: VERT, fragmentShader: EARTH_FRAG });
      scene.add(new T.Mesh(sphere(1), earthMat));

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
      const auroraMats: THREE.ShaderMaterial[] = [];
      try {
        const res = await fetch('/api/oval');
        if (!res.ok) throw new Error();
        const grid = await res.json() as OvalGrid;
        if (disposed) return;
        const tex = ovalTexture(T, Uint8Array.from(atob(grid.data), ch => ch.charCodeAt(0)));
        for (const [r, strength] of [[R.aurora, 1.1], [R.auroraGlow, 0.35]] as const) {
          const m = new T.ShaderMaterial({ uniforms: { oval: { value: tex }, sunDir: { value: sunDir }, strength: { value: strength } }, vertexShader: VERT, fragmentShader: AURORA_FRAG, transparent: true, depthWrite: false, blending: T.AdditiveBlending });
          auroraMats.push(m);
          scene.add(new T.Mesh(sphere(r), m));
        }
        onForecast(grid.forecast);
        onStatus('');
      } catch {
        onStatus('map.auroraUnavailable');
      }

      scene.add(new T.Mesh(sphere(R.atmosphere), new T.ShaderMaterial({ uniforms: { sunDir: { value: sunDir } }, vertexShader: VERT, fragmentShader: ATMOS_FRAG, transparent: true, depthWrite: false, side: T.BackSide, blending: T.AdditiveBlending })));

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
      controls.minDistance = 1.35;
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

      const sunTimer = setInterval(updateSun, 6e4);
      cleanups.push(() => clearInterval(sunTimer));

      const tmp = new T.Vector3();
      let frame = 0;
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
        controls.update();
        // At the opening zoom the globe is cropped, so shift it away from the pole facing the viewer
        // to keep the auroral oval on screen. Fades out on zooming in; the orbit stays centred.
        const len = camera.position.length();
        const zoom = Math.max(0, Math.min(1, (len - controls.minDistance) / (fit - controls.minDistance)));
        const shift = Math.round(0.14 * viewH * zoom * Math.max(-1, Math.min(1, (camera.position.y / len) * 3)));
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
      };
      frame = requestAnimationFrame(tick);
      cleanups.push(() => cancelAnimationFrame(frame));

      api.current = {
        setClouds: on => { cloudsWanted = on; setClouds(on); },
        setPlace,
        flyTo,
      };
      setPlace(place);
      setClouds(clouds);
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
  useEffect(() => { api.current?.setPlace(place); }, [place]);

  const goHome = () => {
    if (!home) { setNotice(t('map.noHome')); setTimeout(() => setNotice(''), 4000); return; }
    setNotice('');
    api.current?.flyTo(home);
  };

  return (
    <div style={{ position: 'relative', overflow: 'hidden' }}>
      <div ref={box} className="aurora-map globe" role="img" aria-label={t('globe.aria')} />
      <div ref={label} className="globe-label" aria-hidden="true" />
      {!failed && (
        <button type="button" className="globe-home" onClick={goHome} title={t('map.zoomHome')} aria-label={t('map.zoomHome')}
          dangerouslySetInnerHTML={{ __html: HOUSE }} />
      )}
      {notice && <div className="map-status" role="status">{notice}</div>}
    </div>
  );
}
