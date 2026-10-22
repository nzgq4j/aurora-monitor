import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../lib/billing';
import { removeOrphans } from '../../../../lib/galleryFiles';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Called daily by Supabase pg_cron (see supabase/migrations/…_gallery_integrity.sql) with the same Vault
 * key as the alert run. Clears gallery files that no live photo uses: uploads never posted, files of removed
 * photos whose clean-up failed, and folders of closed accounts.
 */
export async function POST(req: Request) {
  const key = req.headers.get('x-alerts-key');
  if (!key) return NextResponse.json({ error: 'unauthorised' }, { status: 401 });
  let admin;
  try { admin = supabaseAdmin(); } catch { return NextResponse.json({ error: 'not_configured' }, { status: 503 }); }
  const { data: ok, error } = await admin.rpc('check_alerts_key', { k: key });
  if (error || ok !== true) return NextResponse.json({ error: 'unauthorised' }, { status: 401 });
  const result = await removeOrphans(admin);
  console.log('gallery cleanup', JSON.stringify(result));
  return NextResponse.json(result, { status: result.error ? 500 : 200 });
}
