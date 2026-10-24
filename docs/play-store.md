# Google Play: Data safety and store listing

Answers and text to paste into Play Console for the Android app (`io.polarlights.app`). They follow the
privacy policy at https://www.polarlights.io/privacy; if the policy or the data the app collects changes,
update both. Billing setup is in [`mobile/README.md`](../mobile/README.md#google-play-billing-setup).

## Data safety

Play Console → **Policy → App content → Data safety**.

### Overview

| Question | Answer |
| --- | --- |
| Does your app collect or share any of the required user data types? | **Yes** |
| Is all of the user data collected by your app encrypted in transit? | **Yes** |
| Which account creation methods does your app support? | **Username and password**, and **OAuth** (Sign in with Google) |
| Delete account URL | `https://www.polarlights.io/delete-account` |
| Can users request deletion of some or all of their data without deleting their account? | **Yes**: they can delete their locations and photos and turn off push and email alerts |
| Independent security review | No |

### Data types

For every row: **Shared: No**, **Processed ephemerally: No**, and collection is **optional** (the app
works without an account, and each of these is opt-in).

| Category → type | What it is in Polar Lights | Purposes |
| --- | --- | --- |
| Personal info → **Name** | Display name, or the name from Google sign-in | App functionality, Account management |
| Personal info → **Email address** | Account email; alert and service emails | App functionality, Account management, Developer communications |
| Personal info → **User IDs** | Account ID | App functionality, Account management |
| Location → **Approximate location** | Sightings (rounded to ~10 km); gallery photo place | App functionality |
| Location → **Precise location** | Coordinates of saved places, including a device position the user saves | App functionality |
| Financial info → **Purchase history** | Plan, subscription status and renewal date | App functionality, Account management |
| Photos and videos → **Photos** | Photos the user posts to the community gallery | App functionality |
| App activity → **Other user-generated content** | Captions, sighting reports, helpful votes, reports and blocks, and issue reports or feature requests sent from the dashboard | App functionality |
| Device or other IDs → **Device or other IDs** | Firebase push token, for push alerts | App functionality |

Not collected (leave unticked): contacts, messages, health and fitness, audio, files and docs,
calendar, web browsing, app info and performance (there is no crash reporting or analytics), and
payment info.

Why:

- **Shared is No.** Google doesn't count transfers to service providers working on our behalf
  (Supabase, Vercel, Resend, Firebase, Open-Meteo, BigDataCloud) as sharing, nor content a user
  chooses to post publicly.
- **Payment info isn't collected.** Card details never reach the app: Google Play handles purchases
  in the app and Stripe handles them on the website.
- **Server logs aren't declared.** Hosting and database logs (IP address, browser type) are standard
  security logs and aren't used to infer location.

If analytics or crash reporting is ever added, this form needs updating.

## Store listing

Play Console → **Grow → Store presence → Main store listing**. Limits: title 30, short
description 80, full description 4,000 characters.

**App name** (29 characters)

```
Polar Lights: Aurora Forecast
```

**Short description** (71 characters)

```
Aurora forecasts, live maps and alerts for chasing the northern lights.
```

**Full description** (about 2,400 characters)

```
Know when to look up. Polar Lights turns live space weather into a simple answer for where you are: is the aurora worth going out for tonight, and when?

GO OUT NOW, OR LATER?
• A go-out score for your place, combining the aurora forecast, cloud, darkness and the Moon
• The best viewing window over the next 12 hours, hour by hour
• Your sky: the chance of aurora near you, cloud by layer, when it gets dark and the Kp your place needs

LIVE AURORA MAP
• NOAA's OVATION aurora forecast on a 3D globe and a zoomable map
• A time slider through the last 24 hours of the aurora oval
• City lights, dark-sky areas, best viewing spots and recent sightings from other members

ALERTS THAT MATTER
• Alerts when aurora is likely where you are, by email or instant push notification, with quiet hours
• Clear-sky alerts when the clouds part during activity
• For keen chasers: southward Bz, substorm onset, strong solar-wind coupling, CME arrivals and solar flares

FORECASTS AND SPACE WEATHER
• Kp forecast in 3-hour blocks, the daily peak and NOAA's 27-day outlook
• Storm outlook with geomagnetic storm chances, CME forecasts and flare activity
• Solar wind speed, density, Bz and hemispheric power over the last 24 hours
• The Sun now: the latest images from NASA's SDO and the SOHO coronagraph, plus a time-lapse
• Every chart has a short "What this shows" explanation, so you learn as you go

COMMUNITY
• Tap "I saw it" to report a sighting and help others nearby
• Post your best shots to the moderated community gallery
• Earn badges and ranks for confirmed sightings

MADE FOR THE DARK
• Red night mode protects your night vision
• Available in English, German, Spanish, French and Dutch

PLANS
Polar Lights is free to use, with the live map, forecasts and alerts for one place. Chaser adds up to 10 places, instant push alerts, the technical alerts, the 3-hour Kp forecast and 27-day outlook, hour-by-hour cloud and darkness, solar wind graphs and the dark-sky spot map. Chaser is US$3.99 a month or US$36 a year (save 25%), with a 7-day free trial for new subscribers. Prices in other countries are shown in Google Play before you subscribe.

Data from NOAA's Space Weather Prediction Center, NASA, ESA, GFZ Potsdam, EUMETSAT and Open-Meteo. Polar Lights is independent and not affiliated with these organisations.

Privacy: https://www.polarlights.io/privacy
```

**Other fields**

| Field | Value |
| --- | --- |
| App category | Weather |
| Tags | Weather, Astronomy, Outdoors (from Google's list) |
| Contact email | `privacy@polarlights.io`, or a support address |
| Website | `https://www.polarlights.io` |
| Privacy policy | `https://www.polarlights.io/privacy` |

**Graphics:** app icon 512×512 PNG, feature graphic 1024×500, and at least two phone screenshots
(the store mockup set is 1080×1920).

### Before publishing

- The PLANS paragraph follows the plan definitions in `app/src/data.ts`. SMS alerts are left out
  until they are available.
- The 7-day trial applies in the app through the trial offers on the `chaser` base plans
  (`7-day-trial-monthly`, `7-day-trial-annual`). Keep it in step with `TRIAL_DAYS` in `app/src/data.ts`
  (the website's Stripe trial).
- The prices in the PLANS paragraph must match the `chaser` base plans in Play Console
  (`monthly` US$3.99, `annual` US$36) and `TIERS` in `app/src/data.ts`. Update all three together.
