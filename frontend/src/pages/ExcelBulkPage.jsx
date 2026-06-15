import React, { useState } from 'react';
import { POST } from '../utils/api';
import { parseExcelFile } from '../utils/excel';
import { DataTable, Spinner, StatCard } from '../components/UIComponents';
import { StatusBadge, CurrentStatusBadge, MethBadge } from '../utils/formatters';

export function ExcelBulkPage({ user }) {
  const [file, setFile] = useState(null);
  const [parsedRows, setParsedRows] = useState([]);
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState('all');

  const handleFile = async (f) => {
    setFile(f);
    try {
      const rows = await parseExcelFile(f);
      setParsedRows(rows);
    } catch (err) {
      alert('Error reading file: ' + err.message);
    }
  };

  const onDrop = (e) => {
    e.preventDefault();
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  };

  const submit = async () => {
    if (!parsedRows.length) return;
    setLoading(true);

    const { data } = await POST('/manual/bulk_submit', {
      submitted_by: user?.email || 'system',
      filename: file.name.split('.')[0],
      rows: parsedRows
    });

    setLoading(false);
    if (!data) {
      alert('Cannot reach API');
      return;
    }
    setResults(data);
  };

  const exportCSV = () => {
    if (!results?.results) return;
    const headers = ['Row', 'BL Number', 'Portal Ref', 'Status', 'Method', 'Till Date', 'Current Status', 'Email', 'Message'];
    const csvRows = results.results.map(r => {
      const f = r.fields || {};
      const dd = r.duplicate_details || r.revalidate_details || {};
      return [r.row_index, f.bl_number || '', f.portal_ref_no || '', r.status, dd.duplicate_type || '', r.till_date || '', r.current_status || '', r.email_alert_sent ? 'Yes' : 'No', (r.message || '').replace(/,/g, ';')];
    });
    const csv = [headers, ...csvRows].map(r => r.map(v => `"${v}"`).join(',')).join('\n');
    const a = document.createElement('a');
    a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv);
    a.download = `bulk_results_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  };

  const displayRows = results?.results 
    ? (filter === 'all' ? results.results : results.results.filter(r => r.status === filter))
    : [];

  return (
    <>
      <div className="card mb20">
        <div className="card-hd"><div className="card-t">Upload Excel (.xlsx, .csv)</div></div>
        <div className="card-b">
          <div className="drop" onDragOver={e => e.preventDefault()} onDrop={onDrop}>
            <input type="file" accept=".xlsx,.xls,.csv" onChange={e => e.target.files[0] && handleFile(e.target.files[0])} />
            <div style={{ fontSize: '32px', marginBottom: '8px' }}>📁</div>
            <div style={{ fontSize: '15px', fontWeight: 600, color: 'var(--txt2)', marginBottom: '4px' }}>Drag & Drop Excel File Here</div>
            <div style={{ fontSize: '12.5px', color: 'var(--txt3)' }}>or click to browse</div>
          </div>
          
          <div style={{ marginTop: '16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--bg)', padding: '12px 18px', borderRadius: 'var(--r)', border: '1px solid var(--bdr)' }}>
            <div style={{ fontSize: '13px', fontWeight: 500 }}>
              {file ? `📎 ${file.name} — ${parsedRows.length} rows loaded, ready to process` : 'No file selected'}
            </div>
            <button className="btn btn-p" onClick={submit} disabled={!parsedRows.length || loading}>
              {loading ? <Spinner /> : 'Process File'}
            </button>
          </div>
        </div>
      </div>

      {results && (
        <div style={{ marginTop: '22px' }}>
          <div className="stats" style={{ gridTemplateColumns: 'repeat(6, 1fr)', marginBottom: '14px' }}>
            <StatCard label="Total" value={results.total} colorClass="bl" />
            <StatCard label="✓ Unique" value={results.unique} colorClass="gn" />
            <StatCard label="⛔ Dup" value={results.duplicates} colorClass="rd" />
            <StatCard label="⚠ Reval" value={results.revalidates} colorClass="am" />
            <StatCard label="! Errors" value={results.errors} colorClass="tl" />
            <StatCard label="Skipped" value={results.skipped} colorClass="pu" />
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
            <div className="pills">
              <div className={`pill ${filter === 'all' ? 'on' : ''}`} onClick={() => setFilter('all')}>All</div>
              <div className={`pill ${filter === 'validated' ? 'on' : ''}`} onClick={() => setFilter('validated')}>✓ Unique</div>
              <div className={`pill ${filter === 'duplicate_blocked' ? 'on' : ''}`} onClick={() => setFilter('duplicate_blocked')}>⛔ Dup</div>
              <div className={`pill ${filter === 'revalidate' ? 'on' : ''}`} onClick={() => setFilter('revalidate')}>⚠ Reval</div>
              <div className={`pill ${filter === 'validation_error' ? 'on' : ''}`} onClick={() => setFilter('validation_error')}>! Error</div>
            </div>
            <button className="btn btn-g btn-sm" onClick={exportCSV}>Export CSV</button>
          </div>

          <div className="card">
            <div className="card-hd"><div className="card-t">Results <span style={{ fontSize: '11px', color: 'var(--txt3)', fontWeight: 400 }}>({displayRows.length})</span></div></div>
            <DataTable 
              columns={['Row', 'BL Number', 'Portal Ref', 'Status', 'Method', 'Till Date', 'Current Status', 'Email', 'Edit']}
              rows={displayRows}
              renderRow={r => {
                const f = r.fields || {};
                const dd = r.duplicate_details || r.revalidate_details || {};
                const sid = r.submission_id || r.id || '';
                return (
                  <tr key={r.row_index || Math.random()} style={{ background: r.is_revalidate ? '#fffbeb' : r.is_duplicate ? '#fff5f5' : '' }}>
                    <td className="mono" style={{ fontSize: '11.5px', color: 'var(--txt3)' }}>{r.row_index || '—'}</td>
                    <td className="mono" style={{ fontSize: '11.5px' }}>{r.bl_number || f.bl_number || '—'}</td>
                    <td className="mono" style={{ fontSize: '11px', color: '#b45309' }}>{r.portal_ref_no || f.portal_ref_no || '—'}</td>
                    <td><StatusBadge status={r.status} isReval={r.is_revalidate} /></td>
                    <td>{dd.duplicate_type ? <MethBadge m={dd.duplicate_type} /> : '—'}</td>
                    <td className="mono" style={{ fontSize: '11px' }}>{r.till_date || '—'}</td>
                    <td><CurrentStatusBadge cs={r.current_status || 'pending'} /></td>
                    <td>{r.email_alert_sent ? <span className="badge b-warn" style={{ fontSize: '9.5px' }}>Sent ✓</span> : <span style={{ color: 'var(--txt3)', fontSize: '11px' }}>—</span>}</td>
                    <td>{sid ? <span style={{ fontSize: '10.5px', color: 'var(--txt3)' }}>Edit (TBD)</span> : '—'}</td>
                  </tr>
                );
              }}
            />
          </div>
        </div>
      )}
    </>
  );
}
