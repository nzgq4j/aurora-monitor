# All-sky camera permissions

This tracks what each camera operator allows and what Polar Lights wants to do with their images. The registry is `app/src/lib/skycams.ts`. Any status change here must also be recorded in that file: `license.status`, and `socialPermission` with `grantedBy`, `grantedOn` and `evidence`.

What Polar Lights wants, in general terms:

1. **In-app display.** The latest frame appears in the "Live sky cams" panel on the Now page.
   - Served unaltered through `https://www.polarlights.io/api/skycam/<id>`.
   - Credit, licence link and "Image not altered" are shown under the image.
   - At most one request to the operator per camera per publishing interval: the frame is cached server-side and at the CDN.
2. **Bluesky.** The frame may be attached to an occasional "aurora visible now" post on @polarlights.io (at most a few posts a night), with:
   - a credit line and a link to the operator's page;
   - alt text naming the camera and the capture time.
   - Off until written permission is recorded.

Polar Lights is commercial: it has a paid plan and ads. None of the emails below has been sent. Placeholders are in `[brackets]`.

---

## IRF / KAGO (Kiruna)

**Finding**
- KAGO data is published under CC BY 4.0. https://www.irf.se/en/forskning/kago/license/
- Its conditions: credit the source, link the licence, say whether the image was changed, and do not imply endorsement.
- The page does not address commercial use, redistribution or hotlinking, and says IRF may rate-limit heavy users.
- Live page: https://irf.se/alis/allsky/krn/t.html

**What the app wants**
- In-app display: cleared under CC BY 4.0, and live in the panel. A courtesy notice is still sent.
- Bluesky: written confirmation before enabling. This follows the decision of 18 Nov 2026 to wait for a written OK.

**Draft email** (courtesy notice and confirmation request)

> Subject: Use of the Kiruna all-sky camera image (KAGO, CC BY 4.0) in Polar Lights
>
> Dear [name / KAGO data contact],
>
> I run Polar Lights (https://www.polarlights.io), an aurora forecast app with a paid plan and ads. We show the latest frame of the Kiruna all-sky camera (latest_small.jpeg) to users near Kiruna when it is dark there. We credit "IRF / KAGO, Kiruna", link the CC BY 4.0 licence and your live page, and state that the image is not altered. Our server requests the image at most once a minute in total, whatever the number of viewers, and sends a User-Agent naming the app.
>
> Could you confirm two points?
> 1. That this use, including serving the image through our own server and CDN, fits your CC BY 4.0 terms, or tell us of any rate or attribution you prefer.
> 2. Whether we may attach the current frame to occasional "aurora visible now" posts on our Bluesky account (@polarlights.io), with the same credit, a link to your page, and alt text. We would do this only a few times a night at most.
>
> We are glad to change the credit wording or the request rate on request.
>
> Kind regards,
> [your name]
> [your email] · https://www.polarlights.io

**Status:** in-app display cleared (CC BY 4.0); Bluesky not permitted. Email not sent. 18 Nov 2026.

---

## Sodankylä Geophysical Observatory (SGO), University of Oulu

**Finding**
- The SGO Data Licence requires prior written permission for commercial use or reproduction. https://sgo.fi/Data/licence.php
- Redistribution requires third parties to accept the licence.
- Live page: https://sgo.fi/Data/AllSky/SkyI_SOD_realtime.php

**What the app wants:** in-app display and Bluesky, both of which need prior written permission. Today the camera is a link card only.

**Draft email** (request for prior written permission)

> Subject: Request for written permission: Sodankylä all-sky camera image in Polar Lights
>
> Dear [name / SGO data contact],
>
> I run Polar Lights (https://www.polarlights.io), an aurora forecast app with a paid plan and ads. Under the SGO Data Licence, we understand that commercial use needs your prior written permission, so we are asking before using any image.
>
> We would like to show the latest Sodankylä all-sky frame (skyi_SOD_latest.jpg) to users near Sodankylä when it is dark there. It would be unaltered and credited "Sodankylä Geophysical Observatory, University of Oulu", with links to your licence and live page. Our server would request it at most once every 30 seconds in total, through our own cache. Separately, we would like to attach the frame to occasional "aurora visible now" posts on Bluesky (@polarlights.io), with the same credit and a link.
>
> Until we hear from you, the app only links to your live page. Please let us know whether either use is acceptable, and on what terms (credit wording, rate, any fee).
>
> Kind regards,
> [your name]
> [your email] · https://www.polarlights.io

**Status:** permission required; link-only in the app; Bluesky not permitted. Email not sent. 18 Nov 2026.

---

## Finnish Meteorological Institute (FMI): Kilpisjärvi and Kevo

**Finding**
- The FMI "Rules of the Road" allow free use for teaching and non-commercial scientific research, with further distribution on the same conditions. https://space.fmi.fi/MIRACLE/ASC/asc_rules_of_the_road_00.html
- Commercial use is not covered.
- Live page: https://space.fmi.fi/image/realtime/SSA/RAF_SSA/raf_allskyimages.php
- In the 18 Nov 2026 probe, Kevo returned an empty image.

**What the app wants:** in-app display and Bluesky, both of which need permission for commercial use. Today both cameras are link cards only.

**Draft email**

> Subject: Permission request: FMI all-sky camera images (Kilpisjärvi, Kevo) in Polar Lights
>
> Dear [name / FMI space and Earth observation contact],
>
> I run Polar Lights (https://www.polarlights.io), an aurora forecast app with a paid plan and ads. Your Rules of the Road cover teaching and non-commercial research, so we are asking for permission before showing any image.
>
> We would like to show the latest Kilpisjärvi and Kevo all-sky frames (latest_KIL.jpg, latest_KEV.jpg) to nearby users when it is dark there. They would be unaltered and credited "Finnish Meteorological Institute", with links to your rules and live page. Our server would request each image at most once per publishing interval in total, through our own cache. Could you also tell us that interval? Separately, we would like to attach a frame to occasional "aurora visible now" posts on Bluesky (@polarlights.io), with the same credit and a link.
>
> Until we hear from you, the app only links to your live page.
>
> Kind regards,
> [your name]
> [your email] · https://www.polarlights.io

**Status:** permission required; link-only in the app; Bluesky not permitted. Email not sent. 18 Nov 2026.

---

## UiT: Tromsø Geophysical Observatory (BACC network, Skibotn)

**Finding**
- No licence or data-use statement was found on the BACC pages. https://fox.phys.uit.no/ASC/BACC.html
- No direct, stable image URL was identified. The live page is https://fox.phys.uit.no/ASC/BACC1_img.html.
- The responsible editor is named on the BACC page.

**What the app wants:**
- the licence or terms;
- a stable URL for the latest frame;
- permission for in-app display and Bluesky.

Today the camera is a link card only.

**Draft email** (licence and stable image URL)

> Subject: Terms of use and a stable image URL for the BACC all-sky cameras
>
> Dear [responsible editor named on https://fox.phys.uit.no/ASC/BACC.html],
>
> I run Polar Lights (https://www.polarlights.io), an aurora forecast app with a paid plan and ads. Our users near Skibotn would benefit from the live BACC all-sky image, and today we link to your page.
>
> 1. Under what licence or terms are the BACC real-time images published?
> 2. Is there a stable URL for the latest frame that we could request at most once per publishing interval in total (our server caches it), and what is that interval?
> 3. If the terms allow, may we show the latest frame unaltered in the app, credited "Tromsø Geophysical Observatory, UiT (BACC)" with a link to your page? And may we attach it to occasional "aurora visible now" posts on Bluesky (@polarlights.io)?
>
> Kind regards,
> [your name]
> [your email] · https://www.polarlights.io

**Status:** terms unknown; link-only; Bluesky not permitted. Email not sent. 18 Nov 2026.

---

## University of Calgary / Canadian Space Agency: AuroraMAX (Yellowknife)

**Finding**
- No reuse terms for the live image were found on the project page. https://ucalgary.ca/aurora/projects/auroramax
- Viewing goes through AuroraMAX.com.
- No direct image URL is in the registry.

**What the app wants:**
- the terms;
- a stable image URL if one is offered;
- permission for in-app display and Bluesky.

Today the camera is a link card only.

**Draft email**

> Subject: Terms for showing the AuroraMAX live image in Polar Lights
>
> Dear [AuroraMAX / UCalgary Auroral Imaging Group contact],
>
> I run Polar Lights (https://www.polarlights.io), an aurora forecast app with a paid plan and ads. Today we link our users near Yellowknife to AuroraMAX.
>
> Are there terms under which we could show the latest AuroraMAX frame in the app? It would be unaltered and credited "AuroraMAX, University of Calgary and Canadian Space Agency", with a link to your page, and fetched at most once per publishing interval in total through our own cache. Is there a stable URL we should use? Separately, may we attach a frame to occasional "aurora visible now" posts on Bluesky (@polarlights.io), with the same credit and a link?
>
> Kind regards,
> [your name]
> [your email] · https://www.polarlights.io

**Status:** terms unknown; link-only; Bluesky not permitted. Email not sent. 18 Nov 2026.

---

## UAF Geophysical Institute (Poker Flat)

**Finding**
- The terms and image URL have not been examined yet. Site: https://allsky.gi.alaska.edu
- The registry entry is marked "unknown", and the camera is link-only until checked.

**What the app wants:**
- the terms;
- a stable image URL;
- permission for in-app display and Bluesky.

**Draft email**

> Subject: Terms for showing the Poker Flat all-sky image in Polar Lights
>
> Dear [UAF Geophysical Institute all-sky camera contact],
>
> I run Polar Lights (https://www.polarlights.io), an aurora forecast app with a paid plan and ads. Today we link our users in interior Alaska to https://allsky.gi.alaska.edu.
>
> Under what terms are the real-time all-sky images published? Could we show the latest Poker Flat frame in the app, unaltered and credited "UAF Geophysical Institute" with a link to your site? It would be fetched at most once per publishing interval in total through our own cache, from a stable URL you recommend. Separately, may we attach a frame to occasional "aurora visible now" posts on Bluesky (@polarlights.io), with the same credit and a link?
>
> Kind regards,
> [your name]
> [your email] · https://www.polarlights.io

**Status:** terms not examined; link-only; Bluesky not permitted. Email not sent. 18 Nov 2026.

---

## Turning on Bluesky attachments for a camera

1. Store the written permission (email or letter) where it can be found again.
2. In `skycams.ts`, set `socialPermission` to `{ status: 'granted', grantedBy, grantedOn, evidence }`. The registry test fails if any of the three is missing.
3. Set `SKYCAM_SOCIAL_ENABLED=true` in the Vercel production environment and redeploy.

The gate (`app/src/lib/skycamSocial.ts`) still checks each of these before every post:
- range and darkness;
- freshness;
- brightness;
- size;
- post length.
