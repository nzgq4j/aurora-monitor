import { NextResponse, type NextRequest } from 'next/server';
import { LOCALES, LOCALE_COOKIE, isLocale, negotiate } from './i18n/config';

/**
 * Serves every page in the visitor's language without changing the URL: /map is rewritten to
 * /{lang}/map, using the language cookie if set, otherwise the browser's Accept-Language.
 */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (LOCALES.some(l => pathname === `/${l}` || pathname.startsWith(`/${l}/`))) return;
  const saved = request.cookies.get(LOCALE_COOKIE)?.value;
  const lang = isLocale(saved) ? saved : negotiate(request.headers.get('accept-language'));
  const url = request.nextUrl.clone();
  url.pathname = `/${lang}${pathname === '/' ? '' : pathname}`;
  return NextResponse.rewrite(url);
}

export const config = {
  // Pages only: skip API routes, Next internals, .well-known and any path with a file extension.
  matcher: ['/((?!api/|_next/|\\.well-known/|.*\\..*).*)'],
};
