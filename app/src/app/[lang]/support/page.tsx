import type { Metadata } from 'next';
import Link from 'next/link';
import { getI18n, routeLocale } from '../../../i18n/server';
import { articles, liveSections, searchIndex } from '../../../lib/support';
import { SupportSearch } from '../../../components/SupportSearch';
import { SupportContact } from '../../../components/SupportContact';
import { ReplayIntroLink } from '../../../components/Onboarding';
import type { MessageKey } from '../../../i18n/core';

type Props = { params: Promise<{ lang: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { t } = await getI18n(await routeLocale(params));
  return { title: t('support.title'), description: t('support.intro'), alternates: { canonical: '/support' } };
}

/** The help centre's front page: search, the sections that have articles, common questions and contact. */
export default async function Page({ params }: Props) {
  const locale = await routeLocale(params);
  const { t, tn } = await getI18n(locale);
  const sections = liveSections(locale);
  const common = articles(locale, 'faq').slice(0, 6);
  return (
    <main className="wrap support">
      <h1 className="display support-h1">{t('support.h1a')} <span className="hl">{t('support.h1b')}</span></h1>
      <p className="support-lead">{t('support.intro')}</p>
      <SupportSearch index={searchIndex(locale)} />

      <div className="support-cards">
        {sections.map(s => (
          <Link key={s} href={`/support/${s}`} className={`support-card support-card-${s}`}>
            <b>{t(`support.section.${s}` as MessageKey)}</b>
            <span>{t(`support.section.${s}.desc` as MessageKey)}</span>
            <small className="mono">{tn('support.articles', articles(locale, s).length)}</small>
          </Link>
        ))}
      </div>

      {common.length > 0 && (
        <section className="support-list" aria-labelledby="support-common">
          <h2 id="support-common">{t('support.common')}</h2>
          <ul>
            {common.map(a => <li key={a.slug}><Link href={`/support/faq/${a.slug}`}>{a.title}</Link></li>)}
          </ul>
          <Link href="/support/faq" className="support-more">{t('support.viewAll')} →</Link>
        </section>
      )}

      <SupportContact />
      <ReplayIntroLink />
    </main>
  );
}
