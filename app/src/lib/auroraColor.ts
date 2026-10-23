// One colour scale for the aurora everywhere: the 2D map, the Now page oval and the 3D globe
// (whose shader, AURORA_FRAG in components/Globe.tsx, uses the same numbers). The aurora is drawn
// as its colour at an opacity that grows with probability, so faint values simply fade out.

const GREEN = [0.35, 1, 0.23], YELLOW = [1, 0.88, 0.3], RED = [1, 0.3, 0.3];

/** The globe's shader works in linear light and converts to sRGB on output; do the same here so the colours match. */
const toSrgb = (v: number) => (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055);
const smooth = (a: number, b: number, x: number) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const mix = (a: number[], b: number[], k: number) => a.map((v, i) => v + (b[i] - v) * k);

/** Colour (0–255 RGB) and opacity (0–1) for an OVATION probability (%): green, through yellow, to red. */
export function auroraColor(p: number): { rgb: [number, number, number]; alpha: number } {
  // Turns yellow from 15 to 30 % and red from 30 to 40 %: everything from 40 % up is red.
  const col = mix(mix(GREEN, YELLOW, smooth(15, 30, p)), RED, smooth(30, 40, p));
  // The globe's main shell uses the same opacity (AURORA_FRAG, strength 1.35).
  return { rgb: col.map(v => Math.round(toSrgb(v) * 255)) as [number, number, number], alpha: Math.min(0.95, smooth(3, 30, p) * 1.35) };
}

/** The same scale as a CSS gradient, for legends (5% → 90%): green to 15 %, yellow at 30 %, red from 40 %. */
export const AURORA_RAMP = 'linear-gradient(90deg, rgba(161,255,133,.25), #a1ff85 12%, #fff195 29%, #ff9595 41%, #ff9595)';
/** Legend labels and where they sit along that 5–90 % bar. */
export const AURORA_TICKS = [5, 20, 40, 90].map(p => ({ p, at: ((p - 5) / 85) * 100 }));
