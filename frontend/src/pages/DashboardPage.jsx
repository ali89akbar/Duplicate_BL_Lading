import React, { useState, useEffect } from 'react';
import { GET } from '../utils/api';
import { StatCard, DataTable } from '../components/UIComponents';
import { StatusBadge, CurrentStatusBadge, MethBadge, ProgressRow, fmtNum } from '../utils/formatters';
import { PendingApprovalsPanel } from './PendingApprovalsPanel';


export function DashboardPage({ user }) {
  const [metrics, setMetrics] = useState(null);
  const [recent, setRecent] = useState([]);
  const [dupStats, setDupStats] = useState(null);
  const [tat, setTat] = useState(null);
  const isAdmin = user?.role === 'admin';
  const isAdminOrSupervisor = user?.role === 'admin' || user?.role === 'supervisor';

  useEffect(() => {
    async function loadData() {
      const [mRes, rRes, dRes] = await Promise.all([
        GET('/dashboard/metrics'),
        GET('/dashboard/recent?limit=10'),
        GET('/duplicates/stats')
      ]);
      if (mRes) setMetrics(mRes);
      if (rRes?.recent) setRecent(rRes.recent);
      if (dRes) setDupStats(dRes);

      if (isAdmin) {
        const tatRes = await GET('/admin/tat');
        if (tatRes?.tat) setTat(tatRes.tat);
      }
    }
    loadData();
  }, [isAdmin]);

  if (!metrics) return <div style={{ padding: '20px' }}>Loading dashboard...</div>;

  return (
    <>
      {isAdminOrSupervisor && <PendingApprovalsPanel />}
      <div className="stats" style={{ gridTemplateColumns: 'repeat(5, 1fr)' }}>
        <StatCard label="Total Scanned" value={metrics.total_documents} colorClass="bl" />
        <StatCard label="Duplicates" value={metrics.total_duplicates} colorClass="rd" />
        <StatCard label="Revalidates" value={metrics.total_revalidates} colorClass="am" />
        <StatCard label="Resolved" value={metrics.revalidated_count} colorClass="gn" />
        <StatCard label="Pending/Expired" value={`${metrics.expired_count || 0} / ${metrics.pending_count || 0}`} colorClass="pu" />
      </div>

      <div className="g2 mb20">
        <div className="card">
          <div className="card-hd"><div className="card-t">Detection Methods</div></div>
          <div className="card-b">
            {dupStats ? (
              <>
                <ProgressRow label="Exact" n={dupStats.exact} total={dupStats.total} color="var(--red)" />
                <ProgressRow label="Fuzzy" n={dupStats.fuzzy} total={dupStats.total} color="var(--amber)" />
                <ProgressRow label="Revalidate" n={dupStats.revalidate} total={dupStats.total} color="#d97706" />
                <ProgressRow label="Velocity/Pattern" n={(dupStats.amount_velocity || 0) + (dupStats.pattern || 0)} total={dupStats.total} color="var(--teal)" />
              </>
            ) : <span style={{ color: 'var(--txt3)' }}>Loading...</span>}
          </div>
        </div>

        <div className="card">
          <div className="card-hd"><div className="card-t">3-Day Status Summary</div></div>
          <div className="card-b">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--bdr)' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '7px', fontSize: '12px' }}><span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#3b82f6', display: 'inline-block' }}></span>Pending (within 3 days)</span>
              <span className="mono" style={{ fontWeight: 700 }}>{metrics.pending_count || 0}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--bdr)' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '7px', fontSize: '12px' }}><span style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--green)', display: 'inline-block' }}></span>Revalidated (attachment uploaded)</span>
              <span className="mono" style={{ fontWeight: 700 }}>{metrics.revalidated_count || 0}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--bdr)' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '7px', fontSize: '12px' }}><span style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--red)', display: 'inline-block' }}></span>Expired (no attachment after 3 days)</span>
              <span className="mono" style={{ fontWeight: 700 }}>{metrics.expired_count || 0}</span>
            </div>
          </div>
        </div>

        {isAdmin && (
          <div className="card" style={{ gridColumn: '1 / -1' }}>
            <div className="card-hd"><div className="card-t">Employee TAT (Records Submitted)</div></div>
            <div className="card-b" style={{ padding: 0 }}>
              {tat ? (
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: 'var(--bg)', borderBottom: '1px solid var(--bdr)' }}>
                      <th style={{ padding: '10px 15px', textAlign: 'left', fontSize: '11px', color: 'var(--txt2)' }}>Employee</th>
                      <th style={{ padding: '10px 15px', textAlign: 'right', fontSize: '11px', color: 'var(--txt2)' }}>Records Submitted</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tat.map(t => (
                      <tr key={t.email} style={{ borderBottom: '1px solid var(--bdr)' }}>
                        <td style={{ padding: '10px 15px', fontSize: '13px' }}>{t.email}</td>
                        <td style={{ padding: '10px 15px', textAlign: 'right', fontWeight: 600 }} className="mono">{t.count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : <div style={{ padding: '15px' }}><span style={{ color: 'var(--txt3)' }}>Loading TAT...</span></div>}
            </div>
          </div>
        )}
      </div>

      <div className="card">
        <div className="card-hd"><div className="card-t">Recent Scans</div></div>
        <DataTable 
          columns={['ID', 'Product', 'BL Number', 'Master', 'Portal Ref', 'Date', 'Amount', 'Doc Status', 'Till Date', 'Current Status']}
          rows={recent}
          renderRow={(d) => (
            <tr key={d.id} style={{ background: d.is_revalidate ? '#fffbeb' : d.is_duplicate ? '#fff5f5' : '' }}>
              <td><code style={{ fontSize: '11px', background: 'var(--bg)', padding: '2px 5px', borderRadius: '4px' }}>{d.id}</code></td>
              <td>{d.product || '—'}</td>
              <td className="mono" style={{ fontSize: '11.5px' }}>{d.bl_number || '—'}</td>
              <td style={{ textAlign: 'center' }}>{d.is_master ? <span style={{ fontSize: '13px', color: '#d97706' }}>★</span> : '—'}</td>
              <td className="mono" style={{ fontSize: '11px', color: '#b45309' }}>{d.portal_ref_no || '—'}</td>
              <td className="mono" style={{ fontSize: '11px' }}>{d.screening_date || '—'}</td>
              <td className="mono" style={{ fontSize: '11px' }}>{d.dr_ccy || ''} {fmtNum(d.amount)}</td>
              <td><StatusBadge status={d.status} isReval={d.is_revalidate} /></td>
              <td className="mono" style={{ fontSize: '11px' }}>{d.till_date || '—'}</td>
              <td><CurrentStatusBadge cs={d.current_status} /></td>
            </tr>
          )}
        />
      </div>
    </>
  );
}
