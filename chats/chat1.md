# Aurora monitoring site UI

_Started 2026-10-16 18:50 UTC_

---

## User

Make UI mockups for An Aurora monitoring site with modern styling like the samples attached. very graphics and data visualization forward.

## User

Make UI mockups for An Aurora monitoring site with modern styling like the samples attached. very graphics and data visualization forward.

## Assistant

_[tool: list_files]_

_[tool: list_files]_

_[tool: dc_write]_

_[tool: ready_for_verification]_

I've built three mockups in `Aurora Monitor.dc.html`, all on a black background with heavy display type and neon green like your samples. The verifier is checking it now.

- **1a, live dashboard (desktop):** a "G2 storm in progress" headline with the current Kp shown on a 0–9 storm scale, and a polar map of the auroral oval with a city overlay and the view line. Below that are the 5-day Kp chart, three solar wind panels, "The Sun today" with flare odds, and a 27-day outlook with moon phases.
- **1b, tonight at my location (mobile):** a gauge for the chance of seeing the aurora, an hour-by-hour strip (chance, darkness, cloud cover), a "where to look" horizon graphic, current conditions and an alert toggle.
- **1c, storm watch event page:** a countdown to CME arrival that ticks live, a chart comparing arrival models against North American darkness, how-far-south odds by city, and an event timeline.

Things to know:
- All the data is made up.
- The sun images are styled placeholders, not real solar photos.
- The oval map has a coordinate grid and cities but no land outlines yet. Add a real basemap or I can build one from map data.
- "OVAL" is a placeholder brand name.
- The headline in 1a says G2, but Kp 5.33 is G1 storm level. One of the two needs to change so they match.

## User

Found issues — fixing…

## Assistant

_[tool: dc_html_str_replace]_

_[tool: ready_for_verification]_

I fixed both problems in the 1a headline. It now reads "G1 Storm" to match the Kp 5.33 readout, and it's smaller (80px) with "In progress" kept on one line, so it fits on two lines. I skipped the automatic re-check for this small edit, so please give 1a a quick look.

## User

let's create a clickable mockup with account pages, membership levels, and other mockups

## Assistant

_[tool: list_files]_

_[tool: list_files]_

_[tool: dc_write]_

_[tool: ready_for_verification]_

_[tool: dc_js_str_replace]_

_[tool: ready_for_verification]_

I've built a clickable prototype in `Aurora Prototype.dc.html`, in the same style as the mockups. The design system you attached is empty, so it uses the colors and fonts from the earlier mockups. The first version would likely have failed to load because of a code bug, which I've fixed; an automatic check is still running.

The screens:
- **Now:** the live dashboard, with an upgrade banner when you're on the Free plan.
- **Plans:** four membership levels (Free, Observer $4, Chaser $9, Observatory $24) with a monthly/annual switch and a comparison table.
- **Checkout:** a card form and order summary; "Start 14-day free trial" upgrades you and drops you into your account.
- **Sign in.**
- **Account, with four tabs:**
  - **Overview:** membership card, this season's activity chart and the best nights ahead.
  - **Alerts:** a Kp threshold slider that highlights how many of the last 30 nights would have triggered an alert, plus trigger and delivery toggles. Toggles your plan doesn't include are locked and link to Plans.
  - **Locations:** saved spots, with any beyond your plan's limit shown as paused.
  - **Billing:** card, invoices and cancel.

The panel has two settings, the starting screen and starting plan, so you can jump straight into a given state.

The user, card and invoice details are made up, and "OVAL" is still a placeholder name.

## User

Found issues — fixing…

## Assistant

_[tool: run_script]_

_[tool: ready_for_verification]_

I fixed all four layout problems the check found at narrower widths; a fresh check is running now.

- **Checkout:** the expiry, CVC and ZIP fields now stay in their columns instead of spilling into the order summary. The form and summary stack when the window is narrow.
- **Account membership card:** the plan name now shrinks to fit the window and wraps if needed, so long names like "OBSERVATORY" no longer get cut off. The card and the stat tiles beside it stack on narrow screens.
- **Header:** "KP 5.33 · G1" stays on one line when you're signed in.
- **Overview stat tiles:** the numbers are slightly smaller and no longer break across lines ("Kp 7" stays together).

