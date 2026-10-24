// Supported languages. Shared by the proxy (edge), server components and the client.

export const LOCALES = ['en', 'es', 'fr', 'de', 'nl', 'nb', 'da', 'sv', 'fi', 'ru'] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = 'en';

/** Each language's own name, as shown in the language picker. */
export const LOCALE_NAMES: Record<Locale, string> = {
  en: 'English', es: 'Español', fr: 'Français', de: 'Deutsch', nl: 'Nederlands',
  nb: 'Norsk', da: 'Dansk', sv: 'Svenska', fi: 'Suomi', ru: 'Русский',
};

/** BCP 47 tag used for dates and numbers. */
export const INTL_TAG: Record<Locale, string> = {
  en: 'en-US', es: 'es-ES', fr: 'fr-FR', de: 'de-DE', nl: 'nl-NL',
  nb: 'nb-NO', da: 'da-DK', sv: 'sv-SE', fi: 'fi-FI', ru: 'ru-RU',
};

/** Cookie holding the chosen language; read by the proxy on every page request. */
export const LOCALE_COOKIE = 'pl.lang';

export const isLocale = (v: unknown): v is Locale => typeof v === 'string' && (LOCALES as readonly string[]).includes(v);

/** Norwegian is often sent as "no" or "nn"; both get the Bokmål translation. */
const ALIASES: Record<string, Locale> = { no: 'nb', nn: 'nb' };

/** Best supported language for an Accept-Language header, e.g. "nl-BE,nl;q=0.9,en;q=0.8" → "nl". */
export function negotiate(header: string | null): Locale {
  if (!header) return DEFAULT_LOCALE;
  const ranked = header.split(',')
    .map(part => {
      const [tag, ...params] = part.trim().split(';');
      const q = params.find(p => p.trim().startsWith('q='));
      const base = tag.toLowerCase().split('-')[0];
      return { lang: ALIASES[base] ?? base, q: q ? Number(q.trim().slice(2)) || 0 : 1 };
    })
    .filter(x => x.q > 0)
    .sort((a, b) => b.q - a.q);
  return ranked.find(x => isLocale(x.lang))?.lang as Locale ?? DEFAULT_LOCALE;
}
