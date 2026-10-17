import { dailyMax, gfzKp, kpNow, outlook27, type KpDay, type OutlookDay } from './feeds';

export interface AccountData {
  /** Daily maximum Kp for the last 90 UTC days (GFZ Potsdam). */
  days: KpDay[];
  /** NOAA 27-day outlook, today onward. */
  outlook: OutlookDay[];
  kp: { t: number; kp: number } | null;
  fetchedAt: number;
}

export async function loadAccount(): Promise<AccountData> {
  const [hist, outlook, kp] = await Promise.all([gfzKp(90), outlook27(), kpNow()]);
  const today = Math.floor(Date.now() / 864e5) * 864e5;
  return { days: dailyMax(hist).slice(-90), outlook: outlook.filter(d => d.t >= today), kp, fetchedAt: Date.now() };
}
