import React, { useState, useEffect } from 'react';
import { GET, PATCH } from '../utils/api'; // ← add PATCH
import { DataTable } from '../components/UIComponents';
import { StatusBadge, CurrentStatusBadge, fmtNum } from '../utils/formatters';
import EditModal from '../components/EditModal';
import { AuthContext } from '../context/AuthContext';
import { useContext } from 'react';

export function AllRecordsPage() {
  const [docs, setDocs] = useState([]);
  const [filter, setFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
 // 1. Add state at top
const [editDoc, setEditDoc] = useState(null);

// Add near top of component (get user from your auth context/localStorage)
  const { authUser } = useContext(AuthContext);
  const isAdminOrSupervisor = ['admin','supervisor'].includes(authUser?.role);

const needsApproval = (d) => 
  (d.status === 'cleared' && !d.cleared_by) || d.status === 'reclearance_requested';

const handleClear = async (portal_ref_no) => {
  await PATCH('/manual/submissions/group_clear', { portal_ref_no });
  loadDocs(filter);
};

const handleReject = async (id) => {
  const reason = window.prompt('Rejection reason (required):');
  if (!reason?.trim()) return alert('Comment is required.');
  await PATCH(`/manual/submissions/${id}/reject`, { reason: reason.trim() });
  loadDocs(filter);
};

const handleReclearance = async (id) => {
  await PATCH(`/manual/submissions/${id}/reclearance`);
  loadDocs(filter);
};

  useEffect(() => { loadDocs(filter); }, [filter]);

  const loadDocs = async (f) => {
    let url = '/documents?limit=200';
    if (['validated', 'duplicate_blocked', 'revalidate'].includes(f)) url += `&status=${f}`;
    const d = await GET(url);
    let all = d?.documents || [];
    if (['pending', 'revalidated', 'expired'].includes(f)) all = all.filter(x => x.current_status === f);
    setDocs(all);
  };

  const filteredDocs = searchQuery 
    ? docs.filter(d => [d.id, d.bl_number, d.portal_ref_no, d.screening_date, d.product].some(v => String(v || '').toLowerCase().includes(searchQuery.toLowerCase())))
    : docs;

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
        <div className="pills">
          <div className={`pill ${filter === '' ? 'on' : ''}`} onClick={() => setFilter('')}>All</div>
          <div className={`pill ${filter === 'validated' ? 'on' : ''}`} onClick={() => setFilter('validated')}>✓ Unique</div>
          <div className={`pill ${filter === 'duplicate_blocked' ? 'on' : ''}`} onClick={() => setFilter('duplicate_blocked')}>⛔ Duplicate</div>
          <div className={`pill ${filter === 'revalidate' ? 'on' : ''}`} onClick={() => setFilter('revalidate')}>⚠ Revalidate</div>
          <div className={`pill ${filter === 'pending' ? 'on' : ''}`} onClick={() => setFilter('pending')}>🕐 Pending</div>
          <div className={`pill ${filter === 'revalidated' ? 'on' : ''}`} onClick={() => setFilter('revalidated')}>✅ Revalidated</div>
          <div className={`pill ${filter === 'expired' ? 'on' : ''}`} onClick={() => setFilter('expired')}>🔴 Expired</div>
        </div>
        <input className="fi" style={{ width: '200px', height: '34px' }} placeholder="Filter…" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
      </div>

      <div className="card">
        <div className="card-hd"><div className="card-t">Records <span style={{ fontSize: '11px', color: 'var(--txt3)', fontWeight: 400 }}>({filteredDocs.length})</span></div></div>
        <DataTable 
          columns={['ID', 'Product', 'BL Number', 'Master', 'Portal Ref', 'Screening Date', 'CCY', 'Amount', 'Doc Status', 'Till Date', 'Current Status', 'Attachments', 'Actions']}
          rows={filteredDocs}
          renderRow={d => (
            <tr key={d.id} style={{ background: d.is_revalidate ? '#fffbeb' : d.is_duplicate ? '#fff5f5' : '' }}>
              <td><code style={{ fontSize: '11px', background: 'var(--bg)', padding: '2px 5px', borderRadius: '4px' }}>{d.id}</code></td>
              <td>{d.product || '—'}</td>
              <td className="mono" style={{ fontSize: '11.5px' }}>{d.bl_number || '—'}</td>
              <td style={{ textAlign: 'center' }}>{d.is_master ? <span style={{ fontSize: '13px', color: '#d97706' }}>True</span> : <span style={{ color: 'var(--txt3)', fontSize: '11px' }}>—</span>}</td>
              <td className="mono" style={{ fontSize: '11px', color: '#b45309' }}>{d.portal_ref_no || '—'}</td>
              <td className="mono" style={{ fontSize: '11px' }}>{d.screening_date || '—'}</td>
              <td className="mono" style={{ fontSize: '11px' }}>{d.dr_ccy || '—'}</td>
              <td className="mono" style={{ fontSize: '11.5px' }}>{fmtNum(d.amount)}</td>
              <td><StatusBadge status={d.status} isReval={d.is_revalidate} /></td>
              <td className="mono" style={{ fontSize: '11px' }}>{d.till_date || '—'}</td>
              <td><CurrentStatusBadge cs={d.current_status} /></td>
              <td style={{ fontSize: '11px' }}>{(d.attachments || []).length > 0 ? <span className="badge b-att">{d.attachments.length} file(s)</span> : '—'}</td>
{/* <td>
  {isAdminOrSupervisor && needsApproval(d) ? (
    <div style={{ display:'flex', gap:'4px' }}>
      <button className="btn btn-xs" style={{ background:'#16a34a', color:'#fff' }}
        onClick={() => handleClear(d.portal_ref_no)}>✓ Clear</button>
      <button className="btn btn-xs" style={{ background:'#dc2626', color:'#fff' }}
        onClick={() => handleReject(d.id)}>✗ Reject</button>
    </div>
  ) : !isAdminOrSupervisor && d.current_status === 'revalidation_required' ? (
    <button className="btn btn-xs" style={{ background:'#d97706', color:'#fff' }}
      onClick={() => handleReclearance(d.id)}>↻ Re-clearance</button>
  ) : d.is_editable ? (
    <button className="btn btn-a btn-xs" onClick={() => setEditDoc(d)}>✎ Edit</button>
  ) : (
    <span style={{ fontSize:'10.5px', color:'var(--txt3)' }}>Locked</span>
  )}
</td> */}
<td>
  {isAdminOrSupervisor && needsApproval ? (
    <div style={{ display:'flex', gap:'4px' }}>
      <button className="btn btn-xs" style={{ background:'#16a34a', color:'#fff' }}
        onClick={() => handleClear(d.portal_ref_no)}>✓ Clear</button>
      <button className="btn btn-xs" style={{ background:'#dc2626', color:'#fff' }}
        onClick={() => handleReject(d.id)}>✗ Reject</button>
    </div>
  ) : (
    <div style={{ display:'flex', gap:'4px' }}>
      {d.is_editable && (
        <button className="btn btn-a btn-xs" onClick={() => setEditDoc(d)}>✎ Edit</button>
      )}
      {d.current_status === 'revalidation_required' && (
        <button className="btn btn-xs" style={{ background:'#d97706', color:'#fff' }}
          onClick={() => handleReclearance(d.id)}>↻ Re-clearance</button>
      )}
      {!d.is_editable && d.current_status !== 'revalidation_required' && (
        <span style={{ fontSize:'10.5px', color:'var(--txt3)' }}>Locked</span>
      )}
    </div>
  )}
</td>
            </tr>
          )}
        />

      </div>
            {editDoc && (
  <EditModal
    doc={editDoc}
    onClose={() => setEditDoc(null)}
    onSaved={async () => {
  setEditDoc(null);
  await loadDocs(filter);
}}
  />
)}
    </>
  );
}
