import type { InputHTMLAttributes } from 'react';

type Props = { label: string; mono?: boolean } & InputHTMLAttributes<HTMLInputElement>;

export function Field({ label, mono, className, ...input }: Props) {
  return (
    <label className="field">
      <span className="label">{label}</span>
      <input className={'input' + (mono ? ' mono' : '') + (className ? ` ${className}` : '')} {...input} />
    </label>
  );
}
