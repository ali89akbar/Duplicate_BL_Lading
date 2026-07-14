import React, { useState, useEffect } from 'react';
import { GET, POST, fileToB64 } from '../utils/api';
import { DataTable, Spinner } from '../components/UIComponents';
import { ResultPanel, ErrorPanel } from '../components/ResultPanel';
import { StatusBadge, CurrentStatusBadge, fmtNum } from '../utils/formatters';
import * as XLSX from 'xlsx';

export function ManualEntryPage({ user }) {
  const [refFields, setRefFields] = useState({ screening_date: '', dr_ccy: 'USD', amount: '', portal_ref_no: '' });
  const [blGroups, setBlGroups] = useState([{ id: 0, product: 'BL', bl_number: '', is_master: true, pendingFiles: [] }]);
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [resultData, setResultData] = useState(null);
  const [history, setHistory] = useState([]);
  const [comments, setComments] = useState('');
  let nextId = 1;

  useEffect(() => { loadHistory(); }, []);

  const loadHistory = async () => {
    const d = await GET('/manual/submissions');
    if (d?.submissions) setHistory(d.submissions);
  };

  const updateRef = (field, val) => setRefFields(prev => ({ ...prev, [field]: val }));
  
  const addGroup = () => setBlGroups(prev => [...prev, { id: Date.now(), product: 'BL', bl_number: '', is_master: prev.length === 0, pendingFiles: [] }]);
  
  const removeGroup = (idx) => {
    if (blGroups.length <= 1) return alert('At least one BL entry required.');
    setBlGroups(prev => prev.filter((_, i) => i !== idx));
  };
  
  const updateGroup = (idx, field, val) => {
    setBlGroups(prev => prev.map((g, i) => i === idx ? { ...g, [field]: val } : g));
  };

  const handleMasterChange = (idx, checked) => {
    setBlGroups(prev => {
      const currentMasters = prev.filter(g => g.is_master).length;
      if (checked && currentMasters >= prev.length - 1 && prev.length > 1) return prev; // cannot make all masters
      if (!checked && currentMasters <= 1 && prev.length > 1) return prev; // must keep 1 master
      return prev.map((g, i) => i === idx ? { ...g, is_master: checked } : g);
    });
  };

  const handleFileChange = (idx, files) => {
    const fileArray = Array.from(files);
    setBlGroups(prev => prev.map((g, i) => i === idx ? { ...g, pendingFiles: [...g.pendingFiles, ...fileArray] } : g));
  };

  const clearForm = () => {
    setRefFields({ screening_date: '', dr_ccy: 'USD', amount: '', portal_ref_no: '' });
    setBlGroups([{ id: Date.now(), product: 'BL', bl_number: '', is_master: true, pendingFiles: [] }]);
    setErrors({});
    setResultData(null);
    setComments('');
  };

  const handleExcelImport = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const bstr = evt.target.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const data = XLSX.utils.sheet_to_json(ws, { header: 1 });
        
        if (data.length < 2) return alert('Excel file is empty or missing data rows.');
        
        // Find column index for "BL / Invoice Number"
        const headerRow = data[0].map(h => String(h).toLowerCase().trim());
        const blColIdx = headerRow.findIndex(h => h.includes('bl') || h.includes('invoice') || h === 'bl_number');
        
        if (blColIdx === -1) {
          return alert('Could not find a column containing "BL" or "Invoice" in the header row.');
        }

        const newBls = [];
        for (let i = 1; i < data.length; i++) {
          const val = data[i][blColIdx];
          if (val) {
            newBls.push({
              id: Date.now() + i,
              product: 'BL',
              bl_number: String(val).trim(),
              is_master: false, // Default to false, user will select the master
              pendingFiles: []
            });
          }
        }

        if (newBls.length > 0) {
          setBlGroups(prev => {
            const hasExisting = prev.length > 0 && prev[0].bl_number.trim() !== '';
            const combined = hasExisting ? [...prev, ...newBls] : newBls;
            // Ensure at least one master if none are set
            if (!combined.some(g => g.is_master) && combined.length > 0) {
              combined[0].is_master = true;
            }
            return combined;
          });
          alert(`Successfully imported ${newBls.length} BL/Invoice numbers from Excel.`);
        } else {
          alert('No values found in the BL column.');
        }
      } catch (err) {
        alert('Error parsing Excel file: ' + err.message);
      }
      e.target.value = ''; // Reset file input
    };
    reader.readAsBinaryString(file);
  };

  const handleSubmit = async (action) => {
    setErrors({});
    let hasErr = false;
    const newErrs = {};

    if (!refFields.screening_date) { newErrs.screening_date = 'Required'; hasErr = true; }
    if (!refFields.amount || refFields.amount <= 0) { newErrs.amount = 'Required'; hasErr = true; }
    if (!refFields.portal_ref_no) { newErrs.portal_ref_no = 'Required'; hasErr = true; }
    
    blGroups.forEach((g, i) => {
      if (!g.bl_number.trim()) { newErrs[`bl_${i}`] = 'Required'; hasErr = true; }
    });

    if (hasErr) return setErrors(newErrs);

    if (blGroups.length > 1) {
      const masters = blGroups.filter(g => g.is_master);
      if (masters.length === 0) return alert('Please mark at least one BL as Master B/L.');
      if (masters.length === blGroups.length) return alert('Not all BLs can be Master. At least one must be regular.');
    }

    setLoading(true);

    const blList = blGroups.map(g => ({ product: g.product, bl_number: g.bl_number.trim(), is_master: g.is_master }));
    
    const { data, status } = await POST('/manual/submit_group', {
      ref: { ...refFields, amount: parseFloat(refFields.amount) || 0 },
      bls: blList,
      action: action,
      comments: comments
    });

    if (!data) {
      setResultData({ type: 'error', message: 'Cannot reach API.' });
      setLoading(false);
      return;
    }

    if (data.field_errors) {
      setErrors(data.field_errors);
      setLoading(false);
      return;
    }

    // Upload attachments
    const results = data.results || [];
    for (let i = 0; i < blGroups.length; i++) {
      const g = blGroups[i];
      const res = results[i];
      if (g.pendingFiles.length && res?.submission_id) {
        for (const file of g.pendingFiles) {
          const b64 = await fileToB64(file);
          await POST(`/manual/submissions/${res.submission_id}/attachments`, {
            file_base64: b64, filename: file.name, filetype: file.type, uploaded_by: user?.email || 'system'
          });
        }
      }
    }

    setResultData(data);
    loadHistory();
    setLoading(false);
  };

  return (
    <>
      <div className="ref-box">
        <div className="ref-box-hd">
          <div className="ref-icon">1</div>
          <div className="ref-title">Reference Fields</div>
          <div style={{ fontSize: '11px', color: '#b45309', marginLeft: 'auto', fontWeight: 600 }}>Applied to all BLs in this group</div>
        </div>
        <div className="g4">
          <div className="fg">
            <label className="fl">Screening Date <span style={{ color: 'var(--red)' }}>*</span></label>
            <input type="date" className={`fi ${errors.screening_date ? 'err' : ''}`} value={refFields.screening_date} onChange={e => updateRef('screening_date', e.target.value)} />
            {errors.screening_date && <div className="ferr on">{errors.screening_date}</div>}
          </div>
          <div className="fg">
            <label className="fl">DR CCY <span style={{ color: 'var(--red)' }}>*</span></label>
            <select className="fsel" value={refFields.dr_ccy} onChange={e => updateRef('dr_ccy', e.target.value)}>
              {['USD','EUR','GBP','AED','SAR','PKR'].map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className="fg">
            <label className="fl">Amount <span style={{ color: 'var(--red)' }}>*</span></label>
            <input type="number" step="0.01" className={`fi ${errors.amount ? 'err' : ''}`} value={refFields.amount} onChange={e => updateRef('amount', e.target.value)} />
            {errors.amount && <div className="ferr on">{errors.amount}</div>}
          </div>
          <div className="fg">
            <label className="fl">Portal Reference No. <span style={{ color: 'var(--red)' }}>*</span></label>
            <input className={`fi-ref ${errors.portal_ref_no ? 'err' : ''}`} placeholder="e.g. DCP-2024-001" value={refFields.portal_ref_no} onChange={e => updateRef('portal_ref_no', e.target.value)} />
            {errors.portal_ref_no && <div className="ferr on">{errors.portal_ref_no}</div>}
          </div>
        </div>
      </div>

      <div className="bl-group">
        <div className="bl-group-hd">
          <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
            <div className="ref-icon" style={{ background: '#0ea5e9' }}>2</div>
            <div className="ref-title" style={{ color: 'white' }}>BL Entries</div>
          </div>
          <div className="bl-group-num">{blGroups.length} entry(s)</div>
        </div>
        
        <div className="bl-group-body">
          {blGroups.length > 1 && !blGroups.some(g => g.is_master) && (
            <div style={{ background: '#fef2f2', border: '1px solid #fbb4b4', padding: '9px 14px', borderRadius: 'var(--r)', marginBottom: '14px', fontSize: '11px', color: '#b91818', display: 'flex', alignItems: 'center', gap: '8px' }}>
              ⚠ You have multiple BLs. At least one must be marked as Master B/L.
            </div>
          )}

          <div>
            {blGroups.map((g, i) => (
              <div key={g.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 0', borderBottom: '1px solid var(--bdr)' }}>
                <label style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px', cursor: 'pointer', flexShrink: 0, width: '52px' }}>
                  <input type="checkbox" checked={g.is_master} onChange={e => handleMasterChange(i, e.target.checked)} style={{ width: '18px', height: '18px', accentColor: '#f59e0b', cursor: 'pointer' }} />
                  <span style={{ fontSize: '9px', fontWeight: 700, color: g.is_master ? '#d97706' : 'var(--txt3)', textAlign: 'center', lineHeight: 1.2 }}>{g.is_master ? '★ Master' : 'Regular'}</span>
                </label>
                <div style={{ width: '22px', height: '22px', borderRadius: '50%', background: g.is_master ? '#f59e0b' : 'var(--bdr2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontWeight: 700, color: g.is_master ? '#92400e' : 'var(--txt3)', flexShrink: 0 }}>{i + 1}</div>
                <div style={{ flex: '0 0 180px' }}>
                  <label className="fl" style={{ fontSize: '10px', marginBottom: '3px' }}>Product</label>
                  <select className="fsel" style={{ height: '36px', fontSize: '12.5px' }} value={g.product} onChange={e => updateGroup(i, 'product', e.target.value)}>
                    <option value="BL">BL</option>
                    <option value="COMMERCIAL INVOICE">COMMERCIAL INVOICE</option>
                  </select>
                </div>
                <div style={{ flex: 1 }}>
                  <label className="fl" style={{ fontSize: '10px', marginBottom: '3px' }}>BL / Invoice Number <span style={{ color: 'var(--red)' }}>*</span></label>
                  <input className={`fi ${errors[`bl_${i}`] ? 'err' : ''}`} value={g.bl_number} onChange={e => updateGroup(i, 'bl_number', e.target.value)} style={{ height: '36px', fontSize: '12.5px', borderColor: g.is_master ? '#f59e0b' : '' }} />
                  {errors[`bl_${i}`] && <div className="ferr on">{errors[`bl_${i}`]}</div>}
                </div>
                <div style={{ flex: '0 0 160px' }}>
                  <label className="fl" style={{ fontSize: '10px', marginBottom: '3px' }}>Attachment</label>
                  <div className="att-zone" style={{ padding: '7px', marginTop: 0 }}>
                    <input type="file" accept="image/*,.pdf" multiple onChange={e => handleFileChange(i, e.target.files)} />
                    <div style={{ fontSize: '10.5px', color: 'var(--txt3)' }}>📎 {g.pendingFiles.length > 0 ? `${g.pendingFiles.length} file(s)` : 'Attach'}</div>
                  </div>
                  {g.pendingFiles.length > 0 && (
                    <div className="att-list" style={{ marginTop: '4px' }}>
                      {g.pendingFiles.map((f, fi) => <span key={fi} className="att-chip" style={{ fontSize: '9.5px', padding: '2px 7px' }}>📎 {f.name}</span>)}
                    </div>
                  )}
                </div>
                {blGroups.length > 1 ? (
                  <button onClick={() => removeGroup(i)} style={{ width: '28px', height: '28px', borderRadius: '50%', background: 'var(--rs)', border: 'none', color: 'var(--red)', cursor: 'pointer', fontSize: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>✕</button>
                ) : <div style={{ width: '28px', flexShrink: 0 }}></div>}
              </div>
            ))}
          </div>
        </div>
        <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
          <button className="add-bl-btn" onClick={addGroup}>+ Add another BL to this group</button>
          
          {/* Excel Import Button */}
          <div style={{ position: 'relative', overflow: 'hidden', display: 'inline-block' }}>
            <button className="add-bl-btn" style={{ background: '#f0fdf4', color: '#166534', borderColor: '#bbf7d0' }}>
              📥 Import BLs from Excel
            </button>
            <input 
              type="file" 
              accept=".xlsx, .xls, .csv" 
              onChange={handleExcelImport}
              style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', opacity: 0, cursor: 'pointer' }}
            />
          </div>
        </div>
      </div>

      <div style={{ padding: '10px 18px' }}>
        <label className="fl" style={{ fontSize: '11px', marginBottom: '4px' }}>Internal Comments</label>
        <textarea 
          className="fi" 
          placeholder="Enter any comments for this group..." 
          style={{ width: '100%', minHeight: '60px', padding: '8px' }}
          value={comments}
          onChange={(e) => setComments(e.target.value)}
        />
      </div>

      <div style={{ padding: '10px 18px', display: 'flex', gap: '10px', alignItems: 'center' }}>
        <button className="btn" style={{ background: '#f59e0b', color: '#fff' }} onClick={() => handleSubmit('hold')} disabled={loading}>
          {loading ? <Spinner /> : 'Save as Hold'}
        </button>
        <button className="btn btn-p" onClick={() => handleSubmit('clear')} disabled={loading}>
          {loading ? <Spinner /> : 'Submit for Clearance'}
        </button>
        <button className="btn btn-g" onClick={clearForm}>Clear Form</button>
      </div>

      <div style={{ padding: '0 18px' }}>
        {resultData?.type === 'error' ? <ErrorPanel message={resultData.message} /> : <ResultPanel data={resultData} />}
      </div>

      <div className="card" style={{ marginTop: '24px' }}>
        <div className="card-hd"><div className="card-t">Recent Manual Submissions</div></div>
        <DataTable 
          columns={['ID', 'Product', 'BL Number', 'Master', 'Portal Ref', 'Date', 'CCY', 'Amount', 'Doc Status', 'Till Date', 'Current Status', 'Attachments', 'Actions']}
          rows={history}
          renderRow={s => (
            <tr key={s.id} style={{ background: s.is_revalidate ? '#fffbeb' : s.is_duplicate ? '#fff5f5' : '' }}>
              <td><code style={{ fontSize: '11px' }}>{s.id}</code></td>
              <td>{s.product || '—'}</td>
              <td className="mono" style={{ fontSize: '11.5px' }}>{s.bl_number || '—'}</td>
              <td style={{ textAlign: 'center' }}>{s.is_master ? <span style={{ fontSize: '12px' }}>True</span> : <span style={{ color: 'var(--txt3)', fontSize: '11px' }}>—</span>}</td>
              <td className="mono" style={{ fontSize: '11px', color: '#b45309' }}>{s.portal_ref_no || '—'}</td>
              <td className="mono" style={{ fontSize: '11px' }}>{s.screening_date || '—'}</td>
              <td className="mono" style={{ fontSize: '11px' }}>{s.dr_ccy || '—'}</td>
              <td className="mono" style={{ fontSize: '11.5px' }}>{fmtNum(s.amount)}</td>
              <td><StatusBadge status={s.status} isReval={s.is_revalidate} /></td>
              <td className="mono" style={{ fontSize: '11px' }}>{s.till_date || '—'}</td>
              <td><CurrentStatusBadge cs={s.current_status} /></td>
              <td style={{ fontSize: '11px' }}>{(s.attachments || []).length > 0 ? <span className="badge b-att">{s.attachments.length} file(s)</span> : <span style={{ color: 'var(--txt3)' }}>None</span>}</td>
              <td><span style={{ fontSize: '10.5px', color: 'var(--txt3)' }}>Locked</span></td>
            </tr>
          )}
        />
      </div>
    </>
  );
}
