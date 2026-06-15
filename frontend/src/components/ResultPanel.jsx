import React from 'react';

export function ResultPanel({ data }) {
  if (!data) return null;

  const hasDuplicate = (data.results || []).some(r => r.is_duplicate);
  const hasRevalidate = (data.results || []).some(r => r.is_revalidate);
  const typeClass = hasDuplicate ? 'dup' : hasRevalidate ? 'reval' : 'ok';

  return (
    <div className={`card res-panel ${typeClass}`} style={{ marginTop: '14px', borderRadius: 'var(--r2)', overflow: 'hidden' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '14px', padding: '12px 18px', background: 'var(--bg)', borderBottom: '1px solid var(--bdr)', fontSize: '12px' }}>
        <span><strong>Ref:</strong> <span className="mono" style={{ color: '#b45309' }}>{data.portal_ref_no}</span></span>
        <span><strong>Date:</strong> {data.screening_date}</span>
        <span><strong>Amount:</strong> <span className="mono">{data.dr_ccy} {Number(data.amount).toLocaleString()}</span></span>
        <span style={{ color: 'var(--txt3)' }}>{data.total_bls} BL(s) submitted by {data.submitted_by}</span>
      </div>
      
      {(data.results || []).map((r, idx) => {
        const icon = r.is_duplicate ? '⛔' : r.is_revalidate ? '⚠' : '✅';
        const label = r.is_duplicate ? 'Duplicate — Blocked' : r.is_revalidate ? 'Revalidate — Not Blocked' : 'Unique — Cleared';
        
        if (r.status === 'validation_error') {
          return (
            <div key={idx} style={{ padding: '10px 18px', borderBottom: '1px solid var(--bdr)', background: 'var(--as)' }}>
              <span style={{ fontSize: '12px', color: 'var(--amber)' }}>⚠ BL {r.bl_number || '?'} — Validation: {Object.values(r.field_errors || {}).join(' | ')}</span>
            </div>
          );
        }

        const orig = r.original_record;
        
        return (
          <div key={idx} style={{ padding: '11px 18px', borderBottom: '1px solid var(--bdr)', display: 'flex', alignItems: 'center', gap: '12px', background: r.is_revalidate ? '#fffbeb' : r.is_duplicate ? '#fff5f5' : '' }}>
            <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: r.is_duplicate ? 'var(--red)' : r.is_revalidate ? '#d97706' : 'var(--green)', flexShrink: 0 }}></div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '13px', fontWeight: 600, color: r.is_duplicate ? 'var(--red)' : r.is_revalidate ? '#92400e' : 'var(--green)' }}>
                {icon} {r.bl_number} {r.is_master && <span style={{ fontSize: '9px', background: '#fbbf24', color: '#92400e', padding: '1px 7px', borderRadius: '10px', marginLeft: '4px' }}>★ Master</span>} — {label}
              </div>
              <div style={{ fontSize: '11px', color: 'var(--txt3)', marginTop: '2px' }}>{r.message}</div>
              {orig && <div style={{ fontSize: '10.5px', color: 'var(--txt3)', marginTop: '2px' }}>Original: {orig.id} · {orig.submitted_by}</div>}
            </div>
            <div style={{ textAlign: 'right', fontSize: '11px', color: 'var(--txt3)' }}>
              <div className="mono">{r.submission_id || ''}</div>
              <div>Till: {r.till_date || '—'}</div>
              {r.email_alert_sent && <span className="badge b-warn" style={{ fontSize: '9px', marginTop: '3px' }}>Email sent</span>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function ErrorPanel({ message }) {
  return (
    <div className="res-panel warn">
      <div className="res-hd">
        <div className="res-ico">
          <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
            <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
            <line x1="12" y1="9" x2="12" y2="13"/>
          </svg>
        </div>
        <div>
          <div className="res-v">Error</div>
          <div className="res-m">{message}</div>
        </div>
      </div>
    </div>
  );
}
