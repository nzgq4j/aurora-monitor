import { NextResponse } from 'next/server';

/**
 * Digital Asset Links for the Android app (Trusted Web Activity). Chrome checks this file to open
 * the site full-screen inside the Play Store app without a browser bar. Set on Vercel:
 *   ANDROID_PACKAGE_NAME   e.g. watch.oval.app
 *   ANDROID_CERT_SHA256    signing-key fingerprint(s) from Play Console → App integrity, comma-separated
 */
export const dynamic = 'force-dynamic';

export function GET() {
  const pkg = process.env.ANDROID_PACKAGE_NAME;
  const prints = (process.env.ANDROID_CERT_SHA256 ?? '').split(',').map(s => s.trim()).filter(Boolean);
  if (!pkg || !prints.length) return NextResponse.json([], { status: 404 });
  return NextResponse.json([{
    relation: ['delegate_permission/common.handle_all_urls'],
    target: { namespace: 'android_app', package_name: pkg, sha256_cert_fingerprints: prints },
  }]);
}
