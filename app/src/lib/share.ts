import { inApp, shareInApp } from './gallery';
import { SITE } from './site';
import type { I18n } from '../i18n/I18n';

/** The post that goes with a shared card: its title and summary, and where it's from. */
export const sharePost = (t: I18n['t'], title: string, summary: string) => `${title}: ${summary} · ${t('gal.post.via')}`;
/** When a card's data is from, for the top of its share picture (UT, as the data). */
export const shareStamp = ({ date }: Pick<I18n, 'date'>, at: number) => `${date(at, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'UTC' })} UT`;

export type ShareOutcome = 'done' | 'copied' | 'cancelled' | 'failed';

/**
 * Shares a picture with a ready-written post and a link, as well as the device allows: in the Android app
 * through its share sheet (picture and post), in browsers that share files the picture with the post,
 * else the post and link, and on desktops without a share sheet it copies the post and link. Call it
 * straight from the tap with the picture already made: Safari only opens the share sheet from a tap.
 */
export async function shareOut(file: File | null, text: string, url: string, title: string = SITE.name): Promise<ShareOutcome> {
  try {
    if (file && inApp() && await shareInApp(file, `${text}\n${url}`)) return 'done';
    if (file && navigator.canShare?.({ files: [file] })) { await navigator.share({ files: [file], title, text: `${text}\n${url}` }); return 'done'; }
    if (navigator.share) { await navigator.share({ title, text, url }); return 'done'; }
    await navigator.clipboard.writeText(`${text}\n${url}`);
    return 'copied';
  } catch (e) {
    return (e as Error).name === 'AbortError' ? 'cancelled' : 'failed';
  }
}
