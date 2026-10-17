import 'server-only';
import { notFound } from 'next/navigation';
import { isLocale, type Locale } from './config';
import { makeI18n, type Messages } from './core';

const loaders: Record<Locale, () => Promise<Messages>> = {
  en: () => import('./messages/en').then(m => m.en),
  es: () => import('./messages/es').then(m => m.es),
  fr: () => import('./messages/fr').then(m => m.fr),
  de: () => import('./messages/de').then(m => m.de),
  nl: () => import('./messages/nl').then(m => m.nl),
};

/** The language from the route's [lang] segment; unknown values are a 404. */
export async function routeLocale(params: Promise<{ lang: string }>): Promise<Locale> {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  return lang;
}

export const getMessages = (locale: Locale) => loaders[locale]();

export async function getI18n(locale: Locale) {
  return makeI18n(locale, await getMessages(locale));
}
