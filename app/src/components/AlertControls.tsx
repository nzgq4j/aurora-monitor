'use client';

import { useEffect, useState } from 'react';
import { TIERS } from '../data';
import { disablePush, enablePush, pushState, type PushState } from '../lib/push';
import { inApp } from '../lib/native';
import { useStore } from '../store';
import { useI18n } from '../i18n/I18n';
import { INSTALL_EVENT } from './InstallPrompt';

/** Switches shared by the Alerts screen (screens/Account) and the introduction's alerts step (Onboarding). */
export interface ToggleProps { label: string; sub: string; on: boolean; need: number; locked: boolean; onClick: () => void }

export function ToggleRow({ label, sub, on, need, locked, onClick }: ToggleProps) {
  const { t } = useI18n();
  const tier = t(`tier.${TIERS[need].id}`);
  const active = on && !locked;
  return (
    <button type="button" className="btn toggle-row" onClick={onClick} style={{ opacity: locked ? .55 : 1 }}
      role={locked ? undefined : 'switch'} aria-checked={locked ? undefined : active}
      aria-label={locked ? t('dash.requires', { label, plan: tier }) : undefined}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span style={{ fontWeight: 700, fontSize: 16 }}>{label}</span>
        <span style={{ fontSize: 13, color: 'var(--muted)' }}>{sub}</span>
      </div>
      <span style={{ fontSize: 11, fontWeight: 700, color: TIERS[need].accent, whiteSpace: 'nowrap' }}>{locked ? tier.toUpperCase() : ''}</span>
      <span className={'switch' + (active ? ' on' : '')}><span className="switch-knob" /></span>
    </button>
  );
}

/** Push alerts for this device: asks for permission when turned on (Chaser). */
export function PushRow({ need, locked }: { need: number; locked: boolean }) {
  const { set, go } = useStore();
  const { t } = useI18n();
  const [state, setState] = useState<PushState | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  useEffect(() => { pushState().then(setState).catch(() => setState('unsupported')); }, []);
  const sub = err || (state === null ? t('channel.push.sub')
    : state === 'unconfigured' ? `${t('channel.push.sub')} · ${t('alerts.comingSoon')}`
    : state === 'on' ? t('push.sub.on') : state === 'off' ? t('channel.push.sub') : t(`push.sub.${state === 'needs-install' ? 'needsInstall' : state === 'denied' && inApp() ? 'deniedApp' : state}`));
  const toggle = async () => {
    if (locked) return go('plans');
    if (state === 'needs-install') return window.dispatchEvent(new Event(INSTALL_EVENT));
    if (state !== 'on' && state !== 'off') return;
    setBusy(true); setErr('');
    try {
      const next = state === 'on' ? await disablePush() : await enablePush(t('push.channel'));
      setState(next);
      set(st => ({ channels: { ...st.channels, push: next === 'on' } }));
    } catch {
      setErr(t('push.error'));
    } finally {
      setBusy(false);
    }
  };
  return <ToggleRow label={t('channel.push')} sub={sub} need={need} locked={locked} on={state === 'on' && !busy} onClick={toggle} />;
}
