/**
 * Scientific all-sky cameras near the places the app serves (the "Live sky cams" panel and, when permitted,
 * Bluesky "visible now" posts). Ordinary webcams show black at night; these run in the dark season only.
 *
 * Rules (enforced by skycams.test.ts):
 * - An image is shown in the app only when license.status is 'cleared'. Every other camera is a link card.
 * - A camera image goes into a Bluesky post only when socialPermission.status is 'granted' with who granted it,
 *   when, and the evidence.
 *
 * Facts below were read from the operators' pages on 18 November 2026; reachability and headers were probed
 * once from Vercel iad1 (scripts/skycam-probe.mjs). Coordinates with coordsConfirmed false are approximate
 * and need checking against the operator page before they are relied on.
 */

export type LicenseStatus = 'cleared' | 'permission-required' | 'unknown';
export type LicenseKind = 'CC-BY-4.0' | 'operator-licence' | 'none-found';

export interface SkyCamera {
  id: string;
  /** Short place name shown under the image, e.g. "Kiruna, Sweden". */
  name: string;
  operator: string;
  lat: number;
  lon: number;
  coordsConfirmed: boolean;
  /** The image the app fetches (thumbnail size). Null when no direct image URL is known. */
  imageUrl: string | null;
  /** The operator's live page: linked from every card and image. */
  sourcePageUrl: string;
  /** How often the operator publishes a new frame, seconds; null when not stated. */
  cadenceSeconds: number | null;
  /** A frame older than this is shown as "Camera offline". */
  maxImageAgeSeconds: number;
  /** The camera runs (and is shown) while the Sun is below this elevation at the camera. */
  darkSunElevationDeg: number;
  region: string;
  credit: { text: string; url: string };
  license: { status: LicenseStatus; kind: LicenseKind; licenseUrl: string | null; notes: string };
  socialPermission: { status: 'none' | 'requested' | 'granted'; grantedBy?: string; grantedOn?: string; evidence?: string };
}

/** Five times the cadence, and never under 10 minutes. */
export const maxAgeFor = (cadenceSeconds: number | null) => Math.max(600, 5 * (cadenceSeconds ?? 0));

export const SKY_CAMERAS: SkyCamera[] = [
  {
    id: 'irf-kiruna',
    name: 'Kiruna, Sweden',
    operator: 'IRF / KAGO (Swedish Institute of Space Physics)',
    lat: 67.8407, lon: 20.4111, coordsConfirmed: true,
    imageUrl: 'https://www.irf.se/alis/allsky/krn/latest_small.jpeg',
    sourcePageUrl: 'https://irf.se/alis/allsky/krn/t.html',
    cadenceSeconds: 60, maxImageAgeSeconds: maxAgeFor(60), darkSunElevationDeg: -10,
    region: 'Northern Scandinavia',
    credit: { text: 'IRF / KAGO, Kiruna', url: 'https://irf.se/alis/allsky/krn/t.html' },
    license: {
      status: 'cleared', kind: 'CC-BY-4.0', licenseUrl: 'https://www.irf.se/en/forskning/kago/license/',
      notes: 'KAGO data is CC BY 4.0: credit the source, link the licence, say whether the image was changed, do not imply endorsement. '
        + 'Commercial use, redistribution and hotlinking are not addressed; IRF may rate-limit heavy users. '
        + 'Probe 18 Nov 2026: 200 image/jpeg, ~179 KB thumbnail, Last-Modified and ETag present, upstream Cache-Control max-age=1209600 (ignored), no Referer check.',
    },
    socialPermission: { status: 'none' },
  },
  {
    id: 'sgo-sodankyla',
    name: 'Sodankylä, Finland',
    operator: 'Sodankylä Geophysical Observatory (University of Oulu)',
    lat: 67.37, lon: 26.63, coordsConfirmed: false,
    imageUrl: 'https://sgo.fi/Data/RealTime/Kuvat/skyi_SOD_latest.jpg',
    sourcePageUrl: 'https://sgo.fi/Data/AllSky/SkyI_SOD_realtime.php',
    cadenceSeconds: 30, maxImageAgeSeconds: maxAgeFor(30), darkSunElevationDeg: -10,
    region: 'Finnish Lapland',
    credit: { text: 'Sodankylä Geophysical Observatory, University of Oulu', url: 'https://sgo.fi/Data/AllSky/SkyI_SOD_realtime.php' },
    license: {
      status: 'permission-required', kind: 'operator-licence', licenseUrl: 'https://sgo.fi/Data/licence.php',
      notes: 'SGO Data Licence: commercial use or reproduction needs prior written permission; redistribution requires third parties to accept the licence. '
        + 'The app is commercial (paid plan and ads). Probe 18 Nov 2026: 200 image/jpeg, ~200 KB, Last-Modified and ETag present, no Cache-Control, no Referer check.',
    },
    socialPermission: { status: 'none' },
  },
  {
    id: 'fmi-kilpisjarvi',
    name: 'Kilpisjärvi, Finland',
    operator: 'Finnish Meteorological Institute (FMI)',
    lat: 69.05, lon: 20.79, coordsConfirmed: false,
    // The HTTP address redirects (301) to this HTTPS one.
    imageUrl: 'https://aurorasnow.fmi.fi/public_service/images/latest_KIL.jpg',
    sourcePageUrl: 'https://space.fmi.fi/image/realtime/SSA/RAF_SSA/raf_allskyimages.php',
    cadenceSeconds: null, maxImageAgeSeconds: maxAgeFor(null), darkSunElevationDeg: -10,
    region: 'Finnish Lapland',
    credit: { text: 'Finnish Meteorological Institute', url: 'https://space.fmi.fi/image/realtime/SSA/RAF_SSA/raf_allskyimages.php' },
    license: {
      status: 'permission-required', kind: 'operator-licence', licenseUrl: 'https://space.fmi.fi/MIRACLE/ASC/asc_rules_of_the_road_00.html',
      notes: 'FMI Rules of the Road: free for teaching and non-commercial scientific research; further distribution on the same conditions. The app is commercial. '
        + 'Probe 18 Nov 2026: HTTP 301 to HTTPS, then 200 image/jpeg, ~15 KB, Last-Modified present, no ETag, no Cache-Control, no Referer check.',
    },
    socialPermission: { status: 'none' },
  },
  {
    id: 'fmi-kevo',
    name: 'Kevo, Finland',
    operator: 'Finnish Meteorological Institute (FMI)',
    lat: 69.76, lon: 27.01, coordsConfirmed: false,
    imageUrl: 'https://aurorasnow.fmi.fi/public_service/images/latest_KEV.jpg',
    sourcePageUrl: 'https://space.fmi.fi/image/realtime/SSA/RAF_SSA/raf_allskyimages.php',
    cadenceSeconds: null, maxImageAgeSeconds: maxAgeFor(null), darkSunElevationDeg: -10,
    region: 'Finnish Lapland',
    credit: { text: 'Finnish Meteorological Institute', url: 'https://space.fmi.fi/image/realtime/SSA/RAF_SSA/raf_allskyimages.php' },
    license: {
      status: 'permission-required', kind: 'operator-licence', licenseUrl: 'https://space.fmi.fi/MIRACLE/ASC/asc_rules_of_the_road_00.html',
      notes: 'As Kilpisjärvi. Probe 18 Nov 2026: HTTP 301 to HTTPS, then 200 image/jpeg with an empty (0-byte) body: the camera appears to be offline.',
    },
    socialPermission: { status: 'none' },
  },
  {
    id: 'uit-bacc-skibotn',
    name: 'Skibotn, Norway',
    operator: 'UiT / UiO / UNIS / FMI (BACC network)',
    lat: 69.35, lon: 20.36, coordsConfirmed: false,
    imageUrl: null,
    sourcePageUrl: 'https://fox.phys.uit.no/ASC/BACC1_img.html',
    cadenceSeconds: 60, maxImageAgeSeconds: maxAgeFor(60), darkSunElevationDeg: -10,
    region: 'Northern Norway',
    credit: { text: 'Tromsø Geophysical Observatory, UiT (BACC)', url: 'https://fox.phys.uit.no/ASC/BACC.html' },
    license: {
      status: 'permission-required', kind: 'none-found', licenseUrl: null,
      notes: 'No licence or data-use statement on the page; no direct image URL identified. Contact the responsible editor named on https://fox.phys.uit.no/ASC/BACC.html.',
    },
    socialPermission: { status: 'none' },
  },
  {
    id: 'auroramax-yellowknife',
    name: 'Yellowknife, Canada',
    operator: 'University of Calgary / Canadian Space Agency (AuroraMAX)',
    lat: 62.45, lon: -114.37, coordsConfirmed: false,
    imageUrl: null,
    sourcePageUrl: 'https://ucalgary.ca/aurora/projects/auroramax',
    cadenceSeconds: null, maxImageAgeSeconds: maxAgeFor(null), darkSunElevationDeg: -10,
    region: 'Northwest Territories',
    credit: { text: 'AuroraMAX, University of Calgary and Canadian Space Agency', url: 'https://ucalgary.ca/aurora/projects/auroramax' },
    license: { status: 'unknown', kind: 'none-found', licenseUrl: null, notes: 'No reuse terms found; viewing goes through AuroraMAX.com. Link-out only.' },
    socialPermission: { status: 'none' },
  },
  {
    id: 'uaf-pokerflat',
    name: 'Poker Flat, Alaska',
    operator: 'UAF Geophysical Institute',
    lat: 65.12, lon: -147.43, coordsConfirmed: false,
    imageUrl: null,
    sourcePageUrl: 'https://allsky.gi.alaska.edu',
    cadenceSeconds: null, maxImageAgeSeconds: maxAgeFor(null), darkSunElevationDeg: -10,
    region: 'Interior Alaska',
    credit: { text: 'UAF Geophysical Institute', url: 'https://allsky.gi.alaska.edu' },
    license: { status: 'unknown', kind: 'none-found', licenseUrl: null, notes: 'Terms and image URL not examined. Link-out only until checked.' },
    socialPermission: { status: 'none' },
  },
];

export const cameraById = (id: string, cams: SkyCamera[] = SKY_CAMERAS) => cams.find(c => c.id === id) ?? null;

/** Problems that make the registry unsafe to ship (empty when valid). Used by the build-time test. */
export function registryProblems(cams: SkyCamera[]): string[] {
  const out: string[] = [];
  const ids = new Set<string>();
  for (const c of cams) {
    if (ids.has(c.id)) out.push(`${c.id}: duplicate id`);
    ids.add(c.id);
    if (c.license.status === 'cleared') {
      if (!c.credit.text.trim()) out.push(`${c.id}: cleared without credit text`);
      if (!/^https:\/\//.test(c.credit.url)) out.push(`${c.id}: cleared without a credit link`);
      if (!c.license.licenseUrl) out.push(`${c.id}: cleared without a licence URL`);
      if (!c.imageUrl) out.push(`${c.id}: cleared without an image URL`);
      if (c.imageUrl && !c.imageUrl.startsWith('https://')) out.push(`${c.id}: cleared image is not HTTPS`);
    }
    const p = c.socialPermission;
    if (p.status === 'granted' && !(p.grantedBy && p.grantedOn && p.evidence)) out.push(`${c.id}: social permission granted without grantedBy, grantedOn and evidence`);
    if (!/^https?:\/\//.test(c.sourcePageUrl)) out.push(`${c.id}: missing source page`);
  }
  return out;
}
