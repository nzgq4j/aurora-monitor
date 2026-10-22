import { describe, expect, it } from 'vitest';
import { renderPendingEmail, type Waiting } from './moderatorMail';

const w = (i: number, extra: Partial<Waiting> = {}): Waiting => ({ id: `p${i}`, handle: `member${i}`, caption: null, place: null, thumb: `https://x.test/${i}_t.jpg`, ...extra });

describe('moderators’ email', () => {
  it('names the poster of a single photo and links to the review page', () => {
    const m = renderPendingEmail([w(1, { place: 'Nordland, NO', caption: 'Pillars' })], 1);
    expect(m.subject).toBe('New photo to review from member1');
    expect(m.html).toContain('/gallery/moderate');
    expect(m.text).toContain('member1, Nordland, NO: Pillars');
  });
  it('counts several photos and says how many wait in all', () => {
    const m = renderPendingEmail([w(1), w(2)], 5);
    expect(m.subject).toBe('2 new photos to review');
    expect(m.text).toContain('5 photos are waiting for approval in all.');
  });
  it('escapes what members wrote', () => {
    const m = renderPendingEmail([w(1, { handle: '<b>x</b>', caption: '"><script>alert(1)</script>' })], 1);
    expect(m.html).not.toContain('<script>');
    expect(m.html).not.toContain('<b>x</b>');
    expect(m.html).toContain('&lt;script&gt;');
  });
  it('lists at most ten and counts the rest', () => {
    const m = renderPendingEmail(Array.from({ length: 13 }, (_, i) => w(i)), 13);
    expect(m.html.match(/<img /g)?.length).toBe(10);
    expect(m.text).toContain('and 3 more');
  });
});
