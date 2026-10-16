'use client';

import {
  C, CHANNEL_DEFS, KP_NAME, KP_WHERE, SEASON_VISIBLE_Y, TIERS, TRIGGER_DEFS, f, hist30, locations, overviewStats,
  season, seasonGrid, upcoming,
} from '../data';
import { useStore, type Tab } from '../store';

const TABS: [Tab, string][] = [['overview', 'Overview'], ['alerts', 'Alerts'], ['locations', 'Locations'], ['billing', 'Billing']];

export function Account() {
  const { s, set, signOut } = useStore();
  return (
    <main data-screen-label="Account" className="wrap" style={{ padding: '36px 32px 56px', display: 'grid', gridTemplateColumns: '220px minmax(0,1fr)', gap: 40, alignItems: 'start' }}>
      <aside style={{ position: 'sticky', top: 96, display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '0 0 20px' }}>
          <span className="avatar" style={{ width: 44, height: 44 }}>SR</span>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontWeight: 700 }}>Sam Rivera</span>
            <span style={{ fontSize: 13, color: 'var(--muted)' }}>sam@example.com</span>
          </div>
        </div>
        <nav role="tablist" aria-orientation="vertical" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {TABS.map(([id, label]) => {
            const on = s.tab === id;
            return (
              <button key={id} type="button" role="tab" aria-selected={on} className="btn" onClick={() => set({ tab: id })}
                style={{ padding: '11px 14px', borderRadius: 10, fontWeight: 600, fontSize: 15, background: on ? C.line : 'transparent', color: on ? '#fff' : C.muted }}>
                {label}
              </button>
            );
          })}
        </nav>
        <button type="button" className="btn" onClick={signOut}
          style={{ padding: '11px 14px', fontWeight: 600, fontSize: 15, color: 'var(--muted)', marginTop: 12, borderTop: '1px solid var(--line)' }}>
          Sign out
        </button>
      </aside>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 28, minWidth: 0 }}>
        {s.tab === 'overview' && <Overview />}
        {s.tab === 'alerts' && <Alerts />}
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

const h2 = { fontSize: 34, lineHeight: 1 };
const h1 = { fontSize: 56, lineHeight: .9 };

function Overview() {
  const { set, plan, planIndex, go } = useStore();
  const planLine = usePlanLine();
  return (
    <div data-screen-label="Account · Overview" style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(340px,100%),1fr))', gap: 20 }}>
        <div style={{ position: 'relative', overflow: 'hidden', display: 'flex', flexDirection: 'column', gap: 14, padding: 28, border: `1px solid ${plan.accent}`, borderRadius: 18, background: 'var(--panel)' }}>
          <div aria-hidden="true" style={{ position: 'absolute', right: -90, bottom: -150, width: 340, height: 340, borderRadius: '50%', border: `38px solid ${plan.accent}`, opacity: .45, filter: 'blur(30px)' }} />
          <span className="mono" style={{ position: 'relative', fontSize: 12, letterSpacing: '.08em', color: 'var(--muted)' }}>MEMBERSHIP</span>
          <span className="display" style={{ position: 'relative', fontSize: 'clamp(34px,4.2vw,60px)', lineHeight: .9, overflowWrap: 'anywhere', color: plan.accent }}>{plan.name}</span>
          <span style={{ position: 'relative', fontSize: 16, color: 'var(--soft)' }}>{planLine}</span>
          <div style={{ position: 'relative', display: 'flex', gap: 10, marginTop: 6 }}>
            <button type="button" className="btn pill pill-primary" onClick={() => go('plans')} style={{ fontSize: 14, padding: '11px 18px' }}>{planIndex === 3 ? 'Change plan' : 'Upgrade'}</button>
            <button type="button" className="btn pill pill-ghost" onClick={() => set({ tab: 'billing' })} style={{ fontSize: 14, padding: '11px 18px', background: '#000' }}>Billing</button>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1, background: 'var(--line)', border: '1px solid var(--line)', borderRadius: 18, overflow: 'hidden' }}>
          {overviewStats.map(st => (
            <div key={st.label} style={{ background: '#000', padding: 18, display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span className="label">{st.label}</span>
              <span className="stat-value" style={{ fontSize: 30, whiteSpace: 'nowrap' }}>{st.value}</span>
              <span style={{ fontSize: 13, fontWeight: 600, color: st.c }}>{st.note}</span>
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: 12 }}>
          <h2 className="display" style={h2}>Your <span className="hl">season</span></h2>
          <div style={{ display: 'flex', gap: 16, fontSize: 13, color: 'var(--soft)' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ width: 11, height: 11, background: C.darkGreen }} />Max Kp over Minneapolis</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ width: 9, height: 9, borderRadius: '50%', background: '#fff' }} />Alerts sent</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ width: 16, borderTop: `2px dashed ${C.amber}` }} />Visible from home (Kp 5)</span>
          </div>
        </div>
        <svg viewBox="0 0 900 240" style={{ width: '100%', display: 'block' }} role="img" aria-label="Weekly max Kp and alerts sent this season">
          {seasonGrid.map(g => (
            <g key={g.k}>
              <line x1="30" x2="890" y1={g.y} y2={g.y} style={{ stroke: '#fff', strokeOpacity: .07 }} />
              <text x="20" y={g.ty} style={{ fill: C.muted, font: "10px 'JetBrains Mono'", textAnchor: 'end' }}>{g.k}</text>
            </g>
          ))}
          <line x1="30" x2="890" y1={SEASON_VISIBLE_Y} y2={SEASON_VISIBLE_Y} style={{ stroke: C.amber, strokeWidth: 1.5, strokeDasharray: '6 4' }} />
          {season.map(w => (
            <g key={w.lbl}>
              <rect x={w.x} y={w.y} width={w.w} height={w.h} style={{ fill: w.fill }} />
              {w.dots.map((d, j) => <circle key={j} cx={d.x} cy={d.y} r="4" style={{ fill: '#fff' }} />)}
              <text x={w.cx} y="230" style={{ fill: C.soft, font: "600 11px 'Barlow'", textAnchor: 'middle' }}>{w.lbl}</text>
            </g>
          ))}
          <line x1="30" x2="890" y1="210" y2="210" style={{ stroke: C.muted }} />
        </svg>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <h2 className="display" style={{ ...h2, margin: '0 0 8px' }}>Best nights <span className="hl">ahead</span></h2>
        {upcoming.map(u => (
          <div key={u.d} style={{ display: 'grid', gridTemplateColumns: '130px 70px minmax(0,1fr) 52px', alignItems: 'center', gap: 16, padding: '12px 0', borderBottom: '1px solid var(--line)' }}>
            <span style={{ fontWeight: 700, fontSize: 16 }}>{u.d}</span>
            <span style={{ fontFamily: 'var(--f-display)', fontWeight: 900, fontSize: 20, color: u.c }}>Kp {u.kp}</span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              <div style={{ height: 10, background: '#121512', borderRadius: 2 }}>
                <div style={{ height: 10, width: u.chance + '%', background: u.c, borderRadius: 2, boxShadow: `0 0 12px ${u.c}` }} />
              </div>
              <span style={{ fontSize: 13, color: 'var(--muted)' }}>{u.note}</span>
            </div>
            <span className="mono" style={{ fontSize: 14, textAlign: 'right' }}>{u.chance}%</span>
          </div>
        ))}
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

function Alerts() {
  const { s, set, planIndex, go } = useStore();
  const kp = s.kpThreshold;
  const hits = hist30.filter(v => v >= kp).length;
  const thY = f(170 - kp * 17);
  return (
    <div data-screen-label="Account · Alerts" style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
      <h1 className="display" style={h1}>Alert <span className="hl">rules</span></h1>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,.8fr) minmax(0,1.2fr)', gap: 28, padding: 26, border: '1px solid var(--line-2)', borderRadius: 18 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <label htmlFor="kp-threshold" className="eyebrow">ALERT ME WHEN KP REACHES</label>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
            <span style={{ fontFamily: 'var(--f-display)', fontWeight: 900, fontStretch: '112%', fontSize: 96, lineHeight: .85 }}>{kp}</span>
            <span style={{ fontFamily: 'var(--f-display)', fontWeight: 800, fontSize: 22, color: kp >= 5 ? C.red : kp === 4 ? C.amber : C.darkGreen }}>{KP_NAME[kp]}</span>
          </div>
          <input id="kp-threshold" type="range" min={2} max={9} step={1} value={kp} onChange={e => set({ kpThreshold: +e.target.value })} style={{ width: '100%' }} />
          <span style={{ fontSize: 15, color: 'var(--soft)', textWrap: 'pretty' }}>At Kp {kp}, aurora is {KP_WHERE[kp]} from Minneapolis.</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <span style={{ fontSize: 14, color: 'var(--muted)' }}>Last 30 nights · max Kp</span>
            <span style={{ fontFamily: 'var(--f-display)', fontWeight: 900, fontSize: 22 }}><span className="hl">{hits}</span> alerts</span>
          </div>
          <svg viewBox="0 0 450 190" style={{ width: '100%', display: 'block' }} role="img" aria-label={`${hits} of the last 30 nights reached Kp ${kp}`}>
            <line x1="0" x2="450" y1={thY} y2={thY} style={{ stroke: C.green, strokeWidth: 1.5, strokeDasharray: '5 4' }} />
            {hist30.map((v, i) => <rect key={i} x={f(i * 15)} y={f(170 - v * 17)} width="11" height={f(v * 17)} style={{ fill: v >= kp ? C.green : C.line2 }} />)}
            <line x1="0" x2="450" y1="170" y2="170" style={{ stroke: C.muted }} />
            <text x="0" y="186" style={{ fill: C.muted, font: "10px 'JetBrains Mono'" }}>SEP 16</text>
            <text x="450" y="186" style={{ fill: C.muted, font: "10px 'JetBrains Mono'", textAnchor: 'end' }}>TONIGHT</text>
          </svg>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(300px,1fr))', gap: 20 }}>
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

function Locations() {
  const { set, plan, go } = useStore();
  const canAdd = plan.locs > 3;
  const mono10 = { fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--muted)' };
  const big = { fontFamily: 'var(--f-display)', fontWeight: 900, fontSize: 24 };
  return (
    <div data-screen-label="Account · Locations" style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 16, flexWrap: 'wrap' }}>
        <h1 className="display" style={h1}>Saved <span className="hl">skies</span></h1>
        <span className="mono" style={{ fontSize: 13, color: 'var(--muted)' }}>{`${Math.min(3, plan.locs)} OF ${plan.locs > 10 ? '∞' : plan.locs} ACTIVE`}</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(260px,1fr))', gap: 16 }}>
        {locations.map((l, i) => {
          const paused = i >= plan.locs;
          const tagC = paused ? C.muted : i === 0 ? C.green : C.soft;
          const c = l.chance >= 70 ? C.green : l.chance >= 40 ? C.amber : C.red;
          return (
            <div key={l.name} className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: 20, opacity: paused ? .45 : 1 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <span style={{ fontWeight: 700, fontSize: 18 }}>{l.name}</span>
                  <span className="label">{l.coords}</span>
                </div>
                <span style={{ fontSize: 11, fontWeight: 700, padding: '4px 8px', borderRadius: 999, border: `1px solid ${tagC}`, color: tagC }}>{paused ? 'PAUSED' : l.tag}</span>
              </div>
              <svg viewBox="0 0 240 90" style={{ width: '100%', display: 'block', borderRadius: 10, background: '#050806' }} aria-hidden="true">
                <defs><filter id={`lb${i}`} x="-30%" y="-80%" width="160%" height="260%"><feGaussianBlur stdDeviation="9" /></filter></defs>
                <ellipse cx="120" cy="72" rx="110" ry={f(10 + l.chance * .35)} style={{ fill: '#59FF3A', opacity: f(.25 + l.chance / 160), filter: `url(#lb${i})` }} />
                <line x1="0" x2="240" y1="72" y2="72" style={{ stroke: '#fff' }} />
                <rect x="0" y="72" width="240" height="18" style={{ fill: '#000' }} />
                <text x="120" y="86" style={{ fill: C.muted, font: "700 10px 'Barlow'", textAnchor: 'middle' }}>N</text>
              </svg>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                <div style={{ display: 'flex', flexDirection: 'column' }}><span style={mono10}>TONIGHT</span><span style={{ ...big, color: c }}>{l.chance}%</span></div>
                <div style={{ display: 'flex', flexDirection: 'column' }}><span style={mono10}>CLOUD</span><span style={big}>{l.cloud}%</span></div>
                <div style={{ display: 'flex', flexDirection: 'column' }}><span style={mono10}>NEEDS</span><span style={big}>Kp {l.need}</span></div>
              </div>
            </div>
          );
        })}
        <button type="button" className="btn" onClick={canAdd ? () => set({ toast: 'Location search would open here.' }) : () => go('plans')}
          style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 240, padding: 20, border: '1px dashed var(--line-3)', borderRadius: 16, textAlign: 'center' }}>
          <span style={{ fontFamily: 'var(--f-display)', fontWeight: 900, fontSize: 40, color: 'var(--green)', lineHeight: 1 }}>+</span>
          <span style={{ fontWeight: 700, fontSize: 16 }}>Add a location</span>
          <span style={{ fontSize: 13, color: 'var(--muted)' }}>{canAdd ? 'Search a town or drop a pin' : `Your ${plan.name} plan includes ${plan.locs}. Upgrade for more.`}</span>
        </button>
      </div>
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
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))', gap: 16 }}>
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
          <div role="table" style={{ display: 'flex', flexDirection: 'column' }}>
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
          </div>
          <button type="button" className="btn" onClick={cancelPlan} style={{ alignSelf: 'flex-start', fontWeight: 600, fontSize: 14, color: C.red }}>Cancel membership</button>
        </>
      )}
    </div>
  );
}
