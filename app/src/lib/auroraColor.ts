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
  // Turns yellow from 20 to 40 % and red from 40 to 70 %, so moderate aurora already reads as stronger.
  const col = mix(mix(GREEN, YELLOW, smooth(20, 40, p)), RED, smooth(40, 70, p));
  // Opacity a little above the globe's main shell (1.1) to stand in for its wider glow shell.
  return { rgb: col.map(v => Math.round(toSrgb(v) * 255)) as [number, number, number], alpha: Math.min(0.95, smooth(3, 30, p) * 1.35) };
}

/** The same scale as a CSS gradient, for legends (5% → 90%): green by 20 %, yellow at 40 %, red from 70 %. */
export const AURORA_RAMP = 'linear-gradient(90deg, rgba(161,255,133,.25), #a1ff85 18%, #fff195 41%, #ff9595 76%)';
