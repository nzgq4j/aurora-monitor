import { beforeAll, describe, expect, it } from 'vitest';
import { sameOriginPath } from './safeUrl';

beforeAll(() => {
  (globalThis as unknown as { window: unknown }).window = { location: { origin: 'https://www.polarlights.io' } };
});

describe('sameOriginPath', () => {
  it('keeps paths on this site', () => {
    expect(sameOriginPath('/badges')).toBe('/badges');
    expect(sameOriginPath('/gallery/photo?id=1#top')).toBe('/gallery/photo?id=1#top');
  });
  it('refuses anything that leaves the site', () => {
    for (const v of ['//evil.com', '/\\evil.com', '/\t/evil.com', 'https://evil.com', 'evil.com', '', null]) {
      expect(sameOriginPath(v)).toBeNull();
    }
  });
});
