/**
 * A square image of the verdict for sharing (1080 × 1080 PNG): place, verdict, score, best window and
 * the 12-hour bars, on the site's dark background with the logo ring.
 */
export interface ShareCardData {
  place: string;
  /** Small heading, e.g. "Tonight". */
  kicker: string;
  verdict: string;
  verdictColor: string;
  score: number;
  scoreLabel: string;
  line: string;
  barsLabel: string;
  bars: { label: string; score: number; color: string }[];
  site: string;
}

export async function shareCardBlob(d: ShareCardData): Promise<Blob | null> {
  const S = 1080;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  if (!g) return null;
  // Use the page's fonts once they're ready, so the card matches the site.
  try { await document.fonts.ready; } catch { /* system fonts */ }
  const body = "'Barlow', 'Helvetica Neue', Arial, sans-serif";

  drawSky(g, S, d.score);

  // Logo ring and brand.
  g.save(); g.translate(112, 112); g.rotate(-0.38);
  g.strokeStyle = '#6CFF2B'; g.lineWidth = 9; g.shadowColor = '#6CFF2B'; g.shadowBlur = 18;
  g.beginPath(); g.ellipse(0, 0, 44, 28, 0, 0, Math.PI * 2); g.stroke(); g.restore();
  g.fillStyle = '#fff'; g.beginPath(); g.arc(112, 112, 8, 0, Math.PI * 2); g.fill();
  g.font = "800 44px 'Archivo', sans-serif"; g.textBaseline = 'middle';
  g.fillStyle = '#fff'; g.fillText('POLAR', 186, 112);
  g.fillStyle = '#6CFF2B'; g.fillText('LIGHTS', 186 + g.measureText('POLAR ').width, 112);

  // Place and kicker.
  g.textBaseline = 'alphabetic';
  g.fillStyle = '#6CFF2B'; g.font = `700 40px ${body}`; g.fillText(d.kicker.toUpperCase(), 80, 270);
  g.fillStyle = '#C9D0CB'; g.font = `600 44px ${body}`; g.fillText(d.place, 80, 330);

  // Verdict, shrunk to fit one line.
  let size = 128;
  g.font = `800 ${size}px 'Archivo', sans-serif`;
  while (g.measureText(d.verdict.toUpperCase()).width > S - 160 && size > 60) { size -= 4; g.font = `800 ${size}px 'Archivo', sans-serif`; }
  g.fillStyle = d.verdictColor; g.shadowColor = d.verdictColor; g.shadowBlur = 28;
  g.fillText(d.verdict.toUpperCase(), 80, 330 + 40 + size);
  g.shadowBlur = 0;
  const yScore = 330 + 40 + size + 120;
  g.fillStyle = '#fff'; g.font = `800 110px 'Archivo', sans-serif`; g.fillText(String(d.score), 80, yScore);
  const sw = g.measureText(String(d.score)).width;
  g.fillStyle = '#9AA39D'; g.font = `500 40px ${body}`; g.fillText(`/100 ${d.scoreLabel}`, 80 + sw + 18, yScore);
  g.fillStyle = '#fff'; g.font = `600 40px ${body}`; g.fillText(d.line, 80, yScore + 76, S - 160);

  // 12-hour bars.
  const top = 790, h = 150, gap = 12, w = (S - 160 - gap * 11) / 12;
  g.fillStyle = '#9AA39D'; g.font = `600 30px ${body}`; g.fillText(d.barsLabel, 80, top - 22);
  d.bars.forEach((b, i) => {
    const x = 80 + i * (w + gap);
    g.fillStyle = '#121613'; roundRect(g, x, top, w, h, 10); g.fill();
    const bh = Math.max(8, (h * b.score) / 100);
    g.fillStyle = b.color; roundRect(g, x, top + h - bh, w, bh, 10); g.fill();
    g.fillStyle = '#9AA39D'; g.font = `500 26px 'JetBrains Mono', monospace`; g.textAlign = 'center';
    g.fillText(b.label, x + w / 2, top + h + 38); g.textAlign = 'left';
  });

  g.fillStyle = '#6CFF2B'; g.font = `700 34px ${body}`; g.textAlign = 'right'; g.fillText(d.site, S - 80, S - 48); g.textAlign = 'left';
  return new Promise(res => c.toBlob(b => res(b), 'image/png'));
}

/** Night sky with stars, aurora curtains (brighter for a higher score) and a mountain ridge above the bars. */
function drawSky(g: CanvasRenderingContext2D, S: number, score: number) {
  const sky = g.createLinearGradient(0, 0, 0, S);
  sky.addColorStop(0, '#02030a'); sky.addColorStop(0.55, '#06121a'); sky.addColorStop(1, '#020403');
  g.fillStyle = sky; g.fillRect(0, 0, S, S);

  // Stars from a fixed seed, so every card looks the same apart from the aurora's strength.
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 220; i++) {
    const x = rnd() * S, y = rnd() * 760, r = rnd() * 1.6 + 0.3;
    g.fillStyle = `rgba(255,255,255,${0.25 + rnd() * 0.6})`;
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  }

  const k = 0.5 + 0.5 * Math.min(1, score / 70);
  g.save();
  g.globalCompositeOperation = 'lighter';
  // A broad glow along the band, then curtains of fine rays: green at the foot, fading through teal to violet.
  for (const [cx, cy, r] of [[760, 470, 420], [430, 560, 360], [1000, 380, 300]]) {
    const glow = g.createRadialGradient(cx, cy, 10, cx, cy, r);
    glow.addColorStop(0, `rgba(80,255,120,${0.22 * k})`); glow.addColorStop(1, 'rgba(80,255,120,0)');
    g.fillStyle = glow; g.fillRect(0, 0, S, S);
  }
  for (let x = -20; x < S + 20; x += 2) {
    const foot = 600 + 70 * Math.sin(x / 170 + 0.6) + 28 * Math.sin(x / 61) - 120 * (x / S);
    const height = 230 + 150 * Math.sin(x / 120 + 1.3) ** 2 + 40 * Math.sin(x / 37);
    const ray = 0.45 + 0.55 * (0.5 + 0.5 * Math.sin(x / 9.5) * Math.sin(x / 23 + 2));
    const fade = Math.min(1, (x + 20) / 260);
    const a = k * ray * fade;
    const grad = g.createLinearGradient(0, foot, 0, foot - height);
    grad.addColorStop(0, `rgba(108,255,90,${0.5 * a})`);
    grad.addColorStop(0.08, `rgba(108,255,90,${0.32 * a})`);
    grad.addColorStop(0.55, `rgba(50,210,170,${0.12 * a})`);
    grad.addColorStop(0.85, `rgba(150,90,255,${0.06 * a})`);
    grad.addColorStop(1, 'rgba(150,90,255,0)');
    g.fillStyle = grad;
    g.fillRect(x, foot - height, 2, height + 18);
  }
  g.restore();

  // Keep the text side readable.
  const shade = g.createLinearGradient(0, 0, S * 0.75, 0);
  shade.addColorStop(0, 'rgba(0,0,0,0.55)'); shade.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = shade; g.fillRect(0, 0, S, 760);

  // Mountain ridge, then solid ground under the bars.
  g.fillStyle = '#020302';
  g.beginPath(); g.moveTo(0, 730);
  const ridge = [[0, 730], [90, 700], [170, 722], [260, 668], [340, 712], [430, 690], [520, 726], [610, 676], [700, 706], [790, 660], [880, 702], [960, 684], [S, 712]];
  for (const [x, y] of ridge) g.lineTo(x, y);
  g.lineTo(S, S); g.lineTo(0, S); g.closePath(); g.fill();
}

function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, w / 2, h / 2);
  g.beginPath();
  g.moveTo(x + rr, y); g.arcTo(x + w, y, x + w, y + h, rr); g.arcTo(x + w, y + h, x, y + h, rr);
  g.arcTo(x, y + h, x, y, rr); g.arcTo(x, y, x + w, y, rr); g.closePath();
}
