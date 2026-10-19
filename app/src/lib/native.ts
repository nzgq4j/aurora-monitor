/**
 * The Android app (mobile/): a Capacitor shell that loads this site and adds native plugins, reached as
 * window.Capacitor.Plugins.<name>. On the website these are all absent.
 */
type CapacitorGlobal = { isNativePlatform?: () => boolean; Plugins?: Record<string, unknown> };
const capacitor = () => (typeof window === 'undefined' ? undefined : (window as unknown as { Capacitor?: CapacitorGlobal }).Capacitor);

/** Running inside the app. */
export const inApp = () => !!capacitor()?.isNativePlatform?.();

/** One of the app's plugins (e.g. 'PhotoLibrary', 'GoogleSignIn'), or null on the website or an app without it. */
export const nativePlugin = <T,>(name: string): T | null => (inApp() ? (capacitor()?.Plugins?.[name] as T | undefined) ?? null : null);
