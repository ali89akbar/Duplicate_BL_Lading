import React, { useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faExclamationTriangle, faCheckCircle, faBan, faStar, faTimesCircle } from '@fortawesome/free-solid-svg-icons';
import { PATCH } from '../utils/api';


export function ResultPanel({ data, onRefresh }) {
  const [rejecting, setRejecting] = useState(false);
  const [rejected, setRejected] = useState(false);

  if (!data) return null;

  const hasDuplicate = (data.results || []).some(r => r.is_duplicate);
  const hasRevalidate = (data.results || []).some(r => r.is_revalidate);
  const typeClass = rejected ? 'dup' : hasDuplicate ? 'dup' : hasRevalidate ? 'reval' : 'ok';

  const groupOrigRef = (data.results || []).map(r => 
    r?.duplicate_details?.original_portal_ref || 
    r?.duplicate_details?.matched_values?.portal_ref_no || 
    r?.duplicate_details?.extra?.original_portal_ref ||
    r?.original_record?.portal_ref_no
  ).find(Boolean);

  const handleRejectRef = async (refNo) => {
    const reason = window.prompt(`Enter rejection reason for Ref No (${refNo}):`, 'Duplication found upon manual entry');
    if (reason === null) return;

    setRejecting(true);
    try {
      await PATCH('/manual/submissions/group_reject', {
        portal_ref_no: refNo,
        reason: reason.trim() || 'Duplication found upon manual entry'
      });
      setRejected(true);
      if (onRefresh) onRefresh();
    } catch (err) {
      alert('Error rejecting group: ' + err.message);
    } finally {
      setRejecting(false);
    }
  };

  return (
    <div className={`card res-panel ${typeClass}`} style={{ marginTop: '14px', borderRadius: 'var(--r2)', overflow: 'hidden' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '14px', alignItems: 'center', padding: '12px 18px', background: 'var(--bg)', borderBottom: '1px solid var(--bdr)', fontSize: '12px' }}>
        <span><strong>Ref:</strong> <span className="mono" style={{ color: '#b45309' }}>{data.portal_ref_no}</span></span>
        
        {hasDuplicate && groupOrigRef && (
          <span className="badge b-err" style={{ fontSize: '10.5px', background: '#fee2e2', color: '#991b1b', border: '1px solid #fca5a5' }}>
            Duplicate of {groupOrigRef}
          </span>
        )}

        <span><strong>Date:</strong> {data.screening_date}</span>
        <span><strong>Amount:</strong> <span className="mono">{data.dr_ccy} {Number(data.amount).toLocaleString()}</span></span>
        <span style={{ color: 'var(--txt3)' }}>{data.total_bls} BL(s) submitted by {data.submitted_by}</span>

        {hasDuplicate && (
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '8px' }}>
            {rejected ? (
              <span className="badge b-rd" style={{ padding: '4px 10px', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <FontAwesomeIcon icon={faTimesCircle} /> Ref Rejected
              </span>
            ) : (
              <button 
                className="btn btn-xs" 
                style={{ background: '#ef4444', color: '#fff', padding: '5px 12px', fontWeight: 600, border: 'none', borderRadius: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px' }}
                onClick={() => handleRejectRef(data.portal_ref_no)}
                disabled={rejecting}
              >
                <FontAwesomeIcon icon={faBan} /> {rejecting ? 'Rejecting...' : `Reject Ref (${data.portal_ref_no})`}
              </button>
            )}
          </div>
        )}
      </div>
      
      {(data.results || []).map((r, idx) => {
        const icon = r.is_duplicate ? <FontAwesomeIcon icon={faBan} /> : r.is_revalidate ? <FontAwesomeIcon icon={faExclamationTriangle} /> : <FontAwesomeIcon icon={faCheckCircle} />;
        const label = r.is_duplicate ? 'Duplicate — Blocked' : r.is_revalidate ? 'Revalidate — Not Blocked' : 'Unique — Cleared';
        
        if (r.status === 'validation_error') {
          return (
            <div key={idx} style={{ padding: '10px 18px', borderBottom: '1px solid var(--bdr)', background: 'var(--as)' }}>
              <span style={{ fontSize: '12px', color: 'var(--amber)' }}><FontAwesomeIcon icon={faExclamationTriangle} /> BL {r.bl_number || '?'} — Validation: {Object.values(r.field_errors || {}).join(' | ')}</span>
            </div>
          );
        }

        const orig = r.original_record;
        const origRef = r?.duplicate_details?.original_portal_ref || 
                        r?.duplicate_details?.matched_values?.portal_ref_no || 
                        r?.duplicate_details?.extra?.original_portal_ref ||
                        orig?.portal_ref_no;
        
        return (
          <div key={idx} style={{ padding: '11px 18px', borderBottom: '1px solid var(--bdr)', display: 'flex', alignItems: 'center', gap: '12px', background: r.is_revalidate ? '#fffbeb' : r.is_duplicate ? '#fff5f5' : '' }}>
            <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: r.is_duplicate ? 'var(--red)' : r.is_revalidate ? '#d97706' : 'var(--green)', flexShrink: 0 }}></div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '13px', fontWeight: 600, color: r.is_duplicate ? 'var(--red)' : r.is_revalidate ? '#92400e' : 'var(--green)', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <span>{icon} {r.bl_number} {r.is_master && <span style={{ fontSize: '9px', background: '#fbbf24', color: '#92400e', padding: '1px 7px', borderRadius: '10px', marginLeft: '4px' }}><FontAwesomeIcon icon={faStar} /> Master</span>} — {label}</span>
                {r.is_duplicate && origRef && (
                  <span className="badge b-err" style={{ fontSize: '10.5px', background: '#fee2e2', color: '#991b1b', border: '1px solid #fca5a5' }}>
                    Duplicate of {origRef}
                  </span>
                )}
              </div>
              <div style={{ fontSize: '11px', color: 'var(--txt3)', marginTop: '2px' }}>{r.message}</div>
              {orig && <div style={{ fontSize: '10.5px', color: 'var(--txt3)', marginTop: '2px' }}>Original Ref: <strong>{orig.portal_ref_no || '—'}</strong> (Doc: {orig.id}) · {orig.submitted_by}</div>}
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
