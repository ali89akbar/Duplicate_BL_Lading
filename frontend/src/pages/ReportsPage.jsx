import React, { useState, useEffect } from 'react';
import { GET } from '../utils/api';
import { fmtNum } from '../utils/formatters';

/* ─────────────────────────────────────────────
   Sub-components
───────────────────────────────────────────── */

/** KPI summary card */
function StatCard({ label, value, colorClass, icon }) {
  return (
    <div className={`stat ${colorClass || ''}`} style={{ flex: 1 }}>
      <div className="stat-icon">{icon}</div>
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
    </div>
  );
}

/** Progress bar row used in status breakdown */
function ProgressRow({ label, count, total, color }) {
  const pct = total > 0 ? Math.min(100, (count / total) * 100) : 0;
  return (
    <tr>
      <td style={{ padding: '10px 12px', fontWeight: 500 }}>{label}</td>
      <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 600 }}>
        {fmtNum(count)}
      </td>
      <td style={{ padding: '10px 12px', width: '45%' }}>
        <div
          style={{
            background: 'rgba(255,255,255,0.08)',
            borderRadius: 6,
            overflow: 'hidden',
            height: 10,
          }}
        >
          <div
            style={{
              width: `${pct.toFixed(1)}%`,
              height: '100%',
              background: color,
              borderRadius: 6,
              transition: 'width 0.6s ease',
            }}
          />
        </div>
      </td>
      <td
        style={{
          padding: '10px 12px',
          textAlign: 'right',
          fontSize: '0.8rem',
          opacity: 0.7,
        }}
      >
        {pct.toFixed(1)}%
      </td>
    </tr>
  );
}

/** Inline bar for detection method table */
function InlineBar({ value, max, color }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div
        style={{
          flex: 1,
          background: 'rgba(255,255,255,0.08)',
          borderRadius: 4,
          overflow: 'hidden',
          height: 8,
        }}
      >
        <div
          style={{
            width: `${pct.toFixed(1)}%`,
            height: '100%',
            background: color,
            borderRadius: 4,
            transition: 'width 0.6s ease',
          }}
        />
      </div>
      <span style={{ minWidth: 42, textAlign: 'right', fontWeight: 600 }}>
        {fmtNum(value)}
      </span>
    </div>
  );
}

/* ─────────────────────────────────────────────
   Main page
───────────────────────────────────────────── */
export function ReportsPage() {
  const [summary, setSummary] = useState(null);
  const [daily, setDaily]     = useState(null);
  const [dupStats, setDupStats] = useState(null);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState(null);

  useEffect(() => {
    let cancelled = false;

    async function fetchAll() {
      setLoading(true);
      setError(null);
      try {
        const [summaryRes, dailyRes, dupRes] = await Promise.all([
          GET('/reports/summary'),
          GET('/reports/daily?days=14'),
          GET('/duplicates/stats'),
        ]);
        if (!cancelled) {
          setSummary(summaryRes);
          setDaily(dailyRes);
          setDupStats(dupRes);
        }
      } catch (err) {
        if (!cancelled) setError(err?.message || 'Failed to load report data.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchAll();
    return () => { cancelled = true; };
  }, []);

  /* ── CSV export ─────────────────────────── */
  function handleExportCSV() {
    if (!daily?.data?.length) return;

    const header = ['Date', 'Total', 'Unique', 'Duplicates', 'Revalidates', 'Rejected'];
    const rows = daily.data.map((r) => [
      r.date,
      r.total,
      r.unique,
      r.duplicates,
      r.revalidates,
      r.rejected,
    ]);

    const csvContent = [header, ...rows]
      .map((row) => row.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(','))
      .join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href     = url;
    link.download = `daily_report_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  /* ── Render states ──────────────────────── */
  if (loading) {
    return (
      <div style={{ padding: 32, textAlign: 'center', opacity: 0.6 }}>
        Loading report data…
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: 32 }}>
        <div className="card" style={{ borderLeft: '4px solid #ef4444', padding: 20 }}>
          <strong>Error:</strong> {error}
        </div>
      </div>
    );
  }

  /* ── Derived values ─────────────────────── */
  const totalForProgress =
    (summary?.total_documents ?? 0) || 1; // avoid divide-by-zero

  const detectionMethods = [
    { label: 'Exact Match',      count: dupStats?.exact           ?? 0, color: '#6366f1' },
    { label: 'Fuzzy Match',      count: dupStats?.fuzzy           ?? 0, color: '#f59e0b' },
    { label: 'Revalidate',       count: dupStats?.revalidate      ?? 0, color: '#10b981' },
    { label: 'Amount / Velocity',count: dupStats?.amount_velocity ?? 0, color: '#ef4444' },
  ];
  const maxDetection = Math.max(...detectionMethods.map((d) => d.count), 1);

  const statusRows = [
    {
      label: 'Cleared / Pending',
      count: (summary?.cleared_count ?? 0) + (summary?.pending_count ?? 0),
      color: '#10b981',
    },
    {
      label: 'Revalidation Required',
      count: summary?.revalidation_required_count ?? 0,
      color: '#f59e0b',
    },
    {
      label: 'Attachment Uploaded',
      count: summary?.attachment_uploaded_count ?? 0,
      color: '#6366f1',
    },
    {
      label: 'Duplicate Blocked',
      count: summary?.duplicate_blocked_count ?? 0,
      color: '#ef4444',
    },
    {
      label: 'Rejected',
      count: summary?.rejected_count ?? 0,
      color: '#dc2626',
    },
  ];

  /* ── JSX ─────────────────────────────────── */
  return (
    <div style={{ padding: '24px 28px', maxWidth: 1100, margin: '0 auto' }}>

      {/* Page header */}
      <div className="mb20">
        <h1 className="card-t" style={{ fontSize: '1.5rem', margin: 0 }}>
          Reports &amp; Analytics
        </h1>
        <p style={{ opacity: 0.55, marginTop: 4, fontSize: '0.9rem' }}>
          System-wide statistics for the last 14 days
        </p>
      </div>

      {/* ── 1. KPI Summary Cards ─────────────── */}
      <div className="stats g2 mb20" style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        <StatCard
          label="Total Scanned"
          value={fmtNum(summary?.total_documents ?? 0)}
          colorClass="stat-blue"
          icon="📄"
        />
        <StatCard
          label="Unique Records"
          value={fmtNum(summary?.total_unique ?? 0)}
          colorClass="stat-green"
          icon="✅"
        />
        <StatCard
          label="Total Duplicates"
          value={fmtNum(summary?.total_duplicates ?? 0)}
          colorClass="stat-red"
          icon="⚠️"
        />
        <StatCard
          label="Duplicate Rate"
          value={`${(summary?.duplicate_rate_pct ?? 0).toFixed(1)}%`}
          colorClass="stat-amber"
          icon="📊"
        />
      </div>

      {/* ── 2. Status Breakdown Table ─────────── */}
      <div className="card mb20">
        <div className="card-hd">
          <span className="card-t">Status Breakdown</span>
          <span className="badge">All-time</span>
        </div>
        <div className="card-b" style={{ padding: 0 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)', opacity: 0.55 }}>
                <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 500 }}>Status</th>
                <th style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 500 }}>Count</th>
                <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 500 }}>Share</th>
                <th style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 500 }}>%</th>
              </tr>
            </thead>
            <tbody>
              {statusRows.map((row) => (
                <ProgressRow
                  key={row.label}
                  label={row.label}
                  count={row.count}
                  total={totalForProgress}
                  color={row.color}
                />
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── 3. 14-Day Daily Trend Table ───────── */}
      <div className="card mb20">
        <div className="card-hd">
          <span className="card-t">14-Day Daily Trend</span>
          <span className="badge">{daily?.days ?? 14} days</span>
        </div>
        <div className="card-b" style={{ padding: 0, overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 600 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)', opacity: 0.55 }}>
                {['Date', 'Total', 'Unique', 'Duplicates', 'Revalidates', 'Rejected'].map((col) => (
                  <th
                    key={col}
                    style={{
                      padding: '9px 14px',
                      textAlign: col === 'Date' ? 'left' : 'right',
                      fontWeight: 500,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(daily?.data ?? []).map((row, idx) => (
                <tr
                  key={row.date ?? idx}
                  style={{
                    borderBottom: '1px solid rgba(255,255,255,0.05)',
                    transition: 'background 0.15s',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.04)')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                >
                  <td style={{ padding: '9px 14px', fontWeight: 500 }}>{row.date}</td>
                  <td style={{ padding: '9px 14px', textAlign: 'right' }}>{fmtNum(row.total)}</td>
                  <td style={{ padding: '9px 14px', textAlign: 'right' }}>{fmtNum(row.unique)}</td>
                  <td
                    style={{
                      padding: '9px 14px',
                      textAlign: 'right',
                      color: '#ef4444',
                      fontWeight: 600,
                    }}
                  >
                    {fmtNum(row.duplicates)}
                  </td>
                  <td
                    style={{
                      padding: '9px 14px',
                      textAlign: 'right',
                      color: '#f59e0b',
                      fontWeight: 600,
                    }}
                  >
                    {fmtNum(row.revalidates)}
                  </td>
                  <td style={{ padding: '9px 14px', textAlign: 'right' }}>
                    {fmtNum(row.rejected)}
                  </td>
                </tr>
              ))}
              {(!daily?.data || daily.data.length === 0) && (
                <tr>
                  <td colSpan={6} style={{ padding: 24, textAlign: 'center', opacity: 0.45 }}>
                    No daily data available.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── 4. Detection Method Breakdown ─────── */}
      <div className="card mb20">
        <div className="card-hd">
          <span className="card-t">Detection Method Breakdown</span>
          <span className="badge">Duplicates</span>
        </div>
        <div className="card-b" style={{ padding: 0 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)', opacity: 0.55 }}>
                <th style={{ padding: '8px 14px', textAlign: 'left', fontWeight: 500 }}>Type</th>
                <th style={{ padding: '8px 14px', fontWeight: 500 }}>Distribution</th>
              </tr>
            </thead>
            <tbody>
              {detectionMethods.map((method) => (
                <tr
                  key={method.label}
                  style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}
                >
                  <td
                    style={{
                      padding: '11px 14px',
                      fontWeight: 500,
                      whiteSpace: 'nowrap',
                      width: '30%',
                    }}
                  >
                    {method.label}
                  </td>
                  <td style={{ padding: '11px 14px' }}>
                    <InlineBar
                      value={method.count}
                      max={maxDetection}
                      color={method.color}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── 5. Export Section ─────────────────── */}
      <div className="card">
        <div className="card-hd">
          <span className="card-t">Export Data</span>
        </div>
        <div className="card-b" style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          <p style={{ margin: 0, opacity: 0.65, flex: 1, minWidth: 200 }}>
            Download the 14-day daily trend as a CSV file for further analysis or reporting.
          </p>
          <button
            className="badge"
            onClick={handleExportCSV}
            disabled={!daily?.data?.length}
            style={{
              cursor: daily?.data?.length ? 'pointer' : 'not-allowed',
              padding: '10px 22px',
              fontSize: '0.9rem',
              fontWeight: 600,
              background: 'linear-gradient(135deg, #6366f1, #4f46e5)',
              color: '#fff',
              border: 'none',
              borderRadius: 8,
              letterSpacing: '0.02em',
              opacity: daily?.data?.length ? 1 : 0.45,
              transition: 'opacity 0.2s, transform 0.15s',
            }}
            onMouseEnter={(e) => {
              if (daily?.data?.length) e.currentTarget.style.transform = 'translateY(-1px)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'translateY(0)';
            }}
          >
            ⬇ Export to CSV
          </button>
        </div>
      </div>

    </div>
  );
}

export default ReportsPage;
