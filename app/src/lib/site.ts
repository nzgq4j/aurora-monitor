/** Brand and canonical address. auroracast.io is registered too and redirects here. */
export const SITE = {
  name: 'Polar Lights',
  domain: 'polarlights.io',
  url: process.env.NEXT_PUBLIC_SITE_URL ?? 'https://www.polarlights.io',
  tagline: 'Aurora forecasts',
} as const;

/** Who runs Polar Lights, for the privacy policy and terms. */
export const LEGAL = {
  operator: 'Crucible Insight',
  email: 'privacy@polarlights.io',
  governingLaw: 'Arizona',
  /** Date shown as "Last updated" on both pages; change it with any change to their text. */
  updated: 'October 21, 2026',
} as const;
