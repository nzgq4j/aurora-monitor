import type { Metadata } from 'next';
import { getI18n, routeLocale } from '../../../i18n/server';
import { LegalPage, type LegalSection } from '../../../components/LegalPage';
import { LEGAL } from '../../../lib/site';

type Props = { params: Promise<{ lang: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { t } = await getI18n(await routeLocale(params));
  return { title: t('title.privacy') };
}

const mail = <a href={`mailto:${LEGAL.email}`}>{LEGAL.email}</a>;

const sections: LegalSection[] = [
  {
    h: 'Who we are',
    body: <p>Polar Lights (the website at www.polarlights.io and the Polar Lights app for Android) is operated by {LEGAL.operator} (&ldquo;we&rdquo;, &ldquo;us&rdquo;). We decide how the personal data described here is used. You can reach us about privacy at {mail}.</p>,
  },
  {
    h: 'What we collect and why',
    body: <>
      <p><b>Your account.</b> Your email address, the display name you choose and your language. If you sign up with a password, it is stored only as a secure hash by our authentication provider. If you sign in with Google, we receive your name and email address from Google. We use this to run your account and to send the alerts and service emails you ask for.</p>
      <p><b>Saved locations.</b> The places you save (a name and coordinates) and which one is your Home. We use them to show your forecast and to decide when to alert you. If you choose to use your device&rsquo;s location, the place it finds is saved like any other location.</p>
      <p><b>Alert settings and history.</b> Your alert rules, thresholds, quiet hours, time zone and delivery choices, and a record of the alerts we sent you (kept for 90 days) so we don&rsquo;t send the same alert twice.</p>
      <p><b>Notifications.</b> If you turn on push alerts, the address your browser or the Android app gives us for delivering notifications (a web push subscription or a Firebase token) and the type of device. We use it only to deliver your alerts.</p>
      <p><b>Sightings.</b> When you report that you saw aurora (&ldquo;I saw it&rdquo;), we store the time, a position rounded to about 10 km, the brightness you choose and the forecast score shown at the time. Recent sightings are shown on the map for 24 hours without anything that identifies you, and every sighting is deleted after 30 days.</p>
      <p><b>Subscriptions.</b> If you subscribe to a paid plan, our payment provider (Stripe) processes your payment. We receive and keep a customer reference, your plan, the subscription status and its renewal date. We never see or store your full card number. In the Android app, purchases may instead be handled by Google Play, which then shares the purchase status with us.</p>
      <p><b>Technical data.</b> Our hosting and database providers keep standard server logs (such as IP address, browser type and the time of a request) for security and to keep the service running.</p>
    </>,
  },
  {
    h: 'What stays on your device',
    body: <>
      <p><b>Camera, motion sensors and Sky view.</b> The camera picture and your phone&rsquo;s compass and motion sensors are used on your device to draw the sky overlay. Photos you take are kept in the app&rsquo;s gallery on your device. They are only copied elsewhere if you save them to your photo library or share them yourself. We never upload them.</p>
      <p><b>Your current position.</b> When you allow location access, your position is used on your device to show your sky. It is sent to us only if you save it as a location, or as a rounded position if you report a sighting.</p>
      <p><b>Preferences.</b> Settings such as red night mode, which cards are open and the map view are stored in your browser or the app (local storage). If you use Polar Lights without an account, your saved locations are stored there too.</p>
    </>,
  },
  {
    h: 'Who we share data with',
    body: <>
      <p>We do not sell your personal data, share it for advertising, or use advertising or tracking cookies. We use these service providers to run Polar Lights, each only for the purpose described:</p>
      <ul>
        <li><b>Supabase</b>: database, accounts and file storage.</li>
        <li><b>Vercel</b>: hosting of the website and its servers.</li>
        <li><b>Stripe</b>: payments for subscriptions bought on the website.</li>
        <li><b>Resend</b>: delivery of alert and account emails.</li>
        <li><b>Google</b>: Sign in with Google, Firebase Cloud Messaging (push alerts in the Android app), Google Play (app distribution and in-app purchases) and Google Fonts (the site&rsquo;s fonts).</li>
        <li><b>Your browser&rsquo;s push service</b> (for example Google, Mozilla or Apple): delivery of push alerts to browsers.</li>
        <li><b>Open-Meteo</b>: cloud forecasts for the coordinates of your locations, and place search.</li>
        <li><b>BigDataCloud</b>: finding the name of the place at your position when you use your device&rsquo;s location.</li>
      </ul>
      <p>Space weather and imagery come from public sources (NOAA, NASA, GFZ Potsdam, EUMETSAT). They receive no personal data from us. We may also disclose data where the law requires it.</p>
    </>,
  },
  {
    h: 'How long we keep data',
    body: <p>Account data, saved locations and alert settings are kept until you delete them or your account. Alert history is kept for 90 days and sightings for 30 days. Notification addresses are removed when you turn push alerts off or when the delivery service reports them as no longer valid. Records of payments are kept as long as tax and accounting law requires.</p>,
  },
  {
    h: 'Your choices and rights',
    body: <>
      <p>You can view and change your name, locations and alert settings in your dashboard, and turn alert emails and push notifications off at any time in Dashboard → Alerts. You can delete your account and its data by writing to {mail} from the email address on your account; we complete deletion within 30 days.</p>
      <p>Depending on where you live, you may have the right to access, correct, delete or export your personal data, to object to or restrict its use, and to complain to your data protection authority. To use any of these rights, contact {mail}. We do not sell or share personal data as those terms are defined in California law.</p>
    </>,
  },
  {
    h: 'Where data is processed',
    body: <p>Our service providers may process data in the United States and other countries. Where data from the European Economic Area, the United Kingdom or Switzerland is transferred, it is protected by the providers&rsquo; standard contractual clauses or equivalent safeguards.</p>,
  },
  {
    h: 'Security',
    body: <p>Data is sent over encrypted connections. Access to each account&rsquo;s data in our database is restricted to that account, and our own access to production data is limited to what is needed to run the service.</p>,
  },
  {
    h: 'Children',
    body: <p>Polar Lights is not directed to children under 13, and we do not knowingly collect their personal data. If you believe a child has given us personal data, contact {mail} and we will delete it.</p>,
  },
  {
    h: 'Changes to this policy',
    body: <p>If we change this policy, we will update the date at the top. If a change materially affects how we use your data, we will tell you by email or in the app before it takes effect.</p>,
  },
  {
    h: 'Contact',
    body: <p>{LEGAL.operator}, {mail}.</p>,
  },
];

/** Privacy policy (linked from the footer, Google sign-in and the Play listing). */
export default async function Privacy({ params }: Props) {
  const locale = await routeLocale(params);
  const { t } = await getI18n(locale);
  return (
    <LegalPage kicker={t('legal.kicker')} title={[t('privacy.h1a'), t('privacy.h1b')]} updated={LEGAL.updated} sections={sections}
      note={locale === 'en' ? null : t('legal.englishOnly')}
      intro={<p>This policy explains what personal data Polar Lights collects, why, who it is shared with and the choices you have.</p>} />
  );
}
