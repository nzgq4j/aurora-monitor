import { describe, expect, it } from 'vitest';
import { detectFacets, expiresSoon, graphemes, jwtExp, postProblem, postRecord, postUrl, type Session } from './bluesky';

const bytes = (s: string) => new TextEncoder().encode(s);
const slice = (text: string, f: { index: { byteStart: number; byteEnd: number } }) => new TextDecoder().decode(bytes(text).slice(f.index.byteStart, f.index.byteEnd));

describe('graphemes', () => {
  it('counts user-perceived characters, not UTF-16 units', () => {
    expect(graphemes('aurora')).toBe(6);
    expect(graphemes('👍🏽')).toBe(1);
    expect(graphemes('🇳🇴')).toBe(1);
    expect('👍🏽'.length).toBe(4);
  });
});

describe('detectFacets', () => {
  it('finds links and tags with UTF-8 byte offsets on accented and CJK text', () => {
    const text = 'Orage géomagnétique à Tromsø 🌌 #aurore #地震 voir https://www.polarlights.io/map. #séisme';
    const f = detectFacets(text);
    expect(f.map(x => slice(text, x))).toEqual(['#aurore', '#地震', 'https://www.polarlights.io/map', '#séisme']);
    expect(f[2].features[0]).toEqual({ $type: 'app.bsky.richtext.facet#link', uri: 'https://www.polarlights.io/map' });
    expect(f[1].features[0]).toEqual({ $type: 'app.bsky.richtext.facet#tag', tag: '地震' });
  });
  it('skips digit-only tags and # inside words', () => {
    expect(detectFacets('G3 #2026 storm#aurora')).toEqual([]);
  });
});

describe('postProblem', () => {
  it('enforces 300 graphemes, 3000 bytes and 2000-grapheme alt text', () => {
    expect(postProblem('')).toBe('empty');
    expect(postProblem('a'.repeat(300))).toBeNull();
    expect(postProblem('a'.repeat(301))).toBe('too_long');
    expect(postProblem('ok', 'x'.repeat(2001))).toBe('alt_too_long');
  });
});

describe('session expiry', () => {
  const jwt = (exp: number) => `x.${Buffer.from(JSON.stringify({ exp })).toString('base64url')}.y`;
  it('reads exp and refreshes within 5 minutes', () => {
    const now = Date.parse('2026-11-18T12:00:00Z');
    expect(jwtExp(jwt(123))).toBe(123);
    const s = (exp: number): Session => ({ service: 'https://bsky.social', did: 'did:plc:x', handle: 'h', accessJwt: jwt(exp), refreshJwt: 'r' });
    expect(expiresSoon(s(now / 1000 + 60), now)).toBe(true);
    expect(expiresSoon(s(now / 1000 + 3600), now)).toBe(false);
    expect(expiresSoon({ ...s(0), accessJwt: 'garbage' }, now)).toBe(true);
  });
});

describe('postRecord', () => {
  it('builds the record with facets, langs and an image embed with aspect ratio', () => {
    const r = postRecord('Hi https://a.io #aurora', 'en', '2026-11-18T12:00:00.000Z', { blob: { ref: 'b' }, alt: 'A card', width: 1080, height: 1350 });
    expect(r.langs).toEqual(['en']);
    expect(r.facets).toHaveLength(2);
    expect(r.embed?.images[0]).toEqual({ image: { ref: 'b' }, alt: 'A card', aspectRatio: { width: 1080, height: 1350 } });
    expect(postUrl('polarlights.io', 'at://did:plc:x/app.bsky.feed.post/3abc')).toBe('https://bsky.app/profile/polarlights.io/post/3abc');
  });
});
