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

  const bg = g.createRadialGradient(S * 0.85, S * 0.1, 40, S * 0.85, S * 0.1, S * 1.1);
  bg.addColorStop(0, '#13261a'); bg.addColorStop(0.55, '#050605'); bg.addColorStop(1, '#000');
  g.fillStyle = bg; g.fillRect(0, 0, S, S);

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

function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, w / 2, h / 2);
  g.beginPath();
  g.moveTo(x + rr, y); g.arcTo(x + w, y, x + w, y + h, rr); g.arcTo(x + w, y + h, x, y + h, rr);
  g.arcTo(x, y + h, x, y, rr); g.arcTo(x, y, x + w, y, rr); g.closePath();
}
