'use client';

import { FEATS } from '../data';
import { Field } from '../components/Field';
import { useRouter } from 'next/navigation';
import { useStore } from '../store';

export function Checkout() {
  const { s, pending, pendingIndex, go, confirm, live, signedIn } = useStore();
  const router = useRouter();
  const trialEnd = new Date(Date.now() + 14 * 864e5).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const cycle = s.annual ? 'Annual' : 'Monthly';
  const price = '$' + (s.annual ? pending.y : pending.m);
  const feats = FEATS.filter(x => x[1] > 0 && x[1] <= pendingIndex).map(x => x[0]).slice(0, 6);

  return (
    <main data-screen-label="Checkout" style={{ maxWidth: 1080, margin: '0 auto', padding: '48px var(--gutter) 56px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(360px,100%),1fr))', gap: 40, alignItems: 'start' }}>
      <form style={{ display: 'flex', flexDirection: 'column', gap: 22 }} onSubmit={e => { e.preventDefault(); confirm(); }}>
        <button type="button" className="btn mono" onClick={() => go('plans')} style={{ fontSize: 12, color: 'var(--muted)', alignSelf: 'flex-start' }}>← BACK TO PLANS</button>
        <h1 className="display" style={{ fontSize: 'clamp(40px, 11vw, 60px)', lineHeight: .9, overflowWrap: 'anywhere' }}>Join as<br /><span className="hl">{pending.name}</span></h1>
        {live ? (
          <>
            <p style={{ margin: 0, fontSize: 16, lineHeight: 1.5, color: 'var(--soft)' }}>
              Your 14-day trial starts now and needs no card. Card payments aren’t switched on yet, so nothing is charged when it ends.
            </p>
            {signedIn
              ? <button type="submit" className="btn pill pill-primary" style={{ fontSize: 16, padding: 16 }}>Start 14-day free trial</button>
              : <button type="button" className="btn pill pill-primary" onClick={() => router.push('/signin?next=/checkout')} style={{ fontSize: 16, padding: 16 }}>Sign in or create an account to start</button>}
            <span style={{ fontSize: 13, color: 'var(--muted)', textAlign: 'center' }}>Trial ends {trialEnd}.</span>
          </>
        ) : (
          <>
            {!s.signedIn && <Field label="EMAIL" placeholder="you@example.com" type="email" autoComplete="email" />}
            <Field label="CARD NUMBER" placeholder="4242 4242 4242 4242" mono autoComplete="cc-number" />
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,minmax(0,1fr))', gap: 12 }}>
              <Field label="EXPIRY" placeholder="MM / YY" mono autoComplete="cc-exp" />
              <Field label="CVC" placeholder="123" mono autoComplete="cc-csc" />
              <Field label="ZIP" placeholder="55401" mono autoComplete="postal-code" />
            </div>
            <button type="submit" className="btn pill pill-primary" style={{ fontSize: 16, padding: 16 }}>Start 14-day free trial</button>
            <span style={{ fontSize: 13, color: 'var(--muted)', textAlign: 'center' }}>No charge today. Cancel any time before {trialEnd} and you won't be billed.</span>
          </>
        )}
      </form>

      <aside style={{ display: 'flex', flexDirection: 'column', gap: 18, padding: 28, border: '1px solid var(--green)', borderRadius: 16, background: 'radial-gradient(140% 90% at 50% 120%,rgba(89,255,58,.22),rgba(0,0,0,0) 65%)' }}>
        <span className="eyebrow">ORDER SUMMARY</span>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: '4px 16px' }}>
          <span className="display" style={{ fontSize: 'clamp(28px, 8vw, 36px)', overflowWrap: 'anywhere' }}>{pending.name}</span>
          <span style={{ fontSize: 15, color: 'var(--soft)' }}>{cycle}</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {feats.map(feat => (
            <div key={feat} style={{ display: 'flex', gap: 10, fontSize: 15 }}><span style={{ color: 'var(--green)', fontWeight: 700 }}>+</span><span>{feat}</span></div>
          ))}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, borderTop: '1px solid var(--line-2)', paddingTop: 16, fontSize: 15 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: 'var(--muted)' }}>{cycle} price</span><span className="mono">{price}</span></div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: 'var(--muted)' }}>Free trial</span><span className="mono">14 days</span></div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', borderTop: '1px solid var(--line-2)', paddingTop: 12 }}>
            <span style={{ fontWeight: 700 }}>Due today</span>
            <span style={{ fontFamily: 'var(--f-display)', fontWeight: 900, fontSize: 32 }}>$0.00</span>
          </div>
          <span style={{ fontSize: 13, color: 'var(--muted)' }}>{live ? `Then ${price} ${s.annual ? 'per year' : 'per month'} once card payments are switched on.` : `Then ${price} ${s.annual ? 'per year' : 'per month'} from ${trialEnd}.`}</span>
        </div>
      </aside>
    </main>
  );
}
