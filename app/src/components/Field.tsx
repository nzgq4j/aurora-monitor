export function Field({ label, placeholder, mono, type, autoComplete }: { label: string; placeholder: string; mono?: boolean; type?: string; autoComplete?: string }) {
  return (
    <label className="field">
      <span className="label">{label}</span>
      <input className={'input' + (mono ? ' mono' : '')} placeholder={placeholder} type={type} autoComplete={autoComplete} />
    </label>
  );
}
