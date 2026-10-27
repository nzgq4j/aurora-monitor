import { useId } from 'react';
import { GLYPHS, TIER_METALS, type Glyph, type Tier } from '../lib/badges';

const SHIELD = 'M60 4 L112 22 V66 C112 99 89 118 60 129 C31 118 8 99 8 66 V22 Z';
const FACE = 'M60 11 L105 26.5 V66 C105 94.5 85 111.5 60 121.5 C35 111.5 15 94.5 15 66 V26.5 Z';
// The two aurora bands across the face, as enamel cells, and the metal wires along their upper edges.
const BAND1 = 'M0 82 C38 64 64 98 120 66 V140 H0 Z';
const BAND2 = 'M0 98 C44 84 66 108 120 84 V140 H0 Z';
const WIRE1 = 'M0 82 C38 64 64 98 120 66';
const WIRE2 = 'M0 98 C44 84 66 108 120 84';

/**
 * A badge: one shield for every badge, finished like an enamel pin. The rim and the raised wires and
 * glyph are the tier's metal (bronze, silver, gold, platinum, or iridescent for aurora and storm badges);
 * the face is coloured glass in three cells. Storm badges carry a label (KP7, G4) in place of the glyph.
 */
export function BadgeIcon({ tier, glyph, label, size = 96, title }: { tier: Tier; glyph: Glyph; label?: string; size?: number; title?: string }) {
  const m = TIER_METALS[tier];
  // Gradients and the clip are referenced by id, so each badge on the page needs its own.
  const id = `b${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const url = (name: string) => `url(#${id}-${name})`;
  const glass = (name: string, [light, dark]: [string, string]) => (
    <linearGradient id={`${id}-${name}`} x1="0" y1="0" x2="0.35" y2="1">
      <stop offset="0" stopColor={light} />
      <stop offset="1" stopColor={dark} />
    </linearGradient>
  );
  return (
    <svg width={size} height={Math.round(size * 1.1)} viewBox="0 0 120 132" role={title ? 'img' : undefined} aria-label={title} aria-hidden={title ? undefined : true} style={{ flex: 'none', display: 'block' }}>
      <defs>
        {/* Polished metal: bright and dark bands so it reads as curved, lit from the upper left. */}
        <linearGradient id={`${id}-metal`} x1="0" y1="0" x2="1" y2="1">
          {m.metal.map((c, i) => <stop key={i} offset={i / (m.metal.length - 1)} stopColor={c} />)}
        </linearGradient>
        <linearGradient id={`${id}-wire`} x1="0" y1="0" x2="1" y2="0">
          {m.metal.map((c, i) => <stop key={i} offset={i / (m.metal.length - 1)} stopColor={c} />)}
        </linearGradient>
        {glass('g0', m.glass[0])}
        {glass('g1', m.glass[1])}
        {glass('g2', m.glass[2])}
        {/* Light caught in the glass: a soft sheen across the upper left. */}
        <radialGradient id={`${id}-sheen`} cx="0.3" cy="0.12" r="0.75">
          <stop offset="0" stopColor="#fff" stopOpacity={tier === 'locked' ? 0.12 : 0.42} />
          <stop offset="0.55" stopColor="#fff" stopOpacity="0.05" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
        <clipPath id={`${id}-face`}><path d={FACE} /></clipPath>
      </defs>

      {/* Rim: metal, with a highlight along the edge and a dark groove where it meets the glass. */}
      <path d={SHIELD} fill={url('metal')} />
      <path d={SHIELD} fill="none" stroke="#fff" strokeOpacity={tier === 'locked' ? 0.12 : 0.5} strokeWidth={1.2} transform="translate(0 0.6)" />
      <path d={FACE} fill="none" stroke="#000" strokeOpacity={0.55} strokeWidth={3} />

      {/* Glass in three cells, divided by raised metal wires. */}
      <g clipPath={url('face')}>
        <rect width="120" height="132" fill={url('g0')} />
        <path d={BAND1} fill={url('g1')} />
        <path d={BAND2} fill={url('g2')} />
        <rect width="120" height="132" fill={url('sheen')} />
        <path d={WIRE1} fill="none" stroke="#000" strokeOpacity={0.45} strokeWidth={3.4} transform="translate(0 1)" />
        <path d={WIRE2} fill="none" stroke="#000" strokeOpacity={0.45} strokeWidth={3.4} transform="translate(0 1)" />
        <path d={WIRE1} fill="none" stroke={url('wire')} strokeWidth={2.4} />
        <path d={WIRE2} fill="none" stroke={url('wire')} strokeWidth={2.4} />
      </g>
      <path d={FACE} fill="none" stroke={url('metal')} strokeWidth={1.6} />

      {/* Raised metal glyph (or storm label), with a soft shadow on the glass. */}
      <g transform="translate(39 30) scale(1.75)" fill="none" strokeLinecap="round" strokeLinejoin="round" opacity={label ? 0.35 : 1}>
        <path d={GLYPHS[glyph]} stroke="#000" strokeOpacity={0.55} strokeWidth={2.6} transform="translate(0.35 0.55)" />
        <path d={GLYPHS[glyph]} stroke={url('metal')} strokeWidth={2} />
      </g>
      {label && (
        <g fontFamily="Archivo, Montserrat, sans-serif" fontWeight={900} fontSize={label.length > 3 ? 17 : 20} textAnchor="middle">
          <text x="60.6" y="89" fill="#000" fillOpacity={0.55}>{label}</text>
          <text x="60" y="88" fill={url('metal')}>{label}</text>
        </g>
      )}
    </svg>
  );
}
