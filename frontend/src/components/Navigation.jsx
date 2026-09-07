import React from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faHouse,
  faPenToSquare,
  faFileLines,
  faMagnifyingGlass,

  faBell,
  faChartColumn,
  faClockRotateLeft,
  faSearch,
  faUsers,
  faChartLine,
  faEnvelope,
} from "@fortawesome/free-solid-svg-icons";

export function Sidebar({
  activePage,
  setActivePage,
  dupCount,
  notifCount,
  user,
}) {
  const isAdmin =
    user?.role === "admin" || user?.role === "supervisor";

  let navItems = [
    {
      id: "dashboard",
      label: "Dashboard",
      icon: faHouse,
      group: "core",
    },
    {
      id: "manual",
      label: "Manual Entry",
      icon: faPenToSquare,
      tag: "NEW",
      group: "core",
    },
    // {
    //   id: "excel",
    //   label: "Excel Bulk Upload",
    //   icon: faFileExcel,
    //   group: "core",
    // },
    {
      id: "documents",
      label: "All Records",
      icon: faFileLines,
      group: "data",
    },
    {
      id: "duplicates",
      label: "Duplicates & Revalidate",
      icon: faMagnifyingGlass,
      badge: dupCount,
      group: "data",
    },
    {
      id: "alerts",
      label: "Alerts",
      icon: faBell,
      badge: notifCount,
      group: "data",
    },
    {
      id: "reports",
      label: "MIS Reports",
      icon: faChartColumn,
      group: "data",
    },
    {
      id: "audit",
      label: "Audit Log",
      icon: faClockRotateLeft,
      group: "data",
    },
    {
      id: "search",
      label: "Search",
      icon: faSearch,
    },
    {
      id: "email_recipients",
      label: "Email Alerts",
      icon: faEnvelope,
      group: "admin",
    },
  ];

  if (!isAdmin) {
    const allowed = [
      "dashboard",
      "manual",
      "search",
      "documents",
      "alerts",
    ];

    navItems = navItems.filter((item) =>
      allowed.includes(item.id)
    );
  } else {
    navItems = navItems.filter(
      (item) => item.id !== "manual"
    );

    navItems.push({
      id: "tat",
      label: "Employee TAT",
      icon: faChartLine,
      group: "admin",
    });

    navItems.push({
      id: "users",
      label: "User Management",
      icon: faUsers,
      group: "admin",
    });
  }

  const coreItems = navItems.filter(
    (i) => i.group === "core"
  );
  const dataItems = navItems.filter(
    (i) => i.group === "data"
  );
  const adminItems = navItems.filter(
    (i) => i.group === "admin"
  );

  return (
    <div className="sb">
      <div className="sb-brand">
        <div className="sb-logo-row">
          <div className="sb-logo">
            <img
              src="/UBL.png"
              alt="UBL"
              style={{ width: "48px", opacity: 0.9 }}
            />
          </div>

          <div>
            <div className="sb-name">Operations</div>
            <div className="sb-sub">Trade Finance</div>
          </div>
        </div>

        <div className="sb-status">
          <div className="sb-dot"></div>
          Systems Online
        </div>
      </div>

      <div
        className="sb-sec"
        style={{ flex: 1, overflowY: "auto" }}
      >
        {coreItems.length > 0 && (
          <div className="sb-lbl">Core Modules</div>
        )}

        {coreItems.map((item) => (
          <button
            key={item.id}
            className={`sb-item ${
              activePage === item.id ? "on" : ""
            }`}
            onClick={() => setActivePage(item.id)}
          >
            <span className="sb-ic">
              <FontAwesomeIcon icon={item.icon} />
            </span>

            <span>{item.label}</span>

            {item.tag && (
              <span className="sb-tag sb-tag-g">
                {item.tag}
              </span>
            )}
          </button>
        ))}

        {dataItems.length > 0 && (
          <div
            className="sb-lbl"
            style={{ marginTop: "14px" }}
          >
            Data & Reports
          </div>
        )}

        {dataItems.map((item) => (
          <button
            key={item.id}
            className={`sb-item ${
              activePage === item.id ? "on" : ""
            }`}
            onClick={() => setActivePage(item.id)}
          >
            <span className="sb-ic">
              <FontAwesomeIcon icon={item.icon} />
            </span>

            <span>{item.label}</span>

            {item.badge > 0 && (
              <span className="sb-badge">
                {item.badge}
              </span>
            )}
          </button>
        ))}

        {adminItems.length > 0 && (
          <div
            className="sb-lbl"
            style={{ marginTop: "14px" }}
          >
            Administration
          </div>
        )}

        {adminItems.map((item) => (
          <button
            key={item.id}
            className={`sb-item ${
              activePage === item.id ? "on" : ""
            }`}
            onClick={() => setActivePage(item.id)}
          >
            <span className="sb-ic">
              <FontAwesomeIcon icon={item.icon} />
            </span>

            <span>{item.label}</span>
          </button>
        ))}
      </div>

      <div className="sb-ft">
        OCR Duplicate Detection System
        <br />
        v2.1.0 — Internal
      </div>
    </div>
  );
}

export function Topbar({
  title,
  subtitle,
  doLogout,
  notifCount,
  user,
  onNotifClick,
}) {
  const initials = user?.name
    ? user.name.substring(0, 2).toUpperCase()
    : "OP";

  return (
    <div className="topbar">
      <div className="tb-l">
        <div className="tb-title">{title}</div>
        <div className="tb-sep">/</div>
        <div className="tb-sub">{subtitle}</div>
      </div>

      <div className="tb-r">
        <button 
          className="notif-btn" 
          onClick={onNotifClick}
          title="Notifications & Alerts"
          style={{ cursor: 'pointer', position: 'relative' }}
        >
          <FontAwesomeIcon icon={faBell} />
          {notifCount > 0 && (
            <span style={{ 
              position: 'absolute', 
              top: '-4px', 
              right: '-4px', 
              background: '#ef4444', 
              color: '#fff', 
              borderRadius: '10px', 
              padding: '1px 5px', 
              fontSize: '9px', 
              fontWeight: 700 
            }}>
              {notifCount}
            </span>
          )}
        </button>

        <div className="user-pill">
          <div className="user-av">{initials}</div>

          <span>{user?.email || "operator@bank.com"}</span>

          {user?.role && (
            <span
              className="sb-tag sb-tag-g"
              style={{
                marginLeft: "6px",
                fontSize: "10px",
              }}
            >
              {user.role}
            </span>
          )}
        </div>

        <button
          className="btn btn-g btn-sm"
          onClick={doLogout}
          style={{ marginLeft: "10px" }}
        >
          Logout
        </button>
      </div>
    </div>
  );
}