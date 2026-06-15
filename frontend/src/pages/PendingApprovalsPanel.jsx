import { useEffect, useState } from 'react';
import { GET, PATCH } from '../utils/api';

export function PendingApprovalsPanel() {
  const [groups, setGroups] = useState([]);
  const [rejectModal, setRejectModal] = useState(null);

  const load = async () => {
    const r = await GET('/admin/pending_approvals');
    setGroups(r?.approvals || []);
  };

  useEffect(() => { load(); }, []);

  const clear = async (portal_ref_no) => {
    await PATCH('/manual/submissions/group_clear', { portal_ref_no });
    load();
  };

  const confirmReject = async () => {
    if (!rejectModal?.reason?.trim()) return alert('Rejection reason is required.');
    await PATCH('/manual/submissions/group_reject', {
      portal_ref_no: rejectModal.portal_ref_no,
      reason: rejectModal.reason.trim()
    });
    setRejectModal(null);
    load();
  };

  if (groups.length === 0) return null;

  return (
    <>
      <div className="card" style={{ borderLeft: '3px solid #d97706', marginBottom: '16px' }}>
        <div className="card-hd">
          <div className="card-t">
            🔔 Pending Approvals
            <span style={{ background:'#dc2626', color:'#fff', borderRadius:'10px', fontSize:'10px', padding:'1px 7px', marginLeft:'8px' }}>{groups.length}</span>
          </div>
        </div>
        <table style={{ width:'100%', fontSize:'12px' }}>
          <thead>
            <tr style={{ color:'var(--txt3)' }}>
              <th style={{ padding:'6px 8px', textAlign:'left' }}>Portal Ref</th>
              <th>Date</th>
              <th>CCY</th>
              <th>Amount</th>
              <th>By</th>
              <th>BLs</th>
              <th>Type</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {groups.map(g => (
              <tr key={g.portal_ref_no} style={{ borderTop:'1px solid var(--brd)' }}>
                <td style={{ padding:'6px 8px' }}><code style={{ fontSize:'11px' }}>{g.portal_ref_no}</code></td>
                <td className="mono" style={{ fontSize:'11px' }}>{g.screening_date}</td>
                <td className="mono" style={{ fontSize:'11px' }}>{g.dr_ccy}</td>
                <td className="mono" style={{ fontSize:'11px' }}>{g.amount?.toLocaleString()}</td>
                <td style={{ fontSize:'11px' }}>{g.uploaded_by}</td>
                <td style={{ fontSize:'11px' }}>{g.bls.length} BL(s)</td>
                <td>
                  {g.is_reclearance
                    ? <span style={{ fontSize:'10px', background:'#fef3c7', color:'#92400e', padding:'1px 6px', borderRadius:'4px' }}>Re-clearance</span>
                    : <span style={{ fontSize:'10px', background:'#dbeafe', color:'#1e40af', padding:'1px 6px', borderRadius:'4px' }}>New</span>}
                </td>
                <td>
                  <div style={{ display:'flex', gap:'4px' }}>
                    <button className="btn btn-xs" style={{ background:'#16a34a', color:'#fff' }}
                      onClick={() => clear(g.portal_ref_no)}>✓ Clear All</button>
                    <button className="btn btn-xs" style={{ background:'#dc2626', color:'#fff' }}
                      onClick={() => setRejectModal({ portal_ref_no: g.portal_ref_no, reason: '' })}>
                      ✗ Reject
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {rejectModal && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.4)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center' }}>
          <div style={{ background:'var(--bg)', borderRadius:'10px', padding:'24px', width:'400px' }}>
            <div style={{ fontWeight:600, marginBottom:'12px' }}>
              Reject — <code style={{ fontSize:'12px' }}>{rejectModal.portal_ref_no}</code>
            </div>
            <div style={{ fontSize:'11px', color:'var(--txt3)', marginBottom:'6px' }}>Rejection reason (required)</div>
            <textarea
              className="fi" style={{ width:'100%', height:'80px', resize:'vertical' }}
              placeholder="Enter reason..."
              value={rejectModal.reason}
              onChange={e => setRejectModal(m => ({ ...m, reason: e.target.value }))}
            />
            <div style={{ display:'flex', gap:'8px', justifyContent:'flex-end', marginTop:'12px' }}>
              <button className="btn" onClick={() => setRejectModal(null)}>Cancel</button>
              <button className="btn btn-xs" style={{ background:'#dc2626', color:'#fff' }} onClick={confirmReject}>
                Confirm Reject
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}