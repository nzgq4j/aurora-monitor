import { describe, expect, it } from 'vitest';
import { sharePost, shareStamp } from './share';

const t = ((k: string) => (k === 'gal.post.via' ? 'shared from Polar Lights' : k)) as Parameters<typeof sharePost>[0];

describe('share posts', () => {
  it('gives the card title, its summary and where it is from', () => {
    expect(sharePost(t, 'Space weather', 'Bz south at −9 nT: helping aurora')).toBe('Space weather: Bz south at −9 nT: helping aurora · shared from Polar Lights');
  });
  it('stamps a card with the data time in UT', () => {
    const date = (x: string | number, o: Intl.DateTimeFormatOptions) => new Date(x).toLocaleString('en-GB', o);
    expect(shareStamp({ date }, Date.UTC(2026, 10, 7, 5, 58))).toBe('7 Nov, 05:58 UT');
  });
});
