# OVAL — Aurora monitor prototype

React + TypeScript (Vite) implementation of `project/Aurora Prototype.dc.html` from the Claude Design handoff.

```sh
npm install
npm run dev        # local dev server
npm run build      # typecheck + production build into dist/
```

## Screens

Now (live dashboard) · Plans · Checkout · Sign in · Account (Overview, Alerts, Locations, Billing).
All navigation is client-side state; there is no router or backend. All data is placeholder.

## Opening a specific state

The design's "starting screen" and "starting plan" settings are URL parameters:

- `?screen=home|plans|checkout|signin|account` (opening `account` signs you in)
- `?plan=free|observer|chaser|observatory`

Example: `/?screen=account&plan=observer`

## Layout

- `src/data.ts`: tiers, features, comparison rows and all chart geometry
- `src/store.tsx`: app state and actions (plan changes, checkout, sign in/out)
- `src/components/`: header/toast/footer, polar oval and Kp outlook charts, form field
- `src/screens/`: one file per screen
