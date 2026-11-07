import { GIFEncoder, applyPalette, quantize } from 'gifenc';

/** Size of the GIF (square) and the most frames it holds, so it stays a few MB: small enough for any app. */
const SIZE = 480, MAX = 48;
/** 8 frames a second, as the time-lapse plays; the last frame holds a moment before it loops. */
const DELAY = 125, HOLD = 1200;

export interface LapseGifInfo {
  /** The view, e.g. "AIA 193 Å", top right. */
  band: string;
  /** Each frame's time as text, bottom left. */
  when: (t: number) => string;
  site: string;
}

/**
 * The time-lapse as an animated GIF, for sharing: up to 48 of its frames (the first and last always),
 * each with the Polar Lights mark, the view, the frame's time and the site. One palette for all the
 * frames (from the first, middle and last), so the colours don't flicker and the file stays small.
 * The frames come from Supabase storage, which allows cross-origin reads, so the canvas may use them.
 */
export async function lapseGif(frames: { t: number; url: string }[], info: LapseGifInfo, progress: (pct: number) => void): Promise<Blob> {
  const pick = pickFrames(frames, MAX);
  const c = document.createElement('canvas');
  c.width = c.height = SIZE;
  const g = c.getContext('2d', { willReadFrequently: true });
  if (!g) throw new Error('no canvas');
  try { await document.fonts.ready; } catch { /* system fonts */ }

  const draw = async (f: { t: number; url: string }) => {
    await paintFrame(g, SIZE, f, info);
    return g.getImageData(0, 0, SIZE, SIZE).data;
  };

  // The palette from the first, middle and last frames together.
  const sample = [pick[0], pick[Math.floor(pick.length / 2)], pick[pick.length - 1]];
  const parts = [];
  for (const f of sample) parts.push(await draw(f));
  const all = new Uint8ClampedArray(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) { all.set(p, o); o += p.length; }
  const palette = quantize(all, 256);

  const gif = GIFEncoder();
  for (let i = 0; i < pick.length; i++) {
    const data = await draw(pick[i]);
    gif.writeFrame(applyPalette(data, palette), SIZE, SIZE, { palette: i === 0 ? palette : undefined, delay: i === pick.length - 1 ? HOLD : DELAY, repeat: 0 });
    progress(Math.round(((i + 1) / pick.length) * 100));
    // Let the page update the progress between frames.
    await new Promise(r => setTimeout(r, 0));
  }
  gif.finish();
  return new Blob([gif.bytes() as BlobPart], { type: 'image/gif' });
}

/** At most `max` of the frames, spread evenly (the first and last always in). */
export const pickFrames = <T,>(frames: T[], max: number) =>
  frames.length <= max ? frames : Array.from({ length: max }, (_, i) => frames[Math.round((i * (frames.length - 1)) / (max - 1))]);

/** One frame of the time-lapse with its overlay, drawn on a `size`-pixel square canvas. */
export async function paintFrame(g: CanvasRenderingContext2D, size: number, f: { t: number; url: string }, info: LapseGifInfo) {
  const res = await fetch(f.url, { mode: 'cors' });
  if (!res.ok) throw new Error(String(res.status));
  const bmp = await createImageBitmap(await res.blob());
  g.fillStyle = '#000'; g.fillRect(0, 0, size, size);
  g.drawImage(bmp, 0, 0, size, size);
  bmp.close();
  // The overlay is laid out for 480 px and scaled to the canvas.
  g.save(); g.scale(size / SIZE, size / SIZE); overlay(g, info, f.t); g.restore();
}

/** The mark and wordmark top left, the view top right, the time bottom left and the site bottom right. */
function overlay(g: CanvasRenderingContext2D, info: LapseGifInfo, t: number) {
  const top = g.createLinearGradient(0, 0, 0, 70);
  top.addColorStop(0, 'rgba(0,0,0,.7)'); top.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = top; g.fillRect(0, 0, SIZE, 70);
  const foot = g.createLinearGradient(0, SIZE - 70, 0, SIZE);
  foot.addColorStop(0, 'rgba(0,0,0,0)'); foot.addColorStop(1, 'rgba(0,0,0,.75)');
  g.fillStyle = foot; g.fillRect(0, SIZE - 70, SIZE, 70);

  g.save(); g.translate(30, 30); g.rotate(-0.38);
  g.strokeStyle = '#6CFF2B'; g.lineWidth = 3.5;
  g.beginPath(); g.ellipse(0, 0, 15, 9.5, 0, 0, Math.PI * 2); g.stroke(); g.restore();
  g.fillStyle = '#fff'; g.beginPath(); g.arc(30, 30, 3, 0, Math.PI * 2); g.fill();
  g.textBaseline = 'middle';
  g.font = "800 17px 'Archivo', 'Montserrat', sans-serif";
  g.fillStyle = '#fff'; g.fillText('POLAR', 56, 31);
  g.fillStyle = '#6CFF2B'; g.fillText('LIGHTS', 56 + g.measureText('POLAR ').width, 31);
  const body = "'Barlow', 'Golos Text', 'Helvetica Neue', Arial, sans-serif";
  g.textAlign = 'right'; g.fillStyle = '#fff'; g.font = `600 16px ${body}`; g.fillText(info.band, SIZE - 16, 31);
  g.textBaseline = 'alphabetic';
  g.textAlign = 'left'; g.fillStyle = '#E3E8E4'; g.font = `500 16px 'JetBrains Mono', monospace`; g.fillText(info.when(t), 16, SIZE - 16);
  g.textAlign = 'right'; g.fillStyle = '#6CFF2B'; g.font = `700 17px ${body}`; g.fillText(info.site, SIZE - 16, SIZE - 16);
  g.textAlign = 'left';
}
