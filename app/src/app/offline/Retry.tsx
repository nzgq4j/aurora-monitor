'use client';

export function Retry() {
  return (
    <button type="button" className="btn pill pill-primary" onClick={() => {
      // Go back to the page that couldn't load (only same-site paths).
      const from = new URLSearchParams(location.search).get('from');
      location.href = from && from.startsWith('/') && !from.startsWith('//') ? from : '/';
    }} style={{ alignSelf: 'flex-start', fontSize: 15, padding: '14px 22px' }}>
      Try again
    </button>
  );
}
