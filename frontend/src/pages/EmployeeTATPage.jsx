import React, { useState, useEffect } from 'react';
import { GET } from '../utils/api';
import { StatusBadge, CurrentStatusBadge, fmtNum } from '../utils/formatters';

function CaseDetailModal({ doc, onClose }) {
  if (!doc) return null;
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 680 }} onClick={e => e.stopPropagation()}>
        <div className="modal-hd">
          <div>
            <div className="modal-t">Case Detail</div>
            <div style={{ fontSize: 11, color: 'var(--txt3)', marginTop: 2 }}>{doc.id}</div>
          </div>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-b" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
          {[
            ['Submission ID', doc.id],
            ['BL Number', doc.bl_number || '—'],
            ['Product', doc.product || '—'],
            ['Portal Ref No.', doc.portal_ref_no || '—'],
            ['Screening Date', doc.screening_date || '—'],
            ['Amount', `${doc.dr_ccy || ''} ${fmtNum(doc.amount)}`],
            ['Till Date', doc.till_date || '—'],
            ['Upload Time', doc.upload_time ? doc.upload_time.replace('T', ' ').slice(0, 19) : '—'],
          ].map(([label, value]) => (
            <div key={label} style={{ background: 'var(--bg)', borderRadius: 'var(--r)', padding: '10px 14px' }}>
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--txt3)', marginBottom: 4 }}>{label}</div>
              <div style={{ fontSize: 13, fontWeight: 500, fontFamily: label === 'BL Number' || label === 'Portal Ref No.' || label === 'Submission ID' ? 'JetBrains Mono, monospace' : 'inherit' }}>{value}</div>
            </div>
          ))}
          <div style={{ gridColumn: '1 / -1', display: 'flex', gap: 10, alignItems: 'center' }}>
            <StatusBadge status={doc.status} isReval={doc.is_revalidate} />
            <CurrentStatusBadge cs={doc.current_status} />
            {doc.is_duplicate && <span className="badge b-err">Duplicate</span>}
            {doc.is_revalidate && <span className="badge b-warn">Revalidate</span>}
          </div>
        </div>
        <div className="modal-ft">
          <button className="btn btn-g" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}

export function EmployeeTATPage() {
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedEmployee, setSelectedEmployee] = useState(null);
  const [expandedDates, setExpandedDates] = useState({});
  const [selectedDoc, setSelectedDoc] = useState(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const res = await GET('/admin/tat/detail');
      if (res?.detail) {
        setDetail(res.detail);
        const employees = Object.keys(res.detail);
        if (employees.length > 0) setSelectedEmployee(employees[0]);
      }
      setLoading(false);
    }
    load();
  }, []);

  const toggleDate = (date) => {
    setExpandedDates(prev => ({ ...prev, [date]: !prev[date] }));
  };

  const employees = detail ? Object.keys(detail) : [];
  const employeeData = selectedEmployee && detail ? detail[selectedEmployee] : {};
  const totalRecords = Object.values(employeeData).reduce((sum, recs) => sum + recs.length, 0);

  if (loading) return <div style={{ padding: 30, textAlign: 'center', color: 'var(--txt3)' }}>Loading TAT data...</div>;

  if (!detail || employees.length === 0) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: 'var(--txt3)', border: '2px dashed var(--bdr)', borderRadius: 'var(--r2)' }}>
        No records found. Submit some records first to see employee TAT.
      </div>
    );
  }

  return (
    <>
      {selectedDoc && <CaseDetailModal doc={selectedDoc} onClose={() => setSelectedDoc(null)} />}

      <div style={{ display: 'grid', gridTemplateColumns: '240px 1fr', gap: 16, alignItems: 'start' }}>
        {/* Employee list */}
        <div className="card" style={{ position: 'sticky', top: 72 }}>
          <div className="card-hd"><div className="card-t">Employees</div></div>
          <div style={{ padding: 6 }}>
            {employees.map(emp => {
              const count = Object.values(detail[emp]).reduce((s, r) => s + r.length, 0);
              const dates = Object.keys(detail[emp]).length;
              const isActive = selectedEmployee === emp;
              return (
                <button
                  key={emp}
                  onClick={() => { setSelectedEmployee(emp); setExpandedDates({}); }}
                  style={{
                    width: '100%', textAlign: 'left', background: isActive ? 'var(--sky)' : 'none',
                    border: isActive ? '1px solid var(--blue2)' : '1px solid transparent',
                    borderRadius: 'var(--r)', padding: '10px 12px', cursor: 'pointer',
                    marginBottom: 4, transition: 'all .14s',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: isActive ? 'var(--blue)' : 'var(--txt)', wordBreak: 'break-word' }}>
                      {emp.split('@')[0]}
                    </div>
                    <span style={{
                      background: isActive ? 'var(--blue2)' : 'var(--bg)', color: isActive ? '#fff' : 'var(--txt2)',
                      borderRadius: 10, padding: '1px 7px', fontSize: 11, fontWeight: 700, flexShrink: 0, marginLeft: 6
                    }}>{count}</span>
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--txt3)', marginTop: 2 }}>{emp} · {dates} day(s)</div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Date-wise records for selected employee */}
        <div>
          {selectedEmployee && (
            <>
              {/* Summary bar */}
              <div className="card" style={{ marginBottom: 14 }}>
                <div className="card-b" style={{ display: 'flex', gap: 24, alignItems: 'center', padding: '12px 18px' }}>
                  <div>
                    <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--txt3)', fontWeight: 700 }}>Employee</div>
                    <div style={{ fontSize: 14, fontWeight: 700 }}>{selectedEmployee}</div>
                  </div>
                  <div style={{ width: 1, background: 'var(--bdr)', alignSelf: 'stretch' }} />
                  <div>
                    <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--txt3)', fontWeight: 700 }}>Total Records</div>
                    <div style={{ fontSize: 24, fontWeight: 700, fontFamily: 'JetBrains Mono,monospace', color: 'var(--blue)' }}>{totalRecords}</div>
                  </div>
                  <div style={{ width: 1, background: 'var(--bdr)', alignSelf: 'stretch' }} />
                  <div>
                    <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--txt3)', fontWeight: 700 }}>Active Days</div>
                    <div style={{ fontSize: 24, fontWeight: 700, fontFamily: 'JetBrains Mono,monospace' }}>{Object.keys(employeeData).length}</div>
                  </div>
                  <div style={{ marginLeft: 'auto', display: 'flex', gap: 12 }}>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--red)' }}>
                        {Object.values(employeeData).flat().filter(r => r.is_duplicate).length}
                      </div>
                      <div style={{ fontSize: 10, color: 'var(--txt3)' }}>Duplicates</div>
                    </div>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--amber)' }}>
                        {Object.values(employeeData).flat().filter(r => r.is_revalidate).length}
                      </div>
                      <div style={{ fontSize: 10, color: 'var(--txt3)' }}>Revalidates</div>
                    </div>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--green)' }}>
                        {Object.values(employeeData).flat().filter(r => !r.is_duplicate && !r.is_revalidate).length}
                      </div>
                      <div style={{ fontSize: 10, color: 'var(--txt3)' }}>Unique</div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Date accordion */}
              {Object.entries(employeeData).map(([date, records]) => {
                const isOpen = expandedDates[date] !== false; // default open
                const dupCount = records.filter(r => r.is_duplicate).length;
                return (
                  <div key={date} className="card" style={{ marginBottom: 10, overflow: 'hidden' }}>
                    <button
                      onClick={() => toggleDate(date)}
                      style={{
                        width: '100%', background: 'none', border: 'none', cursor: 'pointer',
                        display: 'flex', alignItems: 'center', gap: 12, padding: '12px 18px',
                        borderBottom: isOpen ? '1px solid var(--bdr)' : 'none',
                      }}
                    >
                      <span style={{ fontSize: 13, color: isOpen ? 'var(--blue)' : 'var(--txt)', transition: 'transform .15s', display: 'inline-block', transform: isOpen ? 'rotate(90deg)' : 'none' }}>▶</span>
                      <div style={{ fontWeight: 700, fontSize: 13 }}>{date}</div>
                      <span style={{ marginLeft: 6, background: 'var(--bg)', border: '1px solid var(--bdr)', borderRadius: 10, padding: '1px 9px', fontSize: 11, fontWeight: 600 }}>
                        {records.length} record{records.length !== 1 ? 's' : ''}
                      </span>
                      {dupCount > 0 && (
                        <span style={{ background: 'var(--rs)', color: 'var(--red)', borderRadius: 10, padding: '1px 9px', fontSize: 11, fontWeight: 600 }}>
                          {dupCount} dup
                        </span>
                      )}
                      <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--txt3)' }}>
                        {isOpen ? 'Click to collapse' : 'Click to expand'}
                      </span>
                    </button>

                    {isOpen && (
                      <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                          <thead>
                            <tr style={{ background: 'var(--bg)' }}>
                              {['ID', 'Product', 'BL Number', 'Portal Ref', 'Amount', 'Status', 'Current Status', ''].map(h => (
                                <th key={h} style={{ padding: '8px 13px', textAlign: 'left', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.07em', color: 'var(--txt3)', borderBottom: '1px solid var(--bdr)', whiteSpace: 'nowrap' }}>{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {records.map(rec => (
                              <tr
                                key={rec.id}
                                style={{ borderBottom: '1px solid var(--bdr)', background: rec.is_duplicate ? '#fff5f5' : rec.is_revalidate ? '#fffbeb' : '' }}
                              >
                                <td style={{ padding: '9px 13px' }}><code style={{ fontSize: 11 }}>{rec.id}</code></td>
                                <td style={{ padding: '9px 13px' }}>{rec.product || '—'}</td>
                                <td style={{ padding: '9px 13px', fontFamily: 'JetBrains Mono,monospace', fontSize: 11 }}>{rec.bl_number || '—'}</td>
                                <td style={{ padding: '9px 13px', fontFamily: 'JetBrains Mono,monospace', fontSize: 11, color: '#b45309' }}>{rec.portal_ref_no || '—'}</td>
                                <td style={{ padding: '9px 13px', fontFamily: 'JetBrains Mono,monospace', fontSize: 11 }}>{rec.dr_ccy} {fmtNum(rec.amount)}</td>
                                <td style={{ padding: '9px 13px' }}><StatusBadge status={rec.status} isReval={rec.is_revalidate} /></td>
                                <td style={{ padding: '9px 13px' }}><CurrentStatusBadge cs={rec.current_status} /></td>
                                <td style={{ padding: '9px 13px' }}>
                                  <button
                                    onClick={() => setSelectedDoc(rec)}
                                    className="btn btn-a btn-xs"
                                  >
                                    View
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                );
              })}
            </>
          )}
        </div>
      </div>
    </>
  );
}
