# Google Play: graphics brief and prompt

A prompt for producing the Polar Lights store graphics, for a design tool, an image model or a designer.
Copy everything inside the block. The listing text it refers to is in [`play-store.md`](play-store.md)
and [`play-store-listings.md`](play-store-listings.md).

```
You are designing the Google Play store graphics for Polar Lights, an aurora (northern lights)
forecasting app for Android. Produce the assets below, following the brand and rules exactly.

ABOUT THE APP
Polar Lights turns live space-weather data into a simple answer: is the aurora worth going out for
tonight where you are, and when? Features: a 0–100 go-out score per place; the best viewing window
over the next 12 hours; a live aurora map and 3D globe using NOAA's OVATION forecast; Kp forecasts,
storm outlook and solar-wind graphs; aurora and clear-sky alerts by push and email; sighting reports,
badges and a moderated community photo gallery; a red night mode that protects night vision.
Free to use; the Chaser plan (US$3.99/month or US$36/year, 7-day free trial) adds more places,
instant push alerts and the technical data. Audience: aurora chasers, travellers to the Arctic,
photographers and curious sky-watchers. Tone: calm, precise, confident; science you can act on.

BRAND
- Background: pure black #000000. Cards and panels: #0B0D0C with a 1px border #2A302C and 16px corners.
- Accent: signal green #6CFF2B, used sparingly for the one thing that matters in each image.
- Kp colour strip (activity scale, left to right): green #2FA84A, yellow #E6B800, orange #FF9A3C,
  red #F06A6A. Use as a thin 4px bar, as in the app.
- Type: headings in Archivo Black / Archivo 900, UPPERCASE, slightly expanded, tight line height;
  body in Barlow 500–600; small labels in JetBrains Mono, uppercase, wide letter spacing.
  For Cyrillic text use Montserrat 900 (headings) and Golos Text (body).
- Wordmark: "POLAR LIGHTS" in white Archivo Black with "LIGHTS" in #6CFF2B.
- Icon: a glowing green tilted ellipse (the auroral oval) around a soft white point (the pole),
  on black. Supplied as app/public/icons/icon-512.png; reuse it, do not redraw it.
- Imagery: real night skies with green aurora over dark Nordic landscapes (fjords, snowfields,
  forests, mountains). Natural colour, mostly green with faint purple at the top; no fantasy
  colours, no people facing the camera, no recognisable landmarks or brands.

ASSETS TO PRODUCE

1. App icon: 512 × 512 PNG, 32-bit, under 1 MB.
   Use the supplied icon as is. Full square, no added rounded corners, shadows or badges
   (Google Play applies its own mask).

2. Feature graphic: 1024 × 500, PNG (24-bit, no transparency) or JPEG, under 15 MB.
   Left 55%: the wordmark, and beneath it the line "KNOW WHEN TO LOOK UP" (white, Archivo 900),
   with a thin Kp colour strip under the text. Right 45%: an aurora over a dark snowy landscape,
   fading into the black on the left. Keep all text and the logo inside the central 924 × 400
   safe area, since Google crops the edges and may overlay a play button in the centre.
   No device frames, no prices, no "No. 1"/"best" claims, no calls to download.

3. Phone screenshots: 6 images, 1080 × 1920 PNG (9:16).
   Each is a framed real app screenshot with a short headline above it:
   - Top 28%: the headline in Archivo 900 UPPERCASE, white, with the key word(s) in #6CFF2B,
     maximum two lines, plus an optional one-line subhead in Barlow.
   - Below: the supplied app screenshot inside a simple dark phone outline (no brand-specific
     device), slightly overlapping the bottom edge.
   - Background: black, with a faint green aurora glow at the very top.
   Headlines (green words in brackets):
     1. "SHOULD YOU GO [OUT TONIGHT]?" — subhead: "A go-out score for your place, hour by hour."
        Screen: Now tab (verdict and score).
     2. "THE AURORA, [LIVE]" — subhead: "NOAA's OVATION forecast on a map and 3D globe."
        Screen: Map tab.
     3. "ALERTS THAT [MATTER]" — subhead: "Aurora and clear-sky alerts, with quiet hours."
        Screen: Alerts tab.
     4. "READ THE [SPACE WEATHER]" — subhead: "Kp, storms and solar wind, each explained."
        Screen: solar activity / Kp forecast cards.
     5. "SHARE WHAT [YOU SAW]" — subhead: "Report sightings and post to the community gallery."
        Screen: Gallery tab.
     6. "MADE FOR [THE DARK]" — subhead: "Red night mode keeps your night vision."
        Screen: any screen in red night mode.

RULES
- Use only the supplied screenshots for app screens. Do not invent, redraw or alter interface
  elements, numbers or data, and do not add features the app doesn't have (no camera or
  photo-capture features; those are not in this version).
- No text inside the feature graphic or screenshots beyond what is listed above.
- No prices, ratings, awards, rankings or time-limited offers in any graphic (Google Play policy).
- Keep at least 64 px of empty margin around headlines; nothing important within 40 px of an edge.
- Check contrast: white or #6CFF2B text on black only.
- Deliver each file named as: icon-512.png, feature-1024x500.png, phone-1.png … phone-6.png.

LOCALISED VERSIONS (after English is approved)
Produce screenshot sets with translated headlines and screenshots of the app in that language for:
Spanish, French, German, Dutch, Norwegian, Danish, Swedish, Finnish and Russian (Cyrillic, with the
fonts above). Keep the same layout; if a translated headline runs past two lines, reduce the type
size rather than changing the layout. The feature graphic line "KNOW WHEN TO LOOK UP" is translated
the same way.
```

## Notes

- **Screenshots must be real.** Google rejects screenshots that misrepresent the app. Capture the six
  screens from the app (or the website at phone size) and supply them with the prompt.
- **Play Console limits** (checked October 2026; confirm in Play Console, as they change): icon
  512 × 512 32-bit PNG up to 1 MB; feature graphic 1024 × 500 JPEG or 24-bit PNG up to 15 MB; 2–8
  phone screenshots, each side 320–3,840 px with the long side no more than twice the short side.
  Apps need at least four screenshots of 1080 px or more to be eligible for some Play promotions.
- **Tablet screenshots** (7-inch and 10-inch) are optional and can use the same layout at 1600 × 2560.
