/** Draws a real card for every kind (fonts come from Google Fonts; skipped when offline). */
import { describe, expect, it } from 'vitest';
import { cardAlt, renderCard } from './socialCard';
import { EVENT_KINDS, sampleEvent } from './socialEvents';
import { graphemes, MAX_ALT, MAX_IMAGE_BYTES } from './bluesky';

const NOW = Date.parse('2026-11-18T14:30:00Z');
const online = await fetch('https://fonts.googleapis.com/css2?family=Barlow:wght@500').then(r => r.ok, () => false);

describe('card alt text', () => {
  it('is substantial and within limits, for every kind', () => {
    for (const k of EVENT_KINDS) {
      const alt = cardAlt(sampleEvent(k, NOW), {});
      expect(graphemes(alt)).toBeGreaterThan(150);
      expect(graphemes(alt)).toBeLessThanOrEqual(MAX_ALT);
      expect(alt).not.toMatch(/official warning/i);
      expect(alt).toContain('UTC');
    }
  });
});

describe.skipIf(!online)('renderCard', () => {
  it('draws a PNG under 1 MB with alt text for every kind', async () => {
    for (const k of EVENT_KINDS) {
      const c = await renderCard(sampleEvent(k, NOW), {});
      expect([...c.bytes.slice(0, 4)]).toEqual([137, 80, 78, 71]);
      expect(c.bytes.length).toBeLessThan(MAX_IMAGE_BYTES);
      expect(c.alt.length).toBeGreaterThan(150);
    }
  }, 60000);
});
