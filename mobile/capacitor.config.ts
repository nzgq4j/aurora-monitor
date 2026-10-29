import type { CapacitorConfig } from '@capacitor/cli';

/**
 * The app loads the live site, so web releases reach it without a store update. `www/` holds only
 * the page shown when the site can't be reached (offline on first launch).
 */
const config: CapacitorConfig = {
  appId: 'io.polarlights.app',
  appName: 'Polar Lights',
  webDir: 'www',
  server: {
    url: 'https://www.polarlights.io',
    // Pages on these hosts stay in the app (and can use its native plugins); other links open in the
    // browser. Only our own site: Google sign-in is native in the app, so no auth pages load here.
    allowNavigation: ['www.polarlights.io', 'polarlights.io'],
    errorPath: 'offline.html',
  },
  android: {
    // Only https content; no cleartext.
    allowMixedContent: false,
    backgroundColor: '#000000',
  },
  plugins: {
    // The launch screen stays until the site has drawn its first screen (the site calls SplashScreen.hide(),
    // see app/src/components/NativeSplash.tsx), and at most 3 seconds, then fades out.
    SplashScreen: { launchShowDuration: 3000, launchAutoHide: true, launchFadeOutDuration: 250, backgroundColor: '#000000', showSpinner: false },
    // Edge to edge (Android 15+): the site sets viewport-fit=cover and pads with env(safe-area-inset-*).
    // Light status and navigation bar icons on the black app.
    SystemBars: { insetsHandling: 'native', initialViewportFitValueHint: 'cover', style: 'DARK' },
    // Show alerts as notifications even while the app is open.
    PushNotifications: { presentationOptions: ['badge', 'sound', 'alert'] },
  },
};

export default config;
