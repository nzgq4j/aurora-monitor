import { describe, expect, it } from 'vitest';
import { badges, rank, specialBadges, type Achievement, type MemberInfo } from './badges';

const member: MemberInfo = { handle: 'x', points: 0, helpful: 0, isAdmin: false };
const ach = (kind: string, ref: string, value: number | null = null): Achievement => ({ kind, ref, at: '2026-10-20T22:00:00Z', value, points: 0 });
const find = (list: ReturnType<typeof badges>, id: string) => list.find(b => b.id === id)!;

describe('badges', () => {
  it('gives tiers by count', () => {
    const reports = Array.from({ length: 12 }, (_, i) => ach('report', String(i)));
    const b = find(badges(reports, member), 'reporter');
    expect(b.tier).toBe('silver');
    expect(b.level).toBe(2);
    expect(b.next).toBe(25);
  });
  it('locks badges with nothing earned and shows the first step', () => {
    const b = find(badges([], member), 'reporter');
    expect(b.tier).toBe('locked');
    expect(b.next).toBe(1);
  });
  it('shows single badges as gold once earned', () => {
    const b = find(badges([ach('kp7', 'once', 6.67)], member), 'kp7');
    expect(b.tier).toBe('gold');
    expect(b.next).toBeNull();
  });
  it('counts helpful votes from the member, not achievements', () => {
    expect(find(badges([], { ...member, helpful: 55 }), 'appreciated').tier).toBe('silver');
  });
  it('makes one limited badge per storm day with its G level', () => {
    const list = badges([ach('storm', '2026-10-20', 7.67), ach('storm', '2026-10-10', 6.67)], member);
    const storms = list.filter(b => b.day);
    expect(storms.map(b => [b.day, b.label])).toEqual([['2026-10-20', 'G4'], ['2026-10-10', 'G3']]);
  });
  it('needs all four seasons for Year-round', () => {
    const three = ['winter', 'spring', 'autumn'].map(s => ach('season', s));
    expect(find(badges(three, member), 'yearRound').level).toBe(0);
    expect(find(badges([...three, ach('season', 'summer')], member), 'yearRound').level).toBe(3);
  });
});

describe('rank', () => {
  it('moves up at each threshold', () => {
    expect(rank(0).id).toBe('stargazer');
    expect(rank(99).id).toBe('stargazer');
    expect(rank(100).id).toBe('watcher');
    expect(rank(250).id).toBe('spotter');
    expect(rank(4000).id).toBe('polarLegend');
    expect(rank(4000).next).toBeNull();
  });
  it('reports progress to the next rank', () => expect(rank(175).progress).toBeCloseTo(0.5));
});

describe('specialBadges', () => {
  const row = { slug: 'low-latitude', kind: 'auto', name: { en: 'Low Latitude', sv: 'Låg latitud' }, description: { en: 'Far south.' }, glyph: 'globe', at: '2026-10-20T22:00:00Z', value: 52.4 };
  it('names the badge in the member’s language, falling back to English', () => {
    expect(specialBadges([row], 'sv')[0]).toMatchObject({ id: 'special:low-latitude', tier: 'special', level: 3, title: 'Låg latitud', text: 'Far south.' });
    expect(specialBadges([row], 'fi')[0].title).toBe('Low Latitude');
  });
  it('uses a star for a glyph the app doesn’t know', () => expect(specialBadges([{ ...row, glyph: 'nope' }], 'en')[0].glyph).toBe('star'));
});
