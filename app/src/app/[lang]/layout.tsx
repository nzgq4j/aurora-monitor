import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import './globals.css';
import { Footer, Header, TabBar, Toast } from '../../components/Chrome';
import { PullToRefresh } from '../../components/PullToRefresh';
import { InstallPrompt } from '../../components/InstallPrompt';
import { G_SCALE } from '../../lib/astro';
import { kpNow } from '../../lib/feeds';
import { AuthProvider } from '../../lib/auth';
import { NIGHT_BOOT, NightFilter, NightModeProvider } from '../../components/NightMode';
import { LocationsProvider } from '../../lib/locations';
import { StoreProvider } from '../../store';
import { SITE } from '../../lib/site';
import { ServiceWorker } from '../../components/ServiceWorker';
import { UpdateCheck } from '../../components/UpdateCheck';
import { AppPush } from '../../components/AppPush';
import { FitHeadings } from '../../components/FitHeadings';
import { LOCALES } from '../../i18n/config';
import { I18nProvider } from '../../i18n/I18n';
import { getI18n, getMessages, routeLocale } from '../../i18n/server';

// One prerendered copy of every page per language; the proxy picks which one a visitor gets.
export const generateStaticParams = () => LOCALES.map(lang => ({ lang }));
export const dynamicParams = false;

type Props = { params: Promise<{ lang: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { t } = await getI18n(await routeLocale(params));
  return {
    metadataBase: new URL(SITE.url),
    title: { default: `${SITE.name} · ${t('meta.tagline')}`, template: `%s · ${SITE.name}` },
    description: t('meta.description'),
    applicationName: SITE.name,
    appleWebApp: { capable: true, title: SITE.name, statusBarStyle: 'black' },
    openGraph: { type: 'website', siteName: SITE.name, url: '/', images: [{ url: '/icons/icon-512.png', width: 512, height: 512 }] },
    icons: {
      icon: [{ url: '/icons/icon.svg', type: 'image/svg+xml' }, { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' }],
      apple: '/icons/apple-touch-icon.png',
    },
    formatDetection: { telephone: false },
  };
}

// viewport-fit=cover lets the layout use the full screen on notched phones; safe-area insets are applied in CSS.
export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#000000', colorScheme: 'dark', viewportFit: 'cover' };

export default async function RootLayout({ children, params }: Props & { children: ReactNode }) {
  const locale = await routeLocale(params);
  const [kp, messages, { num }] = await Promise.all([kpNow(), getMessages(locale), getI18n(locale)]);
  const kpLabel = kp ? `KP ${num(kp.kp, 2)}${G_SCALE(kp.kp) ? ` · G${G_SCALE(kp.kp)}` : ''}` : 'KP —';
  return (
    <html lang={locale} suppressHydrationWarning>
      <head>
        {/* Red night mode, applied before the first paint when it's switched on (components/NightMode). */}
        <script dangerouslySetInnerHTML={{ __html: NIGHT_BOOT }} />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* Loaded as a stylesheet (not next/font) so the SVG charts can reference the families by name. */}
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@62..125,400..900&family=Barlow:wght@400;500;600;700&family=JetBrains+Mono:wght@400;600&display=swap"
        />
      </head>
      <body>
        <NightFilter />
        <I18nProvider locale={locale} messages={messages}>
          <AuthProvider>
            <StoreProvider>
              <LocationsProvider>
                <NightModeProvider>
                <div className="app">
                  <Header kpLabel={kpLabel} />
                  <Toast />
                  {children}
                  <Footer />
                  <TabBar />
                  <PullToRefresh />
                </div>
                <ServiceWorker />
                <UpdateCheck />
                <AppPush />
                <InstallPrompt />
                <FitHeadings />
                </NightModeProvider>
              </LocationsProvider>
            </StoreProvider>
          </AuthProvider>
        </I18nProvider>
      </body>
    </html>
  );
}
