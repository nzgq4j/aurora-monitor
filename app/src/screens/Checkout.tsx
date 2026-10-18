'use client';

import { useEffect, useState } from 'react';
import { FEATS } from '../data';
import { PAYMENTS, useAuth } from '../lib/auth';
import { Field } from '../components/Field';
import { useRouter } from 'next/navigation';
import { rememberCheckoutIntent, useStore } from '../store';
import { useI18n } from '../i18n/I18n';

export function Checkout() {
  const { s, pending, pendingIndex, go, confirm, live, signedIn } = useStore();
  const router = useRouter();
  const { t, money, date } = useI18n();
  const { profile } = useAuth();
  const [busy, setBusy] = useState(false);
  const [cancelled, setCancelled] = useState(false);
  // Back from Stripe without paying.
  useEffect(() => { setCancelled(new URLSearchParams(window.location.search).get('checkout') === 'cancelled'); }, []);
  // Card payments: one free trial per account (a trial already used means paying from today).
  const stripe = live && PAYMENTS;
  const trial = !stripe || !profile?.trialEndsAt;
  const trialEnd = date(Date.now() + 14 * 864e5, { month: 'short', day: 'numeric', year: 'numeric' });
  const cycle = s.annual ? t('plans.annual') : t('plans.monthly');
  const price = money(s.annual ? pending.y : pending.m);
  const name = t(`tier.${pending.id}`);
  const per = s.annual ? t('checkout.perYear') : t('checkout.perMonth');
  const feats = FEATS.filter(x => x[1] > 0 && x[1] <= pendingIndex).map(x => x[0]).slice(0, 6);

  return (
    <main data-screen-label="Checkout" style={{ maxWidth: 1080, margin: '0 auto', padding: '48px var(--gutter) 56px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(360px,100%),1fr))', gap: 40, alignItems: 'start' }}>
      <form style={{ display: 'flex', flexDirection: 'column', gap: 22 }} onSubmit={async e => { e.preventDefault(); setBusy(true); await confirm(); setBusy(false); }}>
        <button type="button" className="btn mono" onClick={() => go('plans')} style={{ fontSize: 12, color: 'var(--muted)', alignSelf: 'flex-start' }}>{t('checkout.back')}</button>
        <h1 className="display" style={{ fontSize: 'clamp(40px, 11vw, 60px)', lineHeight: .9, overflowWrap: 'anywhere' }}>{t('checkout.joinAs')}<br /><span className="hl">{name}</span></h1>
        {live ? (
          <>
            <p style={{ margin: 0, fontSize: 16, lineHeight: 1.5, color: 'var(--soft)' }}>
              {!stripe ? t('checkout.liveBody') : trial ? t('checkout.stripeTrial', { date: trialEnd }) : t('checkout.stripeNoTrial')}
            </p>
            {cancelled && <span role="status" style={{ fontSize: 14, color: 'var(--amber)' }}>{t('checkout.cancelled')}</span>}
            {signedIn
              ? <button type="submit" disabled={busy} className="btn pill pill-primary" style={{ fontSize: 16, padding: 16, opacity: busy ? .6 : 1 }}>
                  {busy ? t('common.oneMoment') : !stripe ? t('checkout.start') : trial ? t('checkout.startStripe') : t('checkout.subscribe')}
                </button>
              : <>
                  {/* Arriving here signed out usually means a new member, so start on account creation. */}
                  <button type="button" className="btn pill pill-primary" onClick={() => { rememberCheckoutIntent(pending.id, s.annual); router.push('/signin?mode=signup&next=/checkout'); }} style={{ fontSize: 16, padding: 16 }}>{t('checkout.createToStart')}</button>
                  <span style={{ fontSize: 14, color: 'var(--muted)', textAlign: 'center' }}>
                    {t('signin.haveAccount')} <button type="button" className="btn" onClick={() => { rememberCheckoutIntent(pending.id, s.annual); router.push('/signin?next=/checkout'); }} style={{ color: 'var(--green)', fontWeight: 700 }}>{t('nav.signIn')}</button>
                  </span>
                </>}
            <span style={{ fontSize: 13, color: 'var(--muted)', textAlign: 'center' }}>{stripe ? t('checkout.secure') : t('checkout.trialEnds', { date: trialEnd })}</span>
          </>
        ) : (
          <>
            {!s.signedIn && <Field label={t('field.email')} placeholder={t('field.emailPlaceholder')} type="email" autoComplete="email" />}
            <Field label={t('field.cardNumber')} placeholder="4242 4242 4242 4242" mono autoComplete="cc-number" />
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,minmax(0,1fr))', gap: 12 }}>
              <Field label={t('field.expiry')} placeholder={t('field.expiryPlaceholder')} mono autoComplete="cc-exp" />
              <Field label={t('field.cvc')} placeholder="123" mono autoComplete="cc-csc" />
              <Field label={t('field.zip')} placeholder="55401" mono autoComplete="postal-code" />
            </div>
            <button type="submit" className="btn pill pill-primary" style={{ fontSize: 16, padding: 16 }}>{t('checkout.start')}</button>
            <span style={{ fontSize: 13, color: 'var(--muted)', textAlign: 'center' }}>{t('checkout.demoNote', { date: trialEnd })}</span>
          </>
        )}
      </form>

      <aside style={{ display: 'flex', flexDirection: 'column', gap: 18, padding: 28, border: '1px solid var(--green)', borderRadius: 16, background: 'radial-gradient(140% 90% at 50% 120%,rgba(89,255,58,.22),rgba(0,0,0,0) 65%)' }}>
        <span className="eyebrow">{t('checkout.summary')}</span>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: '4px 16px' }}>
          <span className="display" style={{ fontSize: 'clamp(28px, 8vw, 36px)', overflowWrap: 'anywhere' }}>{name}</span>
          <span style={{ fontSize: 15, color: 'var(--soft)' }}>{cycle}</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {feats.map(feat => (
            <div key={feat} style={{ display: 'flex', gap: 10, fontSize: 15 }}><span style={{ color: 'var(--green)', fontWeight: 700 }}>+</span><span>{t(`feat.${feat}`)}</span></div>
          ))}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, borderTop: '1px solid var(--line-2)', paddingTop: 16, fontSize: 15 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: 'var(--muted)' }}>{t('checkout.cyclePrice', { cycle })}</span><span className="mono">{price}</span></div>
          {trial && <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: 'var(--muted)' }}>{t('checkout.freeTrial')}</span><span className="mono">{t('checkout.days14')}</span></div>}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', borderTop: '1px solid var(--line-2)', paddingTop: 12 }}>
            <span style={{ fontWeight: 700 }}>{t('checkout.dueToday')}</span>
            <span style={{ fontFamily: 'var(--f-display)', fontWeight: 900, fontSize: 32 }}>{trial ? money(0) : price}</span>
          </div>
          <span style={{ fontSize: 13, color: 'var(--muted)' }}>{stripe ? (trial ? t('checkout.thenStripe', { price, per, date: trialEnd }) : t('checkout.taxNote'))
            : live ? t('checkout.thenLive', { price, per }) : t('checkout.thenDemo', { price, per, date: trialEnd })}</span>
        </div>
      </aside>
    </main>
  );
}
