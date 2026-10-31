/** Line icons for the stat tiles (the icon on top of each tile), each in its own colour. */
const ICONS = {
  aurora: { d: 'M3 18c3-7 6-10 9-10s6 3 9 10M7 18c1.6-3.5 3.3-5.5 5-5.5s3.4 2 5 5.5', color: '#6CFF2B' },
  cloud: { d: 'M7 18h10a4 4 0 0 0 .6-7.96A6 6 0 0 0 6.1 11 3.5 3.5 0 0 0 7 18Z', color: '#5fb8ff' },
  moon: { d: 'M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5Z', color: '#e8d27a' },
  gauge: { d: 'M4 17a8 8 0 0 1 16 0M12 17l4-5', color: '#6CFF2B' },
  field: { d: 'M12 3v18M8 7l4-4 4 4M8 17l4 4 4-4', color: '#b06bdc' },
  wind: { d: 'M3 9h11a3 3 0 1 0-3-3M3 15h15a3 3 0 1 1-3 3M3 12h8', color: '#FF9A3C' },
  bolt: { d: 'M13 2 4 14h7l-1 8 9-12h-7l1-8Z', color: '#E6B800' },
  density: { d: 'M7 8h.01M12 8h.01M17 8h.01M7 12h.01M12 12h.01M17 12h.01M7 16h.01M12 16h.01M17 16h.01', color: '#5fb8ff', dots: true },
  sun: { d: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8ZM12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4', color: '#E6B800' },
  flare: { d: 'M12 2l2.5 6.5L21 9l-5 4.5L17.5 21 12 17l-5.5 4 1.5-7.5L3 9l6.5-.5Z', color: '#FF9A3C' },
  radiation: { d: 'M12 3a9 9 0 1 0 0 18 9 9 0 1 0 0-18ZM12 9a3 3 0 1 0 0 6 3 3 0 1 0 0-6Z', color: '#F06A6A' },
  spots: { d: 'M12 3a9 9 0 1 0 0 18 9 9 0 1 0 0-18ZM9 10h.01M14 14h.01M15 9h.01', color: '#C9D0CB' },
} as const;

export type StatIconName = keyof typeof ICONS;

export function StatIcon({ name, size = 30 }: { name: StatIconName; size?: number }) {
  const i = ICONS[name];
  return (
    <span className="stat-icon" style={{ color: i.color }} aria-hidden="true">
      <svg viewBox="0 0 24 24" width={size} height={size}>
        <path d={i.d} fill="none" stroke="currentColor" strokeWidth={'dots' in i ? 3 : 1.9} strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}
