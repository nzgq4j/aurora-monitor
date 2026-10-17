# Polar Lights — aurora forecasts

Live at **https://www.polarlights.io** (the canonical address; `polarlights.io` redirects to it).
`auroracast.io` is registered for the same app; to avoid a duplicate site, set `auroracast.io` and
`www.auroracast.io` in Vercel → Project → Domains as permanent 308 redirects to `www.polarlights.io`.
The brand name, domain and tagline live in `src/lib/site.ts`; `NEXT_PUBLIC_SITE_URL` overrides the canonical URL.

Next.js (App Router) + TypeScript implementation of `project/Aurora Prototype.dc.html` from the Claude Design handoff.

```sh
npm install
npm run dev        # local dev server on http://localhost:3000
npm run build      # production build
npm start          # serve the production build
```

## Routes

| Route       | Screen                                                     |
| ----------- | ---------------------------------------------------------- |
| `/`         | Now (live dashboard)                                       |
| `/plans`    | Membership tiers and comparison                            |
| `/checkout` | Trial checkout for the selected tier                       |
| `/signin`   | Sign in                                                    |
| `/account`  | Account: Overview, Alerts, Locations, Billing tabs         |

All pages are statically prerendered and regenerated in the background (Now and Account every 2 minutes).
Accounts use Supabase Auth when `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are set;
without them the site runs in demo mode (simulated sign-in and plan). Card payments are not built yet.

## Live data

| What | Source | Where |
| --- | --- | --- |
| Planetary Kp (now, observed, 3-day forecast) | NOAA SWPC `noaa-planetary-k-index*.json` | Header, Now |
| Solar wind Bz, speed, density at L1 | NOAA SWPC solar-wind products (falls back to `rtsw` JSON) | Now |
| Aurora probability map, 10% edge | NOAA SWPC OVATION Prime `ovation_aurora_latest.json` | Now, `/api/conditions` |
| Hemispheric power | NOAA SWPC `aurora-nowcast-hemi-power.txt` | Now |
| Kp history (90 days, official) | GFZ Potsdam Kp API | Account |
| Best nights ahead | NOAA SWPC 27-day outlook | Account |
| Sun images | NASA SDO latest AIA 193/171 and HMI | Now |
| Cloud cover | Open-Meteo forecast API | `/api/conditions` |
| Town search / device place name | Open-Meteo geocoding / BigDataCloud reverse geocoding | Locations |

`/api/conditions?lat=&lon=` returns OVATION probability (overhead and up to ~6° poleward),
cloud cover now and for 12 hours, Sun altitude and darkness window (Sun below −12°),
geomagnetic latitude and an approximate Kp needed for that spot.

## Locations

Saved locations can be added by town search or from the device (Geolocation API). When
location access was already granted, the device location refreshes automatically on the
Locations tab. Signed-in users' locations are stored in the `locations` table; signed-out
visitors' locations stay in the browser and move into the account at the next sign-in.
See `../supabase/README.md`.

## Opening a specific state

Demo mode only:
- Loading `/account` directly starts signed in (the design's "account" starting screen).
- `?plan=free|chaser` sets the starting plan, e.g. `/account?plan=chaser`.

## Layout

- `src/app/`: root layout, global styles and one `page.tsx` per route
- `src/data.ts`: tiers, features, comparison rows and all chart geometry
- `src/store.tsx`: app state, route mapping and actions (plan changes, checkout, sign in/out)
- `src/components/`: header/toast/footer, polar oval and Kp outlook charts, form field
- `src/screens/`: one client component per screen

## Deployment

Deployed on Vercel with **Root Directory** set to `app` and the Next.js framework preset.

## Installable app (PWA) and Google Play

The site is a Progressive Web App, which is the basis for the Android app: Google Play accepts a PWA
wrapped as a Trusted Web Activity (TWA), and the app then always shows the live site.

| Piece | Where |
| --- | --- |
| Web app manifest (name, colours, icons, shortcuts, screenshots) | `src/app/manifest.ts` → `/manifest.webmanifest` |
| Icons: 192/512 (`any` and `maskable`), monochrome (Android themed icons), Apple touch, SVG favicon | `public/icons/`, regenerate with `node scripts/make-icons.mjs` from `scripts/icon.svg` |
| Install-dialog screenshots (1080×2340 narrow, 1920×1080 wide) | `public/screenshots/`, regenerate with `BASE=https://… node scripts/make-screenshots.mjs` |
| Service worker: pages and `/api/*` network-first with cached fallback, static assets cache-first, `/offline` page when nothing is cached | `public/sw.js`, registered by `src/components/ServiceWorker.tsx` |
| Digital Asset Links for the TWA | `/.well-known/assetlinks.json` (`src/app/.well-known/assetlinks.json/route.ts`) |

The scripts need Playwright (`npx playwright install chromium`, or `PW_ROOT=$(npm root -g)` for a global install).

**Validate mobile behaviour** against any build (exits non-zero on failure):

```sh
BASE=https://www.polarlights.io node scripts/validate-mobile.mjs
```

It emulates a Pixel 7 and checks the manifest and its images, Chrome's own installability verdict
(DevTools `Page.getInstallabilityErrors`), service-worker control and offline behaviour, and every page
at 360 px and 412 px for sideways scrolling, page errors and touch targets under 44 px.

**Publishing to Google Play** (outline):

1. Install Bubblewrap: `npm i -g @bubblewrap/cli`, then `bubblewrap init --manifest https://www.polarlights.io/manifest.webmanifest`
   (use the www host: the Android app and `/.well-known/assetlinks.json` are bound to that exact host).
   The Android app is bound to this one domain (the auroracast.io redirect doesn't need its own app).
   Choose an application ID such as `io.polarlights.app`; it can't be changed after the first Play release.
2. `bubblewrap build` produces a signed `.aab` for upload.
3. Create the app in Play Console and upload the `.aab`. With Play App Signing, copy the **app signing key**
   SHA-256 fingerprint from *Test and release → App integrity*.
4. In Vercel, set `ANDROID_PACKAGE_NAME` and `ANDROID_CERT_SHA256` (comma-separate several fingerprints, e.g. upload
   and app signing keys) and redeploy. `/.well-known/assetlinks.json` returns 404 until both are set; once the file
   verifies, the app opens full-screen without the browser address bar.
5. Store listing assets: the 512×512 icon is `public/icons/icon-512.png`; Play also needs a 1024×500 feature graphic
   and phone screenshots.
