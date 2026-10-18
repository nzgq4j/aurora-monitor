// Cloud forecast for a point (Open-Meteo), shared by /api/conditions and the alert engine.

export interface CloudLayers { low: number; mid: number; high: number }

export interface CloudForecast {
  /** Total cloud now, %. */
  now: number;
  /** Cloud that matters for aurora now, %: low and mid in full, thin high cloud at half weight. */
  aurora: number;
  layers: CloudLayers;
  /** The same aurora weighting for each of the next 12 hours. */
  next12h: { t: number; pct: number }[];
}

/** Layers combined as independent coverings, with high cloud at half weight; never above the total. */
const auroraCloud = (total: number, { low, mid, high }: CloudLayers) =>
  Math.round(Math.min(total, 100 * (1 - (1 - low / 100) * (1 - mid / 100) * (1 - high / 200))));

export async function cloudCover(lat: number, lon: number): Promise<CloudForecast | null> {
  const vars = 'cloud_cover,cloud_cover_low,cloud_cover_mid,cloud_cover_high';
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(3)}&longitude=${lon.toFixed(3)}&current=${vars}&hourly=${vars}&forecast_hours=12&timezone=GMT`;
  try {
    const res = await fetch(url, { next: { revalidate: 900 } });
    if (!res.ok) return null;
    const j = await res.json();
    const c = j?.current ?? {};
    if (![c.cloud_cover, c.cloud_cover_low, c.cloud_cover_mid, c.cloud_cover_high].every(v => typeof v === 'number')) return null;
    const layers = { low: c.cloud_cover_low, mid: c.cloud_cover_mid, high: c.cloud_cover_high };
    const h = j?.hourly ?? {};
    const next12h = ((h.time ?? []) as string[]).map((t, i) => ({
      t: Date.parse(t + 'Z'),
      pct: auroraCloud(h.cloud_cover?.[i], { low: h.cloud_cover_low?.[i], mid: h.cloud_cover_mid?.[i], high: h.cloud_cover_high?.[i] }),
    })).filter(x => Number.isFinite(x.t) && Number.isFinite(x.pct));
    return { now: c.cloud_cover, aurora: auroraCloud(c.cloud_cover, layers), layers, next12h };
  } catch {
    return null;
  }
}

