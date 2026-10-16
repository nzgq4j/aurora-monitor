'use client';

import { kpScale, nowStats } from '../data';
import { KpOutlookChart, PolarOval } from '../components/Charts';
import { useStore } from '../store';

export function Home() {
  const { planIndex, go } = useStore();
  return (
    <main data-screen-label="Now" className="wrap" style={{ padding: '40px 32px 48px', display: 'flex', flexDirection: 'column', gap: 36 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(420px,1fr))', gap: 40, alignItems: 'center' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <div className="kicker" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--green)' }} />LIVE · UPDATED 2 MIN AGO
          </div>
          <h1 className="display" style={{ fontSize: 80, lineHeight: .88 }}>
            G1 Storm<br /><span className="hl" style={{ whiteSpace: 'nowrap' }}>In progress</span>
          </h1>
          <p style={{ margin: 0, maxWidth: 540, fontSize: 18, lineHeight: 1.45, color: 'var(--soft)', textWrap: 'pretty' }}>
            A CME shock arrived at 18:20 UT and the IMF has turned hard south. Aurora is likely overhead across central Canada and low on the northern horizon down to the northern US tier tonight.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(9,1fr)', gap: 4, maxWidth: 520 }} aria-label="Kp scale, current level 5">
            {kpScale.map(s => (
              <div key={s.n} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ height: 14, borderRadius: 2, background: s.bg, opacity: s.op }} />
                <span className="mono" style={{ fontSize: 11, color: 'var(--muted)' }}>{s.n}</span>
              </div>
            ))}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,minmax(0,1fr))', borderTop: '1px solid var(--line)', borderBottom: '1px solid var(--line)' }}>
            {nowStats.map(s => (
              <div key={s.label} style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 4, borderRight: '1px solid var(--line)' }}>
                <span className="label">{s.label}</span>
                <span className="stat-value" style={{ fontSize: 32 }}>
                  {s.value}<span style={{ fontSize: 14, fontWeight: 600, color: 'var(--muted)', marginLeft: 4 }}>{s.unit}</span>
                </span>
                <span style={{ fontSize: 13, fontWeight: 600, color: s.c }}>{s.note}</span>
              </div>
            ))}
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 520, width: '100%', justifySelf: 'center' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ fontFamily: 'var(--f-display)', fontWeight: 800, fontSize: 14, color: 'var(--green)', letterSpacing: '.04em' }}>AURORAL OVAL · OVATION</span>
            <span className="label">22:15 UT</span>
          </div>
          <PolarOval />
        </div>
      </div>

      <div className="rule-top" style={{ display: 'flex', flexDirection: 'column', gap: 12, paddingTop: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 24, flexWrap: 'wrap' }}>
          <h2 className="display" style={{ fontSize: 40, lineHeight: 1 }}>Geomagnetic <span className="hl">outlook</span></h2>
          <span style={{ fontSize: 13, color: 'var(--muted)' }}>Observed Kp · NOAA 3-day forecast</span>
        </div>
        <KpOutlookChart />
      </div>

      {planIndex === 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto', gap: 24, alignItems: 'center', padding: '28px 32px', border: '1px solid var(--line-2)', borderRadius: 16, background: 'radial-gradient(120% 140% at 100% 100%,rgba(89,255,58,.18),rgba(0,0,0,0) 60%)' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <span className="display" style={{ fontSize: 36, lineHeight: 1 }}>Never miss <span className="hl">a night</span></span>
            <span style={{ fontSize: 16, color: 'var(--soft)' }}>Instant alerts when the oval reaches your sky, with clouds and darkness taken into account.</span>
          </div>
          <button type="button" className="btn pill pill-primary" onClick={() => go('plans')} style={{ fontSize: 15, padding: '14px 22px', whiteSpace: 'nowrap' }}>See memberships</button>
        </div>
      )}
    </main>
  );
}
