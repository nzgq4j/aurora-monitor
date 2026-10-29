import type { Metadata } from 'next';
import { getI18n, routeLocale } from '../../../i18n/server';
import { LegalPage, type LegalSection } from '../../../components/LegalPage';
import { LEGAL } from '../../../lib/site';
import Link from 'next/link';

type Props = { params: Promise<{ lang: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { t } = await getI18n(await routeLocale(params));
  return { title: t('title.deleteAccount') };
}

const mail = <a href={`mailto:${LEGAL.email}?subject=Delete%20my%20Polar%20Lights%20account`}>{LEGAL.email}</a>;

const sections: LegalSection[] = [
  {
    h: 'Delete it yourself',
    body: <>
      <p>In the Polar Lights app for Android, open the <b>You</b> tab and choose <b>Delete account</b> at the bottom. On the website, sign in and open <b>Dashboard → Account</b>, then choose <b>Delete my account</b>. Confirm, and your account is deleted straight away and you are signed out.</p>
      <p><Link href="/signin?next=/dashboard">Sign in to delete your account</Link></p>
    </>,
  },
  {
    h: 'Or ask us',
    body: <p>If you can&rsquo;t sign in, email {mail} from the address on your account and ask us to delete it. We confirm by email and complete the deletion within 30 days.</p>,
  },
  {
    h: 'What is deleted',
    body: <ul>
      <li>your account (email address, name, password or Google sign-in) and language;</li>
      <li>your saved locations;</li>
      <li>your alert settings and the history of alerts sent to you;</li>
      <li>the browsers and phones registered for push alerts;</li>
      <li>your sightings, badges and points;</li>
      <li>the photos you posted to the gallery, with their captions and helpful votes, and your reports and blocks;</li>
      <li>the issue reports and feature requests you sent us.</li>
    </ul>,
  },
  {
    h: 'Delete some of your data and keep your account',
    body: <>
      <p>You can remove parts of your data at any time without deleting your account. In the app, open the <b>You</b> tab; on the website, open the <b>Dashboard</b>.</p>
      <ul>
        <li><b>Saved locations:</b> open <b>Saved locations</b> (website: <b>Dashboard → Locations</b>) and choose <b>Remove</b> on any place.</li>
        <li><b>Gallery photos:</b> open <b>My gallery</b>, choose <b>Select</b>, pick the photos and delete them, or open a photo and choose <b>Delete photo</b>. The photo files are removed from our storage.</li>
        <li><b>Alerts and push:</b> open <b>Alerts</b> under <b>Aurora</b> (website: <b>Dashboard → Alerts</b>) to turn alerts off, or turn off push alerts on the device you are using, which removes it from our list.</li>
      </ul>
      <p>For anything else, such as your sightings or messages you sent us, email {mail} from the address on your account and say what you want removed. We confirm by email and complete it within 30 days.</p>
    </>,
  },
  {
    h: 'Subscriptions and what is kept',
    body: <>
      <p>A Chaser subscription bought on the website is cancelled immediately when you delete your account, and you won&rsquo;t be charged again. A subscription bought in the Android app through Google Play is set not to renew when you delete your account, so you won&rsquo;t be charged again; it shows in the Google Play Store app under <b>Payments &amp; subscriptions</b> until the time already paid for runs out.</p>
      <p>Records of past payments are kept by our payment provider (Stripe) or Google Play for as long as tax and accounting law requires. Standard server logs are deleted by our providers on their usual schedule.</p>
    </>,
  },
];

/** How to delete a Polar Lights account (the deletion link for the Google Play listing). */
export default async function DeleteAccount({ params }: Props) {
  const locale = await routeLocale(params);
  const { t } = await getI18n(locale);
  return (
    <LegalPage kicker={t('legal.kicker')} title={[t('deleteAccount.h1a'), t('deleteAccount.h1b')]} updated={LEGAL.updated} sections={sections}
      note={locale === 'en' ? null : t('legal.englishOnly')}
      intro={<p>You can delete your Polar Lights account and the data stored with it at any time, or delete only some of your data and keep your account. Polar Lights is operated by {LEGAL.operator}.</p>} />
  );
}
