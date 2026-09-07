import React, { useState, useEffect, useContext, useMemo } from 'react';
import { GET, PATCH } from '../utils/api';
import { StatusBadge, CurrentStatusBadge, fmtNum } from '../utils/formatters';
import EditModal from '../components/EditModal';
import { AuthContext } from '../context/AuthContext';
import { useDebounce } from '../hooks/useDebounce';
import { PaginationBar } from '../components/UIComponents';
import * as XLSX from 'xlsx';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faExclamationTriangle, faCheckCircle, faCheck, faCircle, faBan, faChevronDown, faChevronRight, faEdit, faClock, faPause } from '@fortawesome/free-solid-svg-icons';


import { ClearJustificationModal } from '../components/ClearJustificationModal';

export function AllRecordsPage() {
  const [docs, setDocs] = useState([]);
  const [filter, setFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const debouncedSearchQuery = useDebounce(searchQuery, 500);
  const [editDoc, setEditDoc] = useState(null);
  const [expandedGroups, setExpandedGroups] = useState({});
  const [comments, setComments] = useState({});
  const [editingRef, setEditingRef] = useState(null);
  const [newRefValue, setNewRefValue] = useState('');
  const [misStartDate, setMisStartDate] = useState('');
  const [misEndDate, setMisEndDate] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const [clearModalRef, setClearModalRef] = useState(null);
  const [clearModalOrigRef, setClearModalOrigRef] = useState('');

  const { authUser } = useContext(AuthContext);
  const isAdminOrSupervisor = ['admin','supervisor'].includes(authUser?.role);

  useEffect(() => { loadDocs(filter); }, [filter]);

  const loadDocs = async (f) => {
    let url = '/documents?limit=500';
    if (['validated', 'duplicate_blocked', 'revalidate', 'hold', 'hit', 'rejected', 'cleared'].includes(f)) url += `&status=${f}`;
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

  const filteredDocs = docs.filter(d => {
    if (misStartDate && d.screening_date && d.screening_date < misStartDate) return false;
    if (misEndDate && d.screening_date && d.screening_date > misEndDate) return false;
    if (!debouncedSearchQuery) return true;
    const q = debouncedSearchQuery.toLowerCase();
    return d.bl_number.toLowerCase().includes(q) || d.portal_ref_no?.toLowerCase().includes(q) || d.product?.toLowerCase().includes(q);
  });

  // Group by Ref No
  const groups = {};
  filteredDocs.forEach(d => {
    const ref = d.portal_ref_no || 'unknown';
    if (!groups[ref]) groups[ref] = { ref_no: ref, docs: [], statuses: new Set(), currentStatuses: new Set() };
    groups[ref].docs.push(d);
    if (d.status) groups[ref].statuses.add(d.status);
    if (d.current_status) groups[ref].currentStatuses.add(d.current_status);
  });

  const toggleGroup = (ref) => {
    setExpandedGroups(prev => ({ ...prev, [ref]: !prev[ref] }));
  };

  const handleHold = async (ref) => {
    await PATCH('/manual/submissions/group_hold', { portal_ref_no: ref, comments: comments[ref] || '' });
    loadDocs(filter);
  };

  const handleClearUserClick = (g) => {
    const dupDoc = g.docs.find(d => d.is_duplicate || d.status === 'duplicate_blocked');
    if (dupDoc) {
      const origRef = dupDoc?.duplicate_info?.original_portal_ref || 
                      dupDoc?.duplicate_info?.matched_values?.portal_ref_no || 
                      dupDoc?.duplicate_info?.extra?.original_portal_ref ||
                      dupDoc?.original_record?.portal_ref_no || '';
      setClearModalOrigRef(origRef);
      setClearModalRef(g.ref_no);
    } else {
      handleClearUser(g.ref_no, comments[g.ref_no] || '');
    }
  };

  const handleClearUser = async (ref, c) => {
    await PATCH('/manual/submissions/group_clear_user', { portal_ref_no: ref, comments: c || '' });
    loadDocs(filter);
  };

  const handleModalConfirmClear = async (payload) => {
    await PATCH('/manual/submissions/group_clear_user', payload);
    setClearModalRef(null);
    setClearModalOrigRef('');
    loadDocs(filter);
  };

  const handleRevalidateUser = async (ref) => {
    await PATCH('/manual/submissions/group_revalidate', { portal_ref_no: ref, comments: comments[ref] || '' });
    loadDocs(filter);
  };

  const handleCommentChange = (ref_no, val) => {
    setComments(prev => ({ ...prev, [ref_no]: val }));
  };

  const saveRef = async (oldRef) => {
    if (!newRefValue.trim() || newRefValue.trim() === oldRef) {
      setEditingRef(null);
      return;
    }
    await PATCH('/manual/submissions/group_edit_ref', { old_ref_no: oldRef, new_ref_no: newRefValue.trim() });
    setEditingRef(null);
    loadDocs();
  };

  const saveComment = async (ref_no) => {
    await PATCH('/manual/submissions/group_comment', { portal_ref_no: ref_no, comments: comments[ref_no] || '' });
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

  const exportToExcel = () => {
    const exportData = filteredDocs.map(d => {
      const staffName = authUser?.name || d.uploaded_by || '';
      let statusStr = d.current_status || d.status || '';
      if (d.status === 'duplicate_blocked') statusStr = 'duplication';
      if (d.status === 'revalidate') statusStr = 'revalidation';
      
      const remarks = comments[d.portal_ref_no] || d.comments || '';
      if (remarks) statusStr += ` - ${remarks}`;

      return {
        'Date': d.screening_date || d.upload_time?.split('T')[0] || '',
        'BL/AWB': d.product || '',
        'Number': d.bl_number || '',
        'Company': '',
        'CCY': d.dr_ccy || '',
        'Amount': d.amount || 0,
        'Ref#': d.portal_ref_no || '',
        'Staff 1 (Initiator)': d.uploaded_by || '',
        'Staff 2 (Editor)': d.last_edited_by || '',
        'Status': statusStr
      };
    });

    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Records");
    XLSX.writeFile(workbook, `BL_Export_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const allGroupsList = useMemo(() => Object.values(groups), [filteredDocs]);
  const totalGroupItems = allGroupsList.length;
  const paginatedGroupsList = useMemo(() => {
    if (pageSize === 'all') return allGroupsList;
    const start = (currentPage - 1) * pageSize;
    return allGroupsList.slice(start, start + pageSize);
  }, [allGroupsList, currentPage, pageSize]);

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
        <div className="pills" style={{ flexWrap: 'wrap' }}>
          <div className={`pill ${filter === '' ? 'on' : ''}`} onClick={() => setFilter('')}>All</div>
          <div className={`pill ${filter === 'cleared' ? 'on' : ''}`} onClick={() => setFilter('cleared')}><FontAwesomeIcon icon={faCheck} /> Cleared</div>
          <div className={`pill ${filter === 'validated' ? 'on' : ''}`} onClick={() => setFilter('validated')}><FontAwesomeIcon icon={faCheck} /> Unique</div>
          <div className={`pill ${filter === 'duplicate_blocked' ? 'on' : ''}`} onClick={() => setFilter('duplicate_blocked')}><FontAwesomeIcon icon={faBan} /> Duplicate</div>
          <div className={`pill ${filter === 'revalidate' ? 'on' : ''}`} onClick={() => setFilter('revalidate')}><FontAwesomeIcon icon={faExclamationTriangle} /> Revalidate</div>
          <div className={`pill ${filter === 'hold' ? 'on' : ''}`} onClick={() => setFilter('hold')}><FontAwesomeIcon icon={faPause} /> Hold</div>
          <div className={`pill ${filter === 'hit' ? 'on' : ''}`} onClick={() => setFilter('hit')}>Hit</div>
          <div className={`pill ${filter === 'rejected' ? 'on' : ''}`} onClick={() => setFilter('rejected')}>Rejected</div>
          <div className={`pill ${filter === 'pending' ? 'on' : ''}`} onClick={() => setFilter('pending')}><FontAwesomeIcon icon={faClock} /> Pending</div>
          <div className={`pill ${filter === 'revalidated' ? 'on' : ''}`} onClick={() => setFilter('revalidated')}><FontAwesomeIcon icon={faCheckCircle} /> Revalidated</div>
          <div className={`pill ${filter === 'expired' ? 'on' : ''}`} onClick={() => setFilter('expired')}><FontAwesomeIcon icon={faCircle} /> Expired</div>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button className="btn btn-g btn-sm" onClick={exportToExcel} style={{ height: '34px' }}>Export to Excel</button>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <label style={{ fontSize: '11px', color: 'var(--txt2)' }}>From:</label>
            <input type="date" className="fi" style={{ height: '34px' }} value={misStartDate} onChange={e => setMisStartDate(e.target.value)} />
            <label style={{ fontSize: '11px', color: 'var(--txt2)', marginLeft: '4px' }}>To:</label>
            <input type="date" className="fi" style={{ height: '34px' }} value={misEndDate} onChange={e => setMisEndDate(e.target.value)} />
          </div>
          <input className="fi" style={{ width: '200px', height: '34px' }} placeholder="Search Reference, BL..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
        </div>
      </div>

      <div className="card">
        <div className="card-hd"><div className="card-t">Grouped Records <span style={{ fontSize: '11px', color: 'var(--txt3)', fontWeight: 400 }}>({totalGroupItems} groups)</span></div></div>
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
            {paginatedGroupsList.map(g => (
              <React.Fragment key={g.ref_no}>
                <tr style={{ borderBottom: expandedGroups[g.ref_no] ? 'none' : '1px solid var(--brd)', background: '#fafafa' }}>
                  <td style={{ padding: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <button className="btn btn-xs" onClick={() => toggleGroup(g.ref_no)} style={{ padding: '2px 6px' }}>
                        {expandedGroups[g.ref_no] ? <FontAwesomeIcon icon={faChevronDown} /> : <FontAwesomeIcon icon={faChevronRight} />}
                      </button>
                      {editingRef === g.ref_no ? (
                        <div style={{ display: 'flex', gap: '4px' }}>
                          <input 
                            className="fi" 
                            style={{ height: '24px', fontSize: '11px', width: '150px' }} 
                            value={newRefValue} 
                            onChange={e => setNewRefValue(e.target.value)} 
                            onKeyDown={e => e.key === 'Enter' && saveRef(g.ref_no)} 
                            autoFocus
                          />
                          <button className="btn btn-xs btn-p" onClick={() => saveRef(g.ref_no)}>Save</button>
                          <button className="btn btn-xs" onClick={() => setEditingRef(null)}>Cancel</button>
                        </div>
                      ) : (
                        <>
                          <code style={{ fontSize: '12px', fontWeight: 600 }}>{g.ref_no}</code>
                          <button className="btn btn-xs" style={{ background: 'transparent', border: 'none', color: 'var(--txt3)', cursor: 'pointer', padding: '0 4px', fontSize: '13px' }} onClick={() => { setEditingRef(g.ref_no); setNewRefValue(g.ref_no); }}>
                            <FontAwesomeIcon icon={faEdit} />
                          </button>
                        </>
                      )}
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
                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
                      {(() => {
                        const dupDoc = g.docs.find(d => d.is_duplicate || d.status === 'duplicate_blocked');
                        const revalDoc = g.docs.find(d => d.is_revalidate || d.status === 'revalidate' || d.current_status === 'revalidated');
                        const holdDoc = g.docs.find(d => d.status === 'hold' || d.current_status === 'hold');

                        let grpStatus = 'cleared';
                        if (dupDoc) grpStatus = 'duplicate_blocked';
                        else if (holdDoc) grpStatus = 'hold';
                        else if (revalDoc) grpStatus = 'revalidated';

                        const origRef = dupDoc?.duplicate_info?.original_portal_ref || 
                                        dupDoc?.duplicate_info?.matched_values?.portal_ref_no || 
                                        dupDoc?.duplicate_info?.extra?.original_portal_ref ||
                                        dupDoc?.original_record?.portal_ref_no;

                        return (
                          <>
                            {grpStatus === 'duplicate_blocked' && <StatusBadge status="duplicate_blocked" />}
                            {grpStatus === 'hold' && <StatusBadge status="hold" />}
                            {grpStatus === 'revalidated' && <CurrentStatusBadge cs="revalidated" />}
                            {grpStatus === 'cleared' && <StatusBadge status="cleared" />}
                            
                            {grpStatus === 'duplicate_blocked' && origRef && (
                              <span className="badge b-err" style={{ fontSize: '10.5px', background: '#fee2e2', color: '#991b1b', border: '1px solid #fca5a5' }}>
                                Duplicate of {origRef}
                              </span>
                            )}
                          </>
                        );
                      })()}
                    </div>
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: '4px' }}>
                      <button className="btn btn-xs" style={{ background: '#f59e0b', color: '#fff' }} onClick={() => handleHold(g.ref_no)}>
                        Hold
                      </button>
                      <button className="btn btn-xs" style={{ background: '#d97706', color: '#fff' }} onClick={() => handleRevalidateUser(g.ref_no)}>
                        Revalidate
                      </button>
                      <button className="btn btn-xs" style={{ background: '#10b981', color: '#fff' }} onClick={() => handleClearUserClick(g)}>
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
                              <th style={{ textAlign: 'left' }}>Staff</th>
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
                                <td style={{ fontSize: '9.5px', lineHeight: '1.3' }}>
                                  <div style={{ color: 'var(--txt2)' }}>Init: {d.uploaded_by || '—'}</div>
                                  <div style={{ color: 'var(--txt3)' }}>Edit: {d.last_edited_by || '—'}</div>
                                </td>
                                <td>
                                  <StatusBadge status={d.status} isReval={d.is_revalidate} />
                                  {(() => {
                                    const origRef = d?.duplicate_info?.original_portal_ref || 
                                                    d?.duplicate_info?.matched_values?.portal_ref_no || 
                                                    d?.duplicate_info?.extra?.original_portal_ref ||
                                                    d?.original_record?.portal_ref_no;
                                    return origRef ? (
                                      <div style={{ fontSize: '9.5px', color: '#dc2626', fontWeight: 600, marginTop: '2px' }}>
                                        Duplicate of {origRef}
                                      </div>
                                    ) : null;
                                  })()}
                                </td>
                                <td><CurrentStatusBadge cs={d.current_status} /></td>
                                <td>
                                  <div style={{ display:'flex', gap:'4px' }}>
                                    {d.is_editable && (
                                      <>
                                        <button className="btn btn-a btn-xs" onClick={() => setEditDoc(d)}><FontAwesomeIcon icon={faEdit} /> Edit</button>
                                        <button className="btn btn-xs" style={{ background: '#ef4444', color: '#fff' }} onClick={() => handleDelete(d.id)}>✕ Delete</button>
                                      </>
                                    )}
                                    {d.status === 'duplicate_blocked' && (
                                      <>
                                        <button className="btn btn-xs" style={{ background: '#3b82f6', color: '#fff' }} onClick={() => handleMarkPartial(d.id)}>Mark Partial</button>
                                        <button className="btn btn-xs" style={{ background: '#ef4444', color: '#fff' }} onClick={() => handleDelete(d.id)}>✕ Delete</button>
                                      </>
                                    )}
                                    {(d.current_status === 'revalidated' || d.current_status === 'revalidation_required') && (
                                      <button className="btn btn-xs" style={{ background:'#d97706', color:'#fff' }}
                                        onClick={() => handleReclearance(d.id)}>↻ Re-clearance</button>
                                    )}
                                    {!d.is_editable && d.status !== 'duplicate_blocked' && d.current_status !== 'revalidated' && d.current_status !== 'revalidation_required' && (
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
        <PaginationBar
          currentPage={currentPage}
          totalItems={totalGroupItems}
          pageSize={pageSize}
          onPageChange={setCurrentPage}
          onPageSizeChange={(newSize) => {
            setPageSize(newSize);
            setCurrentPage(1);
          }}
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
      {clearModalRef && (
        <ClearJustificationModal
          refNo={clearModalRef}
          origRef={clearModalOrigRef}
          onClose={() => setClearModalRef(null)}
          onConfirm={handleModalConfirmClear}
        />
      )}
    </>
  );
}
