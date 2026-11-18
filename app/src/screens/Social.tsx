'use client';

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { useStore } from '../store';
import { useI18n } from '../i18n/I18n';
import { BottomSheet } from '../components/BottomSheet';
import { supabase } from '../lib/supabase';
import type { MessageKey } from '../i18n/core';
import { searchPlaces, type PlaceResult } from '../lib/locations';

const BACK = 'M15 5l-7 7 7 7', CHEVRON = 'M9 6l6 6-6 6';
const MAX_TEXT = 300, MAX_ALT = 2000;
type Kind = 'storm' | 'flare' | 'shock' | 'substorm' | 'viewing';
const KINDS: Kind[] = ['storm', 'flare', 'shock', 'substorm', 'viewing'];
/** Local aurora hashtags suggested for a new site, by country. */
const COUNTRY_TAGS: Record<string, string> = {
  Norway: '#nordlys #Norway', Norge: '#nordlys #Norway', Sweden: '#norrsken #Sweden', Sverige: '#norrsken #Sweden', Finland: '#revontulet #Finland', Suomi: '#revontulet #Finland',
  Iceland: '#nordurljos #Iceland', Denmark: '#nordlys #Denmark', Greenland: '#Greenland', 'United Kingdom': '#aurora #UK', Canada: '#Canada', 'United States': '#USA',
  Russia: '#Russia', Australia: '#AuroraAustralis #Australia', 'New Zealand': '#AuroraAustralis #NewZealand',
};

interface Rules { enabled: boolean; stormMinG: number; flareMin: 'X' | 'M5' | 'off'; shocks: boolean; substorms: boolean; viewingEnabled: boolean }
interface Site { id: string; name: string; lat: number; lon: number; tags: string; level: 'goNow' | 'goLater' | 'maybe' | 'no' | 'unavailable' | null; score: number | null }
interface Connection { handle: string | null; connectedAt: string | null; lastError: string | null; envFallback: boolean }
interface PostRow { key: string; kind: Kind; status: 'posting' | 'posted' | 'failed'; error: string | null; post_url: string | null; manual: boolean; image: boolean; created_at: string }
interface Data { rules: Rules; connection: Connection; now: { kind: Kind; key: string; at: number; posted: boolean; site?: string; mode?: 'now' | 'tonight' }[]; sites: Site[]; recent: PostRow[] }
type Style = 'card' | 'globe' | 'map' | 'sun';
interface Preview { sample: boolean; key: string | null; style: Style; styles: Style[]; text: string; alt: string | null; image: string | null; graphemes: number }

const segmenter = (Intl as unknown as { Segmenter?: new (l: string, o: object) => { segment: (s: string) => Iterable<unknown> } }).Segmenter;
const seg = segmenter ? new segmenter('en', { granularity: 'grapheme' }) : null;
const graphemes = (s: string) => (seg ? [...seg.segment(s)].length : [...s].length);

/** /api/admin/* as the signed-in user. The server checks the admins table on every call. */
async function api<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<{ ok: boolean; status: number; data: T & { error?: string } }> {
  const s = (await supabase()?.auth.getSession())?.data.session;
  try {
    const res = await fetch(path, {
      method: init.method ?? 'GET',
      headers: { 'content-type': 'application/json', ...(s ? { authorization: `Bearer ${s.access_token}` } : {}) },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
    return { ok: res.ok, status: res.status, data: await res.json().catch(() => ({})) };
  } catch {
    return { ok: false, status: 0, data: { error: 'unreachable' } as T & { error?: string } };
  }
}

const Icon = ({ d, size = 22 }: { d: string; size?: number }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true"><path d={d} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
);

function Group({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section className="you-group" aria-label={label}>
      <h2 className="you-group-label">{label}</h2>
      <div className="you-group-rows">{children}</div>
    </section>
  );
}

function Switch({ label, on, onChange, disabled }: { label: string; on: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button type="button" className="btn you-row" role="switch" aria-checked={on} disabled={disabled} onClick={() => onChange(!on)}>
      <span className="you-row-label">{label}</span>
      <span className={'switch' + (on ? ' on' : '')} aria-hidden="true"><span className="switch-knob" /></span>
    </button>
  );
}

const field = { width: '100%', padding: '12px 14px', borderRadius: 12, border: '1px solid var(--line2, #2a302c)', background: '#0b0d0c', color: '#fff', fontSize: 16, fontFamily: 'inherit' } as const;
const note = { fontSize: 14, color: 'var(--soft)', margin: 0, lineHeight: 1.45 } as const;

export function Social() {
  const { go } = useStore();
  const { t, tx, date } = useI18n();
  const [data, setData] = useState<Data | null>(null);
  const [denied, setDenied] = useState(false);
  const [msg, setMsg] = useState<{ text: string; bad?: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [sheet, setSheet] = useState<null | 'storm' | 'flare'>(null);
  const [preview, setPreview] = useState<{ kind: Kind; p: Preview | null; text: string; alt: string } | null>(null);
  const [form, setForm] = useState({ identifier: '', password: '', service: '' });
  const [siteQ, setSiteQ] = useState('');
  const [found, setFound] = useState<PlaceResult[] | null>(null);
  const [siteTags, setSiteTags] = useState('');

  const err = (code?: string) => {
    const key = `social.err.${code}`;
    const known = tx(key);
    return known !== key ? known : t('social.err.generic', { code: code ?? '?' });
  };
  const when = (iso: string | number) => date(iso, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

  const load = useCallback(async () => {
    const r = await api<Data>('/api/admin/social');
    if (r.status === 403) { setDenied(true); return; }
    if (r.ok) setData(r.data);
    else setMsg({ text: err(r.data.error), bad: true });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- load once; err only reads translations
  useEffect(() => { void load(); }, [load]); // eslint-disable-line react-hooks/set-state-in-effect -- fetch once on open

  const act = async (fn: () => Promise<void>) => { setBusy(true); setMsg(null); try { await fn(); } finally { setBusy(false); } };
  const bluesky = (body: object) => act(async () => {
    const r = await api<{ handle?: string }>('/api/admin/bluesky', { method: 'POST', body });
    setForm(f => ({ ...f, password: '' })); // never keep the password around
    if (!r.ok) { setMsg({ text: err(r.data.error), bad: true }); return; }
    if ((body as { action: string }).action === 'check') setMsg({ text: t('social.checkOk', { handle: r.data.handle ?? '' }) });
    await load();
  });
  const patch = (p: Partial<Rules>) => act(async () => {
    setData(d => (d ? { ...d, rules: { ...d.rules, ...p } } : d));
    const r = await api('/api/admin/social', { method: 'PATCH', body: p });
    if (!r.ok) { setMsg({ text: err(r.data.error), bad: true }); await load(); }
  });
  const sites = (body: object) => act(async () => {
    const r = await api('/api/admin/social/sites', { method: 'POST', body });
    if (!r.ok) { setMsg({ text: err(r.data.error), bad: true }); return; }
    setFound(null); setSiteQ(''); setSiteTags('');
    await load();
  });
  const findSite = () => act(async () => {
    try { setFound(await searchPlaces(siteQ)); } catch { setMsg({ text: err('unreachable'), bad: true }); }
  });
  const openPreview = (kind: Kind, style?: Style) => act(async () => {
    setPreview(prev => ({ kind, p: style && prev?.kind === kind ? prev.p : null, text: prev?.text ?? '', alt: prev?.alt ?? '' }));
    const r = await api<Preview>(`/api/admin/social?preview=${kind}${style ? `&style=${style}` : ''}`);
    if (!r.ok) { setPreview(null); setMsg({ text: err(r.data.error), bad: true }); return; }
    setPreview({ kind, p: r.data, text: r.data.text, alt: r.data.alt ?? '' });
  });

  const postNow = () => act(async () => {
    if (!preview?.p) return;
    const r = await api<{ url?: string; repost?: boolean }>('/api/admin/social', { method: 'POST', body: { kind: preview.kind, style: preview.p.style, text: preview.text, alt: preview.alt } });
    if (!r.ok) { setMsg({ text: err(r.data.error), bad: true }); return; }
    setPreview(null);
    setMsg({ text: t('social.postedOk') });
    await load();
  });

  const bar = (
    <div className="you-bar">
      <button type="button" className="btn you-back" onClick={() => go('account')} aria-label={t('you.back')}><Icon d={BACK} /></button>
      <h1 className="you-bar-title">{t('social.title')}</h1>
    </div>
  );
  if (denied) return <main className="wrap you">{bar}<p style={note}>{t('social.notAllowed')}</p></main>;
  if (!data) return <main className="wrap you">{bar}<p style={note}>{msg ? msg.text : t('social.loading')}</p></main>;

  const { rules, connection: c } = data;
  const nowFor = (k: Kind) => data.now.find(n => n.kind === k);
  const textCount = preview ? graphemes(preview.text) : 0, altCount = preview ? graphemes(preview.alt) : 0;
  const posted = preview?.p?.key ? data.now.find(n => n.key === preview.p!.key)?.posted : false;

  return (
    <main className="wrap you social-page" style={{ paddingBottom: 48 }}>
      {bar}
      {msg && <p role="status" style={{ ...note, color: msg.bad ? '#F06A6A' : 'var(--green)', margin: '0 0 12px' }}>{msg.text}</p>}

      <Group label={t('social.connection')}>
        {c.handle ? (
          <>
            <div className="you-row" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 4 }}>
              <span className="you-row-label">{t('social.postingAs', { handle: c.handle })}</span>
              {c.connectedAt && <span style={{ fontSize: 14, color: 'var(--muted)' }}>{t('social.signedIn', { date: when(c.connectedAt) })}</span>}
              {c.lastError && <span style={{ fontSize: 14, color: '#F06A6A' }}>{t('social.sessionLost')}</span>}
            </div>
            <button type="button" className="btn you-row" disabled={busy} onClick={() => bluesky({ action: 'check' })}><span className="you-row-label">{t('social.check')}</span></button>
            <button type="button" className="btn you-row danger" disabled={busy} onClick={() => bluesky({ action: 'signout' })}><span className="you-row-label">{t('social.signOut')}</span></button>
          </>
        ) : (
          <form className="you-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 10 }} onSubmit={e => { e.preventDefault(); void bluesky({ action: 'signin', ...form }); }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 14 }}>{t('social.identifier')}
              <input style={field} autoComplete="username" autoCapitalize="none" value={form.identifier} onChange={e => setForm({ ...form, identifier: e.target.value })} placeholder="polarlights.io" />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 14 }}>{t('social.appPassword')}
              <input style={field} type="password" autoComplete="current-password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} />
            </label>
            <p style={note}>{t('social.appPasswordHelp')}</p>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 14 }}>{t('social.server')}
              <input style={field} inputMode="url" autoCapitalize="none" value={form.service} onChange={e => setForm({ ...form, service: e.target.value })} placeholder="https://bsky.social" />
            </label>
            {c.lastError && <p style={{ ...note, color: '#F06A6A' }}>{t('social.sessionLost')}</p>}
            {c.envFallback && <p style={note}>{t('social.envFallback')}</p>}
            <button type="submit" className="btn pill pill-primary" disabled={busy || !form.identifier || !form.password}>{t('social.signIn')}</button>
          </form>
        )}
      </Group>

      <Group label={t('social.feed')}>
        <div className="you-row"><p style={note}>{t('social.feedHelp')}</p></div>
        <Switch label={t('social.enabled')} on={rules.enabled} disabled={busy} onChange={v => void patch({ enabled: v })} />
        <button type="button" className="btn you-row" aria-haspopup="dialog" onClick={() => setSheet('storm')}>
          <span className="you-row-label">{t('social.storms')}</span>
          <span className="you-row-value">{rules.stormMinG ? t('social.stormsValue', { g: rules.stormMinG }) : t('social.off')}</span><span className="you-chevron"><Icon d={CHEVRON} size={16} /></span>
        </button>
        <button type="button" className="btn you-row" aria-haspopup="dialog" onClick={() => setSheet('flare')}>
          <span className="you-row-label">{t('social.flares')}</span>
          <span className="you-row-value">{rules.flareMin === 'off' ? t('social.off') : t(rules.flareMin === 'X' ? 'social.flareX' : 'social.flareM5')}</span><span className="you-chevron"><Icon d={CHEVRON} size={16} /></span>
        </button>
        <Switch label={t('social.shocks')} on={rules.shocks} disabled={busy} onChange={v => void patch({ shocks: v })} />
        <Switch label={t('social.substorms')} on={rules.substorms} disabled={busy} onChange={v => void patch({ substorms: v })} />
      </Group>

      <Group label={t('social.viewing')}>
        <div className="you-row"><p style={note}>{t('social.viewingHelp')}</p></div>
        <Switch label={t('social.viewingEnabled')} on={rules.viewingEnabled} disabled={busy} onChange={v => void patch({ viewingEnabled: v })} />
      </Group>

      <details className="you-group social-sites">
        <summary className="you-group-label" style={{ cursor: 'pointer' }}>{t('social.sites', { n: data.sites.length })}</summary>
        <div className="you-group-rows">
          {data.sites.length === 0 && <div className="you-row"><span style={note}>{t('social.noSites')}</span></div>}
          {data.sites.map(s => (
            <div key={s.id} className="you-row" style={{ gap: 10 }}>
              <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0, flex: 1 }}>
                <span className="you-row-label" style={{ overflowWrap: 'anywhere' }}>{s.name}</span>
                <span style={{ fontSize: 13, color: s.level === 'goNow' || s.level === 'goLater' ? 'var(--green)' : 'var(--muted)' }}>
                  {s.level ? t(`social.level.${s.level}` as MessageKey) : '–'}{s.score !== null && s.level !== 'unavailable' ? ` · ${s.score}/100` : ''}{s.tags ? ` · ${s.tags}` : ''}
                </span>
              </span>
              <button type="button" className="btn pill pill-ghost" style={{ padding: '6px 12px', fontSize: 14 }} disabled={busy} aria-label={t('social.removeSite', { name: s.name })} onClick={() => void sites({ action: 'remove', id: s.id })}>{t('social.remove')}</button>
            </div>
          ))}
          <form className="you-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 10 }} onSubmit={e => { e.preventDefault(); void findSite(); }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 14 }}>{t('social.addSite')}
              <span style={{ display: 'flex', gap: 8 }}>
                <input style={{ ...field, flex: 1, minWidth: 0 }} value={siteQ} onChange={e => setSiteQ(e.target.value)} placeholder="Tromsø" />
                <button type="submit" className="btn pill pill-ghost" style={{ padding: '0 16px' }} disabled={busy || siteQ.trim().length < 2}>{t('social.search')}</button>
              </span>
            </label>
            {found && found.length === 0 && <p style={note}>{t('social.noResults')}</p>}
            {found && found.length > 0 && (
              <>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 14 }}>{t('social.tags')}
                  <input style={field} value={siteTags} onChange={e => setSiteTags(e.target.value)} placeholder="#nordlys #Norway" autoCapitalize="none" />
                </label>
                {found.map(p => {
                  const region = p.detail.split(', ')[0] || p.detail;
                  const country = p.detail.split(', ').pop() ?? '';
                  return (
                    <button key={`${p.lat},${p.lon}`} type="button" className="btn you-row" style={{ justifyContent: 'space-between' }} disabled={busy}
                      onClick={() => void sites({ action: 'add', name: region && region !== p.name ? `${p.name}, ${region}` : p.name, lat: p.lat, lon: p.lon, tags: siteTags || COUNTRY_TAGS[country] || '' })}>
                      <span className="you-row-label" style={{ overflowWrap: 'anywhere' }}>{p.name}<span style={{ color: 'var(--muted)', fontSize: 13 }}> · {p.detail}</span></span>
                      <span className="you-row-value" style={{ color: 'var(--green)' }}>{t('social.add')}</span>
                    </button>
                  );
                })}
              </>
            )}
          </form>
        </div>
      </details>

      <Group label={t('social.now')}>
        {KINDS.map(k => {
          const n = nowFor(k);
          return (
            <button key={k} type="button" className="btn you-row" aria-haspopup="dialog" disabled={busy} onClick={() => void openPreview(k)}>
              <span className="you-row-label">{t(`social.kind.${k}` as MessageKey)}</span>
              <span className="you-row-value" style={n ? { color: 'var(--green)' } : undefined}>{n ? (n.posted ? t('social.posted') : n.site ? `${n.site} · ${t(n.mode === 'now' ? 'social.level.goNow' : 'social.level.goLater')}` : t('social.happening')) : t('social.nothing')}</span>
              <span className="you-chevron"><Icon d={CHEVRON} size={16} /></span>
            </button>
          );
        })}
      </Group>

      <details className="you-group social-recent">
        <summary className="you-group-label" style={{ cursor: 'pointer' }}>{t('social.recent', { n: data.recent.length })}</summary>
        <div className="you-group-rows">
          {data.recent.length === 0 && <div className="you-row"><span style={note}>{t('social.none')}</span></div>}
          {data.recent.map(r => (
            <div key={r.key} className="you-row" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 2 }}>
              <span className="you-row-label">{t(`social.kind.${r.kind}` as MessageKey)} · {t(`social.status.${r.status}` as MessageKey)}{r.manual ? ` · ${t('social.manual')}` : ''}{!r.image && r.status === 'posted' ? ` · ${t('social.noImage')}` : ''}</span>
              <span style={{ fontSize: 13, color: 'var(--muted)', overflowWrap: 'anywhere' }}>{when(r.created_at)}{r.error ? ` · ${err(r.error)}` : ''}</span>
              {r.post_url && <a href={r.post_url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 14, color: 'var(--green)' }}>{t('social.open')}</a>}
            </div>
          ))}
        </div>
      </details>

      {sheet === 'storm' && (
        <BottomSheet title={t('social.storms')} onClose={() => setSheet(null)}>
          <div className="you-group-rows">
            {[0, 1, 2, 3, 4, 5].map(g => (
              <button key={g} type="button" className="btn you-row" aria-pressed={rules.stormMinG === g} onClick={() => { void patch({ stormMinG: g }); setSheet(null); }}>
                <span className="you-row-label">{g ? t('social.stormsValue', { g }) : t('social.off')}</span>
                {rules.stormMinG === g && <span className="you-row-value" style={{ color: 'var(--green)' }}>✓</span>}
              </button>
            ))}
          </div>
        </BottomSheet>
      )}
      {sheet === 'flare' && (
        <BottomSheet title={t('social.flares')} onClose={() => setSheet(null)}>
          <div className="you-group-rows">
            {(['off', 'M5', 'X'] as const).map(v => (
              <button key={v} type="button" className="btn you-row" aria-pressed={rules.flareMin === v} onClick={() => { void patch({ flareMin: v }); setSheet(null); }}>
                <span className="you-row-label">{v === 'off' ? t('social.off') : t(v === 'X' ? 'social.flareX' : 'social.flareM5')}</span>
                {rules.flareMin === v && <span className="you-row-value" style={{ color: 'var(--green)' }}>✓</span>}
              </button>
            ))}
          </div>
        </BottomSheet>
      )}
      {preview && (
        <BottomSheet title={`${t('social.preview')} · ${t(`social.kind.${preview.kind}` as MessageKey)}`} onClose={() => setPreview(null)}>
          {!preview.p ? <p style={note}>{t('social.loading')}</p> : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {preview.p.sample && <p style={{ ...note, color: '#E6B800' }}>{t('social.sample')}</p>}
              {(preview.p.styles?.length ?? 0) > 1 && (
                <div role="group" aria-label={t('social.style')} style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {preview.p.styles.map(st => (
                    <button key={st} type="button" className={'btn pill ' + (st === preview.p!.style ? 'pill-primary' : 'pill-ghost')} aria-pressed={st === preview.p!.style}
                      style={{ padding: '6px 14px', fontSize: 14 }} disabled={busy} onClick={() => void openPreview(preview.kind, st)}>{t(`social.style.${st}` as MessageKey)}</button>
                  ))}
                </div>
              )}
              {posted && <p style={{ ...note, color: '#E6B800' }}>{t('social.repostNote')}</p>}
              {preview.p.image
                // eslint-disable-next-line @next/next/no-img-element -- a data URL from the server, nothing to optimise
                ? <img src={preview.p.image} alt={preview.alt} style={{ width: '100%', height: 'auto', borderRadius: 12 }} />
                : <p style={note}>{t('social.noImage')}</p>}
              <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 14 }}>
                <span style={{ display: 'flex', justifyContent: 'space-between' }}><span>{t('social.text')}</span><span style={{ color: textCount > MAX_TEXT ? '#F06A6A' : 'var(--muted)' }}>{t('social.count', { n: textCount, max: MAX_TEXT })}</span></span>
                <textarea style={{ ...field, minHeight: 170, resize: 'vertical' }} value={preview.text} onChange={e => setPreview({ ...preview, text: e.target.value })} />
              </label>
              {preview.p.image && (
                <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 14 }}>
                  <span style={{ display: 'flex', justifyContent: 'space-between' }}><span>{t('social.alt')}</span><span style={{ color: altCount > MAX_ALT ? '#F06A6A' : 'var(--muted)' }}>{t('social.count', { n: altCount, max: MAX_ALT })}</span></span>
                  <textarea style={{ ...field, minHeight: 170, resize: 'vertical' }} value={preview.alt} onChange={e => setPreview({ ...preview, alt: e.target.value })} />
                </label>
              )}
              <div style={{ display: 'flex', gap: 10 }}>
                <button type="button" className="btn pill pill-ghost" style={{ flex: 1 }} onClick={() => setPreview({ ...preview, text: preview.p!.text, alt: preview.p!.alt ?? '' })}>{t('social.reset')}</button>
                <button type="button" className="btn pill pill-primary" style={{ flex: 1 }}
                  disabled={busy || preview.p.sample || !preview.text.trim() || textCount > MAX_TEXT || altCount > MAX_ALT} onClick={() => void postNow()}>{t('social.postNow')}</button>
              </div>
            </div>
          )}
        </BottomSheet>
      )}
    </main>
  );
}
