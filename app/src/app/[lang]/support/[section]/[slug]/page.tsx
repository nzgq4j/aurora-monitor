import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getI18n, routeLocale } from '../../../../../i18n/server';
import { allPaths, article, articles } from '../../../../../lib/support';
import { isSection } from '../../../../../lib/supportText';
import { SupportContact } from '../../../../../components/SupportContact';
import type { MessageKey } from '../../../../../i18n/core';
import type { Locale } from '../../../../../i18n/config';

type Props = { params: Promise<{ lang: string; section: string; slug: string }> };

export async function generateStaticParams({ params }: { params: { section: string } }) {
  return allPaths().filter(p => p.section === params.section).map(({ slug }) => ({ slug }));
}
export const dynamicParams = false;

async function find(params: Props['params']) {
  const { section, slug } = await params;
  const locale: Locale = await routeLocale(params);
  const a = isSection(section) ? article(locale, section, slug) : null;
  if (!a) notFound();
  return { a, locale };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { a } = await find(params);
  return { title: a.title, description: a.summary || undefined, alternates: { canonical: `/support/${a.section}/${a.slug}` } };
}

/** One help article: contents (for longer ones), the article, more in its section, and contact. */
export default async function Page({ params }: Props) {
  const { a, locale } = await find(params);
  const { t } = await getI18n(locale);
  const more = articles(locale, a.section).filter(x => x.slug !== a.slug).slice(0, 6);
  return (
    <main className="wrap support support-article">
      <nav className="support-crumbs" aria-label={t('support.crumbs')}>
        <Link href="/support">{t('support.title')}</Link>
        <span aria-hidden="true">›</span>
        <Link href={`/support/${a.section}`}>{t(`support.section.${a.section}` as MessageKey)}</Link>
      </nav>
      <article lang={a.fallback ? 'en' : undefined}>
        <h1 className="support-title">{a.title}</h1>
        {a.fallback && <p className="legal-note" lang={locale}>{t('support.fallback')}</p>}
        {a.summary && <p className="support-lead">{a.summary}</p>}
        {a.headings.length >= 3 && (
          <nav className="support-toc" aria-label={t('support.contents')} lang={locale}>
            <span className="label">{t('support.contents')}</span>
            <ol>{a.headings.map(h => <li key={h.id}><a href={`#${h.id}`}>{h.text}</a></li>)}</ol>
          </nav>
        )}
        <div className="support-body" dangerouslySetInnerHTML={{ __html: a.html }} />
      </article>
      {more.length > 0 && (
        <section className="support-list" aria-labelledby="support-more">
          <h2 id="support-more">{t('support.moreIn', { section: t(`support.section.${a.section}` as MessageKey) })}</h2>
          <ul>{more.map(x => <li key={x.slug}><Link href={`/support/${x.section}/${x.slug}`}>{x.title}</Link></li>)}</ul>
        </section>
      )}
      <SupportContact />
    </main>
  );
}
