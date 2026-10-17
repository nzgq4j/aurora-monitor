'use client';

import { C, COMPARE, FEATS, TIERS } from '../data';
import { displayPrice, useStore } from '../store';
import { useI18n } from '../i18n/I18n';

const COMPARE_COLS = `minmax(180px,1.4fr) repeat(${TIERS.length},minmax(0,1fr))`;
/** Annual saving on the paid plan versus paying monthly, e.g. 17%. */
const SAVING = Math.round((1 - TIERS[1].y / (TIERS[1].m * 12)) * 100);

/** Pricing page; `embedded` renders it as the Dashboard's Plans tab (no page wrapper or hero heading). */
export function Plans({ embedded = false }: { embedded?: boolean }) {
  const { s, set, planIndex, choose } = useStore();
  const { t, money } = useI18n();
  const Wrapper = embedded ? 'div' : 'main';
  const wrapperProps = embedded
    ? { 'data-screen-label': 'Dashboard · Plans', style: { display: 'flex', flexDirection: 'column' as const, gap: 28 } }
    : { 'data-screen-label': 'Plans', className: 'wrap', style: { padding: '48px var(--gutter) 56px', display: 'flex', flexDirection: 'column' as const, gap: 36 } };
  const seg = (on: boolean) => ({ padding: '9px 16px', borderRadius: 999, fontWeight: 700, fontSize: 14, background: on ? '#fff' : 'transparent', color: on ? '#000' : C.muted });

  return (
    <Wrapper {...wrapperProps}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 24, flexWrap: 'wrap' }}>
        {embedded ? (
          <h2 className="display" style={{ fontSize: 'clamp(28px, 7.5vw, 34px)', lineHeight: 1 }}>{t('plans.h2a')} <span className="hl">{t('plans.h2b')}</span></h2>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <span className="kicker">{t('plans.kicker')}</span>
            <h1 className="display" style={{ fontSize: 'var(--h-hero)', lineHeight: .88 }}>{t('plans.h1a')}<br /><span className="hl">{t('plans.h1b')}</span></h1>
          </div>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div role="group" aria-label={t('plans.cycle')} style={{ display: 'flex', padding: 4, border: '1px solid var(--line-2)', borderRadius: 999 }}>
            <button type="button" className="btn" aria-pressed={!s.annual} onClick={() => set({ annual: false })} style={seg(!s.annual)}>{t('plans.monthly')}</button>
            <button type="button" className="btn" aria-pressed={s.annual} onClick={() => set({ annual: true })} style={seg(s.annual)}>{t('plans.annual')}</button>
          </div>
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--green)' }}>{t('plans.save', { pct: SAVING })}</span>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(300px,100%),1fr))', gap: 16, maxWidth: 900 }}>
        {TIERS.map((tier, i) => {
          const cur = s.signedIn && i === planIndex;
          const hot = tier.id === 'chaser';
          const name = t(`tier.${tier.id}`);
          const lit = i ? 9 : 3;
          const cta = cur ? t('plans.current') : s.signedIn && i < planIndex ? t('plans.downgrade') : i === 0 ? t('plans.startFree') : t('plans.choose', { plan: name });
          return (
            <div key={tier.id} style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: 18, padding: '26px 24px', border: `1px solid ${hot ? C.green : C.line2}`, borderRadius: 16, background: hot ? 'radial-gradient(140% 70% at 50% 120%,rgba(89,255,58,.16),rgba(0,0,0,0) 70%)' : '#000' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', minHeight: 24 }}>
                <span style={{ fontFamily: 'var(--f-display)', fontWeight: 800, fontSize: 15, letterSpacing: '.05em', color: tier.accent }}>{name.toUpperCase()}</span>
                <span aria-hidden={!hot} style={{ fontSize: 11, fontWeight: 700, padding: '4px 9px', borderRadius: 999, background: 'var(--green)', color: '#000', opacity: hot ? 1 : 0 }}>{t('plans.trialBadge')}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                <span style={{ fontFamily: 'var(--f-display)', fontWeight: 900, fontStretch: '112%', fontSize: 60, lineHeight: .9 }}>{displayPrice(tier, s.annual, money)}</span>
                <span style={{ fontSize: 15, color: 'var(--muted)', fontWeight: 600 }}>{tier.m ? t('plans.perMonth') : ''}</span>
              </div>
              <span style={{ fontSize: 13, color: 'var(--muted)', minHeight: 18 }}>{tier.m ? (s.annual ? t('plans.billedYearly', { price: money(tier.y) }) : t('plans.billedMonthly')) : t('plans.freeForever')}</span>
              <span style={{ fontSize: 16, color: 'var(--soft)', minHeight: 44, textWrap: 'pretty' }}>{t(`tier.${tier.id}.blurb`)}</span>
              <svg viewBox="0 0 200 40" style={{ width: '100%', height: 40, display: 'block' }} aria-hidden="true">
                {[...Array(9)].map((_, j) => {
                  const h = 8 + j * 3.5;
                  return <rect key={j} x={j * 22.5} y={40 - h} width="18" height={h} rx="2" style={{ fill: j < lit ? tier.accent : C.line }} />;
                })}
              </svg>
              <button type="button" className="btn" onClick={() => choose(i)} disabled={cur}
                style={{ cursor: cur ? 'default' : 'pointer', textAlign: 'center', padding: 13, borderRadius: 999, fontWeight: 700, fontSize: 15, background: cur ? 'transparent' : hot ? C.green : '#fff', color: cur ? C.muted : '#000', border: `1px solid ${cur ? C.line2 : 'transparent'}` }}>
                {cta}
              </button>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, borderTop: '1px solid var(--line)', paddingTop: 16 }}>
                <span style={{ fontSize: 13, color: 'var(--muted)', fontWeight: 600 }}>{i ? t('plans.everythingIn', { plan: t(`tier.${TIERS[i - 1].id}`) }) : t('plans.includes')}</span>
                {FEATS.filter(x => x[1] === i).map(([feat]) => (
                  <div key={feat} style={{ display: 'flex', gap: 10, fontSize: 15, lineHeight: 1.35 }}>
                    <span style={{ color: tier.accent, fontWeight: 700 }}>+</span><span>{t(`feat.${feat}`)}</span>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <div className="rule-top hscroll">
      <div style={{ display: 'flex', flexDirection: 'column', minWidth: 420, maxWidth: 900 }}>
        <div style={{ display: 'grid', gridTemplateColumns: COMPARE_COLS, gap: 12, padding: '20px 0 14px', borderBottom: '1px solid var(--line-2)' }}>
          <span className="display" style={{ fontSize: 28 }}>{t('cmp.title')}</span>
          {TIERS.map(tier => <span key={tier.id} style={{ fontFamily: 'var(--f-display)', fontWeight: 800, fontSize: 15, color: tier.accent, alignSelf: 'end' }}>{t(`tier.${tier.id}`)}</span>)}
        </div>
        {COMPARE.map(row => (
          <div key={row} style={{ display: 'grid', gridTemplateColumns: COMPARE_COLS, gap: 12, padding: '14px 0', borderBottom: '1px solid var(--line)', fontSize: 15 }}>
            <span style={{ color: 'var(--soft)' }}>{t(`cmp.${row}`)}</span>
            {TIERS.map((tier, i) => {
              const v = t(`cmp.${row}.${tier.id}`);
              return <span key={tier.id} style={{ fontWeight: 600, color: v === '—' ? C.dash : i === planIndex && s.signedIn ? C.green : '#fff' }}>{v}</span>;
            })}
          </div>
        ))}
      </div>
      </div>
    </Wrapper>
  );
}
