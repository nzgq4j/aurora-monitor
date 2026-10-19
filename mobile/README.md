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
| Sign in with Google | Not yet: Google blocks its sign-in inside apps' web views. Needs native Google sign-in. |
| Sky view camera and location | Works (Android asks for permission) |
| Gallery: Save to Photos / Share | Works: saves into a **Polar Lights** album (Pictures/Polar Lights) and opens Android's share sheet (`PhotoLibraryPlugin.java`) |
| Push notifications | Not yet: needs Firebase Cloud Messaging |
| Chaser subscription | Not yet: needs Google Play Billing (Stripe can't be used for in-app purchases on Google Play) |
