/**
 * A path on this site to continue to (?next=, ?from=), or null. The browser's URL parser turns `/\evil.com`
 * and `/<tab>/evil.com` into another site, so the value is resolved first and kept only when it stays on
 * this origin; backslashes and control characters are refused outright.
 */
export function sameOriginPath(raw: string | null): string | null {
  if (!raw || !raw.startsWith('/') || /[\\\u0000-\u001f\u007f]/.test(raw)) return null;
  try {
    const u = new URL(raw, window.location.origin);
    return u.origin === window.location.origin ? u.pathname + u.search + u.hash : null;
  } catch {
    return null;
  }
}
