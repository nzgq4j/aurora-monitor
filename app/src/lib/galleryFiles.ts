import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';

const BUCKET = 'gallery';
/** Files per storage remove call. */
const CHUNK = 100;

/** Remove files from the gallery bucket in chunks; the number removed (failures are logged, not thrown). */
export async function removeFiles(admin: SupabaseClient, paths: string[]): Promise<number> {
  let done = 0;
  for (let i = 0; i < paths.length; i += CHUNK) {
    const part = paths.slice(i, i + CHUNK);
    const { data, error } = await admin.storage.from(BUCKET).remove(part);
    if (error) console.error('gallery files: remove failed', error.message);
    else done += data?.length ?? 0;
  }
  return done;
}

/**
 * Every file in a member's gallery folder, however many, including any in subfolders. Used when an
 * account is closed; anything missed here is caught by the daily cleanup (gallery_orphans).
 */
export async function removeFolder(admin: SupabaseClient, folder: string): Promise<number> {
  const paths: string[] = [];
  const walk = async (dir: string, depth: number) => {
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await admin.storage.from(BUCKET).list(dir, { limit: 1000, offset });
      if (error) { console.error('gallery files: list failed', error.message); return; }
      for (const f of data ?? []) {
        // Folders come back without an id.
        if (f.id) paths.push(`${dir}/${f.name}`);
        else if (depth < 3) await walk(`${dir}/${f.name}`, depth + 1);
      }
      if ((data?.length ?? 0) < 1000) return;
    }
  };
  await walk(folder, 0);
  return removeFiles(admin, paths);
}

/** Files more than a day old that no live photo uses (see gallery_orphans in the database), in rounds. */
export async function removeOrphans(admin: SupabaseClient, rounds = 5): Promise<{ removed: number; error?: string }> {
  let removed = 0;
  for (let r = 0; r < rounds; r++) {
    const { data, error } = await admin.rpc('gallery_orphans', { p_limit: 500 });
    if (error) return { removed, error: error.message };
    const names = ((data as { name: string }[] | null) ?? []).map(x => x.name);
    if (!names.length) break;
    const n = await removeFiles(admin, names);
    removed += n;
    // Nothing could be removed this round: stop rather than ask for the same files again.
    if (n === 0) break;
  }
  return { removed };
}
