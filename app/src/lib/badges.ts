/**
 * Badges and ranks, worked out from a member's achievements (public.achievements, written by the
 * database: award_sightings every 15 minutes for confirmed "I saw it" reports, post_photo for photos).
 * Points are added up in the database (members.points) so others see the same rank.
 */

/**
 * 'special' (rose gold) and 'borealis' (aurora green, red and purple) are finishes of the secret special-event
 * badges, outside the bronze to aurora ladder.
 */
export type Tier = 'locked' | 'bronze' | 'silver' | 'gold' | 'platinum' | 'aurora' | 'special' | 'borealis';
export const TIERS: Tier[] = ['bronze', 'silver', 'gold', 'platinum', 'aurora'];

export type Glyph = 'eye' | 'sunrise' | 'check2' | 'bolt' | 'camera' | 'heart' | 'star' | 'notes' | 'pin' | 'route' | 'equinox' | 'snow' | 'moon' | 'globe' | 'ticket' | 'flag' | 'question' | 'camp';

export type Family = 'reporter' | 'storm' | 'contributor' | 'explorer' | 'seasoned' | 'special';
export const FAMILIES: Family[] = ['reporter', 'storm', 'contributor', 'explorer', 'seasoned'];

export interface Achievement { kind: string; ref: string; at: string; value: number | null; points: number }
export interface MemberInfo { handle: string; points: number; helpful: number; isAdmin: boolean }

interface Def {
  id: string;
  family: Family;
  glyph: Glyph;
  /** The face label instead of the glyph (storm badges). */
  label?: string;
  /** Counts needed for each tier, bronze first; one number for a single badge (shown in gold). */
  steps: number[];
  count: (a: Achievement[], m: MemberInfo) => number;
}

const n = (kind: string) => (a: Achievement[]) => a.filter(x => x.kind === kind).length;
const has = (kind: string) => (a: Achievement[]) => (a.some(x => x.kind === kind) ? 1 : 0);

const DEFS: Def[] = [
  { id: 'reporter', family: 'reporter', glyph: 'eye', steps: [1, 10, 25, 50, 100], count: n('report') },
  { id: 'firstLight', family: 'reporter', glyph: 'sunrise', steps: [1, 3, 5, 10, 25], count: n('first_light') },
  { id: 'corroborator', family: 'reporter', glyph: 'check2', steps: [3, 10, 25, 50, 100], count: n('corroborate') },
  { id: 'kp5', family: 'storm', glyph: 'bolt', label: 'KP5', steps: [1], count: has('kp5') },
  { id: 'kp7', family: 'storm', glyph: 'bolt', label: 'KP7', steps: [1], count: has('kp7') },
  { id: 'kp9', family: 'storm', glyph: 'bolt', label: 'KP9', steps: [1], count: has('kp9') },
  { id: 'photographer', family: 'contributor', glyph: 'camera', steps: [1, 10, 25, 50, 100], count: n('photo') },
  { id: 'appreciated', family: 'contributor', glyph: 'heart', steps: [10, 50, 100, 250, 500], count: (_, m) => m.helpful },
  { id: 'featured', family: 'contributor', glyph: 'star', steps: [1, 3, 5, 10, 25], count: n('featured') },
  { id: 'fieldNotes', family: 'contributor', glyph: 'notes', steps: [5, 10, 25, 50, 100], count: n('fieldnote') },
  { id: 'furthest', family: 'explorer', glyph: 'pin', steps: [1], count: has('south') },
  { id: 'roadTrip', family: 'explorer', glyph: 'route', steps: [1, 3, 10, 25, 50], count: n('road_trip') },
  { id: 'places', family: 'explorer', glyph: 'pin', steps: [5, 10, 25, 50, 100], count: n('place') },
  { id: 'equinox', family: 'seasoned', glyph: 'equinox', steps: [1, 2, 4, 6, 10], count: n('equinox') },
  { id: 'seasonTracker', family: 'seasoned', glyph: 'snow', steps: [10, 25, 50, 100, 200], count: n('night') },
  { id: 'yearRound', family: 'seasoned', glyph: 'moon', steps: [4], count: n('season') },
];

export interface Badge {
  /** Message key stem (badge.<id>.name / .desc) and the seen-badges key. */
  id: string;
  family: Family;
  glyph: Glyph;
  label?: string;
  tier: Tier;
  /** 0 when locked, 1–5 for bronze–aurora (single badges: 3, shown as gold). */
  level: number;
  count: number;
  /** Count needed for the next tier, or null at the top. */
  next: number | null;
  steps: number[];
  /** For storm-day badges, the UTC day and its G level; for Furthest, the latitude. */
  day?: string;
  g?: number;
  value?: number | null;
  /** When the current tier was reached (the latest achievement counted), ISO. */
  at?: string;
  /** Special badges carry their own name and description (from the database, in the member's language). */
  title?: string;
  text?: string;
}

const G = (kp: number) => (kp >= 8.66 ? 5 : kp >= 7.66 ? 4 : kp >= 6.66 ? 3 : kp >= 5.66 ? 2 : 1);

export function badges(a: Achievement[], m: MemberInfo): Badge[] {
  const out: Badge[] = DEFS.map(d => {
    const count = d.count(a, m);
    const single = d.steps.length === 1;
    const reached = d.steps.filter(s => count >= s).length;
    const level = single ? (reached ? 3 : 0) : reached;
    const tier: Tier = level ? TIERS[level - 1] : 'locked';
    const next = single ? (reached ? null : d.steps[0]) : reached < d.steps.length ? d.steps[reached] : null;
    const latest = a.filter(x => d.count([x], { ...m, helpful: 0 }) > 0).map(x => x.at).sort().pop();
    return { id: d.id, family: d.family, glyph: d.glyph, label: d.label, tier, level, count, next, steps: d.steps, at: latest,
      value: d.id === 'furthest' ? a.find(x => x.kind === 'south')?.value ?? null : undefined };
  });
  // Each storm day (G3 or stronger) is a limited-edition badge of its own, newest first.
  const storms = a.filter(x => x.kind === 'storm').sort((x, y) => y.ref.localeCompare(x.ref));
  for (const s of storms) {
    const g = G(s.value ?? 0);
    out.push({ id: `storm:${s.ref}`, family: 'storm', glyph: 'bolt', label: `G${g}`, tier: 'aurora', level: 5, count: 1, next: null, steps: [1], day: s.ref, g, at: s.at });
  }
  return out;
}

/** A special badge as public.my_special_badges() returns it: names and descriptions by language. */
export interface SpecialRow { slug: string; kind: string; name: Record<string, string>; description: Record<string, string>; glyph: string; finish?: string; at: string; value: number | null }

/**
 * Special badges: secret until earned (Low Latitude, named storm events, tour codes), so only the ones a
 * member holds are ever sent to the app. Named in the member's language, or English.
 */
export function specialBadges(rows: SpecialRow[], locale: string): Badge[] {
  return rows.map(r => ({
    id: `special:${r.slug}`, family: 'special', glyph: r.glyph in GLYPHS ? (r.glyph as Glyph) : 'star', tier: r.finish === 'borealis' ? 'borealis' : 'special',
    level: 3, count: 1, next: null, steps: [1], at: r.at, value: r.value,
    title: r.name[locale] ?? r.name.en, text: r.description[locale] ?? r.description.en,
  }));
}

/** Ranks by points (members.points), lowest first. */
export const RANKS: { id: string; min: number }[] = [
  { id: 'stargazer', min: 0 },
  { id: 'watcher', min: 100 },
  { id: 'spotter', min: 250 },
  { id: 'tracker', min: 500 },
  { id: 'stormHunter', min: 1000 },
  { id: 'auroraHunter', min: 2000 },
  { id: 'polarLegend', min: 4000 },
];

export function rank(points: number) {
  let i = 0;
  while (i + 1 < RANKS.length && points >= RANKS[i + 1].min) i++;
  const next = RANKS[i + 1] ?? null;
  return { index: i, id: RANKS[i].id, next, progress: next ? (points - RANKS[i].min) / (next.min - RANKS[i].min) : 1 };
}

/** Badge colours by tier: rim, face, the two aurora bands, and the glyph. */
export const TIER_COLORS: Record<Tier, { rim: string; face: string; band: string; band2: string; ink: string }> = {
  bronze: { rim: '#C98A55', face: '#1a120c', band: '#C98A55', band2: '#7a4a28', ink: '#E7B48A' },
  silver: { rim: '#C9D0CB', face: '#111413', band: '#C9D0CB', band2: '#6b7570', ink: '#E8ECE9' },
  gold: { rim: '#E6B800', face: '#161204', band: '#E6B800', band2: '#8a6e00', ink: '#FFD84A' },
  platinum: { rim: '#9FE3F5', face: '#0b1417', band: '#9FE3F5', band2: '#4c8c9c', ink: '#D4F5FF' },
  aurora: { rim: '#6CFF2B', face: '#07100a', band: '#6CFF2B', band2: '#B07CFF', ink: '#C9FFB0' },
  special: { rim: '#E8A58F', face: '#160a12', band: '#E86FC8', band2: '#6A3FD0', ink: '#FFD6EC' },
  borealis: { rim: '#6CFF2B', face: '#0a0710', band: '#FF4D6D', band2: '#9B5CFF', ink: '#D8FFC4' },
  locked: { rim: '#2a302c', face: '#0b0d0c', band: '#2a302c', band2: '#1d211e', ink: '#7d857f' },
};

/**
 * Badge finish by tier (components/BadgeIcon): the metal's tones from highlight to shadow, and the glass
 * in the face's three cells, each a [light, dark] pair. Glass is garnet and amber for bronze, ice blue for
 * silver, aurora green for gold, cyan to violet for platinum, green to violet for aurora and storms, and
 * magenta to violet in rose gold for the secret special badges; borealis is the aurora's own colours (green,
 * red and purple) in silver.
 */
export const TIER_METALS: Record<Tier, { metal: string[]; glass: [[string, string], [string, string], [string, string]] }> = {
  bronze: { metal: ['#f6c896', '#c98a55', '#6e3f1e', '#e2a873', '#8a5229', '#f0bd8a'], glass: [['#8a3524', '#3a1009'], ['#e08a3a', '#8a3c12'], ['#5a1f0c', '#220a04']] },
  silver: { metal: ['#ffffff', '#c9d0cb', '#6f7873', '#eef1ef', '#8d9590', '#f6f8f7'], glass: [['#3f7fb0', '#173b5e'], ['#6fb2e0', '#2a5d8a'], ['#1d4a72', '#0a1e33']] },
  gold: { metal: ['#fff3b0', '#e6b800', '#7a5c00', '#ffd84a', '#a88400', '#fff0a0'], glass: [['#2f9a5c', '#0f4a2e'], ['#4fd48c', '#18704a'], ['#167a6c', '#062e2a']] },
  platinum: { metal: ['#ffffff', '#dcecf2', '#7f9aa4', '#f1fafd', '#a3bcc5', '#ffffff'], glass: [['#62b9d6', '#2b7896'], ['#9be3f5', '#4f97cc'], ['#a493ee', '#5548b4']] },
  aurora: { metal: ['#f4fff0', '#c6f7b4', '#6f8c80', '#efe2ff', '#9aa9d6', '#f7fff2'], glass: [['#2e8f3a', '#0e3a1c'], ['#6CFF2B', '#1f7a3a'], ['#B07CFF', '#3d1f80']] },
  special: { metal: ['#ffe9df', '#e8a58f', '#7a4034', '#f6c4b2', '#a2604f', '#ffe0d4'], glass: [['#a03a8c', '#4a0f42'], ['#e86fc8', '#8a2a7a'], ['#6a3fd0', '#251060']] },
  borealis: { metal: ['#ffffff', '#d5dcda', '#6c7a76', '#f2f6f4', '#8f9b97', '#fbfdfc'], glass: [['#3fd46a', '#0d5a2a'], ['#ff5a7a', '#a81c3c'], ['#a35cff', '#3a1580']] },
  locked: { metal: ['#6a706c', '#454b47', '#1f2321', '#565c58', '#2c312e', '#5d635f'], glass: [['#2a3230', '#121615'], ['#232a28', '#0e1211'], ['#1c2220', '#0a0d0c']] },
};

export const GLYPHS: Record<Glyph, string> = {
  eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 9a3 3 0 1 0 0 6a3 3 0 1 0 0-6z',
  sunrise: 'M3 18h18M6 18a6 6 0 0 1 12 0M12 4v4M4.9 9.9l2 2M19.1 9.9l-2 2',
  check2: 'M2 13l4 4 8-9M10 15l2 2 8-9',
  bolt: 'M13 2L4 14h7l-1 8 9-12h-7z',
  camera: 'M4 8h3l2-3h6l2 3h3v11H4zM12 10a3.5 3.5 0 1 0 0 7a3.5 3.5 0 1 0 0-7z',
  heart: 'M12 20s-8-5-8-11a4.5 4.5 0 0 1 8-2.8A4.5 4.5 0 0 1 20 9c0 6-8 11-8 11z',
  star: 'M12 3l2.8 5.8 6.2.9-4.5 4.4 1.1 6.3L12 17.5 6.4 20.4l1.1-6.3L3 9.7l6.2-.9z',
  notes: 'M5 4h10l4 4v12H5zM8 11h8M8 15h6',
  pin: 'M12 22s7-7 7-12a7 7 0 0 0-14 0c0 5 7 12 7 12zM12 7.5a2.5 2.5 0 1 0 0 5a2.5 2.5 0 1 0 0-5z',
  route: 'M5 17a2 2 0 1 0 0 4a2 2 0 1 0 0-4zM19 3a2 2 0 1 0 0 4a2 2 0 1 0 0-4zM7 19h7a3.5 3.5 0 0 0 0-7h-4a3.5 3.5 0 0 1 0-7h7',
  equinox: 'M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18zM12 3v18',
  snow: 'M12 2v20M3.3 7l17.4 10M3.3 17L20.7 7',
  moon: 'M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z',
  globe: 'M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18zM12 3a4 9 0 1 0 0 18a4 9 0 1 0 0-18zM4 8.5h16M3.5 15h17',
  ticket: 'M3 7h18v3a2 2 0 0 0 0 4v3H3v-3a2 2 0 0 0 0-4zM15 8v2M15 14v2',
  flag: 'M5 21V4M5 4h12l-2.5 4.5L17 13H5',
  camp: 'M2.5 20h19M5 20l7-13 7 13M9.5 20l2.5-5 2.5 5M10.5 4.5 12 7l1.5-2.5',
  question: 'M8.5 8.5a3.5 3.5 0 1 1 5.2 3.1c-1.1.6-1.7 1.3-1.7 2.6M12 18.5v.01',
};
