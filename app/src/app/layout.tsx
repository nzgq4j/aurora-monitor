import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import './globals.css';
import { Footer, Header, Toast } from '../components/Chrome';
import { LocationsProvider } from '../lib/locations';
import { StoreProvider } from '../store';

export const metadata: Metadata = {
  title: 'OVAL · Aurora monitor',
  description: 'Live aurora forecasts, the auroral oval, and alerts for your sky.',
};

export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#000000' };

export default function RootLayout({ children }: { children: ReactNode }) {
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
        <StoreProvider>
          <LocationsProvider>
            <div className="app">
              <Header />
              <Toast />
              {children}
              <Footer />
            </div>
          </LocationsProvider>
        </StoreProvider>
      </body>
    </html>
  );
}
