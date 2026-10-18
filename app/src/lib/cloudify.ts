// Shared by the 2D map's cloud tiles and the 3D globe's cloud layer.

/**
 * Turn an infrared tile (grey: white = cold cloud tops, dark = warm clear ground) into white
 * cloud with transparency, so clear sky shows the basemap and thick, high cloud is near-opaque.
 */
export function cloudify(img: HTMLImageElement, tile: HTMLCanvasElement) {
  const ctx = tile.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0, tile.width, tile.height);
  const d = ctx.getImageData(0, 0, tile.width, tile.height);
  const px = d.data;
  for (let o = 0; o < px.length; o += 4) {
    const t = Math.max(0, Math.min(1, (px[o] - CLOUD_LO) / (CLOUD_HI - CLOUD_LO)));
    px[o + 3] = px[o + 3] ? Math.round(255 * CLOUD_MAX * t * t * (3 - 2 * t)) : 0;
    px[o] = 236; px[o + 1] = 241; px[o + 2] = 246;
  }
  ctx.putImageData(d, 0, 0);
}
/** Grey levels treated as clear (≤ LO) and as solid cloud (≥ HI), and the strongest cloud opacity. */
export const CLOUD_LO = 105, CLOUD_HI = 205, CLOUD_MAX = 0.82;
