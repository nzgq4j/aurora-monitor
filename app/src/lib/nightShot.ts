'use client';

/**
 * Night shot for Sky view: the browser only gives the camera's video (short exposures, no night mode),
 * so a night photo is made the way phone night modes work: a few seconds of frames are lined up with
 * the first one (small hand movements), averaged (noise falls with the number of frames), and the result
 * brightened. Where the browser allows manual exposure (Chrome on Android), the camera's longest frame
 * exposure is used while it records.
 */

/** Frames for lining up are compared at this width; the search reaches MAX_SHIFT of these pixels. */
const ALIGN_W = 160;
const MAX_SHIFT = 6;

export interface NightResult { canvas: HTMLCanvasElement; frames: number }

type VideoWithCallback = HTMLVideoElement & { requestVideoFrameCallback?: (cb: () => void) => number };

/** Average brightness (0–1) of what the camera sees now, from a small copy of the frame. */
export function sceneBrightness(v: HTMLVideoElement): number | null {
  if (!v.videoWidth) return null;
  const c = document.createElement('canvas');
  c.width = 32; c.height = Math.max(1, Math.round((32 * v.videoHeight) / v.videoWidth));
  const ctx = c.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(v, 0, 0, c.width, c.height);
  const d = ctx.getImageData(0, 0, c.width, c.height).data;
  let sum = 0;
  for (let i = 0; i < d.length; i += 4) sum += 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
  return sum / (d.length / 4) / 255;
}

/**
 * Ask for the camera's longest frame exposure (up to 1/8 s) where the browser supports manual exposure.
 * Returns a function that puts automatic exposure back.
 */
export async function longestExposure(track: MediaStreamTrack): Promise<() => void> {
  const caps = (track.getCapabilities?.() ?? {}) as { exposureMode?: string[]; exposureTime?: { max: number; min: number } };
  if (!caps.exposureMode?.includes('manual') || !caps.exposureTime) return () => {};
  // exposureTime is in units of 100 µs; 1250 = 1/8 s, about as long as a video frame can be.
  const time = Math.max(caps.exposureTime.min, Math.min(caps.exposureTime.max, 1250));
  try {
    await track.applyConstraints({ advanced: [{ exposureMode: 'manual', exposureTime: time } as MediaTrackConstraintSet] });
    await new Promise(res => setTimeout(res, 400));
  } catch { return () => {}; }
  return () => { track.applyConstraints({ advanced: [{ exposureMode: 'continuous' } as MediaTrackConstraintSet] }).catch(() => {}); };
}

/** Luminance of a small copy of the frame, for lining frames up. */
function small(ctx: CanvasRenderingContext2D, v: HTMLVideoElement, w: number, h: number): Float32Array {
  ctx.drawImage(v, 0, 0, w, h);
  const d = ctx.getImageData(0, 0, w, h).data;
  const out = new Float32Array(w * h);
  for (let i = 0, j = 0; j < out.length; i += 4, j++) out[j] = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
  return out;
}

/** The shift (in small pixels) that best lines `cur` up with `ref`, by the least mean absolute difference. */
function bestShift(ref: Float32Array, cur: Float32Array, w: number, h: number): [number, number] {
  let best = Infinity, bx = 0, by = 0;
  for (let dy = -MAX_SHIFT; dy <= MAX_SHIFT; dy++) {
    for (let dx = -MAX_SHIFT; dx <= MAX_SHIFT; dx++) {
      let sum = 0, n = 0;
      for (let y = MAX_SHIFT; y < h - MAX_SHIFT; y += 2) {
        const row = y * w, row2 = (y + dy) * w + dx;
        for (let x = MAX_SHIFT; x < w - MAX_SHIFT; x += 2) { sum += Math.abs(ref[row + x] - cur[row2 + x]); n++; }
      }
      const s = sum / n;
      if (s < best) { best = s; bx = dx; by = dy; }
    }
  }
  return [bx, by];
}

/**
 * Record `ms` of video, line the frames up, average them and brighten the result. `onProgress` gets 0–1.
 * The caller keeps the camera running and still; this only reads frames.
 */
export async function nightShot(v: HTMLVideoElement, ms: number, onProgress: (f: number) => void): Promise<NightResult> {
  const W = v.videoWidth, H = v.videoHeight;
  const work = document.createElement('canvas');
  work.width = W; work.height = H;
  const wctx = work.getContext('2d', { willReadFrequently: true })!;
  const sw = ALIGN_W, sh = Math.max(16, Math.round((ALIGN_W * H) / W)), scale = W / sw;
  const sc = document.createElement('canvas');
  sc.width = sw; sc.height = sh;
  const sctx = sc.getContext('2d', { willReadFrequently: true })!;

  const sum = new Float32Array(W * H * 3);
  const count = new Uint16Array(W * H);
  let ref: Float32Array | null = null, frames = 0;
  const start = performance.now();

  const addFrame = () => {
    const lum = small(sctx, v, sw, sh);
    let dx = 0, dy = 0;
    if (!ref) ref = lum; else [dx, dy] = bestShift(ref, lum, sw, sh);
    // Draw the frame moved back by the shift, so it sits over the first one; uncovered edges stay empty.
    wctx.clearRect(0, 0, W, H);
    wctx.drawImage(v, -Math.round(dx * scale), -Math.round(dy * scale), W, H);
    const d = wctx.getImageData(0, 0, W, H).data;
    for (let p = 0, i = 0; p < count.length; p++, i += 4) {
      if (d[i + 3] === 0) continue;
      sum[p * 3] += d[i]; sum[p * 3 + 1] += d[i + 1]; sum[p * 3 + 2] += d[i + 2];
      count[p]++;
    }
    frames++;
  };

  // One sample per new video frame (requestVideoFrameCallback where available, else every animation frame).
  const vv = v as VideoWithCallback;
  await new Promise<void>(done => {
    const next = () => {
      const t = performance.now() - start;
      onProgress(Math.min(1, t / ms));
      if (t >= ms && frames > 0) { done(); return; }
      addFrame();
      if (vv.requestVideoFrameCallback) vv.requestVideoFrameCallback(next); else requestAnimationFrame(next);
    };
    next();
  });

  // Average, then stretch: the darkest 1 % to black, the brightest 0.3 % to white (at most 8× brighter),
  // with a gentle curve that lifts faint light more than bright.
  const mean = new Float32Array(W * H * 3);
  const lums: number[] = [];
  for (let p = 0; p < count.length; p++) {
    const n = count[p] || 1;
    const r = (mean[p * 3] = sum[p * 3] / n), g = (mean[p * 3 + 1] = sum[p * 3 + 1] / n), b = (mean[p * 3 + 2] = sum[p * 3 + 2] / n);
    if (p % 7 === 0) lums.push(0.2126 * r + 0.7152 * g + 0.0722 * b);
  }
  lums.sort((a, b) => a - b);
  const black = lums[Math.floor(lums.length * 0.01)] ?? 0;
  const white = Math.max(black + 255 / 8, lums[Math.floor(lums.length * 0.997)] ?? 255);
  const k = 1 / (white - black);
  const out = wctx.createImageData(W, H);
  for (let p = 0, i = 0; p < count.length; p++, i += 4) {
    for (let c = 0; c < 3; c++) {
      const x = Math.min(1, Math.max(0, (mean[p * 3 + c] - black) * k));
      out.data[i + c] = Math.round(255 * Math.pow(x, 0.8));
    }
    out.data[i + 3] = 255;
  }
  wctx.putImageData(out, 0, 0);
  return { canvas: work, frames };
}
