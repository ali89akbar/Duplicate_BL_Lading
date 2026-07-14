import React, { useState, useEffect, useContext } from 'react';
import { GET, PATCH } from '../utils/api';
import { StatusBadge, CurrentStatusBadge, fmtNum } from '../utils/formatters';
import EditModal from '../components/EditModal';
import { AuthContext } from '../context/AuthContext';

export function AllRecordsPage() {
  const [docs, setDocs] = useState([]);
  const [filter, setFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [editDoc, setEditDoc] = useState(null);
  const [expandedGroups, setExpandedGroups] = useState({});
  const [comments, setComments] = useState({});

  const { authUser } = useContext(AuthContext);
  const isAdminOrSupervisor = ['admin','supervisor'].includes(authUser?.role);

  useEffect(() => { loadDocs(filter); }, [filter]);

  const loadDocs = async (f) => {
    let url = '/documents?limit=500';
    if (['validated', 'duplicate_blocked', 'revalidate'].includes(f)) url += `&status=${f}`;
    const d = await GET(url);
    let all = d?.documents || [];
    if (['pending', 'revalidated', 'expired'].includes(f)) all = all.filter(x => x.current_status === f);
    setDocs(all);
    
    // Initialize comments state based on loaded docs
    const newComments = {};
    all.forEach(doc => {
      const ref = doc.portal_ref_no || 'unknown';
      if (!newComments[ref] && doc.comments) {
        newComments[ref] = doc.comments;
      }
    });
    setComments(prev => ({ ...prev, ...newComments }));
  };

  const filteredDocs = searchQuery 
    ? docs.filter(d => [d.id, d.bl_number, d.portal_ref_no, d.screening_date, d.product].some(v => String(v || '').toLowerCase().includes(searchQuery.toLowerCase())))
    : docs;

  // Group by Ref No
  const groups = {};
  filteredDocs.forEach(d => {
    const ref = d.portal_ref_no || 'unknown';
    if (!groups[ref]) groups[ref] = { ref_no: ref, docs: [], isHold: false, isPending: false };
    groups[ref].docs.push(d);
    if (d.status === 'hold') groups[ref].isHold = true;
    if (d.status === 'pending_approval') groups[ref].isPending = true;
  });

  const toggleGroup = (ref) => {
    setExpandedGroups(prev => ({ ...prev, [ref]: !prev[ref] }));
  };

  const handleHold = async (ref) => {
    await PATCH('/manual/submissions/group_hold', { portal_ref_no: ref, comments: comments[ref] || '' });
    loadDocs(filter);
  };

  const handleClearUser = async (ref) => {
    await PATCH('/manual/submissions/group_clear_user', { portal_ref_no: ref, comments: comments[ref] || '' });
    loadDocs(filter);
  };

  const handleCommentChange = (ref, val) => {
    setComments(prev => ({ ...prev, [ref]: val }));
  };

  const saveComment = async (ref) => {
    await PATCH('/manual/submissions/group_comment', { portal_ref_no: ref, comments: comments[ref] || '' });
    loadDocs(filter);
  };

  // For individual BL reclearance
  const handleReclearance = async (id) => {
    await PATCH(`/manual/submissions/${id}/reclearance`);
    loadDocs(filter);
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this BL record?')) return;
    try {
      await fetch(`/api/manual/submissions/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });
      loadDocs(filter);
    } catch (e) {
      console.error(e);
      alert('Error deleting record');
    }
  };

  const handleMarkPartial = async (id) => {
    if (!window.confirm('Mark this record as a Partial Payment to unblock it?')) return;
    try {
      await PATCH(`/manual/submissions/${id}/mark_partial`);
      loadDocs(filter);
    } catch (e) {
      console.error(e);
      alert('Error marking as partial');
    }
  };

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
        <div className="card-hd"><div className="card-t">Grouped Records <span style={{ fontSize: '11px', color: 'var(--txt3)', fontWeight: 400 }}>({Object.keys(groups).length} groups)</span></div></div>
        <table style={{ width: '100%', fontSize: '12px' }}>
          <thead>
            <tr style={{ color: 'var(--txt3)', borderBottom: '1px solid var(--brd)', textAlign: 'left' }}>
              <th style={{ padding: '8px' }}>Ref No / Comment</th>
              <th>BL Count</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {Object.values(groups).map(g => (
              <React.Fragment key={g.ref_no}>
                <tr style={{ borderBottom: expandedGroups[g.ref_no] ? 'none' : '1px solid var(--brd)', background: '#fafafa' }}>
                  <td style={{ padding: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <button className="btn btn-xs" onClick={() => toggleGroup(g.ref_no)} style={{ padding: '2px 6px' }}>
                        {expandedGroups[g.ref_no] ? '▼' : '▶'}
                      </button>
                      <code style={{ fontSize: '12px', fontWeight: 600 }}>{g.ref_no}</code>
                    </div>
                    <div style={{ marginTop: '6px', marginLeft: '32px', display: 'flex', gap: '4px' }}>
                      <input 
                        type="text" 
                        className="fi" 
                        placeholder="Internal Comments..." 
                        style={{ width: '250px', height: '26px', fontSize: '11px' }}
                        value={comments[g.ref_no] || ''}
                        onChange={(e) => handleCommentChange(g.ref_no, e.target.value)}
                        onBlur={() => saveComment(g.ref_no)}
                      />
                    </div>
                  </td>
                  <td style={{ fontWeight: 500 }}>{g.docs.length} BL(s)</td>
                  <td>
                    {g.isHold && <span className="badge" style={{ background: '#fef3c7', color: '#b45309' }}>Hold</span>}
                    {g.isPending && <span className="badge" style={{ background: '#dbeafe', color: '#1e40af' }}>Pending Approval</span>}
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: '4px' }}>
                      <button className="btn btn-xs" style={{ background: '#f59e0b', color: '#fff' }} onClick={() => handleHold(g.ref_no)}>
                        Hold
                      </button>
                      <button className="btn btn-xs" style={{ background: '#10b981', color: '#fff' }} onClick={() => handleClearUser(g.ref_no)}>
                        Clear
                      </button>
                    </div>
                  </td>
                </tr>
                {expandedGroups[g.ref_no] && (
                  <tr>
                    <td colSpan="4" style={{ padding: 0 }}>
                      <div style={{ padding: '10px 10px 10px 40px', borderBottom: '1px solid var(--brd)', background: '#fff' }}>
                        <table style={{ width: '100%', fontSize: '11px' }}>
                          <thead>
                            <tr style={{ color: 'var(--txt3)' }}>
                              <th style={{ textAlign: 'left', paddingBottom: '4px' }}>ID</th>
                              <th style={{ textAlign: 'left' }}>BL Number</th>
                              <th style={{ textAlign: 'left' }}>Amount</th>
                              <th style={{ textAlign: 'left' }}>Doc Status</th>
                              <th style={{ textAlign: 'left' }}>Current Status</th>
                              <th style={{ textAlign: 'left' }}>Actions</th>
                            </tr>
                          </thead>
                          <tbody>
                            {g.docs.map(d => (
                              <tr key={d.id} style={{ borderTop: '1px solid #f0f0f0' }}>
                                <td style={{ padding: '6px 0' }}><code style={{ background: 'var(--bg)', padding: '2px 4px', borderRadius: '4px' }}>{d.id}</code></td>
                                <td className="mono">{d.bl_number} {d.is_master && <span style={{ color: '#d97706' }}>(Master)</span>}</td>
                                <td className="mono">{d.dr_ccy} {fmtNum(d.amount)}</td>
                                <td><StatusBadge status={d.status} isReval={d.is_revalidate} /></td>
                                <td><CurrentStatusBadge cs={d.current_status} /></td>
                                <td>
                                  <div style={{ display:'flex', gap:'4px' }}>
                                    {d.is_editable && (
                                      <>
                                        <button className="btn btn-a btn-xs" onClick={() => setEditDoc(d)}>✎ Edit</button>
                                        <button className="btn btn-xs" style={{ background: '#ef4444', color: '#fff' }} onClick={() => handleDelete(d.id)}>✕ Delete</button>
                                      </>
                                    )}
                                    {d.status === 'duplicate_blocked' && (
                                      <>
                                        <button className="btn btn-xs" style={{ background: '#3b82f6', color: '#fff' }} onClick={() => handleMarkPartial(d.id)}>Mark Partial</button>
                                        <button className="btn btn-xs" style={{ background: '#ef4444', color: '#fff' }} onClick={() => handleDelete(d.id)}>✕ Delete</button>
                                      </>
                                    )}
                                    {d.current_status === 'revalidation_required' && (
                                      <button className="btn btn-xs" style={{ background:'#d97706', color:'#fff' }}
                                        onClick={() => handleReclearance(d.id)}>↻ Re-clearance</button>
                                    )}
                                    {!d.is_editable && d.status !== 'duplicate_blocked' && d.current_status !== 'revalidation_required' && (
                                      <span style={{ fontSize:'10px', color:'var(--txt3)' }}>Locked</span>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}
          </tbody>
        </table>
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
