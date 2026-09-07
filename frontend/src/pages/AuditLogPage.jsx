import { useState, useEffect, useMemo } from 'react';
import { GET } from '../utils/api';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faInbox } from '@fortawesome/free-solid-svg-icons';


const PAGE_SIZE = 20;

const ACTION_COLORS = {
  manual_form_submit: 'b-blue',
  excel_bulk_row:     'b-teal',
  record_edit:        'b-warn',
  attachment_upload:  'b-ok',
  document_rejected:  'b-err',
};

const ACTION_OPTIONS = [
  { value: '', label: 'All Actions' },
  { value: 'manual_form_submit',  label: 'manual_form_submit' },
  { value: 'excel_bulk_row',      label: 'excel_bulk_row' },
  { value: 'record_edit',         label: 'record_edit' },
  { value: 'attachment_upload',   label: 'attachment_upload' },
  { value: 'document_rejected',   label: 'document_rejected' },
];

function formatTs(ts) {
  if (!ts) return '—';
  const d = new Date(ts);
  if (isNaN(d)) return ts;
  const pad = (n) => String(n).padStart(2, '0');
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
    `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
  );
}

export function AuditLogPage() {
  const [logs, setLogs]       = useState([]);
  const [total, setTotal]     = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);

  // Filters
  const [search, setSearch]         = useState('');
  const [actionFilter, setActionFilter] = useState('');
  const [userFilter, setUserFilter]   = useState('');

  // Pagination
  const [page, setPage] = useState(1);

  useEffect(() => {
    setLoading(true);
    setError(null);
    GET('/reports/audit-log?limit=100')
      .then((data) => {
        setLogs(data?.logs || []);
        setTotal(data?.total ?? 0);
      })
      .catch((err) => setError(err?.message || 'Failed to load audit log'))
      .finally(() => setLoading(false));
  }, []);

  // Unique users for dropdown
  const uniqueUsers = useMemo(() => {
    const users = [...new Set(logs.map((l) => l.user).filter(Boolean))].sort();
    return users;
  }, [logs]);

  // Client-side filtering
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return logs.filter((l) => {
      if (actionFilter && l.action !== actionFilter) return false;
      if (userFilter && l.user !== userFilter) return false;
      if (q) {
        const haystack = [l.doc_id, l.bl_number, l.user, l.filename]
          .map((v) => (v || '').toLowerCase())
          .join(' ');
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [logs, search, actionFilter, userFilter]);

  // Reset to page 1 when filters change
  useEffect(() => {
    setPage(1);
  }, [search, actionFilter, userFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated  = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div className="fg" style={{ padding: '1.5rem', maxWidth: '1400px', margin: '0 auto' }}>
      {/* ── Header ── */}
      <div className="fl" style={{ alignItems: 'center', gap: '0.75rem', marginBottom: '1.25rem' }}>
        <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 700 }}>Audit Log</h1>
        {!loading && !error && (
          <span className="badge b-blue mono" style={{ fontSize: '0.85rem' }}>
            {total} records
          </span>
        )}
      </div>

      {/* ── Filter Bar ── */}
      <div className="card" style={{ marginBottom: '1.25rem' }}>
        <div className="card-hd">Filters</div>
        <div
          className="fl"
          style={{ gap: '0.75rem', flexWrap: 'wrap', padding: '0.75rem 1rem 1rem' }}
        >
          {/* Search */}
          <input
            className="fi fsel"
            type="text"
            placeholder="Search by Doc ID, BL Number, User, Filename…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ flex: '1 1 260px', minWidth: '200px' }}
          />

          {/* Action filter */}
          <select
            className="fi fsel"
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
            style={{ flex: '0 1 220px' }}
          >
            {ACTION_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>

          {/* User filter */}
          <select
            className="fi fsel"
            value={userFilter}
            onChange={(e) => setUserFilter(e.target.value)}
            style={{ flex: '0 1 180px' }}
          >
            <option value="">All Users</option>
            {uniqueUsers.map((u) => (
              <option key={u} value={u}>{u}</option>
            ))}
          </select>

          {/* Clear */}
          {(search || actionFilter || userFilter) && (
            <button
              className="btn btn-sm"
              onClick={() => { setSearch(''); setActionFilter(''); setUserFilter(''); }}
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* ── Table Card ── */}
      <div className="card">
        <div className="card-hd fl" style={{ alignItems: 'center', gap: '0.5rem' }}>
          <span>Entries</span>
          {!loading && !error && (
            <span className="badge mono" style={{ fontSize: '0.8rem' }}>
              {filtered.length} shown
            </span>
          )}
        </div>

        {loading && (
          <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted, #888)' }}>
            Loading…
          </div>
        )}

        {error && !loading && (
          <div style={{ padding: '2rem', textAlign: 'center' }}>
            <span className="badge b-err">{error}</span>
          </div>
        )}

        {!loading && !error && filtered.length === 0 && (
          <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted, #888)' }}>
            <div style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}><FontAwesomeIcon icon={faInbox} /></div>
            <div style={{ fontWeight: 600 }}>No audit entries found</div>
            <div style={{ fontSize: '0.875rem', marginTop: '0.25rem' }}>
              Try adjusting your filters or search query.
            </div>
          </div>
        )}

        {!loading && !error && filtered.length > 0 && (
          <>
            <div style={{ overflowX: 'auto' }}>
              <table className="card-t" style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th>Timestamp</th>
                    <th>Action</th>
                    <th>Document ID</th>
                    <th>BL Number</th>
                    <th>Doc Type</th>
                    <th>User</th>
                    <th>Filename</th>
                    <th>Flags</th>
                  </tr>
                </thead>
                <tbody>
                  {paginated.map((log, idx) => (
                    <tr
                      key={`${log.doc_id}-${log.timestamp}-${idx}`}
                      style={{
                        background: idx % 2 === 0
                          ? 'var(--row-even, transparent)'
                          : 'var(--row-odd, rgba(255,255,255,0.03))',
                      }}
                    >
                      <td className="mono" style={{ whiteSpace: 'nowrap', fontSize: '0.82rem' }}>
                        {formatTs(log.timestamp)}
                      </td>
                      <td>
                        <span className={`badge ${ACTION_COLORS[log.action] || ''}`}
                              style={{ whiteSpace: 'nowrap', fontSize: '0.78rem' }}>
                          {log.action || '—'}
                        </span>
                      </td>
                      <td className="mono" style={{ fontSize: '0.82rem' }}>
                        {log.doc_id || '—'}
                      </td>
                      <td className="mono" style={{ fontSize: '0.82rem' }}>
                        {log.bl_number || '—'}
                      </td>
                      <td>{log.doc_type || '—'}</td>
                      <td>{log.user || '—'}</td>
                      <td
                        className="mono"
                        style={{
                          fontSize: '0.8rem',
                          maxWidth: '220px',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                        title={log.filename}
                      >
                        {log.filename || '—'}
                      </td>
                      <td>
                        <div className="fl" style={{ gap: '0.3rem', flexWrap: 'nowrap' }}>
                          {log.is_duplicate  && <span className="badge b-err"  style={{ fontSize: '0.72rem' }}>DUP</span>}
                          {log.is_revalidate && <span className="badge b-warn" style={{ fontSize: '0.72rem' }}>REVAL</span>}
                          {!log.is_duplicate && !log.is_revalidate && (
                            <span style={{ color: 'var(--text-muted, #888)', fontSize: '0.8rem' }}>—</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* ── Pagination ── */}
            {totalPages > 1 && (
              <div
                className="fl"
                style={{
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '0.75rem 1rem',
                  borderTop: '1px solid var(--border, #2a2a2a)',
                  flexWrap: 'wrap',
                  gap: '0.5rem',
                }}
              >
                <span style={{ fontSize: '0.85rem', color: 'var(--text-muted, #888)' }}>
                  Page {page} of {totalPages} &nbsp;·&nbsp; {filtered.length} total
                </span>
                <div className="fl" style={{ gap: '0.5rem' }}>
                  <button
                    className="btn btn-sm btn-g"
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page === 1}
                  >
                    ← Previous
                  </button>
                  <button
                    className="btn btn-sm btn-g"
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages}
                  >
                    Next →
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
