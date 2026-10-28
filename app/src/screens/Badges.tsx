'use client';

import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../lib/auth';
import { useStore } from '../store';
import { useI18n } from '../i18n/I18n';
import { BadgeIcon } from '../components/BadgeIcon';
import { BottomSheet } from '../components/BottomSheet';
import { FAMILIES, TIERS, TIER_COLORS, badges, rank, specialBadges, type Badge } from '../lib/badges';
import { badgeCardBlob } from '../lib/shareCard';
import { SITE } from '../lib/site';
import { myAchievements, myMember, mySpecialBadges, redeemBadgeCode, setHandle, type RedeemStatus } from '../lib/community';
import { markSeen } from '../components/BadgeWatcher';
import type { MemberInfo } from '../lib/badges';
import type { MessageKey } from '../i18n/core';

const BACK = 'M15 5l-7 7 7 7';

/** The badge's name: storm days are named for their storm, special badges carry their own, the rest from messages. */
export function useBadgeText() {
  const { t, num, date } = useI18n();
  const day = (d: string) => date(`${d}T12:00:00Z`, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
  return {
    name: (b: Badge) => b.title ?? (b.day ? t('badge.storm.name', { g: b.g ?? 3 }) : t(`badge.${b.id}.name` as MessageKey)),
    desc: (b: Badge) => b.text ?? (b.day ? t('badge.storm.desc', { g: b.g ?? 3, date: day(b.day) })
      : b.id === 'furthest' && b.value != null ? t('badge.furthest.got', { lat: num(b.value, 1) })
      : t(`badge.${b.id}.desc` as MessageKey)),
    tierName: (b: Badge) => (b.steps.length === 1 ? '' : b.level ? t(`badgeTier.${TIERS[b.level - 1]}` as MessageKey) : ''),
  };
}

/** One line under a badge in the cabinet: its tier and count, or what's still needed. */
function useSubline() {
  const { t, tn } = useI18n();
  const text = useBadgeText();
  return (b: Badge) => {
    if (b.day) return t('badges.limited');
    if (b.family === 'special') return t('badges.earned');
    if (b.steps.length === 1) return b.level ? t('badges.earned') : b.id === 'yearRound' ? t('badges.ofN', { n: b.count, of: 4 }) : t('badges.notYet');
    if (!b.level) return t('badges.ofN', { n: b.count, of: b.next ?? 0 });
    return `${text.tierName(b)} · ${tn('badges.count', b.count)}`;
  };
}

export function Badges() {
  const { go } = useStore();
  const { user, ready } = useAuth();
  const { t, num, locale } = useI18n();
  const text = useBadgeText();
  const sub = useSubline();
  const [member, setMember] = useState<MemberInfo | null>(null);
  const [list, setList] = useState<Badge[] | null>(null);
  const [specials, setSpecials] = useState<Badge[]>([]);
  const [open, setOpen] = useState<Badge | null>(null);
  const [fresh, setFresh] = useState(false);
  const [naming, setNaming] = useState(false);
  const [mystery, setMystery] = useState(false);
  const [redeeming, setRedeeming] = useState(false);

  const load = () => Promise.all([myMember(), myAchievements(), mySpecialBadges()]).then(([m, a, sp]) => {
    setMember(m);
    setList(m ? badges(a, m) : []);
    const special = specialBadges(sp, locale);
    setSpecials(special);
    return special;
  });
  // A redeemed code: show its badge as new, and tell the watcher it has been seen.
  const redeemed = async (slug: string) => {
    setRedeeming(false);
    const b = (await load()).find(x => x.id === `special:${slug}`);
    if (!b) return;
    if (user) markSeen(user.id, b);
    setFresh(true);
    setOpen(b);
  };
  useEffect(() => { if (user) void load(); }, [user, locale]); // eslint-disable-line react-hooks/exhaustive-deps -- load is remade each render

  if (ready && !user) {
    return (
      <main className="wrap you badges-page">
        <h1 className="you-title">{t('badges.title')}</h1>
        <p className="you-sheet-text">{t('badges.signedOut')}</p>
        <button type="button" className="btn pill pill-primary" onClick={() => go('signin')}>{t('nav.signIn')}</button>
      </main>
    );
  }

  const r = rank(member?.points ?? 0);
  const earned = (list ?? []).filter(b => b.level).length;
  return (
    <main className="wrap you badges-page">
      <div className="you-bar badges-bar">
        <button type="button" className="btn you-back" onClick={() => go('account')} aria-label={t('you.back')}>
          <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d={BACK} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </button>
        <h1 className="you-bar-title">{t('badges.title')}</h1>
      </div>

      <section className="badges-rank" aria-label={t('badges.rank')}>
        <div className="badges-rank-top">
          <span className="mono">{t('badges.level', { n: r.index + 1, of: 7 })}</span>
          <span className="mono">{t('badges.points', { n: num(member?.points ?? 0) })}</span>
        </div>
        <div className="badges-rank-name">{t(`rank.${r.id}` as MessageKey)}</div>
        <div className="badges-bar-track" aria-hidden="true"><div style={{ width: `${Math.round(r.progress * 100)}%` }} /></div>
        <div className="badges-rank-sub">
          {r.next ? t('badges.toNext', { n: num(r.next.min - (member?.points ?? 0)), rank: t(`rank.${r.next.id}` as MessageKey) }) : t('badges.top')}
          {list && ` · ${t('badges.earnedOf', { n: earned, of: list.length })}`}
        </div>
        {member && (
          <button type="button" className="btn badges-handle" onClick={() => setNaming(true)}>
            {t('badges.handle', { handle: member.handle })} <span className="hl">{t('badges.change')}</span>
          </button>
        )}
      </section>

      {!list && <p className="you-sheet-text">{t('common.loading')}</p>}
      {list && FAMILIES.map(f => {
        const items = list.filter(b => b.family === f);
        return (
          <section key={f} className="badges-family" aria-labelledby={`fam-${f}`}>
            <div className="badges-family-head">
              <h2 id={`fam-${f}`}>{t(`badges.family.${f}` as MessageKey)}</h2>
              <span>{t('badges.ofN', { n: items.filter(b => b.level).length, of: items.length })}</span>
            </div>
            <div className="badges-grid">
              {items.map(b => (
                <button key={b.id} type="button" className="btn badges-item" onClick={() => setOpen(b)}>
                  <BadgeIcon tier={b.tier} glyph={b.glyph} label={b.label} size={88} />
                  <span className="badges-item-name">{text.name(b)}</span>
                  <span className={'badges-item-sub' + (b.level ? '' : ' locked')}>{sub(b)}</span>
                </button>
              ))}
            </div>
          </section>
        );
      })}
      {list && (
        <section className="badges-family" aria-labelledby="fam-special">
          <div className="badges-family-head">
            <h2 id="fam-special">{t('badges.family.special')}</h2>
          </div>
          <p className="badges-secret">{t('badges.secretFound', { n: specials.length })}</p>
          <div className="badges-grid">
            {specials.map(b => (
              <button key={b.id} type="button" className="btn badges-item" onClick={() => setOpen(b)}>
                <BadgeIcon tier={b.tier} glyph={b.glyph} size={88} />
                <span className="badges-item-name">{text.name(b)}</span>
                <span className="badges-item-sub">{sub(b)}</span>
              </button>
            ))}
            {/* Secret until earned: one mystery tile, with no hint of how many there are or what they need. */}
            <button type="button" className="btn badges-item" onClick={() => setMystery(true)}>
              <BadgeIcon tier="locked" glyph="question" size={88} />
              <span className="badges-item-name">{t('badges.mystery.name')}</span>
              <span className="badges-item-sub locked">{t('badges.mystery.sub')}</span>
            </button>
          </div>
          <button type="button" className="btn badges-redeem" onClick={() => setRedeeming(true)}>
            {t('badges.redeem.ask')} <span className="hl">{t('badges.redeem.open')}</span>
          </button>
        </section>
      )}
      <p className="you-foot">{t('badges.how')}</p>

      {open && <BadgeSheet b={open} fresh={fresh} onClose={() => { setOpen(null); setFresh(false); }} />}
      {mystery && (
        <BottomSheet title={t('badges.mystery.name')} onClose={() => setMystery(false)}>
          <div className="badge-sheet">
            <BadgeIcon tier="locked" glyph="question" size={160} />
            <p className="you-sheet-text" style={{ textAlign: 'center', margin: 0 }}>{t('badges.mystery.text')}</p>
            <div className="badge-sheet-actions">
              <button type="button" className="btn pill pill-ghost sheet-pill" onClick={() => setMystery(false)}>{t('common.done')}</button>
            </div>
          </div>
        </BottomSheet>
      )}
      {redeeming && <RedeemSheet onClose={() => setRedeeming(false)} onRedeemed={redeemed} />}
      {naming && member && <HandleSheet current={member.handle} onClose={() => setNaming(false)} onSaved={h => { setMember({ ...member, handle: h }); setNaming(false); }} />}
    </main>
  );
}

/** A badge up close: its tier ladder and what the next tier needs. */
export function BadgeSheet({ b, onClose, fresh }: { b: Badge; onClose: () => void; fresh?: boolean }) {
  const { t, tn, num, date } = useI18n();
  const text = useBadgeText();
  const tiered = b.steps.length > 1;
  const icon = useRef<HTMLDivElement>(null);
  const card = useRef<File | null>(null);
  // The badge as a picture, made when the sheet opens so sharing can start straight from the tap.
  useEffect(() => {
    if (!b.level || typeof navigator === 'undefined' || !navigator.canShare) return;
    let live = true;
    void badgeCardBlob({
      kicker: t('badges.cardKicker'), name: text.name(b), tier: text.tierName(b), desc: text.desc(b),
      color: TIER_COLORS[b.tier].rim, site: SITE.domain,
    }, icon.current?.querySelector('svg') ?? null).then(blob => {
      if (!live || !blob) return;
      const file = new File([blob], `polar-lights-badge-${b.id.replace(/[^a-z0-9]+/gi, '-')}.png`, { type: 'image/png' });
      if (navigator.canShare({ files: [file] })) card.current = file;
    });
    return () => { live = false; };
  }, [b]); // eslint-disable-line react-hooks/exhaustive-deps -- once per badge
  const share = async () => {
    const msg = t('badges.shareText', { badge: text.name(b) + (text.tierName(b) ? ` · ${text.tierName(b)}` : '') });
    const url = 'https://www.polarlights.io';
    try {
      await navigator.share?.(card.current ? { files: [card.current], title: SITE.name, text: `${msg} ${url}` } : { text: msg, url });
    } catch { /* cancelled */ }
  };
  return (
    <BottomSheet title={fresh ? t('badges.new') : text.name(b)} onClose={onClose}>
      <div className="badge-sheet">
        <div ref={icon}><BadgeIcon tier={b.tier} glyph={b.glyph} label={b.label} size={160} title={text.name(b)} /></div>
        {fresh && <h3 className="badge-sheet-name">{text.name(b)}{text.tierName(b) && ` · ${text.tierName(b)}`}</h3>}
        {!fresh && text.tierName(b) && <h3 className="badge-sheet-name">{text.tierName(b)}</h3>}
        <p className="you-sheet-text" style={{ textAlign: 'center', margin: 0 }}>{text.desc(b)}</p>
        {b.level > 0 && b.at && <p className="badge-sheet-when">{t('badges.when', { date: date(b.at, { day: 'numeric', month: 'short', year: 'numeric' }) })}</p>}
        {tiered && (
          <>
            {b.next != null && (
              <div className="badge-sheet-progress">
                <div className="badges-bar-track" aria-hidden="true"><div style={{ width: `${Math.min(100, Math.round((b.count / b.next) * 100))}%` }} /></div>
                <span className="mono">{t('badges.ofN', { n: b.count, of: b.next })}</span>
              </div>
            )}
            <ol className="badge-ladder" aria-label={t('badges.tiers')}>
              {b.steps.map((s, i) => (
                <li key={s}>
                  <BadgeIcon tier={b.level > i ? TIERS[i] : 'locked'} glyph={b.glyph} size={44} />
                  <span>{t(`badgeTier.${TIERS[i]}` as MessageKey)}</span>
                  <span className="mono">{s}</span>
                </li>
              ))}
            </ol>
          </>
        )}
        {b.family === 'special' && b.value != null && <p className="badge-sheet-when">{t('badges.magLat', { lat: num(b.value, 1) })}</p>}
        {b.family === 'reporter' && <p className="badge-sheet-note">{t('badges.confirmed')}</p>}
        {!tiered && !b.level && b.id === 'yearRound' && <p className="badge-sheet-when">{tn('badges.seasonsLeft', 4 - b.count)}</p>}
        <div className="badge-sheet-actions">
          {b.level > 0 && typeof navigator !== 'undefined' && 'share' in navigator && <button type="button" className="btn pill pill-primary sheet-pill" onClick={share}>{t('badges.share')}</button>}
          <button type="button" className="btn pill pill-ghost sheet-pill" onClick={onClose}>{t('common.done')}</button>
        </div>
      </div>
    </BottomSheet>
  );
}

/** A badge code from a tour or event: letters and numbers, with or without the dash. */
function RedeemSheet({ onClose, onRedeemed }: { onClose: () => void; onRedeemed: (slug: string) => void }) {
  const { t } = useI18n();
  const [v, setV] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const errors: Record<Exclude<RedeemStatus, 'ok'>, MessageKey> = {
    invalid: 'badges.redeem.invalid', expired: 'badges.redeem.expired', used: 'badges.redeem.used',
    have: 'badges.redeem.have', plan: 'badges.redeem.plan', limit: 'badges.redeem.limit', error: 'badges.redeem.failed',
  };
  const redeem = async () => {
    setBusy(true); setErr('');
    const r = await redeemBadgeCode(v);
    setBusy(false);
    if (r.status === 'ok' && r.slug) onRedeemed(r.slug);
    else setErr(t(errors[r.status === 'ok' ? 'error' : r.status]));
  };
  const ready = v.replace(/[^a-z0-9]/gi, '').length >= 6;
  return (
    <BottomSheet title={t('badges.redeem.title')} onClose={onClose}>
      <p className="you-sheet-text">{t('badges.redeem.text')}</p>
      <label className="field">
        <span className="label">{t('badges.redeem.label')}</span>
        <input className="input mono" value={v} maxLength={24} autoCapitalize="characters" autoCorrect="off" autoComplete="off" spellCheck={false}
          placeholder="XXXX-XXXX" onChange={e => setV(e.target.value.toUpperCase())} onKeyDown={e => { if (e.key === 'Enter' && ready && !busy) void redeem(); }} />
      </label>
      {err && <p className="you-sheet-text" role="alert" style={{ color: 'var(--red)' }}>{err}</p>}
      <button type="button" className="btn pill pill-primary sheet-pill" disabled={busy || !ready} onClick={redeem}>{t('badges.redeem.button')}</button>
    </BottomSheet>
  );
}

/** A gallery name as the database stores it: trimmed, with runs of spaces made one. */
const clean = (v: string) => v.trim().replace(/\s+/g, ' ');

/** The name shown with a member's photos in the gallery: any characters, 3 to 24 of them. */
export function HandleSheet({ current, onClose, onSaved }: { current: string; onClose: () => void; onSaved: (h: string) => void }) {
  const { t } = useI18n();
  const [v, setV] = useState(current);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true); setErr('');
    const r = await setHandle(v);
    setBusy(false);
    if (r === 'ok') onSaved(clean(v));
    else setErr(t(r === 'taken' ? 'handle.taken' : r === 'invalid' ? 'handle.invalid' : 'handle.failed'));
  };
  return (
    <BottomSheet title={t('handle.title')} onClose={onClose}>
      <p className="you-sheet-text">{t('handle.text')}</p>
      <label className="field">
        <span className="label">{t('handle.label')}</span>
        <input className="input" value={v} maxLength={24} autoCorrect="off" spellCheck={false} onChange={e => setV(e.target.value)} />
      </label>
      {err && <p className="you-sheet-text" role="alert" style={{ color: 'var(--red)' }}>{err}</p>}
      <button type="button" className="btn pill pill-primary sheet-pill" disabled={busy || clean(v) === current || clean(v).length < 3} onClick={save}>{t('common.save')}</button>
    </BottomSheet>
  );
}

/** The member's rank and a way into their badges, on the desktop Dashboard. */
export function RankStrip() {
  const { go } = useStore();
  const { user } = useAuth();
  const { t, num } = useI18n();
  const [m, setM] = useState<MemberInfo | null>(null);
  useEffect(() => { if (user) void myMember().then(setM); }, [user]);
  if (!m) return null;
  const r = rank(m.points);
  return (
    <button type="button" className="btn badges-strip" onClick={() => go('badges')}>
      <span className="mono">{t('badges.rank')}</span>
      <b className="hl">{t(`rank.${r.id}` as MessageKey)}</b>
      <span className="badges-bar-track" aria-hidden="true"><span style={{ width: `${Math.round(r.progress * 100)}%` }} /></span>
      <span>{t('badges.points', { n: num(m.points) })}</span>
      <span className="hl">{t('badges.view')}</span>
    </button>
  );
}
