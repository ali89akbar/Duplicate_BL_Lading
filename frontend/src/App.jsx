import React, { useState, useEffect } from 'react';
import { useAuth } from './hooks/useAuth';
import { GET } from './utils/api';
import { Sidebar, Topbar } from './components/Navigation';
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';
import { ManualEntryPage } from './pages/ManualEntryPage';
import { ExcelBulkPage } from './pages/ExcelBulkPage';
import { AllRecordsPage } from './pages/AllRecordsPage';
import { UserManagementPage } from './pages/UserManagementPage';
import { EmployeeTATPage } from './pages/EmployeeTATPage';
import { DuplicatesPage } from './pages/DuplicatesPage';
import { AlertsPage } from './pages/AlertsPage';
import { ReportsPage } from './pages/ReportsPage';
import { AuditLogPage } from './pages/AuditLogPage';
import { SearchPage } from './pages/SearchPage';
import { EmailRecipientsPage } from './pages/EmailRecipientsPage';

const PAGES = {
  dashboard: ['Dashboard', 'Real-time overview'],
  manual:    ['Manual Entry', 'Module 1 — Reference-first entry'],
  excel:     ['Excel Bulk Upload', 'Multi-row processing'],
  documents: ['All Records', 'Click pending record to edit'],
  duplicates:['Duplicates & Revalidate', 'Detection log & rejection workflow'],
  alerts:    ['Alerts', 'Email notification log'],
  reports:   ['MIS Reports', 'Management information system'],
  audit:     ['Audit Log', 'System action trail'],
  search:    ['Search', 'Full-text search'],
  users:     ['User Management', 'Manage system users and roles'],
  tat:       ['Employee TAT', 'Date-wise records per employee'],
  email_recipients: ['Email Alerts', 'SMTP server configuration & recipient distribution list'],
};

export default function App() {
  const { isAuthenticated, doLogout, authUser } = useAuth();
  const [activePage, setActivePage] = useState('dashboard');
  const [dupCount, setDupCount] = useState(0);
  const [notifCount, setNotifCount] = useState(0);

  useEffect(() => {
    if (isAuthenticated) {
      GET('/notifications?limit=50').then(res => {
        if (res?.unread != null) setNotifCount(res.unread);
      });
      GET('/duplicates/stats').then(res => {
        if (res?.total != null) setDupCount(res.total);
      });
    }
  }, [isAuthenticated]);

  if (!isAuthenticated) {
    return <LoginPage />;
  }

  const [title, subtitle] = PAGES[activePage] || [activePage, ''];

  return (
    <>
      <Sidebar 
        activePage={activePage} 
        setActivePage={setActivePage} 
        dupCount={dupCount} 
        notifCount={notifCount} 
        user={authUser}
      />
      <div className="main">
        <Topbar 
          title={title} 
          subtitle={subtitle} 
          doLogout={doLogout} 
          notifCount={notifCount} 
          user={authUser}
          onNotifClick={() => setActivePage('alerts')}
        />
        <div className="content">
          {activePage === 'dashboard' && <div className="page on"><DashboardPage user={authUser} /></div>}
          {activePage === 'manual' && <div className="page on"><ManualEntryPage user={authUser} /></div>}
          {activePage === 'excel' && <div className="page on"><ExcelBulkPage user={authUser} /></div>}
          {activePage === 'documents' && <div className="page on"><AllRecordsPage /></div>}
          {activePage === 'users' && <div className="page on"><UserManagementPage /></div>}
          {activePage === 'tat' && <div className="page on"><EmployeeTATPage /></div>}
          {activePage === 'duplicates' && <div className="page on"><DuplicatesPage /></div>}
          {activePage === 'alerts' && <div className="page on"><AlertsPage /></div>}
          {activePage === 'reports' && <div className="page on"><ReportsPage /></div>}
          {activePage === 'audit' && <div className="page on"><AuditLogPage /></div>}
          {activePage === 'search' && <div className="page on"><SearchPage /></div>}
          {activePage === 'email_recipients' && <div className="page on"><EmailRecipientsPage /></div>}
        </div>
      </div>
    </>
  );
}
