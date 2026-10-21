'use client';

import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../lib/auth';
import { supabase } from '../lib/supabase';
import { fileUrl } from '../lib/community';
import { useI18n } from '../i18n/I18n';
import type { MessageKey } from '../i18n/core';

interface Item {
  id: string; created_at: string; thumb_path: string; caption: string | null; place: string | null; source: string;
  status: string; featured: boolean; helpful: number; reports: number; handle: string; reasons: string[];
}

async function call(body: object) {
  const s = (await supabase()?.auth.getSession())?.data.session;
  if (!s) return null;
  const res = await fetch('/api/gallery/moderate', { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${s.access_token}` }, body: JSON.stringify(body) });
  return res.ok ? res.json() : null;
}

/** Gallery moderation for admins: reported and hidden photos, to restore or remove. */
export function Moderate() {
  const { user, ready } = useAuth();
  const { t, date } = useI18n();
  const [items, setItems] = useState<Item[] | null>(null);
  const [denied, setDenied] = useState(false);

  const load = useCallback(async () => {
    const r = await call({}) as { photos: Item[] } | null;
    if (!r) { setDenied(true); return; }
    setItems(r.photos);
  }, []);
  useEffect(() => { if (user) void load(); }, [user, load]);

  const act = async (id: string, action: 'restore' | 'remove') => {
    if (await call({ photoId: id, action })) setItems(xs => xs?.filter(x => x.id !== id) ?? null);
  };

  if (ready && (!user || denied)) return <main className="wrap gal"><h1 className="you-title">{t('mod.title')}</h1><p className="gal-empty">{t('mod.denied')}</p></main>;
  return (
    <main className="wrap gal">
      <h1 className="you-title">{t('mod.title')}</h1>
      <p className="you-sheet-text">{t('mod.text')}</p>
      {items === null && <p className="gal-empty">{t('gal.loading')}</p>}
      {items && !items.length && <p className="gal-empty">{t('mod.empty')}</p>}
      {items?.map(x => (
        <div key={x.id} className="mod-item">
          {/* eslint-disable-next-line @next/next/no-img-element -- public storage file */}
          <img src={fileUrl(x.thumb_path)} alt="" />
          <div className="mod-body">
            <b>{x.handle}</b> · {date(x.created_at, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
            <div className="mod-meta">{x.status === 'hidden' ? t('mod.hidden') : t('mod.visible')} · {t('mod.reports', { n: x.reports })}</div>
            {x.reasons.length > 0 && <div className="mod-meta">{x.reasons.map(r => t(`gal.reason.${r}` as MessageKey)).join(', ')}</div>}
            {x.caption && <p>{x.caption}</p>}
            <div className="mod-actions">
              <button type="button" className="btn pill pill-ghost sheet-pill" onClick={() => act(x.id, 'restore')}>{t('mod.restore')}</button>
              <button type="button" className="btn pill pill-primary sheet-pill danger" onClick={() => act(x.id, 'remove')}>{t('mod.remove')}</button>
            </div>
          </div>
        </div>
      ))}
    </main>
  );
}
