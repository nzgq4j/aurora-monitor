# OVAL — Aurora monitor prototype

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
- `?plan=free|observer|chaser|observatory` sets the starting plan, e.g. `/account?plan=observer`.

## Layout

- `src/app/`: root layout, global styles and one `page.tsx` per route
- `src/data.ts`: tiers, features, comparison rows and all chart geometry
- `src/store.tsx`: app state, route mapping and actions (plan changes, checkout, sign in/out)
- `src/components/`: header/toast/footer, polar oval and Kp outlook charts, form field
- `src/screens/`: one client component per screen

## Deployment

Deployed on Vercel with **Root Directory** set to `app` and the Next.js framework preset.
