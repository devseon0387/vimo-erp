'use client';

export default function Error({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      background: '#f5f4f2',
      fontFamily: 'sans-serif',
    }}>
      <h1 style={{ fontSize: '48px', fontWeight: 800, color: '#1c1917', margin: 0 }}>오류 발생</h1>
      <p style={{ fontSize: '16px', color: '#78716c', marginTop: '8px' }}>문제가 발생했습니다. 다시 시도해 주세요.</p>
      <button
        onClick={reset}
        style={{
          marginTop: '24px',
          padding: '10px 24px',
          background: '#f97316',
          color: '#fff',
          borderRadius: '12px',
          border: 'none',
          fontSize: '14px',
          fontWeight: 600,
          cursor: 'pointer',
        }}
      >
        다시 시도
      </button>
      <p style={{ marginTop: '32px', fontSize: '11px', color: '#d6cec8', letterSpacing: '0.1em' }}>VIMO ERP</p>
    </div>
  );
}
