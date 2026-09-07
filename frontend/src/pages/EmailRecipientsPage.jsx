import React, { useState, useEffect } from 'react';
import { GET, POST, DELETE, PATCH } from '../utils/api';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faEnvelope, faPlus, faTrash, faPaperPlane, faServer, faCheckCircle, faExclamationTriangle, faGear, faSave } from '@fortawesome/free-solid-svg-icons';

export function EmailRecipientsPage() {
  const [data, setData] = useState({ recipients: [], smtp_host: '10.224.118.151', smtp_port: 25, sender: 'noreply-ocr-alerts@ubl.com.pk' });
  const [loading, setLoading] = useState(true);
  const [newEmail, setNewEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  // SMTP Settings edit modal/state
  const [editingSmtp, setEditingSmtp] = useState(false);
  const [smtpForm, setSmtpForm] = useState({ smtp_host: '10.224.118.151', smtp_port: 25, sender: 'noreply-ocr-alerts@ubl.com.pk' });
  const [savingSmtp, setSavingSmtp] = useState(false);

  // Test email state
  const [testEmail, setTestEmail] = useState('');
  const [testing, setTesting] = useState(false);
  const [testMsg, setTestMsg] = useState(null);
  const [testErr, setTestErr] = useState(null);

  const fetchRecipients = async () => {
    setLoading(true);
    const res = await GET('/admin/alert_recipients');
    if (res) {
      setData(res);
      setSmtpForm({ smtp_host: res.smtp_host || '10.224.118.151', smtp_port: res.smtp_port || 25, sender: res.sender || 'noreply-ocr-alerts@ubl.com.pk' });
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchRecipients();
  }, []);

  const handleSaveSmtp = async (e) => {
    e.preventDefault();
    setSavingSmtp(true);
    setError(null);
    setSuccess(null);

    const { data: res, status } = await PATCH('/admin/alert_recipients', smtpForm);
    setSavingSmtp(false);

    if (status === 200) {
      setSuccess(`Updated SMTP server configuration to ${smtpForm.smtp_host}:${smtpForm.smtp_port}.`);
      setEditingSmtp(false);
      fetchRecipients();
    } else {
      setError(res?.error || 'Failed to update SMTP configuration.');
    }
  };

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!newEmail || !newEmail.includes('@')) {
      setError('Please enter a valid email address.');
      return;
    }
    setSubmitting(true);
    setError(null);
    setSuccess(null);

    const { data: res, status } = await POST('/admin/alert_recipients', { email: newEmail });
    setSubmitting(false);

    if (status === 200) {
      setSuccess(`Added ${newEmail} to alert recipient distribution list.`);
      setNewEmail('');
      fetchRecipients();
    } else {
      setError(res?.error || 'Failed to add email recipient.');
    }
  };

  const handleDelete = async (email) => {
    if (!window.confirm(`Are you sure you want to remove ${email} from automatic alert notifications?`)) {
      return;
    }
    setError(null);
    setSuccess(null);
    const { data: res, status } = await DELETE(`/admin/alert_recipients?email=${encodeURIComponent(email)}`);
    if (status === 200) {
      setSuccess(`Removed ${email} from recipient list.`);
      fetchRecipients();
    } else {
      setError(res?.error || 'Failed to remove recipient.');
    }
  };

  const handleTestEmail = async (e) => {
    e.preventDefault();
    if (!testEmail || !testEmail.includes('@')) {
      setTestErr('Please enter a valid test email address.');
      return;
    }
    setTesting(true);
    setTestMsg(null);
    setTestErr(null);

    const { data: res, status } = await POST('/admin/alert_recipients/test', { email: testEmail });
    setTesting(false);

    if (status === 200) {
      setTestMsg(res?.message || `Test email dispatched successfully to ${testEmail}!`);
    } else {
      setTestErr(res?.error || 'SMTP Connection Test failed.');
    }
  };

  return (
    <>
      {/* Top Banner: SMTP Server Information */}
      <div className="card mb20" style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)', color: '#fff', border: 'none' }}>
        <div className="card-b" style={{ padding: '20px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
              <span style={{ background: '#3b82f6', color: '#fff', width: 32, height: 32, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <FontAwesomeIcon icon={faServer} />
              </span>
              <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: '-0.02em' }}>SMTP Auto Mail Integration</div>
            </div>
            <div style={{ fontSize: 13, color: '#94a3b8', maxWidth: 600 }}>
              Automatic email alerts are dispatched immediately upon duplicate document detection or reference reuse (revalidate).
            </div>
          </div>
          
          <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
            <div style={{ display: 'flex', gap: 20, background: 'rgba(255,255,255,0.06)', padding: '12px 18px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)' }}>
              <div>
                <div style={{ fontSize: 10, textTransform: 'uppercase', color: '#94a3b8', fontWeight: 700, letterSpacing: '.06em' }}>SMTP Host & Port</div>
                <div style={{ fontSize: 13, fontWeight: 700, fontFamily: 'JetBrains Mono, monospace', color: '#38bdf8' }}>{data.smtp_host}:{data.smtp_port}</div>
              </div>
              <div style={{ width: 1, background: 'rgba(255,255,255,0.1)' }} />
              <div>
                <div style={{ fontSize: 10, textTransform: 'uppercase', color: '#94a3b8', fontWeight: 700, letterSpacing: '.06em' }}>Sender Address</div>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{data.sender}</div>
              </div>
              <div style={{ width: 1, background: 'rgba(255,255,255,0.1)' }} />
              <div>
                <div style={{ fontSize: 10, textTransform: 'uppercase', color: '#94a3b8', fontWeight: 700, letterSpacing: '.06em' }}>Distribution List</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#4ade80' }}>{data.recipients.length} Email(s)</div>
              </div>
            </div>

            <button
              onClick={() => setEditingSmtp(!editingSmtp)}
              className="btn btn-g btn-sm"
              style={{ color: '#fff', borderColor: 'rgba(255,255,255,0.2)' }}
            >
              <FontAwesomeIcon icon={faGear} /> {editingSmtp ? 'Close Settings' : 'Configure SMTP'}
            </button>
          </div>
        </div>

        {/* Expandable SMTP Settings Editor */}
        {editingSmtp && (
          <div style={{ padding: '16px 24px 20px', borderTop: '1px solid rgba(255,255,255,0.1)', background: 'rgba(0,0,0,0.2)' }}>
            <form onSubmit={handleSaveSmtp} style={{ display: 'grid', gridTemplateColumns: '1fr 120px 1fr auto', gap: 14, alignItems: 'end' }}>
              <div>
                <label style={{ fontSize: 11, color: '#94a3b8', textTransform: 'uppercase', fontWeight: 700, display: 'block', marginBottom: 4 }}>SMTP Host IP / Address</label>
                <input
                  type="text"
                  className="form-input"
                  value={smtpForm.smtp_host}
                  onChange={e => setSmtpForm({ ...smtpForm, smtp_host: e.target.value })}
                  style={{ background: '#0f172a', color: '#fff', borderColor: 'rgba(255,255,255,0.2)' }}
                  required
                />
              </div>
              <div>
                <label style={{ fontSize: 11, color: '#94a3b8', textTransform: 'uppercase', fontWeight: 700, display: 'block', marginBottom: 4 }}>Port</label>
                <input
                  type="number"
                  className="form-input"
                  value={smtpForm.smtp_port}
                  onChange={e => setSmtpForm({ ...smtpForm, smtp_port: e.target.value })}
                  style={{ background: '#0f172a', color: '#fff', borderColor: 'rgba(255,255,255,0.2)' }}
                  required
                />
              </div>
              <div>
                <label style={{ fontSize: 11, color: '#94a3b8', textTransform: 'uppercase', fontWeight: 700, display: 'block', marginBottom: 4 }}>Sender Email Address</label>
                <input
                  type="email"
                  className="form-input"
                  value={smtpForm.sender}
                  onChange={e => setSmtpForm({ ...smtpForm, sender: e.target.value })}
                  style={{ background: '#0f172a', color: '#fff', borderColor: 'rgba(255,255,255,0.2)' }}
                  required
                />
              </div>
              <button type="submit" className="btn btn-p" disabled={savingSmtp}>
                <FontAwesomeIcon icon={faSave} /> {savingSmtp ? 'Saving...' : 'Save Settings'}
              </button>
            </form>
          </div>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: 20, alignItems: 'start' }}>
        {/* Left Column: Distribution List */}
        <div>
          {error && (
            <div style={{ padding: '12px 16px', background: 'var(--rs)', color: 'var(--red)', borderRadius: 'var(--r)', marginBottom: 16, fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 }}>
              <FontAwesomeIcon icon={faExclamationTriangle} />
              {error}
            </div>
          )}
          {success && (
            <div style={{ padding: '12px 16px', background: '#ecfdf5', color: '#047857', borderRadius: 'var(--r)', marginBottom: 16, fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 }}>
              <FontAwesomeIcon icon={faCheckCircle} />
              {success}
            </div>
          )}

          <div className="card">
            <div className="card-hd" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div className="card-t" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <FontAwesomeIcon icon={faEnvelope} style={{ color: 'var(--blue)' }} />
                Alert Recipients Distribution List
              </div>
              <span className="badge b-blue">{data.recipients.length} emails</span>
            </div>

            <div className="card-b" style={{ padding: 0 }}>
              {loading ? (
                <div style={{ padding: 30, textAlign: 'center', color: 'var(--txt3)' }}>Loading recipients...</div>
              ) : data.recipients.length === 0 ? (
                <div style={{ padding: 30, textAlign: 'center', color: 'var(--txt3)' }}>No recipient emails configured yet. Add emails below to receive automatic SMTP alerts.</div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: 'var(--bg)', borderBottom: '1px solid var(--bdr)' }}>
                      <th style={{ padding: '10px 16px', textAlign: 'left', fontSize: 11, color: 'var(--txt2)', textTransform: 'uppercase', letterSpacing: '.06em' }}>Recipient Email</th>
                      <th style={{ padding: '10px 16px', textAlign: 'left', fontSize: 11, color: 'var(--txt2)', textTransform: 'uppercase', letterSpacing: '.06em' }}>Added By</th>
                      <th style={{ padding: '10px 16px', textAlign: 'left', fontSize: 11, color: 'var(--txt2)', textTransform: 'uppercase', letterSpacing: '.06em' }}>Date Added</th>
                      <th style={{ padding: '10px 16px', textAlign: 'right', fontSize: 11, color: 'var(--txt2)', textTransform: 'uppercase', letterSpacing: '.06em' }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.recipients.map((r, idx) => (
                      <tr key={r.email} style={{ borderBottom: '1px solid var(--bdr)' }}>
                        <td style={{ padding: '12px 16px', fontWeight: 600 }}>
                          <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#22c55e', display: 'inline-block' }}></span>
                            {r.email}
                          </span>
                        </td>
                        <td style={{ padding: '12px 16px', color: 'var(--txt2)', fontSize: 12 }}>{r.added_by || 'Admin'}</td>
                        <td style={{ padding: '12px 16px', color: 'var(--txt3)', fontSize: 11 }} className="mono">
                          {r.added_at ? r.added_at.replace('T', ' ') : 'Initial'}
                        </td>
                        <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                          <button
                            onClick={() => handleDelete(r.email)}
                            className="btn btn-g btn-xs"
                            style={{ color: 'var(--red)', borderColor: '#fca5a5' }}
                            title="Remove recipient"
                          >
                            <FontAwesomeIcon icon={faTrash} /> Remove
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>

        {/* Right Column: Forms (Add Recipient + SMTP Test) */}
        <div>
          {/* Add New Email Form */}
          <div className="card mb20">
            <div className="card-hd">
              <div className="card-t" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <FontAwesomeIcon icon={faPlus} style={{ color: 'var(--blue)' }} />
                Add New Recipient Email
              </div>
            </div>
            <div className="card-b">
              <form onSubmit={handleAdd}>
                <div className="form-group" style={{ marginBottom: 14 }}>
                  <label className="form-label" style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--txt2)', marginBottom: 6, display: 'block' }}>Email Address</label>
                  <input
                    type="email"
                    className="form-input"
                    placeholder="e.g. manager@bank.com"
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    required
                    style={{ width: '100%', padding: '9px 12px', fontSize: 13 }}
                  />
                </div>
                <button
                  type="submit"
                  className="btn btn-p"
                  disabled={submitting}
                  style={{ width: '100%', justifyContent: 'center' }}
                >
                  <FontAwesomeIcon icon={faPlus} />
                  {submitting ? 'Adding...' : 'Add Recipient Email'}
                </button>
              </form>
            </div>
          </div>

          {/* Test SMTP Dispatch */}
          <div className="card">
            <div className="card-hd">
              <div className="card-t" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <FontAwesomeIcon icon={faPaperPlane} style={{ color: 'var(--blue)' }} />
                Send Test Email (SMTP Test)
              </div>
            </div>
            <div className="card-b">
              {testMsg && (
                <div style={{ padding: '10px 14px', background: '#ecfdf5', color: '#047857', borderRadius: 'var(--r)', marginBottom: 12, fontSize: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <FontAwesomeIcon icon={faCheckCircle} />
                  {testMsg}
                </div>
              )}
              {testErr && (
                <div style={{ padding: '10px 14px', background: 'var(--rs)', color: 'var(--red)', borderRadius: 'var(--r)', marginBottom: 12, fontSize: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <FontAwesomeIcon icon={faExclamationTriangle} />
                  <div>{testErr}</div>
                </div>
              )}
              <form onSubmit={handleTestEmail}>
                <div className="form-group" style={{ marginBottom: 14 }}>
                  <label className="form-label" style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--txt2)', marginBottom: 6, display: 'block' }}>Send Test To Email</label>
                  <input
                    type="email"
                    className="form-input"
                    placeholder="e.g. recipient@bank.com"
                    value={testEmail}
                    onChange={(e) => setTestEmail(e.target.value)}
                    required
                    style={{ width: '100%', padding: '9px 12px', fontSize: 13 }}
                  />
                </div>
                <button
                  type="submit"
                  className="btn btn-g"
                  disabled={testing}
                  style={{ width: '100%', justifyContent: 'center' }}
                >
                  <FontAwesomeIcon icon={faPaperPlane} />
                  {testing ? `Testing ${data.smtp_host}:${data.smtp_port}...` : `Test Dispatch via ${data.smtp_host}:${data.smtp_port}`}
                </button>
              </form>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
