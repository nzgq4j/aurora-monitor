'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { C, CHANNEL_DEFS, KP_NAME, TIERS, TRIGGER_DEFS, f, kpColor } from '../data';
import { G_SCALE, kpNeeded } from '../lib/astro';
import type { AccountData } from '../lib/history';
import { searchPlaces, useLocations, type PlaceResult, type SavedLocation } from '../lib/locations';
import { useConditions } from '../lib/useConditions';
import { useStore, type Tab } from '../store';

const TABS: [Tab, string][] = [['overview', 'Overview'], ['alerts', 'Alerts'], ['locations', 'Locations'], ['billing', 'Billing']];

export function Account({ data }: { data: AccountData }) {
  const { s, set, signOut } = useStore();
  return (
    <main data-screen-label="Account" className="wrap account">
      <aside className="account-aside">
        <div className="account-profile">
          <span className="avatar" style={{ width: 44, height: 44 }}>SR</span>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontWeight: 700 }}>Sam Rivera</span>
            <span style={{ fontSize: 13, color: 'var(--muted)' }}>sam@example.com</span>
          </div>
        </div>
        <nav role="tablist" className="account-tabs">
          {TABS.map(([id, label]) => {
            const on = s.tab === id;
            return (
              <button key={id} type="button" role="tab" aria-selected={on} className="btn" onClick={() => set({ tab: id })}
                style={{ padding: '11px 14px', borderRadius: 10, fontWeight: 600, fontSize: 15, whiteSpace: 'nowrap', background: on ? C.line : 'transparent', color: on ? '#fff' : C.muted }}>
                {label}
              </button>
            );
          })}
        </nav>
        <button type="button" className="btn account-signout" onClick={signOut}>
          Sign out
        </button>
      </aside>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 28, minWidth: 0 }}>
        {s.tab === 'overview' && <Overview data={data} />}
        {s.tab === 'alerts' && <Alerts data={data} />}
        {s.tab === 'locations' && <Locations />}
        {s.tab === 'billing' && <Billing />}
      </div>
    </main>
  );
}

function usePlanLine() {
  const { s, plan, planIndex } = useStore();
  return planIndex === 0
    ? 'Free forever · 1 location · daily digest'
    : `${s.annual ? '$' + plan.y + ' / year' : '$' + plan.m + ' / month'} · trial ends Oct 30, 2026`;
}

const h2 = { fontSize: 'clamp(28px, 7.5vw, 34px)', lineHeight: 1 };
const h1 = { fontSize: 'clamp(40px, 11vw, 56px)', lineHeight: .9 };

const DAY = 864e5;
const shortDate = (t: number) => new Date(t).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
const weekday = (t: number) => new Date(t).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });

/** Home location (loaded on demand) and the Kp it needs, defaulting to Kp 5 when none is saved. */
function useHome() {
  const { locations, load } = useLocations();
  useEffect(() => { load(); }, [load]);
  const home = locations.find(l => l.isHome) ?? null;
  return { home, need: home ? kpNeeded(home.lat, home.lon) : 5, count: locations.length };
}

function Overview({ data }: { data: AccountData }) {
  const { set, plan, planIndex, go } = useStore();
  const planLine = usePlanLine();
  const { home, need, count } = useHome();
  const days = data.days;
  const strongest = days.reduce<typeof days[number] | null>((m, d) => (!m || d.kpMax > m.kpMax ? d : m), null);
  const nights = days.filter(d => d.kpMax >= need).length;
  const kp = data.kp?.kp ?? null;
  const stats = [
    { label: 'KP NOW', value: kp === null ? '—' : `Kp ${kp.toFixed(1)}`, note: kp === null ? 'Unavailable' : G_SCALE(kp) ? `G${G_SCALE(kp)} storm` : KP_NAME[Math.max(2, Math.min(9, Math.round(kp)))], c: kp !== null && kp >= 5 ? C.red : C.soft },
    { label: `DAYS KP ≥ ${need}`, value: days.length ? String(nights) : '—', note: `Last ${days.length || 90} days`, c: C.green },
    { label: 'STRONGEST', value: strongest ? `Kp ${strongest.kpMax.toFixed(1)}` : '—', note: strongest ? `${shortDate(strongest.t)}${G_SCALE(strongest.kpMax) ? ` · G${G_SCALE(strongest.kpMax)}` : ''}` : 'No data', c: C.red },
    { label: 'SAVED SKIES', value: String(count), note: home ? `Home: ${home.name}` : 'No home set', c: C.soft },
  ];

  // Twelve 7-day buckets ending today.
  const end = Math.floor(data.fetchedAt / DAY) * DAY + DAY;
  const weeks = [...Array(12)].map((_, i) => {
    const from = end - (12 - i) * 7 * DAY;
    const inWeek = days.filter(d => d.t >= from && d.t < from + 7 * DAY);
    return { from, kp: inWeek.length ? Math.max(...inWeek.map(d => d.kpMax)) : null };
  });
  const w = 860 / 12;
  const visY = 210 - need * 20;

  return (
    <div data-screen-label="Account · Overview" style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(340px,100%),1fr))', gap: 20 }}>
        <div style={{ position: 'relative', overflow: 'hidden', display: 'flex', flexDirection: 'column', gap: 14, padding: 'clamp(20px, 5vw, 28px)', border: `1px solid ${plan.accent}`, borderRadius: 18, background: 'var(--panel)' }}>
          <div aria-hidden="true" style={{ position: 'absolute', right: -90, bottom: -150, width: 340, height: 340, borderRadius: '50%', border: `38px solid ${plan.accent}`, opacity: .45, filter: 'blur(30px)' }} />
          <span className="mono" style={{ position: 'relative', fontSize: 12, letterSpacing: '.08em', color: 'var(--muted)' }}>MEMBERSHIP</span>
          <span className="display" style={{ position: 'relative', fontSize: 'clamp(34px,4.2vw,60px)', lineHeight: .9, overflowWrap: 'anywhere', color: plan.accent }}>{plan.name}</span>
          <span style={{ position: 'relative', fontSize: 16, color: 'var(--soft)' }}>{planLine}</span>
          <div style={{ position: 'relative', display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 6 }}>
            <button type="button" className="btn pill pill-primary" onClick={() => go('plans')} style={{ fontSize: 14, padding: '11px 18px' }}>{planIndex === 3 ? 'Change plan' : 'Upgrade'}</button>
            <button type="button" className="btn pill pill-ghost" onClick={() => set({ tab: 'billing' })} style={{ fontSize: 14, padding: '11px 18px', background: '#000' }}>Billing</button>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1, background: 'var(--line)', border: '1px solid var(--line)', borderRadius: 18, overflow: 'hidden' }}>
          {stats.map(st => (
            <div key={st.label} style={{ background: '#000', padding: 18, display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
              <span className="label">{st.label}</span>
              <span className="stat-value" style={{ fontSize: 30, whiteSpace: 'nowrap' }}>{st.value}</span>
              <span style={{ fontSize: 13, fontWeight: 600, color: st.c, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{st.note}</span>
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: 12 }}>
          <h2 className="display" style={h2}>Your <span className="hl">season</span></h2>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 16px', fontSize: 13, color: 'var(--soft)' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ width: 11, height: 11, background: C.darkGreen }} />Weekly max Kp · GFZ Potsdam</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ width: 16, borderTop: `2px dashed ${C.amber}` }} />{home ? `Visible from ${home.name}` : 'Typical mid-latitude view'} (≈ Kp {need})</span>
          </div>
        </div>
        <div className="hscroll"><svg viewBox="0 0 900 240" style={{ width: '100%', minWidth: 560, display: 'block' }} role="img" aria-label="Weekly maximum Kp over the last 12 weeks">
          {[0, 3, 6, 9].map(k => (
            <g key={k}>
              <line x1="30" x2="890" y1={210 - k * 20} y2={210 - k * 20} style={{ stroke: '#fff', strokeOpacity: .07 }} />
              <text x="20" y={214 - k * 20} style={{ fill: C.muted, font: "10px 'JetBrains Mono'", textAnchor: 'end' }}>{k}</text>
            </g>
          ))}
          <line x1="30" x2="890" y1={visY} y2={visY} style={{ stroke: C.amber, strokeWidth: 1.5, strokeDasharray: '6 4' }} />
          {weeks.map((wk, i) => {
            const x = 30 + i * w;
            return (
              <g key={wk.from}>
                {wk.kp !== null && <rect x={f(x + 10)} y={f(210 - wk.kp * 20)} width={f(w - 20)} height={f(wk.kp * 20)} style={{ fill: kpColor(wk.kp) }}><title>{`Week of ${shortDate(wk.from)}: max Kp ${wk.kp.toFixed(2)}`}</title></rect>}
                <text x={f(x + w / 2)} y="230" style={{ fill: C.soft, font: "600 11px 'Barlow'", textAnchor: 'middle' }}>{shortDate(wk.from)}</text>
              </g>
            );
          })}
          <line x1="30" x2="890" y1="210" y2="210" style={{ stroke: C.muted }} />
          {days.length === 0 && <text x="460" y="120" style={{ fill: C.muted, font: "600 14px 'Barlow'", textAnchor: 'middle' }}>Kp history unavailable</text>}
        </svg></div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: 12, marginBottom: 8 }}>
          <h2 className="display" style={h2}>Best nights <span className="hl">ahead</span></h2>
          <span style={{ fontSize: 13, color: 'var(--muted)' }}>Largest predicted Kp · NOAA 27-day outlook</span>
        </div>
        {(() => {
          const best = [...data.outlook].sort((a, b) => b.kp - a.kp || a.t - b.t).slice(0, 5).sort((a, b) => a.t - b.t);
          if (!best.length) return <span style={{ fontSize: 15, color: 'var(--muted)', padding: '12px 0' }}>The 27-day outlook is unavailable right now.</span>;
          return best.map(u => {
            const c = u.kp >= need ? C.green : u.kp >= need - 1 ? C.darkGreen : C.amber;
            return (
              <div key={u.t} className="night">
                <span style={{ fontWeight: 700, fontSize: 16 }}>{weekday(u.t)}</span>
                <span style={{ fontFamily: 'var(--f-display)', fontWeight: 900, fontSize: 20, color: c }}>Kp {u.kp}</span>
                <div className="night-bar" style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  <div style={{ height: 10, background: '#121512', borderRadius: 2 }}>
                    <div style={{ height: 10, width: `${(u.kp / 9) * 100}%`, background: c, borderRadius: 2, boxShadow: `0 0 12px ${c}` }} />
                  </div>
                  <span style={{ fontSize: 13, color: 'var(--muted)' }}>{u.kp >= need ? `Reaches your ≈ Kp ${need} threshold` : 'Below your threshold'} · 10.7 cm flux {u.flux}</span>
                </div>
                <span className="mono" style={{ fontSize: 14, textAlign: 'right' }}>Ap {u.ap}</span>
              </div>
            );
          });
        })()}
      </div>
    </div>
  );
}

interface ToggleProps { label: string; sub: string; on: boolean; need: number; locked: boolean; onClick: () => void }

/** Settings row with a switch. Rows above the user's plan are dimmed, labelled with the required tier, and link to Plans. */
function ToggleRow({ label, sub, on, need, locked, onClick }: ToggleProps) {
  const active = on && !locked;
  return (
    <button type="button" className="btn toggle-row" onClick={onClick} style={{ opacity: locked ? .55 : 1 }}
      role={locked ? undefined : 'switch'} aria-checked={locked ? undefined : active}
      aria-label={locked ? `${label}: requires ${TIERS[need].name}. View plans.` : undefined}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span style={{ fontWeight: 700, fontSize: 16 }}>{label}</span>
        <span style={{ fontSize: 13, color: 'var(--muted)' }}>{sub}</span>
      </div>
      <span style={{ fontSize: 11, fontWeight: 700, color: TIERS[need].accent, whiteSpace: 'nowrap' }}>{locked ? TIERS[need].name.toUpperCase() : ''}</span>
      <span className={'switch' + (active ? ' on' : '')}><span className="switch-knob" /></span>
    </button>
  );
}

function Alerts({ data }: { data: AccountData }) {
  const { s, set, planIndex, go } = useStore();
  const { home, need } = useHome();
  const kp = s.kpThreshold;
  const last30 = data.days.slice(-30);
  const hits = last30.filter(d => d.kpMax >= kp).length;
  const thY = f(170 - kp * 17);
  const where = !home ? `Add a location to see what Kp ${kp} means for your sky.`
    : kp >= need + 2 ? `At Kp ${kp}, aurora is likely overhead or high in the sky from ${home.name}.`
    : kp >= need ? `At Kp ${kp}, aurora should be visible low on the poleward horizon from ${home.name}.`
    : `At Kp ${kp}, aurora is unlikely to be visible from ${home.name} (≈ Kp ${need} needed).`;
  const bw = 450 / Math.max(30, last30.length);
  return (
    <div data-screen-label="Account · Alerts" style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
      <h1 className="display" style={h1}>Alert <span className="hl">rules</span></h1>
      <div className="alert-rule">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <label htmlFor="kp-threshold" className="eyebrow">ALERT ME WHEN KP REACHES</label>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
            <span style={{ fontFamily: 'var(--f-display)', fontWeight: 900, fontStretch: '112%', fontSize: 96, lineHeight: .85 }}>{kp}</span>
            <span style={{ fontFamily: 'var(--f-display)', fontWeight: 800, fontSize: 22, color: kp >= 5 ? C.red : kp === 4 ? C.amber : C.darkGreen }}>{KP_NAME[kp]}</span>
          </div>
          <input id="kp-threshold" type="range" min={2} max={9} step={1} value={kp} onChange={e => set({ kpThreshold: +e.target.value })} style={{ width: '100%' }} />
          <span style={{ fontSize: 15, color: 'var(--soft)', textWrap: 'pretty' }}>{where}</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
            <span style={{ fontSize: 14, color: 'var(--muted)' }}>Last 30 days · daily max Kp (GFZ)</span>
            <span style={{ fontFamily: 'var(--f-display)', fontWeight: 900, fontSize: 22, whiteSpace: 'nowrap' }}><span className="hl">{hits}</span> {hits === 1 ? 'alert' : 'alerts'}</span>
          </div>
          <svg viewBox="0 0 450 190" style={{ width: '100%', display: 'block' }} role="img" aria-label={`${hits} of the last ${last30.length} days reached Kp ${kp}`}>
            <line x1="0" x2="450" y1={thY} y2={thY} style={{ stroke: C.green, strokeWidth: 1.5, strokeDasharray: '5 4' }} />
            {last30.map((d, i) => (
              <rect key={d.t} x={f(i * bw)} y={f(170 - d.kpMax * 17)} width={f(bw - 4)} height={f(d.kpMax * 17)} style={{ fill: d.kpMax >= kp ? C.green : C.line2 }}>
                <title>{`${shortDate(d.t)}: max Kp ${d.kpMax.toFixed(2)}`}</title>
              </rect>
            ))}
            <line x1="0" x2="450" y1="170" y2="170" style={{ stroke: C.muted }} />
            {last30.length > 0 && <text x="0" y="186" style={{ fill: C.muted, font: "10px 'JetBrains Mono'" }}>{shortDate(last30[0].t).toUpperCase()}</text>}
            <text x="450" y="186" style={{ fill: C.muted, font: "10px 'JetBrains Mono'", textAnchor: 'end' }}>TODAY</text>
            {last30.length === 0 && <text x="225" y="90" style={{ fill: C.muted, font: "600 13px 'Barlow'", textAnchor: 'middle' }}>Kp history unavailable</text>}
          </svg>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(300px,100%),1fr))', gap: 20 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span className="eyebrow" style={{ marginBottom: 8 }}>TRIGGERS</span>
          {TRIGGER_DEFS.map(([k, label, sub, need]) => {
            const locked = planIndex < need;
            return <ToggleRow key={k} label={label} sub={sub} need={need} locked={locked} on={s.triggers[k]}
              onClick={locked ? () => go('plans') : () => set(st => ({ triggers: { ...st.triggers, [k]: !st.triggers[k] } }))} />;
          })}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span className="eyebrow" style={{ marginBottom: 8 }}>DELIVER VIA</span>
          {CHANNEL_DEFS.map(([k, label, sub, need]) => {
            const locked = planIndex < need;
            return <ToggleRow key={k} label={label} sub={sub} need={need} locked={locked} on={s.channels[k]}
              onClick={locked ? () => go('plans') : () => set(st => ({ channels: { ...st.channels, [k]: !st.channels[k] } }))} />;
          })}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: '14px 0' }}>
            <span style={{ fontWeight: 700, fontSize: 16 }}>Quiet hours</span>
            <span style={{ fontSize: 13, color: 'var(--muted)' }}>Alerts pause automatically while it's daylight at your location.</span>
          </div>
        </div>
      </div>
    </div>
  );
}

const hhmmUT = (t: number) => `${new Date(t).toISOString().slice(11, 16)} UT`;
const coords = (l: { lat: number; lon: number }) => `${Math.abs(l.lat).toFixed(2)}°${l.lat >= 0 ? 'N' : 'S'} ${Math.abs(l.lon).toFixed(2)}°${l.lon >= 0 ? 'E' : 'W'}`;

function LocationCard({ loc, paused, index }: { loc: SavedLocation; paused: boolean; index: number }) {
  const { setHome, remove } = useLocations();
  const { data: cond, loading } = useConditions(loc.lat, loc.lon);
  const aur = cond?.aurora?.nearby ?? null;
  const tag = paused ? 'PAUSED' : loc.isHome ? 'HOME' : loc.source === 'device' ? 'DEVICE' : 'SAVED';
  const tagC = paused ? C.muted : loc.isHome ? C.green : loc.source === 'device' ? '#9CFF6E' : C.soft;
  const ac = aur === null ? C.soft : aur >= 30 ? C.green : aur >= 10 ? C.amber : C.soft;
  const mono10 = { fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--muted)' };
  const big = { fontFamily: 'var(--f-display)', fontWeight: 900, fontSize: 24 };
  const glow = aur ?? 0;
  const sun = cond?.sun;
  const darkLine = !sun ? (loading ? 'Checking sky…' : 'Conditions unavailable')
    : sun.dark ? `Dark now${sun.changesAt ? ` · until ${hhmmUT(sun.changesAt)}` : ''}`
    : sun.changesAt ? `Dark from ${hhmmUT(sun.changesAt)}` : 'No darkness (midnight sun)';
  const linkBtn = { fontSize: 13, fontWeight: 700, color: 'var(--muted)' };
  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: 20, opacity: paused ? .45 : 1 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
          <span style={{ fontWeight: 700, fontSize: 18, overflowWrap: 'anywhere' }}>{loc.name}</span>
          <span className="label">{coords(loc)}</span>
        </div>
        <span style={{ flex: 'none', fontSize: 11, fontWeight: 700, padding: '4px 8px', borderRadius: 999, border: `1px solid ${tagC}`, color: tagC }}>{tag}</span>
      </div>
      <svg viewBox="0 0 240 90" style={{ width: '100%', display: 'block', borderRadius: 10, background: '#050806' }} aria-hidden="true">
        <defs><filter id={`lb${index}`} x="-30%" y="-80%" width="160%" height="260%"><feGaussianBlur stdDeviation="9" /></filter></defs>
        <ellipse cx="120" cy="72" rx="110" ry={f(8 + glow * .45)} style={{ fill: '#59FF3A', opacity: f(Math.min(.9, .08 + glow / 70)), filter: `url(#lb${index})` }} />
        <line x1="0" x2="240" y1="72" y2="72" style={{ stroke: '#fff' }} />
        <rect x="0" y="72" width="240" height="18" style={{ fill: '#000' }} />
        <text x="120" y="86" style={{ fill: C.muted, font: "700 10px 'Barlow'", textAnchor: 'middle' }}>{loc.lat >= 0 ? 'N' : 'S'}</text>
      </svg>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
        <div style={{ display: 'flex', flexDirection: 'column' }}><span style={mono10}>AURORA</span><span style={{ ...big, color: ac }}>{aur === null ? '—' : `${aur}%`}</span></div>
        <div style={{ display: 'flex', flexDirection: 'column' }}><span style={mono10}>CLOUD</span><span style={big}>{cond?.cloud ? `${cond.cloud.now}%` : '—'}</span></div>
        <div style={{ display: 'flex', flexDirection: 'column' }}><span style={mono10}>NEEDS</span><span style={big}>Kp {cond?.kpNeeded ?? kpNeeded(loc.lat, loc.lon)}</span></div>
      </div>
      <span style={{ fontSize: 13, color: sun?.dark ? C.green : 'var(--muted)', fontWeight: 600 }}>{darkLine}</span>
      <div style={{ display: 'flex', gap: 16, borderTop: '1px solid var(--line)', paddingTop: 10 }}>
        {!loc.isHome && <button type="button" className="btn" style={linkBtn} onClick={() => setHome(loc.id)}>Make home</button>}
        <button type="button" className="btn" style={{ ...linkBtn, color: C.red }} onClick={() => remove(loc.id)}>Remove</button>
      </div>
    </div>
  );
}

function AddLocation({ disabled }: { disabled: boolean }) {
  const { plan, go } = useStore();
  const { add, detectDevice, detecting } = useLocations();
  const [q, setQ] = useState('');
  const [results, setResults] = useState<PlaceResult[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  if (disabled) {
    return (
      <button type="button" className="btn" onClick={() => go('plans')}
        style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 240, padding: 20, border: '1px dashed var(--line-3)', borderRadius: 16, textAlign: 'center' }}>
        <span style={{ fontFamily: 'var(--f-display)', fontWeight: 900, fontSize: 40, color: 'var(--green)', lineHeight: 1 }}>+</span>
        <span style={{ fontWeight: 700, fontSize: 16 }}>Add a location</span>
        <span style={{ fontSize: 13, color: 'var(--muted)' }}>Your {plan.name} plan includes {plan.locs}. Upgrade for more.</span>
      </button>
    );
  }
  const search = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true); setMsg(null);
    try { const r = await searchPlaces(q); setResults(r); if (!r.length) setMsg('No places found.'); }
    catch { setMsg('Search is unavailable right now.'); }
    finally { setBusy(false); }
  };
  const pick = async (r: PlaceResult) => {
    const saved = await add({ name: r.detail ? `${r.name}, ${r.detail.split(', ')[0]}` : r.name, lat: r.lat, lon: r.lon, source: 'manual' });
    if (saved) { setQ(''); setResults(null); }
  };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, minHeight: 240, padding: 20, border: '1px dashed var(--line-3)', borderRadius: 16 }}>
      <span style={{ fontWeight: 700, fontSize: 16 }}>Add a location</span>
      <button type="button" className="btn pill pill-primary" disabled={detecting} onClick={async () => { setMsg(null); if (!(await detectDevice())) setMsg(null); }}
        style={{ fontSize: 14, padding: '11px 16px', opacity: detecting ? .6 : 1 }}>
        {detecting ? 'Finding you…' : 'Use my current location'}
      </button>
      <form onSubmit={search} style={{ display: 'flex', gap: 8 }}>
        <input className="input" value={q} onChange={e => setQ(e.target.value)} placeholder="Search a town" aria-label="Search a town" style={{ padding: 11 }} />
        <button type="submit" className="btn pill pill-ghost" disabled={busy || q.trim().length < 2} style={{ fontSize: 14, padding: '0 16px', flex: 'none' }}>{busy ? '…' : 'Search'}</button>
      </form>
      {results && results.length > 0 && (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column' }}>
          {results.map(r => (
            <li key={`${r.lat},${r.lon}`}>
              <button type="button" className="btn" onClick={() => pick(r)} style={{ width: '100%', display: 'flex', justifyContent: 'space-between', gap: 8, padding: '10px 0', borderTop: '1px solid var(--line)' }}>
                <span style={{ fontWeight: 700 }}>{r.name}</span><span style={{ fontSize: 13, color: 'var(--muted)', textAlign: 'right' }}>{r.detail}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {msg && <span style={{ fontSize: 13, color: 'var(--muted)' }}>{msg}</span>}
    </div>
  );
}

function Locations() {
  const { plan } = useStore();
  const { locations, status, load, backend, error, detectDevice } = useLocations();
  useEffect(() => {
    load();
    // If location access was granted before, refresh the device location without prompting.
    navigator.permissions?.query({ name: 'geolocation' as PermissionName })
      .then(p => { if (p.state === 'granted') detectDevice({ silent: true }); })
      .catch(() => {});
  }, [load, detectDevice]);
  const limit = plan.locs;
  const active = Math.min(locations.length, limit);
  return (
    <div data-screen-label="Account · Locations" style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 16, flexWrap: 'wrap' }}>
        <h1 className="display" style={h1}>Saved <span className="hl">skies</span></h1>
        <span className="mono" style={{ fontSize: 13, color: 'var(--muted)' }}>{`${active} OF ${limit > 10 ? '∞' : limit} ACTIVE`}</span>
      </div>
      {error && <span role="status" style={{ fontSize: 14, color: C.amber }}>{error}</span>}
      {backend === 'local' && <span style={{ fontSize: 13, color: 'var(--muted)' }}>Locations are saved in this browser.</span>}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(min(260px,100%),1fr))', gap: 16 }}>
        {status !== 'ready' && <span style={{ color: 'var(--muted)' }}>Loading your locations…</span>}
        {locations.map((l, i) => <LocationCard key={l.id} loc={l} index={i} paused={i >= limit} />)}
        <AddLocation disabled={locations.length >= limit} />
      </div>
      <span style={{ fontSize: 12, color: 'var(--dim)' }}>
        Aurora: highest OVATION probability overhead or up to ~6° poleward. Cloud: Open-Meteo. Needs: approximate Kp for aurora low on the horizon, from geomagnetic latitude.
      </span>
    </div>
  );
}

function Billing() {
  const { s, plan, planIndex, go, cancelPlan } = useStore();
  const planLine = usePlanLine();
  const cycle = s.annual ? 'annual' : 'monthly';
  const cols = '1.2fr 1.5fr 1fr 1fr';
  const invoices = [
    { d: 'Oct 16, 2026', desc: `${plan.name} · trial started`, amt: '$0.00', st: 'Paid', c: C.green },
    { d: 'Oct 30, 2026', desc: `${plan.name} · ${cycle}`, amt: '$' + (s.annual ? plan.y : plan.m) + '.00', st: 'Upcoming', c: C.amber },
  ];
  return (
    <div data-screen-label="Account · Billing" style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <h1 className="display" style={h1}>Billing</h1>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(280px,100%),1fr))', gap: 16 }}>
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 22 }}>
          <span className="label">PLAN</span>
          <span style={{ fontFamily: 'var(--f-display)', fontWeight: 900, fontSize: 32, color: plan.accent }}>{plan.name}</span>
          <span style={{ fontSize: 14, color: 'var(--soft)' }}>{planLine}</span>
          <button type="button" className="btn" onClick={() => go('plans')} style={{ fontWeight: 700, fontSize: 14, color: 'var(--green)', marginTop: 6, alignSelf: 'flex-start' }}>
            {planIndex === 3 ? 'Change plan' : 'Upgrade'} →
          </button>
        </div>
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 22 }}>
          <span className="label">PAYMENT METHOD</span>
          <span className="mono" style={{ fontWeight: 600, fontSize: 22 }}>{planIndex ? 'VISA •••• 4242' : 'None on file'}</span>
          <span style={{ fontSize: 14, color: 'var(--soft)' }}>{planIndex ? 'Expires 08 / 29' : 'Add a card when you upgrade.'}</span>
        </div>
      </div>
      {planIndex > 0 && (
        <>
          <div className="hscroll"><div role="table" style={{ display: 'flex', flexDirection: 'column', minWidth: 480 }}>
            <div role="row" className="mono" style={{ display: 'grid', gridTemplateColumns: cols, gap: 12, padding: '10px 0', borderBottom: '1px solid var(--line-2)', fontSize: 11, color: 'var(--muted)' }}>
              <span role="columnheader">DATE</span><span role="columnheader">DESCRIPTION</span><span role="columnheader">AMOUNT</span><span role="columnheader">STATUS</span>
            </div>
            {invoices.map(inv => (
              <div role="row" key={inv.d} style={{ display: 'grid', gridTemplateColumns: cols, gap: 12, padding: '14px 0', borderBottom: '1px solid var(--line)', fontSize: 15 }}>
                <span role="cell">{inv.d}</span>
                <span role="cell" style={{ color: 'var(--soft)' }}>{inv.desc}</span>
                <span role="cell" className="mono">{inv.amt}</span>
                <span role="cell" style={{ fontWeight: 700, color: inv.c }}>{inv.st}</span>
              </div>
            ))}
          </div></div>
          <button type="button" className="btn" onClick={cancelPlan} style={{ alignSelf: 'flex-start', fontWeight: 600, fontSize: 14, color: C.red }}>Cancel membership</button>
        </>
      )}
    </div>
  );
}
