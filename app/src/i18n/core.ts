import { INTL_TAG, type Locale } from './config';
import type { en } from './messages/en';

export type MessageKey = keyof typeof en;
/** A complete translation: every English key, each with a string. Languages with more plural forms
 *  (Russian) add `.few` and `.many` beside a key's `.one` and `.other`. */
export type Messages = Record<MessageKey, string> & { [k: `${string}.few` | `${string}.many`]: string };
export type Vars = Record<string, string | number>;

/** Fill {name} placeholders. */
export const format = (text: string, vars?: Vars) =>
  vars ? text.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m)) : text;

export interface I18n {
  locale: Locale;
  /** Translate a key, filling {placeholders} from `vars`. */
  t: (key: MessageKey, vars?: Vars) => string;
  /** Translate a key chosen at runtime (e.g. an error code); text that isn't a key is returned unchanged. */
  tx: (keyOrText: string, vars?: Vars) => string;
  /** Pick the plural form of `key` for `n` (`.one`, `.few`, `.many` or `.other`, falling back to `.other`), with {n} available as a placeholder. */
  tn: (key: string, n: number, vars?: Vars) => string;
  /** Format a number with fixed decimals in the current language (4.5 → "4,5" in German). Negative values use a true minus. */
  num: (n: number, decimals?: number) => string;
  /** US-dollar amount, e.g. "$5" or "5 $". */
  money: (usd: number) => string;
  date: (t: number | string, opts: Intl.DateTimeFormatOptions) => string;
}

export function makeI18n(locale: Locale, messages: Messages): I18n {
  const tag = INTL_TAG[locale];
  const plural = new Intl.PluralRules(tag);
  const numFmt = new Map<number, Intl.NumberFormat>();
  const tx = (k: string, vars?: Vars) => (k in messages ? format(messages[k as MessageKey], vars) : k);
  return {
    locale,
    t: (k, vars) => format(messages[k], vars),
    tx,
    tn: (k, n, vars) => {
      const form = `${k}.${plural.select(n)}`;
      return tx(form in messages ? form : `${k}.other`, { n, ...vars });
    },
    num: (n, d = 0) => {
      if (!numFmt.has(d)) numFmt.set(d, new Intl.NumberFormat(tag, { minimumFractionDigits: d, maximumFractionDigits: d, useGrouping: false }));
      return numFmt.get(d)!.format(n).replace('-', '−');
    },
    money: usd => new Intl.NumberFormat(tag, { style: 'currency', currency: 'USD', currencyDisplay: 'narrowSymbol', minimumFractionDigits: usd % 1 ? 2 : 0, maximumFractionDigits: 2 }).format(usd),
    date: (t, opts) => new Date(t).toLocaleDateString(tag, opts),
  };
}


/**
 * The first half of a two-part heading, ready to sit before the highlighted second half. Languages that build
 * one compound word end it with a hyphen ("Rom-" + "vær"): the hyphen becomes a soft hyphen, shown only if the
 * heading wraps there, and no space is added, so it reads "Romvær". Anything else gets the usual space.
 */
/** A two-part heading as plain text (for labels), joined the same way as headLead. */
export const headText = (a: string, b: string) => (a.endsWith('-') ? `${a.slice(0, -1)}${b}` : `${a} ${b}`);

export const headLead = (s: string) => (s.endsWith('-') ? `${s.slice(0, -1)}­` : `${s} `);
