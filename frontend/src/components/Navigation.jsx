import React from 'react';

export function Sidebar({ activePage, setActivePage, dupCount, notifCount, user }) {
  const isAdmin = user?.role === 'admin' || user?.role === 'supervisor';
  
  let navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: '🏠', group: 'core' },
    { id: 'manual', label: 'Manual Entry', icon: '✍', tag: 'NEW', group: 'core' },
    //{ id: 'excel', label: 'Excel Bulk Upload', icon: '📋', group: 'core' },
    { id: 'documents', label: 'All Records', icon: '📄', group: 'data' },
    { id: 'duplicates', label: 'Duplicates & Revalidate', icon: '🔍', badge: dupCount, group: 'data' },
    { id: 'alerts', label: 'Alerts', icon: '🔔', badge: notifCount, group: 'data' },
    { id: 'reports', label: 'MIS Reports', icon: '📊', group: 'data' },
    { id: 'audit', label: 'Audit Log', icon: '🕒', group: 'data' },
    { id: 'search', label: 'Search', icon: '🔎', group: 'data' },
  ];

  if (!isAdmin) {
    // Regular users only see specific pages
    const allowed = ['dashboard', 'manual', 'search', 'documents', 'alerts'];
    navItems = navItems.filter(item => allowed.includes(item.id));
  } else {
    navItems = navItems.filter(item => item.id !== 'manual');
    // Admins get user management and employee TAT
    navItems.push({ id: 'tat', label: 'Employee TAT', icon: '📈', group: 'admin' });
    navItems.push({ id: 'users', label: 'User Management', icon: '👥', group: 'admin' });
  }

  const coreItems = navItems.filter(i => i.group === 'core');
  const dataItems = navItems.filter(i => i.group === 'data');
  const adminItems = navItems.filter(i => i.group === 'admin');

  return (
    <div className="sb">
      <div className="sb-brand">
        <div className="sb-logo-row">
          <div className="sb-logo">
            <img src="/UBL.png" alt="UBL" style={{ width: '48px', opacity: 0.9 }} />
          </div>
          <div>
            <div className="sb-name">Operations</div>
            <div className="sb-sub">Trade Finance</div>
          </div>
        </div>
        <div className="sb-status">
          <div className="sb-dot"></div> Systems Online
        </div>
      </div>
      <div className="sb-sec" style={{ flex: 1, overflowY: 'auto' }}>
        {coreItems.length > 0 && <div className="sb-lbl">Core Modules</div>}
        {coreItems.map(item => (
          <button key={item.id} className={`sb-item ${activePage === item.id ? 'on' : ''}`} onClick={() => setActivePage(item.id)}>
            <span className="sb-ic">{item.icon}</span> {item.label}
            {item.tag && <span className="sb-tag sb-tag-g">{item.tag}</span>}
          </button>
        ))}
        
        {dataItems.length > 0 && <div className="sb-lbl" style={{ marginTop: '14px' }}>Data & Reports</div>}
        {dataItems.map(item => (
          <button key={item.id} className={`sb-item ${activePage === item.id ? 'on' : ''}`} onClick={() => setActivePage(item.id)}>
            <span className="sb-ic">{item.icon}</span> {item.label}
            {item.badge > 0 && <span className="sb-badge">{item.badge}</span>}
          </button>
        ))}

        {adminItems.length > 0 && <div className="sb-lbl" style={{ marginTop: '14px' }}>Administration</div>}
        {adminItems.map(item => (
          <button key={item.id} className={`sb-item ${activePage === item.id ? 'on' : ''}`} onClick={() => setActivePage(item.id)}>
            <span className="sb-ic">{item.icon}</span> {item.label}
          </button>
        ))}
      </div>
      <div className="sb-ft">
        OCR Duplicate Detection System<br/>v2.1.0 — Internal
      </div>
    </div>
  );
}

export function Topbar({ title, subtitle, doLogout, notifCount, user }) {
  const initials = user?.name ? user.name.substring(0, 2).toUpperCase() : 'OP';
  return (
    <div className="topbar">
      <div className="tb-l">
        <div className="tb-title">{title}</div>
        <div className="tb-sep">/</div>
        <div className="tb-sub">{subtitle}</div>
      </div>
      <div className="tb-r">
        <button className="notif-btn">
          🔔
          {notifCount > 0 && <div className="dot"></div>}
        </button>
        <div className="user-pill">
          <div className="user-av">{initials}</div>
          <span>{user?.email || 'operator@bank.com'}</span>
          {user?.role && <span className="sb-tag sb-tag-g" style={{ marginLeft: '6px', fontSize: '10px' }}>{user.role}</span>}
        </div>
        <button className="btn btn-g btn-sm" onClick={doLogout} style={{ marginLeft: '10px' }}>Logout</button>
      </div>
    </div>
  );
}
