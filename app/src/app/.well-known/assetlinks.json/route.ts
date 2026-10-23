import { NextResponse } from 'next/server';

/**
 * Digital Asset Links for the Android app: Android checks this file to let the app open polarlights.io
 * links itself (App Links; the paths are in mobile/android/app/src/main/AndroidManifest.xml). Set on Vercel:
 *   ANDROID_PACKAGE_NAME   io.polarlights.app
 *   ANDROID_CERT_SHA256    app signing key fingerprint(s) from Play Console → App integrity, comma-separated
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
