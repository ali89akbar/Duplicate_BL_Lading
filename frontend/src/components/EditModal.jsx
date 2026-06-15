// import { useState } from 'react';
// import { PATCH } from '../utils/api';

// function EditModal({ doc, onClose, onSaved }) {
//   const [form, setForm] = useState({
//     bl_number: doc.bl_number || '',
//     portal_ref_no: doc.portal_ref_no || '',
//     screening_date: doc.screening_date || '',
//     dr_ccy: doc.dr_ccy || '',
//     amount: doc.amount || '',
//     product: doc.product || '',
//     till_date: doc.till_date || '',
//   });
//   const [saving, setSaving] = useState(false);

//   const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

//   const save = async () => {
//     setSaving(true);
//     await PATCH(`/documents/${doc.id}`, form);
//     setSaving(false);
//     onSaved();
//   };

//   return (
//     <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.4)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center' }}>
//       <div style={{ background:'var(--bg)', borderRadius:'10px', padding:'24px', width:'480px', maxHeight:'90vh', overflowY:'auto' }}>
//         <div style={{ display:'flex', justifyContent:'space-between', marginBottom:'16px' }}>
//           <strong>Edit Record — <code style={{ fontSize:'12px' }}>{doc.id}</code></strong>
//           <span style={{ cursor:'pointer', fontSize:'18px' }} onClick={onClose}>×</span>
//         </div>
//         {[
//           ['Product', 'product'],
//           ['BL Number', 'bl_number'],
//           ['Portal Ref No', 'portal_ref_no'],
//           ['Screening Date', 'screening_date'],
//           ['CCY', 'dr_ccy'],
//           ['Amount', 'amount'],
//           ['Till Date', 'till_date'],
//         ].map(([label, key]) => (
//           <div key={key} style={{ marginBottom:'12px' }}>
//             <div style={{ fontSize:'11px', color:'var(--txt3)', marginBottom:'4px' }}>{label}</div>
//             <input className="fi" style={{ width:'100%' }} value={form[key]} onChange={e => set(key, e.target.value)} />
//           </div>
//         ))}
//         <div style={{ display:'flex', gap:'8px', justifyContent:'flex-end', marginTop:'16px' }}>
//           <button className="btn" onClick={onClose}>Cancel</button>
//           <button className="btn btn-a" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save Changes'}</button>
//         </div>
//       </div>
//     </div>
//   );
// }

// export default EditModal;

import { useState } from 'react';
import { PATCH, POST } from '../utils/api';

function EditModal({ doc, onClose, onSaved }) {
  const [form, setForm] = useState({
    bl_number: doc.bl_number || '',
    portal_ref_no: doc.portal_ref_no || '',
    screening_date: doc.screening_date || '',
    dr_ccy: doc.dr_ccy || '',
    amount: doc.amount || '',
    product: doc.product || '',
  });
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [attachments, setAttachments] = useState(doc.attachments || []);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const save = async () => {
    setSaving(true);
    await PATCH(`/manual/submissions/${doc.id}`, { fields: form });
    setSaving(false);
    onSaved();
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true);
    const reader = new FileReader();
    reader.onload = async () => {
      const b64 = reader.result.split(',')[1];
      const res = await POST(`/manual/submissions/${doc.id}/attachments`, {
        file_base64: b64,
        filename: file.name,
        filetype: file.type,
      });
      if (res?.attachment_id) {
        setAttachments(a => [...a, { id: res.attachment_id, filename: file.name, uploaded_at: new Date().toISOString() }]);
      }
      setUploading(false);
    };
    reader.readAsDataURL(file);
  };

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.4)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center' }}>
      <div style={{ background:'var(--bg)', borderRadius:'10px', padding:'24px', width:'480px', maxHeight:'90vh', overflowY:'auto' }}>
        <div style={{ display:'flex', justifyContent:'space-between', marginBottom:'16px' }}>
          <strong>Edit Record — <code style={{ fontSize:'12px' }}>{doc.id}</code></strong>
          <span style={{ cursor:'pointer', fontSize:'18px' }} onClick={onClose}>×</span>
        </div>

        {[
          ['Product', 'product'],
          ['BL Number', 'bl_number'],
          ['Portal Ref No', 'portal_ref_no'],
          ['Screening Date', 'screening_date'],
          ['CCY', 'dr_ccy'],
          ['Amount', 'amount'],
        ].map(([label, key]) => (
          <div key={key} style={{ marginBottom:'12px' }}>
            <div style={{ fontSize:'11px', color:'var(--txt3)', marginBottom:'4px' }}>{label}</div>
            <input className="fi" style={{ width:'100%' }} value={form[key]} onChange={e => set(key, e.target.value)} />
          </div>
        ))}

        {/* Attachments */}
        <div style={{ marginTop:'16px', borderTop:'1px solid var(--brd)', paddingTop:'14px' }}>
          <div style={{ fontSize:'11px', fontWeight:600, marginBottom:'8px' }}>Attachments</div>
          {attachments.length === 0 && <div style={{ fontSize:'11px', color:'var(--txt3)', marginBottom:'8px' }}>No attachments yet.</div>}
          {attachments.map(a => (
            <div key={a.id} style={{ fontSize:'11px', padding:'4px 0', borderBottom:'1px solid var(--brd)' }}>
              📎 {a.filename} <span style={{ color:'var(--txt3)' }}>{a.uploaded_at?.slice(0,10)}</span>
            </div>
          ))}
          <label style={{ display:'inline-block', marginTop:'10px', cursor:'pointer' }}>
            <input type="file" style={{ display:'none' }} onChange={handleFileUpload} disabled={uploading} />
            <span className="btn btn-xs">{uploading ? 'Uploading…' : '+ Add File'}</span>
          </label>
        </div>

        <div style={{ display:'flex', gap:'8px', justifyContent:'flex-end', marginTop:'16px' }}>
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-a" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save Changes'}</button>
        </div>
      </div>
    </div>
  );
}

export default EditModal;