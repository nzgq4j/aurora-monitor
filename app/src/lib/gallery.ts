/**
 * The sky view's photo gallery (#99): photos are kept on this device in IndexedDB, as a camera app keeps
 * its own media library, and saved to Photos or shared from there. Nothing is uploaded.
 */

import { nativePlugin } from './native';

export interface GalleryPhoto {
  id: string;
  /** When the photo was taken, ms. */
  taken: number;
  name: string;
  photo: Blob;
  /** About 360 px on the long side, for the grid. */
  thumb: Blob;
  /** Saved to Photos or shared at least once. */
  exported: boolean;
}

const DB = 'polarlights-gallery', STORE = 'photos';

let opening: Promise<IDBDatabase> | null = null;
function db(): Promise<IDBDatabase> {
  return (opening ??= new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE, { keyPath: 'id' }).createIndex('taken', 'taken');
    r.onsuccess = () => res(r.result);
    r.onerror = () => { opening = null; rej(r.error); };
  }));
}

function run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> {
  return db().then(d => new Promise((res, rej) => {
    const tx = d.transaction(STORE, mode), req = fn(tx.objectStore(STORE));
    tx.oncomplete = () => res(req ? req.result : undefined);
    tx.onerror = tx.onabort = () => rej(tx.error);
  }));
}

/** A small JPEG of the photo for the grid. */
async function thumbnail(photo: Blob): Promise<Blob> {
  const bmp = await createImageBitmap(photo);
  const k = Math.min(1, 360 / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
  c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height);
  bmp.close();
  return new Promise((res, rej) => c.toBlob(b => (b ? res(b) : rej(new Error('thumb'))), 'image/jpeg', 0.8));
}

/** Keep a photo in the gallery; asks the browser once to keep the gallery when space runs low. */
export async function addPhoto(photo: Blob, name: string, taken = Date.now()): Promise<GalleryPhoto> {
  const p: GalleryPhoto = { id: `${taken}-${Math.random().toString(36).slice(2, 8)}`, taken, name, photo, thumb: await thumbnail(photo), exported: false };
  await run('readwrite', s => s.put(p));
  void navigator.storage?.persist?.().catch(() => {});
  return p;
}

/** Every photo, newest first. */
export async function listPhotos(): Promise<GalleryPhoto[]> {
  const all = (await run<GalleryPhoto[]>('readonly', s => s.getAll())) ?? [];
  return all.sort((a, b) => b.taken - a.taken);
}

export const deletePhotos = (ids: string[]) => run('readwrite', s => { ids.forEach(id => s.delete(id)); });

export async function markExported(photos: GalleryPhoto[]) {
  await run('readwrite', s => { photos.forEach(p => s.put({ ...p, exported: true })); });
}

export const photoFile = (p: GalleryPhoto) => new File([p.photo], p.name, { type: p.photo.type || 'image/jpeg' });

/** iPhone and iPad, where the share sheet's Save Image is the way into Photos. */
export const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

export type ExportResult = 'done' | 'cancelled' | 'downloaded' | 'tap' | 'album' | 'denied' | 'failed';

/** The Android app's photo plugin (mobile/android … PhotoLibraryPlugin.java); null on the website. */
type NativePhotos = Record<'save' | 'share', (o: { photos: { name: string; data: string }[] }) => Promise<unknown>>;
const nativePhotos = () => nativePlugin<NativePhotos>('PhotoLibrary');

/** Running inside the Android app, which saves photos to its own album. */
export const inApp = () => nativePhotos() !== null;

/** A photo as base64 (no data: prefix), for the native plugin. */
const base64 = (b: Blob) => new Promise<string>((res, rej) => {
  const r = new FileReader();
  r.onload = () => res(String(r.result).slice(String(r.result).indexOf(',') + 1));
  r.onerror = () => rej(r.error);
  r.readAsDataURL(b);
});

/**
 * Save photos to the phone as directly as a web page may. In the Android app: straight into a Polar Lights
 * album, or Android's share sheet. iPhone and iPad: the share sheet, whose first action is Save Image /
 * Save N Images. Elsewhere (Android browsers): downloads, which Google Photos and Gallery show under
 * Downloads. `share` always uses the share sheet where there is one.
 */
export async function exportPhotos(photos: GalleryPhoto[], how: 'save' | 'share'): Promise<ExportResult> {
  const native = nativePhotos();
  if (native) {
    try {
      const list = [];
      for (const p of photos) list.push({ name: p.name, data: await base64(p.photo) });
      await native[how]({ photos: list });
      return how === 'save' ? 'album' : 'done';
    } catch (e) {
      return (e as { code?: string }).code === 'denied' ? 'denied' : 'failed';
    }
  }
  const files = photos.map(photoFile);
  if ((how === 'share' || isIOS()) && navigator.canShare?.({ files })) {
    try {
      await navigator.share({ files });
      return 'done';
    } catch (e) {
      // NotAllowedError: the sheet may only open straight from a tap.
      return (e as Error).name === 'AbortError' ? 'cancelled' : 'tap';
    }
  }
  for (const f of files) {
    const url = URL.createObjectURL(f), a = document.createElement('a');
    a.href = url; a.download = f.name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    // Browsers drop downloads started in the same instant.
    if (files.length > 1) await new Promise(r => setTimeout(r, 400));
  }
  return 'downloaded';
}
