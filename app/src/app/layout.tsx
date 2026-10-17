import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import './globals.css';
import { Footer, Header, Toast } from '../components/Chrome';
import { G_SCALE } from '../lib/astro';
import { kpNow } from '../lib/feeds';
import { AuthProvider } from '../lib/auth';
import { LocationsProvider } from '../lib/locations';
import { StoreProvider } from '../store';
import { ServiceWorker } from '../components/ServiceWorker';

export const metadata: Metadata = {
  title: 'OVAL · Aurora monitor',
  description: 'Live aurora forecasts, the auroral oval, and alerts for your sky.',
  applicationName: 'OVAL',
  appleWebApp: { capable: true, title: 'OVAL', statusBarStyle: 'black' },
  icons: {
    icon: [{ url: '/icons/icon.svg', type: 'image/svg+xml' }, { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' }],
    apple: '/icons/apple-touch-icon.png',
  },
  formatDetection: { telephone: false },
};

// viewport-fit=cover lets the layout use the full screen on notched phones; safe-area insets are applied in CSS.
export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#000000', colorScheme: 'dark', viewportFit: 'cover' };

export default async function RootLayout({ children }: { children: ReactNode }) {
  const kp = await kpNow();
  const kpLabel = kp ? `KP ${kp.kp.toFixed(2)}${G_SCALE(kp.kp) ? ` · G${G_SCALE(kp.kp)}` : ''}` : 'KP —';
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* Loaded as a stylesheet (not next/font) so the SVG charts can reference the families by name. */}
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@62..125,400..900&family=Barlow:wght@400;500;600;700&family=JetBrains+Mono:wght@400;600&display=swap"
        />
      </head>
      <body>
        <AuthProvider>
          <StoreProvider>
            <LocationsProvider>
              <div className="app">
                <Header kpLabel={kpLabel} />
                <Toast />
                {children}
                <Footer />
              </div>
              <ServiceWorker />
            </LocationsProvider>
          </StoreProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
