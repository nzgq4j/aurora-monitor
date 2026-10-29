import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getI18n, routeLocale } from '../../../../i18n/server';
import { articles, liveSections } from '../../../../lib/support';
import { isSection, type Section } from '../../../../lib/supportText';
import { SupportContact } from '../../../../components/SupportContact';
import type { MessageKey } from '../../../../i18n/core';

type Props = { params: Promise<{ lang: string; section: string }> };

export const generateStaticParams = () => liveSections('en').map(section => ({ section }));
export const dynamicParams = false;

async function sectionOf(params: Props['params']): Promise<Section> {
  const { section } = await params;
  if (!isSection(section)) notFound();
  return section;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const section = await sectionOf(params);
  const { t } = await getI18n(await routeLocale(params));
  return { title: t(`support.section.${section}` as MessageKey), description: t(`support.section.${section}.desc` as MessageKey), alternates: { canonical: `/support/${section}` } };
}

/** A section of the help centre: every article in it. The FAQ shows its answers in place, with structured data. */
export default async function Page({ params }: Props) {
  const section = await sectionOf(params);
  const locale = await routeLocale(params);
  const { t } = await getI18n(locale);
  const list = articles(locale, section);
  if (!list.length) notFound();
  const faq = section === 'faq';
  const ld = faq && {
    '@context': 'https://schema.org', '@type': 'FAQPage',
    mainEntity: list.map(a => ({ '@type': 'Question', name: a.title, acceptedAnswer: { '@type': 'Answer', text: a.text } })),
  };
  return (
    <main className="wrap support">
      <nav className="support-crumbs" aria-label={t('support.crumbs')}><Link href="/support">{t('support.title')}</Link></nav>
      <h1 className="display support-h1">{t(`support.section.${section}` as MessageKey)}</h1>
      <p className="support-lead">{t(`support.section.${section}.desc` as MessageKey)}</p>
      {faq ? (
        <div className="support-faq">
          {list.map(a => (
            <details key={a.slug} id={a.slug}>
              <summary>{a.title}</summary>
              <div className="support-body" lang={a.fallback ? 'en' : undefined} dangerouslySetInnerHTML={{ __html: a.html }} />
              <Link href={`/support/faq/${a.slug}`} className="support-more">{t('support.permalink')}</Link>
            </details>
          ))}
        </div>
      ) : (
        <ul className="support-index">
          {list.map(a => (
            <li key={a.slug}>
              <Link href={`/support/${section}/${a.slug}`}><b>{a.title}</b>{a.summary && <span>{a.summary}</span>}</Link>
            </li>
          ))}
        </ul>
      )}
      <SupportContact />
      {ld && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld).replace(/</g, '\\u003c') }} />}
    </main>
  );
}
