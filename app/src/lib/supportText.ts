/** Pure helpers for the help centre's articles (lib/support.ts), kept apart so they can be tested. */

export const SECTIONS = ['start', 'faq', 'troubleshooting', 'science'] as const;
export type Section = (typeof SECTIONS)[number];
export const isSection = (s: string): s is Section => (SECTIONS as readonly string[]).includes(s);

/** Splits a Markdown file into its front matter (key: value lines between --- fences) and body. */
export function parseArticle(src: string): { meta: Record<string, string>; body: string } {
  const text = src.replace(/^﻿/, '').replace(/\r\n/g, '\n');
  const m = text.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!m) return { meta: {}, body: text };
  const meta: Record<string, string> = {};
  for (const line of m[1].split('\n')) {
    const i = line.indexOf(':');
    if (i < 1) continue;
    meta[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^(["'])(.*)\1$/, '$2');
  }
  return { meta, body: text.slice(m[0].length) };
}

/** HTML to readable text: tags removed, the common entities decoded, spaces collapsed. */
export const plainText = (html: string) => html
  .replace(/<[^>]+>/g, ' ')
  .replace(/&nbsp;/g, ' ').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
  .replace(/\s+/g, ' ').trim();

/** A heading's anchor: letters (any alphabet, accents dropped from Latin ones) and digits, joined by dashes. */
export const slugify = (s: string) => s.toLowerCase().normalize('NFD').replace(/([a-z])[̀-ͯ]+/g, '$1').normalize('NFC')
  .replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '');

/** Lowercase without accents, so "metéo" matches "meteo" in search. */
export const fold = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '');

/** Entries containing every word of the query (titles first, then summaries, then text). */
export function search<T extends { title: string; summary: string; text: string }>(entries: T[], query: string): T[] {
  const words = fold(query).split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const score = (e: T) => {
    const t = fold(e.title), s = fold(e.summary), x = fold(e.text);
    if (!words.every(w => t.includes(w) || s.includes(w) || x.includes(w))) return -1;
    return words.reduce((n, w) => n + (t.includes(w) ? 3 : s.includes(w) ? 2 : 1), 0);
  };
  return entries.map(e => [e, score(e)] as const).filter(([, n]) => n >= 0).sort((a, b) => b[1] - a[1]).map(([e]) => e);
}
