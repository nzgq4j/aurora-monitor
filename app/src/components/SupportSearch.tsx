'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { search } from '../lib/supportText';
import type { SearchEntry } from '../lib/support';
import { useI18n } from '../i18n/I18n';
import type { MessageKey } from '../i18n/core';

/** Searches the help centre's articles in this language as you type (the index comes with the page). */
export function SupportSearch({ index }: { index: SearchEntry[] }) {
  const { t } = useI18n();
  const [q, setQ] = useState('');
  const hits = useMemo(() => search(index, q).slice(0, 8), [index, q]);
  return (
    <div className="support-search" role="search">
      <label className="field">
        <span className="label">{t('support.search')}</span>
        <input className="input" type="search" value={q} onChange={e => setQ(e.target.value)} placeholder={t('support.searchHint')} autoComplete="off" />
      </label>
      {q.trim() && (
        <div className="support-hits" aria-live="polite">
          {hits.length ? (
            <ul>
              {hits.map(h => (
                <li key={h.href}>
                  <Link href={h.href}>
                    <b>{h.title}</b>
                    <small>{t(`support.section.${h.section}` as MessageKey)}{h.summary && ` · ${h.summary}`}</small>
                  </Link>
                </li>
              ))}
            </ul>
          ) : <p>{t('support.noResults', { q: q.trim() })}</p>}
        </div>
      )}
    </div>
  );
}
