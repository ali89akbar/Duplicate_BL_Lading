import React, { useState, useEffect, useCallback } from 'react';
import { GET, PATCH } from '../utils/api';
import { StatusBadge, CurrentStatusBadge, fmtNum } from '../utils/formatters';
import { DataTable } from '../components/UIComponents';

/* ─── helpers ──────────────────────────────────────────────── */

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

/* ─── filter pills config ───────────────────────────────────── */

const PILLS = [
  { key: 'all',              label: 'All' },
  { key: 'exact',            label: 'Exact' },
  { key: 'fuzzy',            label: 'Fuzzy' },
  { key: 'revalidate',       label: 'Revalidate' },
  { key: 'high',             label: 'High Severity' },
  { key: 'bl',               label: 'BL' },
  { key: 'inv',              label: 'Commercial Invoice' },
];

function matchesPill(log, pill) {
  if (pill === 'all')        return true;
  if (pill === 'exact')      return log.duplicate_type === 'EXACT';
  if (pill === 'fuzzy')      return log.duplicate_type === 'FUZZY';
  if (pill === 'revalidate') return log.duplicate_type === 'REVALIDATE';
  if (pill === 'high')       return log.severity === 'HIGH';
  if (pill === 'bl')         return (log.document_type ?? '').toUpperCase().includes('BL');
  if (pill === 'inv')        return (log.document_type ?? '').toUpperCase().includes('INV');
  return true;
}

/* ─── stat card ─────────────────────────────────────────────── */

function StatCard({ label, value, colorClass, loading }) {
  return (
    <div className={`stat ${colorClass}`}>
      <span className="stat-val">{loading ? '…' : fmtNum(value ?? 0)}</span>
      <span className="stat-lbl">{label}</span>
    </div>
  );
}

/* ─── main component ────────────────────────────────────────── */

export function DuplicatesPage() {
  const [stats,      setStats]      = useState(null);
  const [logs,       setLogs]       = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState(null);
  const [activePill, setActivePill] = useState('all');
  const [rejecting,  setRejecting]  = useState({});   // { [doc_id]: bool }
  const [dupDocs, setDupDocs] = useState([]);
  const [expandedGroups, setExpandedGroups] = useState({});
  
  const toggleGroup = (ref) => setExpandedGroups(p => ({ ...p, [ref]: !p[ref] }));
  
  /* ── fetch ── */
const fetchAll = useCallback(async () => {
  setLoading(true);
  setError(null);
  try {
    const [statsRes, logsRes, docsRes] = await Promise.all([
      GET('/duplicates/stats'),
      GET('/duplicates/logs'),
      GET('/duplicates/documents'),  // ← add
    ]);
    setStats(statsRes);
    setLogs(logsRes.logs ?? []);
    setDupDocs(docsRes?.groups ?? []);
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
      <div className="card" style={{ marginTop: '16px' }}>
        <div className="card-hd"><span className="card-t">Duplicate Blocked Records <span style={{ fontSize: '11px', color: 'var(--txt3)', fontWeight: 400 }}>({dupDocs.length} groups)</span></span></div>
        <div className="card-b" style={{ padding: 0 }}>
          <table style={{ width: '100%', fontSize: '12px' }}>
            <thead>
              <tr style={{ color: 'var(--txt3)', borderBottom: '1px solid var(--brd)', textAlign: 'left', background: 'var(--bg)' }}>
                <th style={{ padding: '8px' }}>Portal Ref No</th>
                <th>BL Count</th>
                <th>Uploaded By</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody>
              {dupDocs.map(g => (
                <React.Fragment key={g.portal_ref_no}>
                  <tr style={{ borderBottom: expandedGroups[g.portal_ref_no] ? 'none' : '1px solid var(--brd)', background: '#fff5f5' }}>
                    <td style={{ padding: '8px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <button className="btn btn-xs" onClick={() => toggleGroup(g.portal_ref_no)} style={{ padding: '2px 6px' }}>
                          {expandedGroups[g.portal_ref_no] ? '▼' : '▶'}
                        </button>
                        <code style={{ fontSize: '12px', fontWeight: 600, color: '#b45309' }}>{g.portal_ref_no}</code>
                      </div>
                    </td>
                    <td style={{ fontWeight: 500 }}>{g.bls.length} BL(s)</td>
                    <td style={{ fontSize: '11px' }}>{g.uploaded_by}</td>
                    <td className="mono" style={{ fontSize: '11px' }}>{g.screening_date}</td>
                  </tr>
                  {expandedGroups[g.portal_ref_no] && (
                    <tr>
                      <td colSpan="4" style={{ padding: 0 }}>
                        <div style={{ padding: '10px 10px 10px 40px', borderBottom: '1px solid var(--brd)', background: '#fff' }}>
                          <table style={{ width: '100%', fontSize: '11px' }}>
                            <thead>
                              <tr style={{ color: 'var(--txt3)' }}>
                                <th style={{ textAlign: 'left', paddingBottom: '4px' }}>ID</th>
                                <th style={{ textAlign: 'left' }}>BL Number</th>
                                <th style={{ textAlign: 'left' }}>Product</th>
                                <th style={{ textAlign: 'left' }}>Status</th>
                                <th style={{ textAlign: 'left' }}>Actions</th>
                              </tr>
                            </thead>
                            <tbody>
                              {g.bls.map(d => (
                                <tr key={d.id} style={{ borderTop: '1px solid #f0f0f0' }}>
                                  <td style={{ padding: '6px 0' }}><code style={{ background: 'var(--bg)', padding: '2px 4px', borderRadius: '4px' }}>{d.id}</code></td>
                                  <td className="mono">{d.bl_number} {d.is_master && <span style={{ color: '#d97706' }}>(Master)</span>}</td>
                                  <td>{d.product}</td>
                                  <td><CurrentStatusBadge cs={d.current_status} /></td>
                                  <td>
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
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {/* ── main card ── */}
      <div className="card">
        <div className="card-hd">
          <span className="card-t">Duplicate Detection Logs</span>
          <button className="btn btn-xs btn-g" onClick={fetchAll} disabled={loading}>
            {loading ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>

        <div className="card-b">
          {/* ── filter pills ── */}
          <div className="pills" style={{ marginBottom: '1rem' }}>
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
              <p style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>🎉</p>
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
    </div>
  );
}

export default DuplicatesPage;
