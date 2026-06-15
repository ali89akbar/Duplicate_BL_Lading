import React from 'react';
import { StatusBadge, CurrentStatusBadge } from '../utils/formatters';

export function StatCard({ label, value, hint, colorClass }) {
  return (
    <div className={`stat ${colorClass}`}>
      <div className="s-lbl">{label}</div>
      <div className="s-val">{value != null ? value : '—'}</div>
      {hint && <div className="s-hint">{hint}</div>}
    </div>
  );
}

export function DataTable({ columns, rows, emptyText, renderRow }) {
  return (
    <div className="tw">
      <table>
        <thead>
          <tr>
            {columns.map((col, i) => <th key={i}>{col}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows && rows.length > 0 ? (
            rows.map(renderRow)
          ) : (
            <tr>
              <td colSpan={columns.length} style={{ textAlign: 'center', padding: '24px', color: 'var(--txt3)' }}>
                {emptyText || 'No records found'}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

export function Spinner() {
  return <div className="spin"></div>;
}

export function InputField({ label, name, type = 'text', value, onChange, required }) {
  return (
    <div className="fg">
      <label className="fl">{label} {required && <span style={{ color: 'var(--red)' }}>*</span>}</label>
      <input 
        type={type} 
        name={name}
        className="fi" 
        value={value} 
        onChange={onChange}
        required={required}
      />
    </div>
  );
}

export function SelectField({ label, name, value, onChange, children, required }) {
  return (
    <div className="fg">
      <label className="fl">{label} {required && <span style={{ color: 'var(--red)' }}>*</span>}</label>
      <select 
        name={name}
        className="fsel" 
        value={value} 
        onChange={onChange}
        required={required}
      >
        {children}
      </select>
    </div>
  );
}

export function Button({ label, onClick, variant = 'p', disabled }) {
  return (
    <button 
      className={`btn btn-${variant}`} 
      onClick={onClick} 
      disabled={disabled}
      type="button"
    >
      {label}
    </button>
  );
}
