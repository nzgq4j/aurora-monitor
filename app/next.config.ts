import type { NextConfig } from 'next';

/**
 * Sent with every response. No other site may frame these pages (clickjacking the account and billing
 * buttons); browsers mustn't guess content types; other sites see only our origin as the referrer; and
 * features the site doesn't use are switched off. The camera, motion sensors and location stay allowed
 * for Sky view and saved places.
 */
const SECURITY_HEADERS = [
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Content-Security-Policy', value: "frame-ancestors 'none'" },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(self), geolocation=(self), microphone=(), payment=(), usb=(), serial=(), bluetooth=()' },
  { key: 'Strict-Transport-Security', value: 'max-age=31536000' },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // The build the browser runs, compared with /api/version to reload onto new releases (UpdateCheck).
  env: { NEXT_PUBLIC_BUILD_ID: process.env.VERCEL_GIT_COMMIT_SHA ?? 'dev' },
  async redirects() {
    // Account was renamed Dashboard; keep old links and installed shortcuts working.
    return [{ source: '/account', destination: '/dashboard', permanent: true }];
  },
  async headers() {
    return [
      { source: '/:path*', headers: SECURITY_HEADERS },
      // The service worker must always be revalidated so updates reach installed apps promptly.
      { source: '/sw.js', headers: [{ key: 'Cache-Control', value: 'no-cache' }, { key: 'Content-Type', value: 'application/javascript; charset=utf-8' }] },
    ];
  },
};

export default nextConfig;
