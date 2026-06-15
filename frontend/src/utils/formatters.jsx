import React from 'react';

export function ago(iso) {
  if (!iso) return '—';
  const d = Date.now() - new Date(iso).getTime();
  const m = Math.floor(d / 60000);
  const h = Math.floor(d / 3600000);
  const dy = Math.floor(d / 86400000);
  return m < 1 ? 'just now' : m < 60 ? m + 'm ago' : h < 24 ? h + 'h ago' : dy + 'd ago';
}

export function lbl(k) {
  return k.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

export function fmtNum(n) {
  return n != null ? Number(n).toLocaleString() : '—';
}

export function StatusBadge({ status, isReval }) {
  if (isReval || status === 'revalidate') return <span className="badge b-reval">⚠ Revalidate</span>;
  if (status === 'validated' || status === 'processed') return <span className="badge b-ok">✓ Unique</span>;
  if (status === 'duplicate_blocked') return <span className="badge b-err">⛔ Duplicate</span>;
  return <span className="badge b-neu">{status || '—'}</span>;
}

export function CurrentStatusBadge({ cs }) {
  if (cs === 'revalidated') return <span className="badge b-att">✅ Revalidated</span>;
  if (cs === 'expired') return <span className="badge b-exp">🔴 Expired</span>;
  if (cs === 'pending') return <span className="badge" style={{ background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe' }}>🕐 Pending</span>;
  return <span className="badge b-neu">{cs || '—'}</span>;
}

export function MethBadge({ m }) {
  if (m === 'EXACT') return <span className="badge b-err" style={{ fontSize: '9.5px' }}>EXACT</span>;
  if (m === 'FUZZY') return <span className="badge b-warn" style={{ fontSize: '9.5px' }}>FUZZY</span>;
  if (m === 'REVALIDATE') return <span className="badge b-reval" style={{ fontSize: '9.5px' }}>REVALIDATE</span>;
  if (m === 'AMOUNT_VELOCITY') return <span className="badge b-teal" style={{ fontSize: '9.5px' }}>VELOCITY</span>;
  return <span className="badge b-neu" style={{ fontSize: '9.5px' }}>{m || '—'}</span>;
}

export function ProgressRow({ label, n, total, color }) {
  const p = total ? Math.round((n / total) * 100) : 0;
  return (
    <div style={{ marginBottom: '9px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '3px' }}>
        <span>{label}</span>
        <span className="mono" style={{ fontWeight: 600 }}>{n}</span>
      </div>
      <div style={{ height: '5px', background: 'var(--bdr)', borderRadius: '3px', overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${p}%`, background: color, borderRadius: '3px', transition: 'width .5s' }}></div>
      </div>
    </div>
  );
}
