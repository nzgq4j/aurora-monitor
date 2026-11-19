# Automatic Bluesky posting

Polar Lights posts space-weather events to Bluesky (@polarlights.io) as they happen, each with a share card
and alt text. Administrators manage it at **/social** (Dashboard sidebar, or You → Social posting on a phone).

## Setup

1. **Database:** `supabase/migrations/20261118000100_social_posting.sql` creates the settings row, the post
   log, the Vault functions for the Bluesky session, the single-use cron tickets and the one-minute schedule.
   Apply it with the deploy, then run the Supabase security advisors.
2. **App password:** in Bluesky, Settings → Privacy and security → App passwords → Add. Don't use the main
   password: accounts with two-factor sign-in refuse it (`AuthFactorTokenRequired`).
3. **Sign in:** open /social, enter the handle (`polarlights.io`) and the app password. The password is used
   once to create a session and is not stored. Only the session tokens are kept, encrypted in Supabase Vault
   (secret `bluesky_session`). The refresh token rotates and is saved on every refresh.
4. **Switch on:** set the rules, check a preview, then turn on *Post automatically*. Nothing is posted until then.

Optional fallback: `BLUESKY_IDENTIFIER` and `BLUESKY_APP_PASSWORD` (and `BLUESKY_SERVICE` for another PDS) in
Vercel are used only when no session is stored or it stops working.

## How it works

- Supabase pg_cron runs `social-posting` every minute. It inserts a ticket in `private.cron_tickets` and
  POSTs its token to `/api/cron/social`, which accepts it once if it is under 2 minutes old
  (`consume_cron_ticket`). Anything else gets 403.
- The route runs the event feed (`lib/socialFeed.ts`). It never throws; it returns a status object.
- Each event is **claimed** in `social_event_posts` (unique key, status `posting`) before Bluesky is called,
  so overlapping runs never double-post. On success the row becomes `posted` with the post URL; on failure
  `failed` with the error. Failed posts are not retried automatically; use *Post now* in /social.
- *Post now* for flares uses the flare in progress, or else the biggest flare of the last 6 hours at the chosen level
  (M2 or X), even if it has ended (`recentFlare`). Its card then says "peak" rather than "peak so far". It shares the
  feed's key for that flare, so it is never posted twice by accident.
- The card is drawn in-process (`lib/socialCard.tsx`, next/og) from the data the rule used. If it can't be
  drawn, the event waits and is tried again the next minute; 15 minutes after the event it goes out as text only.

## Rules (`lib/socialEvents.ts`)

All from observed data, never forecasts. An event that crossed its threshold more than 30 minutes ago is never
posted, so switching the feed on posts no backlog. At most 2 posts per run, storms first.

| Kind | Default | Posts when | Repeats |
| --- | --- | --- | --- |
| Storm | G1 and above | Kp (observed/estimated, last 3 h) or GFZ Hp30 (last 90 min) reaches the level | Again only at a higher G level, or after 24 h |
| Flare | X1 and above (or M2) | GOES X-ray flux crosses the class | One post per flare (a tenfold-bigger flare within the hour is new) |
| Shock | On | Solar wind speeds up 50 km/s and density or field rises by half (L1) | One per 6 h |
| Substorm | Off | Hemispheric auroral power at least doubles to 30 GW or more | One per 3 h per hemisphere |

Viewing outlooks are a separate feed with their own rules (next section).

Post text is English (the account's language), at most 300 graphemes including the link: headline, what was
measured and when (UTC), a link to the map or Sun page, and hashtags. No disclaimer line is added to posts, cards or alt text.
Links and hashtags become facets with UTF-8 byte offsets (`detectFacets`).

## Viewing outlooks (`lib/socialViewing.ts`)

Posts about aurora viewing at chosen sites around the world (table `social_sites`, managed in /social; seeded
from the administrator's saved places). Each site is scored hour by hour with the same model as the Tonight page
and place alerts (`lib/tonight.ts`: aurora strength, darkness, cloud from Open-Meteo, moonlight).

- **Visible now:** the score now is 50 or more. **Tonight:** the best hour in the next 12 scores 50 or more and
  starts at least 30 minutes ahead; the post gives the window in local time and UTC.
- Sites within 150 km form one region (the three Nordland sites are one); the best site in the region is named.
- At most one post per region per night (the site's local night, which turns over at local noon), at most 4
  viewing posts per UTC day, at least 2 hours apart, one per run. Visible now goes before tonight.
- Runs every 10 minutes (minute 5, 15, …) to stay well inside Open-Meteo's free limit; switch: *Post viewing outlooks*.
- Hashtags: `#aurora #NorthernLights` (or `#AuroraAustralis` south of the equator) plus the site's own tags.

## Deleting a post

In /social → Recent posts, *Delete* (tap twice) removes a post from Bluesky straight away. If that fails, the post
stays marked 'deleting' and the every-minute job retries. A deleted post no longer counts toward the viewing cap,
gap or style rotation, and its region can be posted again.

## Picture styles and wording

Posts rotate through picture styles per kind, so the feed doesn't repeat one look (`STYLES`, `pickStyle`):

| Kind | Styles |
| --- | --- |
| Storm, substorm | data card (oval map + Kp bars or power), close-up globe (night side, live oval, day and night) |
| Flare | data card (X-ray chart), Sun image (NASA SDO AIA 131 Å, the flare channel) |
| Shock | data card (solar wind charts), coronagraph (ESA/NASA SOHO LASCO C3, shows CMEs leaving the Sun) |
| Viewing, tonight | always a forecast: a close-up globe (~5,000 km) at the best hour, with the oval modelled from NOAA's Kp forecast for that hour, plus the hourly scores |
| Viewing, now | alternates: close-up globe centred on the site, regional map (~1,600 km); both with the live OVATION oval |

The next post of a kind uses the style after its last post's.

The forecast oval (`kpModelOval` in `lib/socialGlobe.ts`) uses the app's rule of thumb: the equatorward edge is near 66° − 2·Kp magnetic latitude at magnetic midnight, moving poleward towards dawn and dusk. The band is 8–12° wide and brightest at midnight. It is labelled "KP MODEL" on the card and described as a model in the alt text, because OVATION itself only forecasts about an hour ahead. If a Sun image can't be fetched in time, the card
falls back to the data style. Photo cards are saved as JPEG to stay under 1 MB. In /social, the preview shows the
style that would be used and lets you pick another before posting by hand.

Wording varies too: each kind has several headlines and link lines, picked from the event's key, so the same event
always reads the same (preview = post) while different events read differently.

## Alt text

Built by `cardAlt()` from the same data as the card: what kind of card it is, the headline value, what the
picture shows and its visual code (oval colours, Kp bar colours and the dashed storm line, chart scales), the
facts (level, values, time UTC, source), and the site address printed on the card.
It can be edited before a manual post (limit 2,000 characters).

## Changing things

- Thresholds and repeat windows: `detectEvents`, `REPEAT_MS` and `isRepeat` in `lib/socialEvents.ts`.
- Wording and hashtags: `headline`, `bodies`, `TAGS` in the same file. The tests check every kind stays within 300.
- Card layout: `lib/socialCard.tsx`. Run `npm test` (the card test draws every kind when online).

## Tests

- `bluesky.test.ts`: graphemes, facet byte offsets on accented and CJK text, limits, session expiry, the record.
- `socialEvents.test.ts`: G levels, flare classes, storm/flare rules, no backlog, repeats, every post ≤ 300.
- `socialFeed.test.ts`: the whole feed against a fake Bluesky server (fetch replaced; nothing reaches Bluesky):
  off, not connected, one post with image/alt/facets/langs/aspect ratio, overlapping runs, waiting for the card,
  token refresh and rotation, refused refresh, failed posts not retried, feed errors reported.
- `socialCard.test.ts`: alt text for every kind; real PNGs under 1 MB (skipped offline).
- `socialViewing.test.ts`: regions, local nights, candidates, the daily cap and gap, text limits, a full run.
- `socialEvents.test.ts` also checks that wording varies between events and styles rotate.
