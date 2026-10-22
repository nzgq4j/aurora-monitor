/**
 * OVATION grid (row = latitude −90…90, column = longitude 0…359 °E) re-laid out as an equirectangular
 * field (x = 0 at 180° W, y = 0 at 90° S) at 4× the resolution and blurred over a fixed distance on the
 * ground (about 130 km), so the 1° cells don't show. The longitude blur widens towards the poles, where a
 * degree of longitude is short. Shared by the 2D map and the globe so both draw the same oval.
 */
export const OVAL_SCALE = 4, OVAL_W = 360 * OVAL_SCALE, OVAL_H = 180 * OVAL_SCALE + 1;
const OVAL_SIGMA_DEG = 1.2;

/** Smoothed probability (0–100) per cell, row-major, OVAL_W × OVAL_H. */
export function smoothOval(grid: Uint8Array): Float32Array {
  const W = OVAL_W, H = OVAL_H, S = OVAL_SCALE;
  const at = (row: number, c: number) => grid[row * 360 + ((c + 180) % 360)];
  // Bilinear upsample (u = 0 at 180° W, wrapping in longitude).
  const cur = new Float32Array(W * H);
  for (let y = 0; y < H; y++) {
    const r0 = Math.min(180, Math.floor(y / S)), r1 = Math.min(180, r0 + 1), ty = y / S - r0;
    for (let x = 0; x < W; x++) {
      const c0 = Math.floor(x / S), c1 = (c0 + 1) % 360, tx = x / S - c0;
      const top = at(r0, c0) * (1 - tx) + at(r0, c1) * tx, bot = at(r1, c0) * (1 - tx) + at(r1, c1) * tx;
      cur[y * W + x] = top * (1 - ty) + bot * ty;
    }
  }
  // Three box passes approximate a Gaussian; running sums keep each pass linear in the texture size.
  const boxRadius = (sigmaPx: number) => Math.max(1, Math.round((Math.sqrt(4 * sigmaPx * sigmaPx + 1) - 1) / 2));
  const latR = boxRadius(OVAL_SIGMA_DEG * S);
  const lonR = Array.from({ length: H }, (_, y) => {
    const cos = Math.cos(((y / S - 90) * Math.PI) / 180);
    return cos < 0.01 ? W : boxRadius((OVAL_SIGMA_DEG * S) / cos);
  });
  const next = new Float32Array(W * H);
  for (let pass = 0; pass < 3; pass++) {
    for (let y = 0; y < H; y++) {
      const o = y * W, r = lonR[y];
      if (2 * r + 1 >= W) {
        let mean = 0;
        for (let x = 0; x < W; x++) mean += cur[o + x];
        next.fill(mean / W, o, o + W);
        continue;
      }
      let sum = 0;
      for (let k = -r; k <= r; k++) sum += cur[o + ((k + W) % W)];
      for (let x = 0; x < W; x++) {
        next[o + x] = sum / (2 * r + 1);
        sum += cur[o + ((x + r + 1) % W)] - cur[o + ((x - r + W) % W)];
      }
    }
    for (let x = 0; x < W; x++) {
      const row = (y: number) => next[Math.max(0, Math.min(H - 1, y)) * W + x];
      let sum = 0;
      for (let k = -latR; k <= latR; k++) sum += row(k);
      for (let y = 0; y < H; y++) {
        cur[y * W + x] = sum / (2 * latR + 1);
        sum += row(y + latR + 1) - row(y - latR);
      }
    }
  }
  return cur;
}

/** Bilinear lookup of the smoothed field at a latitude/longitude (degrees). */
export function sampleOval(field: Float32Array, lat: number, lon: number): number {
  const fy = Math.max(0, Math.min(OVAL_H - 1, (lat + 90) * OVAL_SCALE)), y0 = Math.min(OVAL_H - 2, Math.floor(fy)), ty = fy - y0;
  const fx = ((((lon + 180) % 360) + 360) % 360) * OVAL_SCALE, x0 = Math.floor(fx) % OVAL_W, x1 = (x0 + 1) % OVAL_W, tx = fx - Math.floor(fx);
  const a = field[y0 * OVAL_W + x0] * (1 - tx) + field[y0 * OVAL_W + x1] * tx;
  const b = field[(y0 + 1) * OVAL_W + x0] * (1 - tx) + field[(y0 + 1) * OVAL_W + x1] * tx;
  return a * (1 - ty) + b * ty;
}
