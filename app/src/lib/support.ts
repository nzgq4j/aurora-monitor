import 'server-only';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { Marked } from 'marked';
import type { Locale } from '../i18n/config';
import { parseArticle, slugify, plainText, type Section, SECTIONS } from './supportText';

/**
 * The help centre (/support): articles are Markdown files in content/support/{lang}/{section}/{slug}.md
 * (see docs/support-content.md). English is the reference set; an article missing in another language is
 * shown in English with a note. Read at build time only: every support page is prerendered.
 */

const ROOT = path.join(process.cwd(), 'content', 'support');
const SHOTS = path.join(process.cwd(), 'public', 'support', 'shots');

export interface Article {
  section: Section;
  slug: string;
  title: string;
  summary: string;
  order: number;
  /** Shown in English because this language doesn't have it yet. */
  fallback: boolean;
  /** Rendered HTML of the body. */
  html: string;
  /** The body as plain text, for search and the FAQ's structured data. */
  text: string;
  /** Headings in the body (## only), for the contents list. */
  headings: { id: string; text: string }[];
}

function slugsIn(lang: string, section: Section): string[] {
  const dir = path.join(ROOT, lang, section);
  return existsSync(dir) ? readdirSync(dir).filter(f => f.endsWith('.md')).map(f => f.slice(0, -3)) : [];
}

/** A screenshot in the article's language if there is one, else the English one. */
function shot(name: string, lang: string) {
  return existsSync(path.join(SHOTS, lang, `${name}.webp`)) ? `/support/shots/${lang}/${name}.webp` : `/support/shots/en/${name}.webp`;
}

function render(md: string, lang: string): Pick<Article, 'html' | 'headings'> {
  const headings: Article['headings'] = [];
  const marked = new Marked({
    gfm: true,
    renderer: {
      heading({ tokens, depth }) {
        const inner = this.parser.parseInline(tokens);
        const text = plainText(inner);
        const id = slugify(text);
        if (depth === 2) headings.push({ id, text });
        return `<h${depth} id="${id}">${inner}</h${depth}>\n`;
      },
      // Screenshots are written ![alt](screen:name) and come from public/support/shots/{lang}/name.webp.
      image({ href, text }) {
        const src = href.startsWith('screen:') ? shot(href.slice(7), lang) : href;
        return `<figure class="support-shot"><img src="${src}" alt="${text.replace(/"/g, '&quot;')}" loading="lazy" /></figure>`;
      },
      link({ href, tokens }) {
        const inner = this.parser.parseInline(tokens);
        const external = /^https?:\/\//.test(href);
        return `<a href="${href}"${external ? ' target="_blank" rel="noopener noreferrer"' : ''}>${inner}</a>`;
      },
    },
  });
  return { html: marked.parse(md, { async: false }), headings };
}

function load(lang: string, section: Section, slug: string, fallback: boolean): Article | null {
  const file = path.join(ROOT, lang, section, `${slug}.md`);
  if (!existsSync(file)) return null;
  const { meta, body } = parseArticle(readFileSync(file, 'utf8'));
  const { html, headings } = render(body, lang);
  return {
    section, slug, fallback, html, headings,
    title: meta.title ?? slug,
    summary: meta.summary ?? '',
    order: Number(meta.order ?? 100),
    text: plainText(html),
  };
}

const cache = new Map<string, Article[]>();

/** Every article in a section for this language, in order (English stands in for missing ones). */
export function articles(locale: Locale, section: Section): Article[] {
  const key = `${locale}/${section}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const slugs = [...new Set([...slugsIn('en', section), ...slugsIn(locale, section)])];
  const list = slugs
    .map(slug => load(locale, section, slug, false) ?? load('en', section, slug, locale !== 'en'))
    .filter((a): a is Article => !!a)
    .sort((a, b) => a.order - b.order || a.title.localeCompare(b.title));
  cache.set(key, list);
  return list;
}

export const article = (locale: Locale, section: Section, slug: string) => articles(locale, section).find(a => a.slug === slug) ?? null;

/** Sections that have at least one article (empty ones stay hidden). */
export const liveSections = (locale: Locale) => SECTIONS.filter(s => articles(locale, s).length > 0);

/** Every article's address, for prerendering and the sitemap. */
export const allPaths = () => SECTIONS.flatMap(section => [...new Set([...slugsIn('en', section)])].map(slug => ({ section, slug })));

/** What the search box searches: titles, summaries and the start of each article. */
export function searchIndex(locale: Locale) {
  return liveSections(locale).flatMap(section => articles(locale, section).map(a => ({
    href: `/support/${section}/${a.slug}`, section, title: a.title, summary: a.summary, text: a.text.slice(0, 1500),
  })));
}
export type SearchEntry = ReturnType<typeof searchIndex>[number];
