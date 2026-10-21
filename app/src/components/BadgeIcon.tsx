import { GLYPHS, TIER_COLORS, type Glyph, type Tier } from '../lib/badges';

/**
 * A badge: one shield shape for every badge, the tier setting the rim, face and aurora-band colours.
 * Storm badges carry a label (KP7, G4) in place of the glyph.
 */
export function BadgeIcon({ tier, glyph, label, size = 96, title }: { tier: Tier; glyph: Glyph; label?: string; size?: number; title?: string }) {
  const c = TIER_COLORS[tier];
  return (
    <svg width={size} height={Math.round(size * 1.1)} viewBox="0 0 120 132" role={title ? 'img' : undefined} aria-label={title} aria-hidden={title ? undefined : true} style={{ flex: 'none', display: 'block' }}>
      <path d="M60 4 L112 22 V66 C112 99 89 118 60 129 C31 118 8 99 8 66 V22 Z" fill={c.rim} />
      <path d="M60 11 L105 26.5 V66 C105 94.5 85 111.5 60 121.5 C35 111.5 15 94.5 15 66 V26.5 Z" fill={c.face} />
      <path d="M15 82 C38 64 64 98 105 70 V86 C70 110 40 80 15 100 Z" fill={c.band} opacity={tier === 'locked' ? 0.6 : 0.4} />
      <path d="M15 92 C44 80 66 104 105 84 V94 C76 112 44 92 15 108 Z" fill={c.band2} opacity={tier === 'locked' ? 0.6 : 0.4} />
      <g transform="translate(39 30) scale(1.75)" fill="none" stroke={c.ink} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" opacity={label ? 0.3 : 1}>
        <path d={GLYPHS[glyph]} />
      </g>
      {label && <text x="60" y="88" textAnchor="middle" fontFamily="Archivo, sans-serif" fontWeight={900} fontSize={label.length > 3 ? 17 : 20} fill={c.ink}>{label}</text>}
    </svg>
  );
}
