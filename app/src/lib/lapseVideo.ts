import { pickFrames, paintFrame, type LapseGifInfo } from './lapseGif';

/** Square video size, frame rate, most frames, and how long the last frame holds before it loops. */
const SIZE = 720, FPS = 8, MAX = 96, HOLD = 1.2;

/**
 * Whether this browser can make the time-lapse video: WebCodecs with H.264 (Safari 16.4+, Chrome, Edge).
 * Loads the MP4 library only when asked.
 */
export async function canMakeLapseVideo(): Promise<boolean> {
  if (typeof window === 'undefined' || typeof VideoEncoder === 'undefined') return false;
  try {
    const { canEncodeVideo } = await import('mediabunny');
    return await canEncodeVideo('avc', { width: SIZE, height: SIZE });
  } catch { return false; }
}

/**
 * The time-lapse as an MP4 video (H.264), for apps that turn a shared GIF into a still picture, such as
 * Bluesky: up to 96 frames at 8 a second, each with the same overlay as the GIF, the last held a moment.
 * Encoded in the browser with WebCodecs, packed by Mediabunny (MPL-2.0), which loads only when used.
 */
export async function lapseVideo(frames: { t: number; url: string }[], info: LapseGifInfo, progress: (pct: number) => void): Promise<Blob> {
  const { Output, Mp4OutputFormat, BufferTarget, CanvasSource, QUALITY_HIGH } = await import('mediabunny');
  const pick = pickFrames(frames, MAX);
  const c = document.createElement('canvas');
  c.width = c.height = SIZE;
  const g = c.getContext('2d');
  if (!g) throw new Error('no canvas');
  try { await document.fonts.ready; } catch { /* system fonts */ }

  const output = new Output({ format: new Mp4OutputFormat({ fastStart: 'in-memory' }), target: new BufferTarget() });
  const source = new CanvasSource(c, { codec: 'avc', bitrate: QUALITY_HIGH });
  output.addVideoTrack(source, { frameRate: FPS });
  await output.start();
  for (let i = 0; i < pick.length; i++) {
    await paintFrame(g, SIZE, pick[i], info);
    const last = i === pick.length - 1;
    await source.add(i / FPS, last ? HOLD : 1 / FPS);
    progress(Math.round(((i + 1) / pick.length) * 100));
  }
  await output.finalize();
  const buf = output.target.buffer;
  if (!buf) throw new Error('no video');
  return new Blob([buf], { type: 'video/mp4' });
}
