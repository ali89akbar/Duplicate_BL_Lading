import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { GET, PATCH } from '../utils/api';
import { StatusBadge, CurrentStatusBadge, fmtNum } from '../utils/formatters';
import { DataTable, PaginationBar } from '../components/UIComponents';
import { useDebounce } from '../hooks/useDebounce';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faTrophy, faChevronDown, faChevronRight, faEdit, faBan, faShieldAlt, faHistory } from '@fortawesome/free-solid-svg-icons';
import { ClearJustificationModal } from '../components/ClearJustificationModal';


/*  helpers  */

const SEVERITY_CLASS = {
  HIGH:   'b-err',
  MEDIUM: 'b-warn',
};

const DTYPE_CLASS = {
  EXACT:           'b-err',
  FUZZY:           'b-warn',
  REVALIDATE:      'b-info',
  AMOUNT_VELOCITY: 'b-teal',
};

const DTYPE_LABEL = {
  EXACT:           'Exact',
  FUZZY:           'Fuzzy',
  REVALIDATE:      'Revalidate',
  AMOUNT_VELOCITY: 'Amt‑Velocity',
};

function DupeTypeBadge({ value }) {
  const cls  = DTYPE_CLASS[value]  ?? 'b-neu';
  const lbl  = DTYPE_LABEL[value]  ?? value;
  return <span className={`badge ${cls}`}>{lbl}</span>;
}

function SeverityBadge({ value }) {
  const cls = SEVERITY_CLASS[value] ?? 'b-neu';
  return <span className={`badge ${cls}`}>{value}</span>;
}

function fmtDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return isNaN(d) ? iso : d.toLocaleString();
}

/* ─── filter pills config  */

const PILLS = [
  { key: 'all',        label: 'All' },
  { key: 'revalidate', label: 'Revalidation' },
  { key: 'cleared',    label: 'Clear' },
  { key: 'hold',       label: 'Hold' },
];

function matchesPill(log, pill) {
  if (pill === 'all')        return true;
  if (pill === 'revalidate') return log.duplicate_type === 'REVALIDATE' || log.status === 'revalidate' || log.current_status === 'revalidated';
  if (pill === 'cleared')    return log.status === 'cleared' || log.current_status === 'cleared';
  if (pill === 'hold')       return log.status === 'hold' || log.current_status === 'hold';
  return true;
}

/* ─── stat card */

function StatCard({ label, value, colorClass, loading }) {
  return (
    <div className={`stat ${colorClass}`}>
      <span className="stat-val">{loading ? '…' : fmtNum(value ?? 0)}</span>
      <span className="stat-lbl">{label}</span>
    </div>
  );
}

/*  main component  */

export function DuplicatesPage() {
  const [stats,      setStats]      = useState(null);
  const [logs,       setLogs]       = useState([]);
  const [dupDocs,    setDupDocs]    = useState([]);
  const [expandedGroups, setExpandedGroups] = useState({});
  const [editingRef, setEditingRef] = useState(null);
  const [newRefValue, setNewRefValue] = useState('');
  const [misStartDate, setMisStartDate] = useState('');
  const [misEndDate, setMisEndDate] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [sec1CurrentPage, setSec1CurrentPage] = useState(1);
  const [sec1PageSize, setSec1PageSize] = useState(10);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState(null);
  const [activePill, setActivePill] = useState('all');
  const [rejecting,  setRejecting]  = useState({});   // { [doc_id]: bool }
  const [clearModalRef, setClearModalRef] = useState(null);
  const [clearModalOrigRef, setClearModalOrigRef] = useState('');

  const handleClearUserClick = (g) => {
    const dupDoc = g.bls.find(d => d.is_duplicate || d.status === 'duplicate_blocked');
    const origRef = dupDoc?.duplicate_info?.original_portal_ref || 
                    dupDoc?.duplicate_info?.matched_values?.portal_ref_no || 
                    dupDoc?.duplicate_info?.extra?.original_portal_ref ||
                    dupDoc?.original_record?.portal_ref_no || '';
    setClearModalOrigRef(origRef);
    setClearModalRef(g.portal_ref_no);
  };

  const handleModalConfirmClear = async (payload) => {
    await PATCH('/manual/submissions/group_clear_user', payload);
    setClearModalRef(null);
    setClearModalOrigRef('');
    fetchAll();
  };

  const toggleGroup = (ref_no) => setExpandedGroups(p => ({ ...p, [ref_no]: !p[ref_no] }));

  const saveRef = async (oldRef) => {
    if (!newRefValue.trim() || newRefValue.trim() === oldRef) {
      setEditingRef(null);
      return;
    }
    await PATCH('/manual/submissions/group_edit_ref', { old_ref_no: oldRef, new_ref_no: newRefValue.trim() });
    setEditingRef(null);
    fetchAll();
  };
  
  /* ── fetch ── */
const fetchAll = useCallback(async () => {
  setLoading(true);
  setError(null);
  try {
    const res = await GET('/duplicates/documents');
    if (res) {
      if (res.stats) setStats(res.stats);
      if (res.logs) setLogs(res.logs);
      if (res.groups) setDupDocs(res.groups);
    }
  } catch (err) {
    setError(err?.message ?? 'Failed to load.');
  } finally {
    setLoading(false);
  }
}, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  /* ── reject action ── */
async function handleReject(doc_id) {
  const reason = window.prompt(`Reason for rejecting ${doc_id}:`);
  if (reason === null) return;
  setRejecting(prev => ({ ...prev, [doc_id]: true }));
  try {
    const res = await PATCH(`/manual/submissions/${doc_id}/reject`, { 
      reason: reason.trim() || 'Rejected via Duplicates page' 
    });
    if (res?.error) throw new Error(res.error);
    await fetchAll();
  } catch (err) {
    alert(`Reject failed: ${err.message}`);
    } finally {
      setRejecting(prev => ({ ...prev, [doc_id]: false }));
    }
  }

  const handleMarkPartial = async (id) => {
    if (!window.confirm('Mark this record as a Partial Payment to unblock it?')) return;
    try {
      await PATCH(`/manual/submissions/${id}/mark_partial`);
      fetchAll();
    } catch (e) {
      console.error(e);
      alert('Error marking as partial');
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this BL record?')) return;
    try {
      await fetch(`/api/manual/submissions/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });
      fetchAll();
    } catch (e) {
      console.error(e);
      alert('Error deleting record');
    }
  };/* ── filtered rows ── */
  const filtered = logs.filter(l => matchesPill(l, activePill));

  const columnHeaders = [
    'ID', 'Document ID', 'BL Number', 'Doc Type', 'Duplicate Type', 
    'Severity', 'Detected At', 'Matched On', 'Uploaded By', 'Action'
  ];

  const renderRow = (row) => (
    <tr key={row.id ?? row.doc_id}>
      <td><span className="mono text-muted">{row.id}</span></td>
      <td><span className="mono">{row.doc_id ?? '—'}</span></td>
      <td>{row.bl_number ?? '—'}</td>
      <td>{row.document_type ?? '—'}</td>
      <td><DupeTypeBadge value={row.duplicate_type} /></td>
      <td><SeverityBadge value={row.severity} /></td>
      <td>{fmtDate(row.detected_at)}</td>
      <td>
        <span title={Array.isArray(row.matched_values) ? row.matched_values.join(', ') : (row.matched_values ?? row.matched_on ?? '—')}>
          {row.matched_on ?? (Array.isArray(row.matched_values) ? row.matched_values.join(', ') : (row.matched_values ?? '—'))}
        </span>
      </td>
      <td>{row.uploaded_by ?? '—'}</td>
      <td>
        <button
          className="btn btn-xs btn-g"
          onClick={() => handleReject(row.doc_id)}
          disabled={!!rejecting[row.doc_id]}
          style={{ background: 'var(--err, #ef4444)', color: '#fff', borderColor: 'transparent' }}
        >
          {rejecting[row.doc_id] ? 'Rejecting…' : 'Reject'}
        </button>
      </td>
    </tr>
  );

  const filteredDupDocs = dupDocs.filter(g => {
    if (misStartDate && g.screening_date && g.screening_date < misStartDate) return false;
    if (misEndDate && g.screening_date && g.screening_date > misEndDate) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const matchRef = g.portal_ref_no?.toLowerCase().includes(q);
      const matchBl = g.bls.some(b => b.bl_number.toLowerCase().includes(q));
      if (!matchRef && !matchBl) return false;
    }
    if (activePill === 'revalidate') {
      const hasReval = g.bls.some(b => b.status === 'revalidate' || b.current_status === 'revalidated' || b.is_revalidate);
      if (!hasReval) return false;
    }
    if (activePill === 'cleared') {
      const hasClear = g.bls.some(b => b.status === 'cleared' || b.current_status === 'cleared');
      if (!hasClear) return false;
    }
    if (activePill === 'hold') {
      const hasHold = g.bls.some(b => b.status === 'hold' || b.current_status === 'hold');
      if (!hasHold) return false;
    }
    return true;
  }, [dupDocs, misStartDate, misEndDate, searchQuery, activePill]);

  const totalSec1Items = filteredDupDocs.length;
  const paginatedDupDocs = useMemo(() => {
    if (sec1PageSize === 'all') return filteredDupDocs;
    const start = (sec1CurrentPage - 1) * sec1PageSize;
    return filteredDupDocs.slice(start, start + sec1PageSize);
  }, [filteredDupDocs, sec1CurrentPage, sec1PageSize]);

  /* ── render ── */
  return (
    <div className="page-content">
      {/* ── stat cards ── */}
      <div className="stats-row" style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginBottom: '1.25rem' }}>
        <StatCard label="Total Detected"  value={stats?.total}     colorClass="bl" loading={loading} />
        {/* <StatCard label="Exact Matches"   value={stats?.exact}     colorClass="rd" loading={loading} />
        <StatCard label="Fuzzy Matches"   value={stats?.fuzzy}     colorClass="am" loading={loading} />*/}
        <StatCard label="Revalidates"     value={stats?.revalidate} colorClass="tl" loading={loading} /> 
        <StatCard label="High Severity"   value={stats?.high}      colorClass="pu" loading={loading} />
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginBottom: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <label style={{ fontSize: '11px', color: 'var(--txt2)' }}>From:</label>
          <input type="date" className="fi" style={{ height: '34px' }} value={misStartDate} onChange={e => setMisStartDate(e.target.value)} />
          <label style={{ fontSize: '11px', color: 'var(--txt2)', marginLeft: '4px' }}>To:</label>
          <input type="date" className="fi" style={{ height: '34px' }} value={misEndDate} onChange={e => setMisEndDate(e.target.value)} />
        </div>
        <input className="fi" style={{ width: '220px', height: '34px' }} placeholder="Search Reference, BL..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
      </div>

      <div className="card" style={{ marginBottom: '24px', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
        <div className="card-hd" style={{ padding: '14px 16px', borderBottom: '1px solid var(--brd)' }}>
          <span className="card-t" style={{ fontSize: '14px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <FontAwesomeIcon icon={faBan} style={{ color: '#ef4444' }} />
            Section 1 — Active Duplicate Blocked Records
            <span style={{ fontSize: '11px', color: 'var(--txt3)', fontWeight: 400, marginLeft: '6px' }}>({totalSec1Items} active groups pending review)</span>
          </span>
        </div>
        <div className="card-b" style={{ padding: 0 }}>
          {filteredDupDocs.length === 0 ? (
            <div style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--txt3)', fontSize: '13px' }}>
              No active duplicate blocked records found for the selected filters.
            </div>
          ) : (
            <>
            <table style={{ width: '100%', fontSize: '12px', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ color: 'var(--txt3)', borderBottom: '1px solid var(--brd)', textAlign: 'left', background: 'var(--bg)' }}>
                  <th style={{ padding: '12px 16px' }}>Portal Ref No</th>
                  <th style={{ padding: '12px 16px' }}>BL Count</th>
                  <th style={{ padding: '12px 16px' }}>Uploaded By</th>
                  <th style={{ padding: '12px 16px' }}>Date</th>
                  <th style={{ padding: '12px 16px' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {paginatedDupDocs.map(g => {
                  const dupDoc = g.bls.find(d => d.is_duplicate || d.status === 'duplicate_blocked');
                  const origRef = dupDoc?.duplicate_info?.original_portal_ref || 
                                  dupDoc?.duplicate_info?.matched_values?.portal_ref_no || 
                                  dupDoc?.duplicate_info?.extra?.original_portal_ref ||
                                  dupDoc?.original_record?.portal_ref_no;

                  return (
                  <React.Fragment key={g.portal_ref_no}>
                    <tr style={{ borderBottom: expandedGroups[g.portal_ref_no] ? 'none' : '1px solid var(--brd)', background: '#fff5f5' }}>
                      <td style={{ padding: '12px 16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                          <button className="btn btn-xs" onClick={() => toggleGroup(g.portal_ref_no)} style={{ padding: '4px 8px' }}>
                            {expandedGroups[g.portal_ref_no] ? <FontAwesomeIcon icon={faChevronDown} /> : <FontAwesomeIcon icon={faChevronRight} />}
                          </button>
                        {editingRef === g.portal_ref_no ? (
                          <div style={{ display: 'flex', gap: '4px' }}>
                            <input 
                              className="fi" 
                              style={{ height: '24px', fontSize: '11px', width: '150px' }} 
                              value={newRefValue} 
                              onChange={e => setNewRefValue(e.target.value)} 
                              onKeyDown={e => e.key === 'Enter' && saveRef(g.portal_ref_no)} 
                              autoFocus
                            />
                            <button className="btn btn-xs btn-p" onClick={() => saveRef(g.portal_ref_no)}>Save</button>
                            <button className="btn btn-xs" onClick={() => setEditingRef(null)}>Cancel</button>
                          </div>
                        ) : (
                          <>
                            <code style={{ fontSize: '12px', fontWeight: 600, color: '#b45309' }}>{g.portal_ref_no}</code>
                            <button className="btn btn-xs" style={{ background: 'transparent', border: 'none', color: 'var(--txt3)', cursor: 'pointer', padding: '0 4px', fontSize: '13px' }} onClick={() => { setEditingRef(g.portal_ref_no); setNewRefValue(g.portal_ref_no); }}>
                              <FontAwesomeIcon icon={faEdit} />
                            </button>
                            {origRef && (
                              <span className="badge b-err" style={{ fontSize: '10.5px', background: '#fee2e2', color: '#991b1b', border: '1px solid #fca5a5' }}>
                                Duplicate of {origRef}
                              </span>
                            )}
                          </>
                        )}
                      </div>
                      </td>
                      <td style={{ padding: '12px 16px', fontWeight: 500 }}>{g.bls.length} BL(s)</td>
                      <td style={{ padding: '12px 16px', fontSize: '11px' }}>{g.uploaded_by}</td>
                      <td className="mono" style={{ padding: '12px 16px', fontSize: '11px' }}>{g.screening_date}</td>
                      <td style={{ padding: '12px 16px' }}>
                        <button className="btn btn-xs" style={{ background: '#10b981', color: '#fff', fontWeight: 600 }} onClick={() => handleClearUserClick(g)}>
                          Approve & Clear
                        </button>
                      </td>
                    </tr>
                    {expandedGroups[g.portal_ref_no] && (
                      <tr>
                        <td colSpan="5" style={{ padding: 0 }}>
                          <div style={{ padding: '14px 16px 14px 44px', borderBottom: '1px solid var(--brd)', background: '#fff' }}>
                            <table style={{ width: '100%', fontSize: '11px', borderCollapse: 'collapse' }}>
                              <thead>
                                <tr style={{ color: 'var(--txt3)', borderBottom: '1px solid #eee' }}>
                                  <th style={{ textAlign: 'left', padding: '6px 8px' }}>ID</th>
                                  <th style={{ textAlign: 'left', padding: '6px 8px' }}>BL Number</th>
                                  <th style={{ textAlign: 'left', padding: '6px 8px' }}>Product</th>
                                  <th style={{ textAlign: 'left', padding: '6px 8px' }}>Staff</th>
                                  <th style={{ textAlign: 'left', padding: '6px 8px' }}>Status</th>
                                  <th style={{ textAlign: 'left', padding: '6px 8px' }}>Actions</th>
                                </tr>
                              </thead>
                              <tbody>
                                {g.bls.map(d => (
                                  <tr key={d.id} style={{ borderTop: '1px solid #f0f0f0' }}>
                                    <td style={{ padding: '8px' }}><code style={{ background: 'var(--bg)', padding: '2px 4px', borderRadius: '4px' }}>{d.id}</code></td>
                                    <td className="mono" style={{ padding: '8px' }}>{d.bl_number} {d.is_master && <span style={{ color: '#d97706' }}>(Master)</span>}</td>
                                    <td style={{ padding: '8px' }}>{d.product}</td>
                                    <td style={{ padding: '8px', fontSize: '9.5px', lineHeight: '1.3' }}>
                                      <div style={{ color: 'var(--txt2)' }}>Init: {d.uploaded_by || '—'}</div>
                                      <div style={{ color: 'var(--txt3)' }}>Edit: {d.last_edited_by || '—'}</div>
                                    </td>
                                    <td style={{ padding: '8px' }}>
                                      <CurrentStatusBadge cs={d.current_status} />
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
                                    <td style={{ padding: '8px' }}>
                                      <div style={{ display: 'flex', gap: '4px' }}>
                                        {d.status === 'duplicate_blocked' && (
                                          <button className="btn btn-xs" style={{ background: '#3b82f6', color: '#fff' }} onClick={() => handleMarkPartial(d.id)}>Mark Partial</button>
                                        )}
                                        <button className="btn btn-xs"
                                          style={{ background:'#dc2626', color:'#fff' }}
                                          onClick={() => handleReject(d.id)}
                                          disabled={!!rejecting[d.id]}>
                                          {rejecting[d.id] ? 'Rejecting…' : 'Reject'}
                                        </button>
                                        <button className="btn btn-xs" style={{ background: '#ef4444', color: '#fff' }} onClick={() => handleDelete(d.id)}>✕ Delete</button>
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
                  );
                })}
              </tbody>
            </table>
            <PaginationBar
              currentPage={sec1CurrentPage}
              totalItems={totalSec1Items}
              pageSize={sec1PageSize}
              onPageChange={setSec1CurrentPage}
              onPageSizeChange={(newSize) => {
                setSec1PageSize(newSize);
                setSec1CurrentPage(1);
              }}
            />
            </>
          )}
        </div>
      </div>

      {/* ── main card ── */}
      <div className="card" style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
        <div className="card-hd" style={{ padding: '14px 16px', borderBottom: '1px solid var(--brd)' }}>
          <span className="card-t" style={{ fontSize: '14px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <FontAwesomeIcon icon={faShieldAlt} style={{ color: '#2563eb' }} />
            Section 2 — System Duplicate Detection & Audit Logs
          </span>
          <button className="btn btn-xs btn-g" onClick={fetchAll} disabled={loading} style={{ padding: '4px 10px' }}>
            <FontAwesomeIcon icon={faHistory} style={{ marginRight: '4px' }} />
            {loading ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>

        <div className="card-b" style={{ padding: '16px' }}>
          {/*  filter pills  */}
          <div className="pills" style={{ marginBottom: '1.2rem' }}>
            {PILLS.map(p => (
              <button
                key={p.key}
                className={`pill${activePill === p.key ? ' on' : ''}`}
                onClick={() => setActivePill(p.key)}
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* ── error ── */}
          {error && (
            <div className="badge b-err" style={{ marginBottom: '1rem', padding: '0.5rem 1rem', display: 'inline-block' }}>
              {error}
            </div>
          )}

          {/* ── loading skeleton / table ── */}
          {loading ? (
            <div style={{ textAlign: 'center', padding: '3rem 0', color: 'var(--text-muted, #888)' }}>
              Loading duplicate logs…
            </div>
          ) : filtered.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '3rem 0', color: 'var(--text-muted, #888)' }}>
              <p style={{ fontSize: '2rem', marginBottom: '0.5rem' }}><FontAwesomeIcon icon={faTrophy} /></p>
              <p>No duplicates found{activePill !== 'all' ? ' for the selected filter' : ''}.</p>
            </div>
          ) : (
            <DataTable
              columns={columnHeaders}
              rows={filtered}
              renderRow={renderRow}
            />
          )}
        </div>
      </div>

      {clearModalRef && (
        <ClearJustificationModal
          refNo={clearModalRef}
          origRef={clearModalOrigRef}
          onClose={() => setClearModalRef(null)}
          onConfirm={handleModalConfirmClear}
        />
      )}
    </div>
  );
}

export default DuplicatesPage;
