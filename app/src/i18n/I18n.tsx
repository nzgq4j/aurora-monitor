'use client';

import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { LOCALE_COOKIE, type Locale } from './config';
import { makeI18n, type I18n, type Messages } from './core';

export type { I18n };

const Ctx = createContext<I18n | null>(null);

export function I18nProvider({ locale, messages, children }: { locale: Locale; messages: Messages; children: ReactNode }) {
  const value = useMemo(() => makeI18n(locale, messages), [locale, messages]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useI18n(): I18n {
  const v = useContext(Ctx);
  if (!v) throw new Error('useI18n must be used inside I18nProvider');
  return v;
}

/** Remember the language and reload so every page, including server-rendered parts, switches over. */
export function applyLocale(locale: Locale) {
  document.cookie = `${LOCALE_COOKIE}=${locale}; path=/; max-age=31536000; samesite=lax`;
  window.location.reload();
}
