'use client';

import type { ReactNode } from 'react';
import { C, TIERS } from '../data';
import { useStore } from '../store';
import { useI18n } from '../i18n/I18n';

/**
 * Stand-in for a feature the current plan doesn't include: a blurred preview behind a short
 * explanation and a link to the plans page.
 */
export function Locked({ tier, title, body, preview }: { tier: number; title: string; body: string; preview?: ReactNode }) {
  const { go } = useStore();
  const { t: tr } = useI18n();
  const t = TIERS[tier];
  return (
    <div style={{ position: 'relative', borderRadius: 16, border: '1px solid var(--line-2)', overflow: 'hidden', minHeight: 260 }}>
      {preview && (
        <div aria-hidden="true" inert style={{ filter: 'blur(7px)', opacity: .45, pointerEvents: 'none', userSelect: 'none' }}>{preview}</div>
      )}
      <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', padding: 20, background: 'radial-gradient(80% 90% at 50% 50%, rgba(0,0,0,.82), rgba(0,0,0,.55))' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, textAlign: 'center', maxWidth: 420 }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderRadius: 999, border: `1px solid ${t.accent}`, color: t.accent, fontSize: 12, fontWeight: 700, letterSpacing: '.04em' }}>
            <svg viewBox="0 0 24 24" width="13" height="13" aria-hidden="true"><path d="M7 11V8a5 5 0 0 1 10 0v3M5.5 11h13v9.5h-13z" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round" /></svg>
            {tr('locked.badge', { plan: tr(`tier.${t.id}`).toUpperCase() })}
          </span>
          <span style={{ fontWeight: 800, fontSize: 20 }}>{title}</span>
          <span style={{ fontSize: 14, color: C.soft, lineHeight: 1.45 }}>{body}</span>
          <button type="button" className="btn pill pill-primary" onClick={() => go('plans')} style={{ marginTop: 4, fontSize: 14, padding: '11px 20px' }}>{tr('common.seeMemberships')}</button>
        </div>
      </div>
    </div>
  );
}
