import type { Metadata } from 'next';
import { getI18n, routeLocale } from '../../../i18n/server';
import { LegalPage, type LegalSection } from '../../../components/LegalPage';
import { LEGAL } from '../../../lib/site';
import { TRIAL_DAYS } from '../../../data';

type Props = { params: Promise<{ lang: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { t } = await getI18n(await routeLocale(params));
  return { title: t('title.terms') };
}

const mail = <a href={`mailto:${LEGAL.email}`}>{LEGAL.email}</a>;

const sections: LegalSection[] = [
  {
    h: 'Agreement',
    body: <p>These terms apply to your use of Polar Lights, the website at www.polarlights.io and the Polar Lights app for Android (the &ldquo;Service&rdquo;), operated by {LEGAL.operator} (&ldquo;we&rdquo;, &ldquo;us&rdquo;). By using the Service you agree to them. Our <a href="/privacy">privacy policy</a> explains how we handle personal data.</p>,
  },
  {
    h: 'What the Service is, and what it isn’t',
    body: <>
      <p>Polar Lights shows aurora forecasts, space weather and sky conditions based on public scientific data and our own calculations, and can send you alerts. Aurora is hard to predict: forecasts, visibility scores, alerts and sighting reports can be wrong, late or unavailable. They are for planning and enjoyment only.</p>
      <p>Do not rely on the Service for your safety. Aurora watching often means driving at night, in cold weather and in remote places; check road and weather conditions from official sources and use your own judgement. Respect private property and local rules.</p>
    </>,
  },
  {
    h: 'Your account',
    body: <p>You must be at least 13 years old to create an account. Give accurate information, keep your sign-in details secure and tell us at {mail} if you think someone else has used your account. You are responsible for activity under your account.</p>,
  },
  {
    h: 'Plans, trials and billing',
    body: <>
      <p>Some features are available only on a paid plan (Chaser). Prices, what each plan includes and the billing period are shown before you subscribe. Subscriptions renew automatically at the end of each period until cancelled.</p>
      <p>A first subscription may start with a free trial of {TRIAL_DAYS} days. Unless you cancel before the trial ends, the subscription then starts and you are charged.</p>
      <p>On the website, payments are processed by Stripe; you can cancel or change your plan in your dashboard, and cancellation takes effect at the end of the period you have paid for. Subscriptions bought in the Android app are billed by Google Play under its terms and are managed and cancelled in Google Play.</p>
      <p>Payments are non-refundable and we do not refund partial periods, except where the law or the app store&rsquo;s policy requires otherwise. We may change prices; a change applies from your next renewal, and we will tell you in advance.</p>
    </>,
  },
  {
    h: 'Acceptable use',
    body: <>
      <p>Don&rsquo;t misuse the Service. In particular, don&rsquo;t:</p>
      <ul>
        <li>report sightings you didn&rsquo;t make, or otherwise submit false or misleading information;</li>
        <li>scrape, copy or resell the Service or its data in bulk, or use it to build a competing service;</li>
        <li>interfere with the Service, probe or bypass its security, or access other people&rsquo;s accounts or data;</li>
        <li>use the Service in breach of any law.</li>
      </ul>
    </>,
  },
  {
    h: 'Your content',
    body: <p>Photos you take in Sky view stay yours and stay on your device unless you share them. When you report a sighting, you allow us to store it and to show it, without anything that identifies you, on the map and in summaries of aurora activity.</p>,
  },
  {
    h: 'Data sources',
    body: <p>The Service uses data from NOAA SWPC, NASA, GFZ Potsdam, EUMETSAT, Open-Meteo and others. That data is provided by them &ldquo;as is&rdquo;; we don&rsquo;t control its accuracy or availability, and their own terms may apply to it.</p>,
  },
  {
    h: 'Our rights',
    body: <p>The Service, its design, software and content (other than third-party data and your content) belong to {LEGAL.operator} or its licensors. You may use the Service for your own personal, non-commercial use. Polar Lights and its logo are our trademarks.</p>,
  },
  {
    h: 'Changes and availability',
    body: <p>We may change, add or remove features, and the Service may sometimes be unavailable. If we change these terms in a way that matters, we will tell you in advance by email or in the app; continuing to use the Service after the change means you accept it.</p>,
  },
  {
    h: 'Ending your use',
    body: <p>You can stop using the Service and delete your account at any time (see the privacy policy). We may suspend or close accounts that break these terms. If we close your account without cause, we will refund any unused part of a paid period.</p>,
  },
  {
    h: 'Disclaimers',
    body: <p>To the extent the law allows, the Service is provided &ldquo;as is&rdquo; and &ldquo;as available&rdquo;, without warranties of any kind, including that forecasts or alerts are accurate, timely or complete, or that the Service will be uninterrupted or error-free.</p>,
  },
  {
    h: 'Limitation of liability',
    body: <p>To the extent the law allows, {LEGAL.operator} is not liable for indirect, incidental, special or consequential losses, or for lost trips, travel costs or missed aurora, arising from your use of the Service. Our total liability for any claim relating to the Service is limited to the greater of the amount you paid us in the 12 months before the claim and USD 50. Nothing in these terms limits liability that cannot be limited by law, or your rights as a consumer under the law of the country where you live.</p>,
  },
  {
    h: 'Governing law',
    body: <p>These terms are governed by the laws of the State of {LEGAL.governingLaw}, United States, without regard to its conflict-of-law rules, and disputes are subject to the courts located in {LEGAL.governingLaw}. If you are a consumer living elsewhere, you also keep the protection of the mandatory laws of your country.</p>,
  },
  {
    h: 'Contact',
    body: <p>Questions about these terms: {LEGAL.operator}, {mail}.</p>,
  },
];

/** Terms of service (linked from the footer and the Play listing). */
export default async function Terms({ params }: Props) {
  const locale = await routeLocale(params);
  const { t } = await getI18n(locale);
  return (
    <LegalPage kicker={t('legal.kicker')} title={[t('terms.h1a'), t('terms.h1b')]} updated={LEGAL.updated} sections={sections}
      note={locale === 'en' ? null : t('legal.englishOnly')}
      intro={<p>Please read these terms before using Polar Lights.</p>} />
  );
}
