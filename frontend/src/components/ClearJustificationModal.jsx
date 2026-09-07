import React, { useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faExclamationTriangle, faPaperclip, faCheckCircle, faTimes, faUpload } from '@fortawesome/free-solid-svg-icons';

export function ClearJustificationModal({ refNo, origRef, onClose, onConfirm }) {
  const [comments, setComments] = useState('');
  const [file, setFile] = useState(null);
  const [fileB64, setFileB64] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleFileChange = (e) => {
    const selected = e.target.files[0];
    if (!selected) {
      setFile(null);
      setFileB64('');
      return;
    }
    if (selected.size > 15 * 1024 * 1024) {
      setError('Attachment file size must be less than 15MB.');
      return;
    }
    setError('');
    setFile(selected);
    const reader = new FileReader();
    reader.onload = () => {
      setFileB64(reader.result);
    };
    reader.readAsDataURL(selected);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!comments.trim()) {
      setError('Justification comment is required to clear duplicate records.');
      return;
    }
    if (!fileB64) {
      setError('Supporting proof attachment file is MANDATORY to clear duplicate records.');
      return;
    }
    setSubmitting(true);
    setError('');

    await onConfirm({
      portal_ref_no: refNo,
      comments: comments.trim(),
      attachment_base64: fileB64,
      attachment_filename: file ? file.name : ''
    });

    setSubmitting(false);
  };

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(15, 23, 42, 0.65)', backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 9999, padding: '20px'
    }}>
      <div style={{
        background: '#ffffff', borderRadius: '12px', width: '100%', maxWidth: '540px',
        boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1), 0 10px 10px -5px rgba(0,0,0,0.04)',
        overflow: 'hidden'
      }}>
        {/* Modal Header */}
        <div style={{
          background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
          padding: '18px 24px', color: '#fff', display: 'flex',
          justify: 'space-between', alignItems: 'center'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ background: '#f59e0b', color: '#fff', width: '32px', height: '32px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <FontAwesomeIcon icon={faExclamationTriangle} />
            </span>
            <div>
              <div style={{ fontSize: '16px', fontWeight: 700 }}>Clear Duplicate Record</div>
              <div style={{ fontSize: '12px', color: '#94a3b8' }}>Ref No: <code style={{ color: '#38bdf8' }}>{refNo}</code></div>
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: '16px' }}>
            <FontAwesomeIcon icon={faTimes} />
          </button>
        </div>

        {/* Modal Body */}
        <form onSubmit={handleSubmit} style={{ padding: '24px' }}>
          {origRef && (
            <div style={{ padding: '10px 14px', background: '#fee2e2', color: '#991b1b', borderRadius: '8px', border: '1px solid #fca5a5', marginBottom: '16px', fontSize: '12.5px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <FontAwesomeIcon icon={faExclamationTriangle} />
              <span>Duplicated with Reference: <strong>{origRef}</strong></span>
            </div>
          )}

          {error && (
            <div style={{ padding: '10px 14px', background: '#fef2f2', color: '#dc2626', borderRadius: '8px', border: '1px solid #fecaca', marginBottom: '16px', fontSize: '12px', fontWeight: 700 }}>
              {error}
            </div>
          )}

          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', color: '#475569', marginBottom: '6px' }}>
              1. Justification Comment <span style={{ color: '#dc2626', fontWeight: 800 }}>* (REQUIRED)</span>
            </label>
            <textarea
              rows={3}
              className="fi"
              placeholder="Provide detailed justification explaining why this duplicate is approved to be cleared..."
              value={comments}
              onChange={e => setComments(e.target.value)}
              required
              style={{ width: '100%', padding: '10px 12px', fontSize: '13px', borderRadius: '6px' }}
            />
          </div>

          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', color: '#475569', marginBottom: '6px' }}>
              2. Supporting Proof Attachment <span style={{ color: '#dc2626', fontWeight: 800 }}>* (MANDATORY FILE ATTACHMENT)</span>
            </label>
            <div style={{
              border: file ? '2px dashed #10b981' : '2px dashed #f87171',
              padding: '18px', borderRadius: '8px', textAlign: 'center',
              background: file ? '#f0fdf4' : '#fff5f5'
            }}>
              <input
                type="file"
                id="clear-attachment"
                onChange={handleFileChange}
                accept=".pdf,.png,.jpg,.jpeg,.xlsx,.doc,.docx"
                style={{ display: 'none' }}
              />
              <label htmlFor="clear-attachment" style={{ cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px', color: file ? '#059669' : '#dc2626', fontSize: '13px', fontWeight: 700 }}>
                <FontAwesomeIcon icon={file ? faCheckCircle : faUpload} style={{ fontSize: '22px' }} />
                {file ? `Attached: ${file.name} (${Math.round(file.size / 1024)} KB)` : 'Click to Upload MANDATORY Proof File (PDF/PNG/JPG/XLSX) *'}
              </label>
            </div>
          </div>

          {/* Modal Footer */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', pt: '16px', borderTop: '1px solid #e2e8f0' }}>
            <button type="button" className="btn btn-g" onClick={onClose} disabled={submitting}>
              Cancel
            </button>
            <button type="submit" className="btn" style={{ background: '#10b981', color: '#fff', fontWeight: 700 }} disabled={submitting}>
              <FontAwesomeIcon icon={faCheckCircle} /> {submitting ? 'Clearing Record...' : 'Approve & Clear Record'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
