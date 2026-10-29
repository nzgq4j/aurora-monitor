import type { ReactNode } from 'react';
import { headLead } from '../i18n/core';

export interface LegalSection { h: string; body: ReactNode; id?: string }

/** Privacy policy and terms (English; other languages get a note that the English text applies). */
export function LegalPage({ kicker, title, updated, intro, sections, note }: {
  kicker: string; title: [string, string]; updated: string; intro: ReactNode; sections: LegalSection[]; note: string | null;
}) {
  return (
    <main className="wrap legal" style={{ padding: '48px var(--gutter) 64px', display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 760 }}>
      <span className="kicker">{kicker}</span>
      <h1 className="display" style={{ fontSize: 'var(--h-hero)', lineHeight: .88, margin: 0 }}>{headLead(title[0])}<span className="hl">{title[1]}</span></h1>
      {note && <p className="legal-note">{note}</p>}
      <div lang="en" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <p className="legal-updated">Last updated: {updated}</p>
        <div className="legal-intro">{intro}</div>
        {sections.map((s, i) => (
          <section key={s.h} id={s.id} aria-labelledby={`legal-${i}`}>
            <h2 id={`legal-${i}`}>{i + 1}. {s.h}</h2>
            {s.body}
          </section>
        ))}
      </div>
    </main>
  );
}
