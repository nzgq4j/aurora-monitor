/** Brand and canonical address. auroracast.io is registered too and redirects here. */
export const SITE = {
  name: 'Polar Lights',
  domain: 'polarlights.io',
  url: process.env.NEXT_PUBLIC_SITE_URL ?? 'https://www.polarlights.io',
  tagline: 'Aurora forecasts',
} as const;
