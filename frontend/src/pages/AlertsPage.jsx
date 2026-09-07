import { useState, useEffect, useCallback } from 'react';
import { GET, PATCH } from '../utils/api';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCheck, faBell, faTrophy } from '@fortawesome/free-solid-svg-icons';


const FILTER_TABS = [
  { key: 'all',        label: 'All' },
  { key: 'unread',     label: 'Unread' },
  { key: 'duplicate',  label: 'Duplicates' },
  { key: 'revalidate', label: 'Revalidates' },
];

function getBorderClass(type, severity) {
  const s = (severity || '').toUpperCase();
  const t = (type || '').toUpperCase();
  if (s === 'HIGH' || t === 'DUPLICATE') return 'b-err';
  if (s === 'MEDIUM' || t === 'REVALIDATE') return 'b-warn';
  return 'b-blue';
}

function getSeverityBadgeClass(severity) {
  const s = (severity || '').toUpperCase();
  if (s === 'HIGH')   return 'badge b-err';
  if (s === 'MEDIUM') return 'badge b-warn';
  return 'badge b-blue';
}

function formatDate(iso) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleString(undefined, {
      year: 'numeric', month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

function filterAlerts(alerts, tab) {
  if (tab === 'all')        return alerts;
  if (tab === 'unread')     return alerts.filter(a => !a.read);
  if (tab === 'duplicate')  return alerts.filter(a => (a.type || '').toUpperCase() === 'DUPLICATE');
  if (tab === 'revalidate') return alerts.filter(a => (a.type || '').toUpperCase() === 'REVALIDATE');
  return alerts;
}

export function AlertsPage() {
  const [alerts, setAlerts]           = useState([]);
  const [total, setTotal]             = useState(0);
  const [unread, setUnread]           = useState(0);
  const [activeTab, setActiveTab]     = useState('all');
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState(null);
  const [markingAll, setMarkingAll]   = useState(false);
  const [markingId, setMarkingId]     = useState(null);

  const fetchAlerts = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await GET('/notifications?limit=50');
      setAlerts(data.notifications || []);
      setTotal(data.total ?? (data.notifications || []).length);
      setUnread(data.unread ?? (data.notifications || []).filter(n => !n.read).length);
    } catch (err) {
      setError('Failed to load alerts. Please try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAlerts(); }, [fetchAlerts]);

  const markOneRead = useCallback(async (nid, e) => {
    if (e) e.stopPropagation();
    if (markingId === nid) return;
    setMarkingId(nid);
    try {
      await PATCH(`/notifications/${nid}/read`);
      setAlerts(prev => prev.map(a => a.id === nid ? { ...a, read: true } : a));
      setUnread(prev => Math.max(0, prev - 1));
    } catch {
      /* silently ignore */
    } finally {
      setMarkingId(null);
    }
  }, [markingId]);

  const handleCardClick = useCallback((alert) => {
    if (!alert.read) markOneRead(alert.id, null);
  }, [markOneRead]);

  const markAllRead = useCallback(async () => {
    if (markingAll) return;
    setMarkingAll(true);
    try {
      await PATCH('/notifications/mark-all-read');
      setAlerts(prev => prev.map(a => ({ ...a, read: true })));
      setUnread(0);
    } catch {
      /* silently ignore */
    } finally {
      setMarkingAll(false);
    }
  }, [markingAll]);

  const readCount      = total - unread;
  const visibleAlerts  = filterAlerts(alerts, activeTab);

  return (
    <div style={{ padding: '24px', maxWidth: '900px', margin: '0 auto' }}>

      {/* ── Page Header ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
        <h1 style={{ margin: 0, fontSize: '1.6rem', fontWeight: 700 }}><FontAwesomeIcon icon={faBell} /> Alerts</h1>
        <button
          className="btn btn-g btn-sm"
          onClick={markAllRead}
          disabled={markingAll || unread === 0}
          title="Mark all notifications as read"
        >
          {markingAll ? 'Marking…' : <><FontAwesomeIcon icon={faCheck} /> Mark All Read</>}
        </button>
      </div>

      {/* ── Summary Bar ── */}
      <div className="card" style={{ display: 'flex', gap: '24px', padding: '16px 20px', marginBottom: '20px', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <span style={{ fontSize: '1.6rem', fontWeight: 700 }}>{total}</span>
          <span style={{ fontSize: '0.78rem', color: 'var(--text-muted, #888)', marginTop: '2px' }}>Total Alerts</span>
        </div>
        <div style={{ width: '1px', background: 'var(--border, #e0e0e0)' }} />
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '1.6rem', fontWeight: 700 }}>{unread}</span>
            {unread > 0 && (
              <span className="badge b-err" style={{ fontSize: '0.7rem', padding: '2px 7px' }}>{unread}</span>
            )}
          </span>
          <span style={{ fontSize: '0.78rem', color: 'var(--text-muted, #888)', marginTop: '2px' }}>Unread</span>
        </div>
        <div style={{ width: '1px', background: 'var(--border, #e0e0e0)' }} />
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <span style={{ fontSize: '1.6rem', fontWeight: 700, color: 'var(--color-success, #22c55e)' }}>{readCount}</span>
          <span style={{ fontSize: '0.78rem', color: 'var(--text-muted, #888)', marginTop: '2px' }}>Read</span>
        </div>
      </div>

      {/* ── Filter Tabs ── */}
      <div className="pills" style={{ marginBottom: '16px' }}>
        {FILTER_TABS.map(tab => (
          <button
            key={tab.key}
            className={`pill${activeTab === tab.key ? ' on' : ''}`}
            onClick={() => setActiveTab(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── States ── */}
      {loading && (
        <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--text-muted, #888)' }}>
          Loading alerts…
        </div>
      )}

      {!loading && error && (
        <div className="card b-err" style={{ padding: '16px', textAlign: 'center', color: 'var(--color-error, #ef4444)' }}>
          {error}
          <button className="btn btn-sm" style={{ marginLeft: '12px' }} onClick={fetchAlerts}>Retry</button>
        </div>
      )}

      {!loading && !error && visibleAlerts.length === 0 && (
        <div style={{ textAlign: 'center', padding: '64px 0' }}>
          <div style={{ fontSize: '3rem', marginBottom: '12px' }}><FontAwesomeIcon icon={faTrophy} /></div>
          <p style={{ fontSize: '1.1rem', fontWeight: 600, margin: '0 0 6px' }}>
            {activeTab === 'unread' ? 'No unread alerts!' : 'No alerts here'}
          </p>
          <p style={{ color: 'var(--text-muted, #888)', margin: 0 }}>
            {activeTab === 'unread'
              ? 'You\'re all caught up.'
              : 'Nothing to display for this filter.'}
          </p>
        </div>
      )}

      {/* ── Alert List ── */}
      {!loading && !error && visibleAlerts.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {visibleAlerts.map(alert => {
            const borderClass = getBorderClass(alert.type, alert.severity);
            const isMarkingThis = markingId === alert.id;

            return (
              <div
                key={alert.id}
                className={`card ${borderClass}`}
                onClick={() => handleCardClick(alert)}
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '12px',
                  padding: '14px 16px',
                  cursor: alert.read ? 'default' : 'pointer',
                  opacity: isMarkingThis ? 0.65 : 1,
                  transition: 'opacity 0.2s',
                  borderLeft: '4px solid',
                }}
              >
                {/* Unread dot */}
                <div style={{ paddingTop: '4px', width: '10px', flexShrink: 0 }}>
                  {!alert.read && (
                    <span
                      title="Unread"
                      style={{
                        display: 'inline-block',
                        width: '9px',
                        height: '9px',
                        borderRadius: '50%',
                        background: 'var(--color-primary, #3b82f6)',
                      }}
                    />
                  )}
                </div>

                {/* Content */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '4px' }}>
                    <span style={{ fontWeight: 700, fontSize: '0.95rem' }}>{alert.title}</span>
                    {alert.severity && (
                      <span className={getSeverityBadgeClass(alert.severity)} style={{ fontSize: '0.7rem', padding: '2px 8px' }}>
                        {alert.severity}
                      </span>
                    )}
                    {alert.type && (
                      <span className="badge" style={{ fontSize: '0.7rem', padding: '2px 8px', background: 'var(--bg-muted, #f3f4f6)', color: 'var(--text-secondary, #555)' }}>
                        {alert.type}
                      </span>
                    )}
                  </div>

                  {alert.message && (
                    <p style={{ margin: '0 0 6px', fontSize: '0.85rem', color: 'var(--text-secondary, #555)', lineHeight: 1.45 }}>
                      {alert.message}
                    </p>
                  )}

                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                    {alert.doc_id && (
                      <code className="mono" style={{ fontSize: '0.78rem', background: 'var(--bg-muted, #f3f4f6)', padding: '2px 6px', borderRadius: '4px' }}>
                        {alert.doc_id}
                      </code>
                    )}
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted, #888)' }}>
                      {formatDate(alert.created_at)}
                    </span>
                  </div>
                </div>

                {/* Mark Read button */}
                {!alert.read && (
                  <button
                    className="btn btn-sm"
                    disabled={isMarkingThis}
                    onClick={(e) => markOneRead(alert.id, e)}
                    style={{ flexShrink: 0, whiteSpace: 'nowrap' }}
                    title="Mark as read"
                  >
                    {isMarkingThis ? '…' : 'Mark Read'}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default AlertsPage;
