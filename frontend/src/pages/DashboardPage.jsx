import React, { useState, useEffect } from 'react';
import { GET } from '../utils/api';
import { StatCard, DataTable } from '../components/UIComponents';
import { StatusBadge, CurrentStatusBadge, MethBadge, ProgressRow, fmtNum } from '../utils/formatters';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faStar } from '@fortawesome/free-solid-svg-icons';



export function DashboardPage({ user }) {
  const [metrics, setMetrics] = useState(null);
  const [recent, setRecent] = useState([]);
  const [dupStats, setDupStats] = useState(null);
  const [tat, setTat] = useState([]);
  const isAdmin = user?.role === 'admin';
  const isAdminOrSupervisor = user?.role === 'admin' || user?.role === 'supervisor';

  useEffect(() => {
    async function loadData() {
      const mRes = await GET('/dashboard/metrics');
      if (mRes) {
        setMetrics(mRes);
        if (mRes.dup_stats) setDupStats(mRes.dup_stats);

        // Recent Scans logic with fallback
        if (Array.isArray(mRes.recent) && mRes.recent.length > 0) {
          setRecent(mRes.recent);
        } else {
          const recRes = await GET('/dashboard/recent?limit=10');
          if (Array.isArray(recRes?.recent)) setRecent(recRes.recent);
        }

        // Employee TAT logic with multi-tier fallback
        if (Array.isArray(mRes.tat) && mRes.tat.length > 0) {
          setTat(mRes.tat);
        } else {
          const tatRes = await GET('/admin/tat');
          if (Array.isArray(tatRes?.tat) && tatRes.tat.length > 0) {
            setTat(tatRes.tat);
          } else {
            const detailRes = await GET('/admin/tat/detail');
            if (detailRes?.detail) {
              const list = Object.entries(detailRes.detail).map(([email, dates]) => {
                const count = Object.values(dates).reduce((sum, recs) => sum + recs.length, 0);
                return { email, count };
              });
              list.sort((a, b) => b.count - a.count);
              setTat(list);
            }
          }
        }
      }
    }
    loadData();
  }, []);

  if (!metrics) return <div style={{ padding: '20px' }}>Loading dashboard...</div>;

  return (
    <>
      <div className="stats" style={{ gridTemplateColumns: 'repeat(5, 1fr)' }}>
        <StatCard label="Total Scanned" value={metrics.total_documents} colorClass="bl" />
        <StatCard label="Duplicates" value={metrics.total_duplicates} colorClass="rd" />
        <StatCard label="Revalidates" value={metrics.total_revalidates} colorClass="am" />
        <StatCard label="Resolved" value={metrics.revalidated_count} colorClass="gn" />
        <StatCard label="Pending/Expired" value={`${metrics.expired_count || 0} / ${metrics.pending_count || 0}`} colorClass="pu" />
      </div>

      <div className="mb20">
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

        {isAdminOrSupervisor && (
          <div className="card" style={{ gridColumn: '1 / -1' }}>
            <div className="card-hd"><div className="card-t">Employee TAT (Records Submitted)</div></div>
            <div className="card-b" style={{ padding: 0 }}>
              {tat.length > 0 ? (
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
              ) : <div style={{ padding: '15px' }}><span style={{ color: 'var(--txt3)' }}>No TAT data available.</span></div>}
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
              <td style={{ textAlign: 'center' }}>{d.is_master ? <span style={{ fontSize: '13px', color: '#d97706' }}><FontAwesomeIcon icon={faStar} /></span> : '—'}</td>
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
