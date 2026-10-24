import { useId } from 'react';
import { GLYPHS, TIER_COLORS, type Glyph, type Tier } from '../lib/badges';

/**
 * A badge: one shield shape for every badge, the tier setting the rim, face and aurora-band colours.
 * Storm badges carry a label (KP7, G4) in place of the glyph.
 */
export function BadgeIcon({ tier, glyph, label, size = 96, title }: { tier: Tier; glyph: Glyph; label?: string; size?: number; title?: string }) {
  const c = TIER_COLORS[tier];
  // The aurora bands are clipped to the shield's face; each badge needs its own clip id on the page.
  const clip = `badge-face-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const FACE = 'M60 11 L105 26.5 V66 C105 94.5 85 111.5 60 121.5 C35 111.5 15 94.5 15 66 V26.5 Z';
  return (
    <svg width={size} height={Math.round(size * 1.1)} viewBox="0 0 120 132" role={title ? 'img' : undefined} aria-label={title} aria-hidden={title ? undefined : true} style={{ flex: 'none', display: 'block' }}>
      <path d="M60 4 L112 22 V66 C112 99 89 118 60 129 C31 118 8 99 8 66 V22 Z" fill={c.rim} />
      <defs><clipPath id={clip}><path d={FACE} /></clipPath></defs>
      <path d={FACE} fill={c.face} />
      <g clipPath={`url(#${clip})`}>
        <path d="M0 82 C38 64 64 98 120 66 V84 C70 110 40 80 0 100 Z" fill={c.band} opacity={tier === 'locked' ? 0.6 : 0.4} />
        <path d="M0 94 C44 80 66 104 120 80 V92 C76 112 44 92 0 110 Z" fill={c.band2} opacity={tier === 'locked' ? 0.6 : 0.4} />
      </g>
      <g transform="translate(39 30) scale(1.75)" fill="none" stroke={c.ink} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" opacity={label ? 0.3 : 1}>
        <path d={GLYPHS[glyph]} />
      </g>
      {label && <text x="60" y="88" textAnchor="middle" fontFamily="Archivo, Montserrat, sans-serif" fontWeight={900} fontSize={label.length > 3 ? 17 : 20} fill={c.ink}>{label}</text>}
    </svg>
  );
}
