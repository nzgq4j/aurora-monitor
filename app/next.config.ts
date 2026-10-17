import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  async redirects() {
    // Account was renamed Dashboard; keep old links and installed shortcuts working.
    return [{ source: '/account', destination: '/dashboard', permanent: true }];
  },
  async headers() {
    return [
      // The service worker must always be revalidated so updates reach installed apps promptly.
      { source: '/sw.js', headers: [{ key: 'Cache-Control', value: 'no-cache' }, { key: 'Content-Type', value: 'application/javascript; charset=utf-8' }] },
    ];
  },
};

export default nextConfig;
