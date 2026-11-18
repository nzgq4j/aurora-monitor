import { cameraById } from '../../../../lib/skycams';
import { fetchFrame } from '../../../../lib/skycamFetch';

// No `dynamic = 'force-dynamic'` here: it would turn off the fetch cache (fetchCache = 'force-no-store') that keeps
// upstream load at one request per cadence. The route still runs per request because it reads dynamic params.

/**
 * GET /api/skycam/:id: the latest frame of a cleared all-sky camera, unaltered, served over HTTPS.
 * Only registry ids are accepted (no URLs from clients); anything else, or a camera not cleared for display,
 * is 404. The CDN caches the response for one cadence interval (s-maxage), and the upstream fetch is cached
 * for the same interval, so the operator sees at most one request per interval.
 * X-Skycam-Captured carries the frame's capture time (ISO 8601) so the panel can tell a stale frame.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const cam = cameraById(id);
  if (!cam || cam.license.status !== 'cleared' || !cam.imageUrl) return new Response('Not found', { status: 404 });
  const r = await fetchFrame(cam);
  if (!r.ok) return new Response(r.error, { status: 502, headers: { 'Cache-Control': 'public, s-maxage=30', 'Content-Type': 'text/plain' } });
  const cadence = Math.max(30, cam.cadenceSeconds ?? 300);
  return new Response(r.frame.bytes as unknown as BodyInit, {
    headers: {
      'Content-Type': r.frame.type,
      'Cache-Control': `public, s-maxage=${cadence}, stale-while-revalidate=${Math.floor(cadence / 2)}`,
      'X-Skycam-Captured': r.frame.capturedAt ? new Date(r.frame.capturedAt).toISOString() : '',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
