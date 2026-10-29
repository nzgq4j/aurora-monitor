// Home Screen launch images for iPhone and iPad (public/splash/apple-{w}x{h}.png). iOS ignores the web manifest's
// splash and shows these instead, one per screen size, picked by the media queries in app/[lang]/layout.tsx.
// Made from the Android app's launch artwork (mobile/assets/splash.png): the mark and wordmark, centred on black.
//
// Usage, from app/: node scripts/apple-splash.mjs   (after changing mobile/assets/splash.png or src/lib/apple-splash.json)
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';

const sharp = createRequire(import.meta.url)('sharp');
const ROOT = new URL('..', import.meta.url).pathname;
const OUT = path.join(ROOT, 'public/splash');
const SIZES = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/lib/apple-splash.json'), 'utf8'));

// The artwork square (2732 px, the mark and wordmark about 1342 px wide in the middle, its glow fading to black).
const SRC = path.join(ROOT, '../mobile/assets/splash.png'), SQUARE = 2732, ART = 1342;
fs.mkdirSync(OUT, { recursive: true });
for (const [w, h, dpr] of SIZES) {
  const W = w * dpr, H = h * dpr;
  // The artwork across about 60% of the width on phones, less on the wider iPads; the square's edges are black,
  // so it is cut down to the screen without the glow being clipped.
  const S = Math.round(SQUARE * W * (w < 600 ? 0.6 : 0.42) / ART);
  const cw = Math.min(S, W), ch = Math.min(S, H);
  const art = await sharp(SRC).resize(S, S).extract({ left: (S - cw) >> 1, top: (S - ch) >> 1, width: cw, height: ch }).toBuffer();
  await sharp({ create: { width: W, height: H, channels: 3, background: '#000000' } })
    .composite([{ input: art, gravity: 'center' }])
    .png({ compressionLevel: 9 })
    .toFile(path.join(OUT, `apple-${W}x${H}.png`));
}
console.log(SIZES.length, 'images in', OUT);
