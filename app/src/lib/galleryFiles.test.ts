import { describe, expect, it } from 'vitest';
import { removeFolder, removeOrphans } from './galleryFiles';

/** A stand-in storage bucket holding `files` (paths), with folders listed the way Supabase lists them. */
function fakeStorage(files: string[], o: { orphans?: string[]; stuck?: boolean } = {}) {
  const left = new Set(files);
  const calls = { remove: [] as number[] };
  const bucket = {
    list: async (dir: string, { limit, offset }: { limit: number; offset: number }) => {
      const names = new Map<string, boolean>();
      for (const p of left) if (p.startsWith(dir + '/')) {
        const rest = p.slice(dir.length + 1);
        const [head, ...more] = rest.split('/');
        names.set(head, more.length === 0 || names.get(head) === true);
      }
      const rows = [...names].sort().map(([name, file]) => ({ name, id: file ? name : null }));
      return { data: rows.slice(offset, offset + limit), error: null };
    },
    remove: async (paths: string[]) => {
      calls.remove.push(paths.length);
      if (o.stuck) return { data: [], error: null };
      for (const p of paths) left.delete(p);
      return { data: paths.map(name => ({ name })), error: null };
    },
  };
  let orphans = [...(o.orphans ?? [])];
  const admin = {
    storage: { from: () => bucket },
    rpc: async () => ({ data: orphans.filter(n => left.has(n)).slice(0, 500).map(name => ({ name })), error: null }),
  } as never;
  return { admin, left, calls, setOrphans: (x: string[]) => { orphans = x; } };
}

describe('removeFolder', () => {
  it('removes every file, past the first page and inside subfolders, in chunks', async () => {
    const files = Array.from({ length: 2350 }, (_, i) => `u1/${String(i).padStart(5, '0')}.jpg`).concat(['u1/old/a.jpg', 'u2/keep.jpg']);
    const s = fakeStorage(files);
    expect(await removeFolder(s.admin, 'u1')).toBe(2351);
    expect([...s.left]).toEqual(['u2/keep.jpg']);
    expect(Math.max(...s.calls.remove)).toBeLessThanOrEqual(100);
  });
});

describe('removeOrphans', () => {
  it('clears what the database lists, in rounds', async () => {
    const orphans = Array.from({ length: 700 }, (_, i) => `u3/${i}.jpg`);
    const s = fakeStorage([...orphans, 'u4/live.jpg'], { orphans });
    expect(await removeOrphans(s.admin)).toEqual({ removed: 700 });
    expect([...s.left]).toEqual(['u4/live.jpg']);
  });
  it('stops when nothing can be removed instead of looping', async () => {
    const s = fakeStorage(['u5/a.jpg'], { orphans: ['u5/a.jpg'], stuck: true });
    expect(await removeOrphans(s.admin)).toEqual({ removed: 0 });
    expect(s.calls.remove.length).toBe(1);
  });
});
