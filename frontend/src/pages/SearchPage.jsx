import { useState, useEffect, useRef, useCallback } from 'react';
import { GET } from '../utils/api';
import { StatusBadge, CurrentStatusBadge, fmtNum } from '../utils/formatters';

/* ─── helpers ─────────────────────────────────────────── */

/** Wrap every occurrence of `term` inside `text` with a <mark> element. */
function Highlight({ text = '', term = '' }) {
  if (!term.trim()) return <>{text}</>;
  const parts = String(text).split(new RegExp(`(${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'));
  return (
    <>
      {parts.map((part, i) =>
        part.toLowerCase() === term.toLowerCase()
          ? <mark key={i} style={{ background: '#fde047', borderRadius: 2, padding: '0 1px' }}>{part}</mark>
          : part
      )}
    </>
  );
}

function fmtDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d)) return iso;
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

/* ─── quick-filter definitions ────────────────────────── */
const FILTERS = [
  { key: 'all',        label: 'All' },
  { key: 'duplicates', label: 'Duplicates Only' },
  { key: 'revalidates',label: 'Revalidates Only' },
  { key: 'unique',     label: 'Unique Only' },
];

function applyFilter(results, filter) {
  switch (filter) {
    case 'duplicates':  return results.filter(r => r.is_duplicate);
    case 'revalidates': return results.filter(r => r.is_revalidate);
    case 'unique':      return results.filter(r => !r.is_duplicate && !r.is_revalidate);
    default:            return results;
  }
}

/* ─── component ───────────────────────────────────────── */
export function SearchPage() {
  const [inputValue, setInputValue]   = useState('');
  const [query, setQuery]             = useState('');
  const [results, setResults]         = useState([]);
  const [count, setCount]             = useState(0);
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState(null);
  const [activeFilter, setActiveFilter] = useState('all');
  const [searched, setSearched]       = useState(false);

  const debounceRef = useRef(null);
  const abortRef    = useRef(null);

  /* ── fetch ── */
  const doSearch = useCallback(async (q) => {
    const trimmed = q.trim();
    if (!trimmed) return;

    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);
    setSearched(true);
    setQuery(trimmed);
    setActiveFilter('all');

    try {
      const data = await GET(
        `/documents/search/query?q=${encodeURIComponent(trimmed)}&limit=30`,
        { signal: controller.signal }
      );
      setResults(data.results ?? []);
      setCount(data.count ?? 0);
    } catch (err) {
      if (err.name === 'AbortError') return;
      setError(err.message ?? 'Search failed');
      setResults([]);
      setCount(0);
    } finally {
      setLoading(false);
    }
  }, []);

  /* ── debounce ── */
  useEffect(() => {
    if (!inputValue.trim()) return;
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(inputValue), 300);
    return () => clearTimeout(debounceRef.current);
  }, [inputValue, doSearch]);

  /* ── keyboard ── */
  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      clearTimeout(debounceRef.current);
      doSearch(inputValue);
    }
  };

  const filtered = applyFilter(results, activeFilter);

  /* ── render ── */
  return (
    <div style={{ padding: '2rem 1.5rem', maxWidth: 1200, margin: '0 auto' }}>

      {/* ── Page title ── */}
      <h1 style={{ marginBottom: '1.5rem', fontSize: '1.4rem', fontWeight: 700, color: 'var(--text, #1e293b)' }}>
        Document Search
      </h1>

      {/* ── Search bar ── */}
      <div className="card" style={{ padding: '1.5rem', marginBottom: '1.25rem' }}>
        <div style={{
          display: 'flex',
          gap: '0.5rem',
          alignItems: 'center',
          background: 'var(--input-bg, #f8fafc)',
          border: '2px solid var(--border, #e2e8f0)',
          borderRadius: 12,
          padding: '0.25rem 0.5rem',
          transition: 'border-color 0.2s',
        }}
          onFocusCapture={e => e.currentTarget.style.borderColor = '#3b82f6'}
          onBlurCapture={e  => e.currentTarget.style.borderColor = 'var(--border, #e2e8f0)'}
        >
          {/* magnifier icon */}
          <span style={{ fontSize: '1.3rem', color: '#94a3b8', flexShrink: 0, paddingLeft: '0.25rem' }}>
            🔍
          </span>
          <input
            type="text"
            value={inputValue}
            onChange={e => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search by BL number, Portal Ref, Product…"
            style={{
              flex: 1,
              border: 'none',
              outline: 'none',
              background: 'transparent',
              fontSize: '1.1rem',
              padding: '0.6rem 0.25rem',
              color: 'var(--text, #1e293b)',
              minWidth: 0,
            }}
          />
          <button
            className="btn btn-p"
            onClick={() => { clearTimeout(debounceRef.current); doSearch(inputValue); }}
            style={{ borderRadius: 8, padding: '0.5rem 1.25rem', flexShrink: 0 }}
          >
            Search
          </button>
        </div>
      </div>

      {/* ── Quick filter chips ── */}
      {searched && !loading && !error && (
        <div className="pills" style={{ marginBottom: '1rem' }}>
          {FILTERS.map(f => (
            <button
              key={f.key}
              className={`pill${activeFilter === f.key ? ' on' : ''}`}
              onClick={() => setActiveFilter(f.key)}
            >
              {f.label}
            </button>
          ))}
        </div>
      )}

      {/* ── Result count ── */}
      {searched && !loading && !error && (
        <div style={{ marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span className="badge" style={{ fontSize: '0.85rem' }}>
            {count} result{count !== 1 ? 's' : ''} for &lsquo;{query}&rsquo;
          </span>
          {activeFilter !== 'all' && (
            <span style={{ fontSize: '0.8rem', color: '#64748b' }}>
              — showing {filtered.length} after filter
            </span>
          )}
        </div>
      )}

      {/* ── Loading ── */}
      {loading && (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '3rem 0' }}>
          <span className="spin-b" style={{ width: 40, height: 40 }} />
        </div>
      )}

      {/* ── Error ── */}
      {!loading && error && (
        <div className="card b-err" style={{ padding: '1rem 1.25rem', color: '#dc2626' }}>
          ⚠️ {error}
        </div>
      )}

      {/* ── Initial placeholder (no search yet) ── */}
      {!searched && !loading && (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          justifyContent: 'center', padding: '5rem 0', gap: '0.75rem',
          color: '#94a3b8', userSelect: 'none',
        }}>
          <span style={{ fontSize: '3.5rem', lineHeight: 1 }}>🔎</span>
          <p style={{ fontSize: '1.1rem', fontWeight: 500, margin: 0 }}>Search across all records</p>
          <p style={{ fontSize: '0.85rem', margin: 0 }}>Type a BL number, portal ref, or product name to begin</p>
        </div>
      )}

      {/* ── Empty state (searched but no results) ── */}
      {searched && !loading && !error && filtered.length === 0 && (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          justifyContent: 'center', padding: '4rem 0', gap: '0.75rem',
          color: '#94a3b8', userSelect: 'none',
        }}>
          <span style={{ fontSize: '3.5rem', lineHeight: 1 }}>📭</span>
          <p style={{ fontSize: '1.05rem', fontWeight: 500, margin: 0 }}>No results found</p>
          <p style={{ fontSize: '0.85rem', margin: 0 }}>
            {activeFilter !== 'all'
              ? 'Try a different filter, or broaden your search.'
              : `No documents matched "${query}".`}
          </p>
        </div>
      )}

      {/* ── Results table ── */}
      {!loading && !error && filtered.length > 0 && (
        <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
          <table className="tw" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
            <thead>
              <tr style={{ background: 'var(--th-bg, #f1f5f9)', textAlign: 'left' }}>
                <th className="fi" style={thStyle}>ID</th>
                <th className="fi" style={thStyle}>Product</th>
                <th className="fi" style={thStyle}>BL Number</th>
                <th className="fi" style={thStyle}>Portal Ref</th>
                <th className="fi" style={thStyle}>Screening Date</th>
                <th className="fi" style={thStyle}>Amount</th>
                <th className="fi" style={thStyle}>Status</th>
                <th className="fi" style={thStyle}>Current Status</th>
                <th className="fi" style={thStyle}>Uploaded By</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row, idx) => (
                <tr
                  key={row.id ?? idx}
                  style={{
                    borderTop: '1px solid var(--border, #e2e8f0)',
                    background: idx % 2 === 0 ? 'transparent' : 'var(--row-alt, #fafbfc)',
                    transition: 'background 0.15s',
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--row-hover, #eff6ff)'}
                  onMouseLeave={e => e.currentTarget.style.background = idx % 2 === 0 ? 'transparent' : 'var(--row-alt, #fafbfc)'}
                >
                  <td style={tdStyle} className="mono">{row.id}</td>
                  <td style={tdStyle}>{row.product ?? '—'}</td>
                  <td style={tdStyle} className="mono">
                    <Highlight text={row.bl_number} term={query} />
                  </td>
                  <td style={tdStyle} className="mono">
                    <Highlight text={row.portal_ref_no} term={query} />
                  </td>
                  <td style={tdStyle}>{fmtDate(row.screening_date)}</td>
                  <td style={tdStyle} className="mono">
                    {row.amount != null ? `${row.dr_ccy ?? ''} ${fmtNum(row.amount)}`.trim() : '—'}
                  </td>
                  <td style={tdStyle}>
                    <StatusBadge status={row.status} />
                  </td>
                  <td style={tdStyle}>
                    <CurrentStatusBadge status={row.current_status} />
                  </td>
                  <td style={tdStyle}>{row.uploaded_by ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ── shared cell styles ── */
const thStyle = {
  padding: '0.65rem 0.9rem',
  fontWeight: 600,
  fontSize: '0.78rem',
  textTransform: 'uppercase',
  letterSpacing: '0.03em',
  color: 'var(--text-muted, #475569)',
  whiteSpace: 'nowrap',
};

const tdStyle = {
  padding: '0.6rem 0.9rem',
  verticalAlign: 'middle',
  whiteSpace: 'nowrap',
  color: 'var(--text, #1e293b)',
};
