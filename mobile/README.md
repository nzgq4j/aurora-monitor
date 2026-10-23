# Polar Lights for Android

The Android app is a [Capacitor](https://capacitorjs.com) shell: a native Android app that loads
https://www.polarlights.io, so every website release reaches the app without a Play Store update.
Native features are added to the shell where the web can't do the job (saving photos to an album,
push notifications, Google Play Billing).

- App ID (package name): `io.polarlights.app` (permanent once uploaded to Google Play)
- `capacitor.config.ts`: the site URL, which hosts stay inside the app, splash and system bars
- `www/offline.html`: shown when the site can't be reached
- `assets/`: sources for the launcher icon and splash; regenerate with
  `npx @capacitor/assets@3.0.5 generate --android --iconBackgroundColor '#000000' --iconBackgroundColorDark '#000000' --splashBackgroundColor '#000000' --splashBackgroundColorDark '#000000'`
- `android/`: the Android Studio project

## First run (Windows)

Needs Android Studio (with the Android SDK from its Standard setup), Node.js 22 LTS and Git.

1. Get the latest code: in Android Studio, **Git → Pull** (or `git pull` in the repository folder).
2. In a terminal (Android Studio's **Terminal** tab works), from the repository folder:

   ```
   cd mobile
   npm install
   npx cap sync android
   ```

3. In Android Studio, **File → Open** and choose the `mobile\android` folder (not the repository
   root). Let Gradle sync finish; accept any SDK component it offers to install.
4. Pick a device in the toolbar (an emulator from **Device Manager**, or your phone with USB
   debugging on) and press **Run ▶**.

After changing `capacitor.config.ts`, `www/` or the plugins, run `npx cap sync android` again.

## What works in the app now, and what's next

| Feature | Status |
| --- | --- |
| All pages, maps, globe, forecasts, alerts settings | Works (the live site) |
| Sign in with email and password | Works |
| Sign in with Google | Android's account picker (`GoogleSignInPlugin.java`), then Supabase `signInWithIdToken`. Needs Google switched on in Supabase, an Android OAuth client (package + SHA-1) and `NEXT_PUBLIC_GOOGLE_CLIENT_ID` on Vercel. Apple sign-in is hidden in the app. |
| Sky view camera and location | Works (Android asks for permission) |
| Night photos in Sky view | Long exposures through Camera2 (`LongExposurePlugin.java`: manual exposure up to the phone's limit, ISO set for the length, focus at infinity, no flash) on phones that allow 1 s or more; elsewhere the website's stacked Night shot. |
| Gallery: Save to Photos / Share | Works: saves into a **Polar Lights** album (Pictures/Polar Lights) and opens Android's share sheet (`PhotoLibraryPlugin.java`) |
| Push notifications | Works: Firebase Cloud Messaging (`@capacitor/push-notifications`; alert icon `ic_stat_aurora`, channel `aurora`, shown as a banner). Uses `android/app/google-services.json` (Firebase project io-polarlights-app), and on Vercel `FCM_SERVICE_ACCOUNT` (secret) and `NEXT_PUBLIC_APP_PUSH=1`. |
| Links to polarlights.io | Android App Links: the home page (alert emails), map, Sky, Alerts and gallery links open in the app (`AndroidManifest.xml` intent filter; `AppLinks.tsx` opens the page). Verified by `/.well-known/assetlinks.json`, from `ANDROID_PACKAGE_NAME` and `ANDROID_CERT_SHA256` (Play's app signing key) on Vercel. Sign-in, checkout, dashboard and password reset stay in the browser. |
| Chaser subscription | Google Play Billing (`PlayBillingPlugin.java`, Play Billing Library 8). Needs the setup below, then `NEXT_PUBLIC_PLAY_BILLING=1` on Vercel. Until then, upgrading in the app shows that it isn't available in this version (Stripe can't be used for purchases inside a Google Play app). |

## Google Play Billing setup

The app sells the Chaser plan with Google Play Billing; the website keeps Stripe. A purchase is tagged
with the user's ID, checked and acknowledged by `/api/play/verify` (Google Play Developer API), and kept
current by Play's real-time developer notifications at `/api/play/rtdn`. Steps, once:

1. **Play Console:** create the app (`io.polarlights.app`) and upload a signed release (AAB) to the
   *Internal testing* track. Play only allows subscriptions once a build with billing has been uploaded.
2. **Subscription:** *Monetize → Products → Subscriptions → Create subscription*, product ID `chaser`.
   Add two auto-renewing base plans, IDs `monthly` (1 month, US$3.99) and `annual` (1 year, US$36), and
   activate them (Play suggests local prices for other countries from the US price). For the trial,
   add an offer with ID `free-trial` to each base plan: *New customer acquisition*, eligibility *New
   customer never had this subscription*, one free-trial phase of 14 days.
3. **API access:** in Google Cloud (project `io-polarlights-app`) enable the *Google Play Android
   Developer API* and create a service account (no Cloud roles needed) with a JSON key. In Play Console
   → *Users and permissions → Invite new users*, invite the service account's email with *View
   financial data* and *Manage orders and subscriptions* for this app. Put the whole JSON key in Vercel
   as `PLAY_SERVICE_ACCOUNT` (sensitive, production). Permission can take up to a day to start working.
4. **Notifications:** in Google Cloud Pub/Sub create a topic (e.g. `play-billing`), give
   `google-play-developer-notifications@system.gserviceaccount.com` the *Pub/Sub Publisher* role on it,
   and add a *push* subscription to `https://www.polarlights.io/api/play/rtdn?token=SECRET`, where
   SECRET is a long random string also saved in Vercel as `PLAY_RTDN_TOKEN` (sensitive). In Play Console
   → *Monetize → Monetization setup*, enter the topic name and send a test notification.
5. **Testers:** Play Console → *Settings → License testing*: add the Google accounts that test purchases
   (they're never charged; renewals happen every few minutes).
6. **Switch on:** set `NEXT_PUBLIC_PLAY_BILLING=1` in Vercel and redeploy.
