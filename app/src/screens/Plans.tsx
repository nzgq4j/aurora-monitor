'use client';

import { useState } from 'react';
import { C, COMPARE, TIERS, TRIAL_DAYS } from '../data';
import { useStore } from '../store';
import { useAuth } from '../lib/auth';
import { useI18n } from '../i18n/I18n';

/** Annual saving on the paid plan versus paying monthly, e.g. 17%. */
const SAVING = Math.round((1 - TIERS[1].y / (TIERS[1].m * 12)) * 100);

/** Icons for the comparison rows (24 px, stroked). */
const ROW_ICON: Record<(typeof COMPARE)[number], string> = {
  locations: 'M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21Zm0-9a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z',
  channels: 'M6 16v-5a6 6 0 1 1 12 0v5l2 2H4l2-2Zm4 4h4',
  speed: 'M13 2 4 14h7l-1 8 9-12h-7l1-8Z',
  range: 'M4 6h16v14H4zM4 10h16M8 3v4M16 3v4',
  detail: 'M5 20v-8M10 20V6M15 20v-9M20 20V9',
  solar: 'M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10ZM12 1v3M12 20v3M1 12h3M20 12h3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1',
  cloud: 'M7 18h10a4 4 0 0 0 .5-8 6 6 0 0 0-11.5 1.5A3.3 3.3 0 0 0 7 18Z',
  substorm: 'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3Z',
  history: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm0 4v5l3 2',
};

const Check = ({ on }: { on: boolean }) => (
  <svg viewBox="0 0 24 24" width="26" height="26" role="img" aria-label="✓">
    <circle cx="12" cy="12" r="11" fill={on ? C.green : '#1d3a22'} />
    <path d="m7 12.5 3.2 3.2L17 9" fill="none" stroke={on ? '#000' : '#4f8f50'} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

/**
 * Pricing page: what each plan includes, the plans as a choice (paid plan first and recommended), the
 * billing cycle, and one button for the chosen plan. `embedded` renders it as the Dashboard's Plans tab
 * (no page wrapper or hero heading).
 */
export function Plans({ embedded = false }: { embedded?: boolean }) {
  const { s, set, planIndex, choose } = useStore();
  const { profile } = useAuth();
  const { t, money } = useI18n();
  // Signed in on a paid plan: that plan; otherwise the paid plan is offered first.
  const [sel, setSel] = useState(() => (s.signedIn && planIndex > 0 ? planIndex : TIERS.length - 1));
  const order = TIERS.map((_, i) => i).reverse();
  const current = (i: number) => s.signedIn && i === planIndex;
  const trial = !profile?.trialEndsAt && !(s.signedIn && planIndex > 0);

  const tier = TIERS[sel], name = t(`tier.${tier.id}`);
  const cta = current(sel) ? t('plans.current')
    : sel === 0 ? (s.signedIn && planIndex > 0 ? t('plans.downgrade') : t('plans.startFree'))
    : trial ? t('plans.ctaTrial', { days: TRIAL_DAYS }) : t('plans.choose', { plan: name });
  const foot = sel === 0 ? t('plans.footFree') : trial ? t('plans.footTrial') : t('plans.footCancel');

  const Wrapper = embedded ? 'div' : 'main';
  const wrapperProps = embedded
    ? { 'data-screen-label': 'Dashboard · Plans', className: 'plans' }
    : { 'data-screen-label': 'Plans', className: 'wrap plans plans-page' };

  return (
    <Wrapper {...wrapperProps}>
      {embedded ? (
        <h2 className="display" style={{ fontSize: 'clamp(28px, 7.5vw, 34px)', lineHeight: 1 }}>{t('plans.h2a')} <span className="hl">{t('plans.h2b')}</span></h2>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <span className="kicker">{t('plans.kicker')}</span>
          <h1 className="display" style={{ fontSize: 'var(--h-hero)', lineHeight: .88 }}>{t('plans.h1a')}<br /><span className="hl">{t('plans.h1b')}</span></h1>
        </div>
      )}

      <div className="plans-col">
        <table className="plans-table">
          <thead>
            <tr>
              <th scope="col">{t('plans.included')}</th>
              {order.map(i => <th key={i} scope="col" style={{ color: i === sel ? '#fff' : C.muted }}>{t(`tier.${TIERS[i].id}`)}</th>)}
            </tr>
          </thead>
          <tbody>
            {COMPARE.map(row => (
              <tr key={row}>
                <th scope="row"><span className="plans-row">
                  <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d={ROW_ICON[row]} fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>
                  {t(`cmp.${row}`)}
                </span></th>
                {order.map(i => {
                  const v = t(`cmp.${row}.${TIERS[i].id}`), on = i === sel;
                  return (
                    <td key={i} className={on ? 'on' : undefined}>
                      {v === '✓' ? <Check on={on} /> : v === '—' ? <span className="plans-dash" aria-label="—">–</span> : v}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>

        <div role="radiogroup" aria-label={t('plans.pick')} className="plans-options">
          {order.map(i => {
            const tr = TIERS[i], on = i === sel, paid = tr.m > 0;
            return (
              <button key={tr.id} type="button" role="radio" aria-checked={on} className={`btn plans-option${on ? ' on' : ''}`} onClick={() => setSel(i)}>
                <span className="plans-option-text">
                  <span className="plans-option-name">
                    {t(`tier.${tr.id}`)}
                    {paid && s.annual && <span className="plans-badge">{t('plans.saveBadge', { pct: SAVING })}</span>}
                    {current(i) && <span className="plans-badge plans-badge-dim">{t('plans.current')}</span>}
                  </span>
                  <span className="plans-option-blurb">{t(`tier.${tr.id}.blurb`)}</span>
                  <span className="plans-option-price">
                    {!paid ? <><b>{money(0)}</b> {t('plans.freeForever')}</> : s.annual ? (
                      <><b>{money(tr.y)}</b> {t('plans.perYear')} <span className="plans-permonth">({money(+(tr.y / 12).toFixed(2))} {t('plans.perMonth')})</span></>
                    ) : <><b>{money(tr.m)}</b> {t('plans.perMonth')}</>}
                  </span>
                </span>
                <span className="plans-option-side">
                  {paid && <span className="plans-reco">{t('plans.recommended')}</span>}
                  <span className="plans-radio" aria-hidden="true" />
                </span>
              </button>
            );
          })}
        </div>

        <div role="group" aria-label={t('plans.cycle')} className="plans-cycle">
          <button type="button" className="btn" aria-pressed={!s.annual} onClick={() => set({ annual: false })}>{t('plans.monthly')}</button>
          <button type="button" className="btn" aria-pressed={s.annual} onClick={() => set({ annual: true })}>{t('plans.annual')} <span className="plans-cycle-save">−{SAVING}%</span></button>
        </div>

        <button type="button" className="btn plans-cta" onClick={() => choose(sel)} disabled={current(sel)}>{cta}</button>
        <p className="plans-foot">{foot}</p>
      </div>
    </Wrapper>
  );
}
