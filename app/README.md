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

All pages are statically prerendered. Prototype state (plan, sign-in, alert settings) lives in a client-side
provider in the root layout, so it survives navigation but resets on a full reload. There is no backend; all data is placeholder.

## Opening a specific state

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
