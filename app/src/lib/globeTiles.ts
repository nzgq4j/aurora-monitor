import type * as THREE from 'three';

/**
 * Sharper globe imagery while zoomed in: NASA GIBS Blue Marble tiles (EPSG:4326, 512 px, up to ~500 m
 * per pixel) laid over the base Earth for the part of the globe in view. Tiles are sphere patches drawn
 * just above the base sphere with the same day/night shader; the night side keeps the base night
 * imagery, sampled at each patch's place on the globe, so the terminator stays seamless.
 */

const GIBS = 'https://gibs.earthdata.nasa.gov/wmts/epsg4326/best/BlueMarble_NextGeneration/default/2004-08-01/500m';
/** The 500m tile matrix set: level z has tiles 288 / 2^z degrees square, levels 0-7. */
const MAX_Z = 7;
const span = (z: number) => 288 / 2 ** z;
const TILE_PX = 512;
/** Imagery detail at the finest level, texels per degree (about 228, ~500 m). */
export const TILE_TEXELS_PER_DEG = TILE_PX / span(MAX_Z);
/** Most tiles drawn at once, and kept in memory (the least recently used go first). */
const MAX_VISIBLE = 48, MAX_CACHED = 160, MAX_LOADING = 6;
const deg = Math.PI / 180;

interface Tile {
  key: string; z: number; row: number; col: number;
  mesh: THREE.Mesh | null; loading: boolean; failed: boolean; used: number;
}

export interface TileLayerOptions {
  scene: THREE.Scene;
  vertexShader: string;
  fragmentShader: string;
  /** Shared with the base Earth material, so a later swap of the night image reaches the tiles. */
  nightMap: { value: THREE.Texture | null };
  sunDir: { value: THREE.Vector3 };
  /** Night shading and city lights switches (x, y: 0 or 1), shared with the base Earth material. */
  shade: { value: THREE.Vector2 };
  anisotropy: number;
}

export function createTileLayer(T: typeof THREE, o: TileLayerOptions) {
  const loader = new T.TextureLoader();
  loader.setCrossOrigin('anonymous');
  const tiles = new Map<string, Tile>();
  const group = new T.Group();
  o.scene.add(group);
  let loading = 0;
  let stamp = 0;

  /** Lon/lat box of a tile, clipped to the globe (edge tiles of the matrix run past 180° E and 90° S). */
  const bounds = (z: number, row: number, col: number) => {
    const s = span(z), west = -180 + col * s, north = 90 - row * s;
    return { s, west, north, east: Math.min(west + s, 180), south: Math.max(north - s, -90) };
  };

  const build = (t: Tile, tex: THREE.Texture) => {
    const { s, west, north, east, south } = bounds(t.z, t.row, t.col);
    const segs = Math.max(8, Math.min(32, Math.ceil((east - west) / 1.5)));
    // Finer levels sit a hair higher so they cover coarser tiles still loaded underneath.
    const r = 1.0008 + t.z * 0.0001;
    const geo = new T.SphereGeometry(r, segs, segs, (west + 180) * deg, (east - west) * deg, (90 - north) * deg, (north - south) * deg);
    const mat = new T.ShaderMaterial({
      uniforms: {
        dayMap: { value: tex },
        nightMap: o.nightMap,
        sunDir: o.sunDir,
        shade: o.shade,
        // The patch's part of the tile image, and of the whole-Earth night image.
        dayRect: { value: new T.Vector4(0, (south - (north - s)) / s, (east - west) / s, (north - south) / s) },
        nightRect: { value: new T.Vector4((west + 180) / 360, (south + 90) / 180, (east - west) / 360, (north - south) / 180) },
      },
      vertexShader: o.vertexShader,
      fragmentShader: o.fragmentShader,
    });
    t.mesh = new T.Mesh(geo, mat);
    t.mesh.visible = false;
    group.add(t.mesh);
  };

  const load = (t: Tile) => {
    t.loading = true;
    loading++;
    loader.load(`${GIBS}/${t.z}/${t.row}/${t.col}.jpeg`, tex => {
      loading--;
      t.loading = false;
      if (!tiles.has(t.key)) { tex.dispose(); return; }
      tex.colorSpace = T.SRGBColorSpace;
      tex.anisotropy = o.anisotropy;
      tex.wrapS = tex.wrapT = T.ClampToEdgeWrapping;
      build(t, tex);
    }, undefined, () => { loading--; t.loading = false; t.failed = true; });
  };

  const drop = (t: Tile) => {
    tiles.delete(t.key);
    if (!t.mesh) return;
    group.remove(t.mesh);
    t.mesh.geometry.dispose();
    const mat = t.mesh.material as THREE.ShaderMaterial;
    (mat.uniforms.dayMap.value as THREE.Texture).dispose();
    mat.dispose();
  };

  const dir = new T.Vector3();
  /**
   * Show the tiles the current view needs. `baseDegPerTexel` is the base image's resolution: tiles
   * only appear once the view needs more detail than that.
   */
  const update = (camera: THREE.PerspectiveCamera, viewH: number, dpr: number, baseDegPerTexel: number) => {
    stamp++;
    const d = camera.position.length();
    // Ground size of one screen pixel at the centre of the view, in degrees.
    const vfov = camera.fov * deg;
    const degPerPx = ((d - 1) * vfov) / Math.max(1, viewH) / deg / dpr;
    let z = Math.ceil(Math.log2(288 / (TILE_PX * degPerPx * 1.3)));
    z = Math.min(MAX_Z, z);
    const needed: Tile[] = [];
    if (span(z) / TILE_PX < baseDegPerTexel * 0.8) {
      // The patch of globe in view: around the point under the camera, out to the frustum corners.
      dir.copy(camera.position).normalize();
      const clat = Math.asin(dir.y) / deg;
      const clon = ((Math.atan2(dir.z, -dir.x) / deg - 180 + 540) % 360) - 180;
      const hfov = Math.atan(Math.tan(vfov / 2) * camera.aspect);
      const corner = Math.atan(Math.hypot(Math.tan(vfov / 2), Math.tan(hfov)));
      const hit = d * Math.sin(corner);
      const radius = (hit < 1 ? Math.asin(hit) - corner : Math.acos(1 / d)) / deg * 1.15;
      for (; z >= 0; z--) {
        const s = span(z);
        needed.length = 0;
        const latN = Math.min(90, clat + radius), latS = Math.max(-90, clat - radius);
        const polar = latN >= 89.9 || latS <= -89.9;
        const dLon = polar ? 180 : Math.min(180, Math.asin(Math.min(1, Math.sin(radius * deg) / Math.cos(clat * deg))) / deg);
        const r0 = Math.max(0, Math.floor((90 - latN) / s)), r1 = Math.floor((90 - latS - 1e-9) / s);
        const cols = Math.ceil(360 / s);
        const cSpan = Math.min(cols, Math.ceil((2 * dLon) / s) + 1);
        const c0 = Math.floor((clon - dLon + 180) / s);
        for (let row = r0; row <= r1; row++) for (let i = 0; i <= cSpan && i < cols; i++) {
          const col = (((c0 + i) % cols) + cols) % cols;
          const { west, east, north, south } = bounds(z, row, col);
          if (east <= west || north <= south) continue;
          // Keep tiles whose centre is within reach of the view.
          const mlat = (north + south) / 2, mlon = (west + east) / 2;
          const cosAng = Math.sin(mlat * deg) * Math.sin(clat * deg) + Math.cos(mlat * deg) * Math.cos(clat * deg) * Math.cos((mlon - clon) * deg);
          const half = Math.hypot((east - west) * Math.cos(mlat * deg), north - south) / 2;
          if (Math.acos(Math.max(-1, Math.min(1, cosAng))) / deg > radius + half) continue;
          const key = `${z}/${row}/${col}`;
          let t = tiles.get(key);
          if (!t) { t = { key, z, row, col, mesh: null, loading: false, failed: false, used: 0 }; tiles.set(key, t); }
          needed.push(t);
        }
        if (needed.length <= MAX_VISIBLE) break;
      }
      // A few downloads at a time; the rest are picked up on later updates.
      for (const t of needed) {
        t.used = stamp;
        if (!t.mesh && !t.loading && !t.failed && loading < MAX_LOADING) load(t);
      }
    }
    // Draw the needed tiles that have arrived; until a tile arrives, coarser loaded tiles over the
    // same ground stay up so there are no holes.
    const want = new Set(needed.map(t => t.key));
    const cover = needed.filter(t => !t.mesh);
    for (const t of tiles.values()) {
      if (!t.mesh) continue;
      let show = want.has(t.key);
      if (!show && cover.length && t.z < z) {
        const b = bounds(t.z, t.row, t.col);
        show = cover.some(c => { const cb = bounds(c.z, c.row, c.col); return cb.west < b.east && cb.east > b.west && cb.south < b.north && cb.north > b.south; });
        if (show) t.used = stamp;
      }
      t.mesh.visible = show;
    }
    if (tiles.size > MAX_CACHED) {
      const old = [...tiles.values()].filter(t => t.used < stamp && !t.loading).sort((a, b) => a.used - b.used);
      for (const t of old.slice(0, tiles.size - MAX_CACHED)) drop(t);
    }
  };

  const dispose = () => {
    for (const t of [...tiles.values()]) drop(t);
    o.scene.remove(group);
  };

  return { update, dispose };
}
