import React, { useState, useMemo, useEffect } from 'react';
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

export function PaginationBar({ currentPage, totalItems, pageSize, onPageChange, onPageSizeChange }) {
  if (!totalItems) return null;

  const isAll = pageSize === 'all';
  const totalPages = isAll ? 1 : Math.ceil(totalItems / pageSize);
  const startItem = isAll ? 1 : (currentPage - 1) * pageSize + 1;
  const endItem = isAll ? totalItems : Math.min(currentPage * pageSize, totalItems);

  // Generate page numbers range
  let pages = [];
  const maxButtons = 5;
  let startPage = Math.max(1, currentPage - Math.floor(maxButtons / 2));
  let endPage = Math.min(totalPages, startPage + maxButtons - 1);
  if (endPage - startPage + 1 < maxButtons) {
    startPage = Math.max(1, endPage - maxButtons + 1);
  }
  for (let i = startPage; i <= endPage; i++) pages.push(i);

  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      padding: '10px 16px', background: '#f8fafc', borderTop: '1px solid #e2e8f0',
      fontSize: '12px', color: '#64748b', flexWrap: 'wrap', gap: '10px'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <span>Showing <strong>{startItem}</strong> to <strong>{endItem}</strong> of <strong>{totalItems}</strong> entries</span>
        {onPageSizeChange && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <label style={{ fontSize: '11px', color: '#64748b' }}>Rows per page:</label>
            <select
              className="fsel"
              style={{ padding: '2px 6px', height: '28px', fontSize: '11px', width: 'auto' }}
              value={pageSize}
              onChange={e => {
                const val = e.target.value === 'all' ? 'all' : Number(e.target.value);
                onPageSizeChange(val);
              }}
            >
              <option value={10}>10</option>
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
              <option value="all">All</option>
            </select>
          </div>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
        <button
          className="btn btn-xs btn-g"
          onClick={() => onPageChange(1)}
          disabled={currentPage === 1 || isAll}
          style={{ padding: '3px 8px', fontSize: '11px' }}
        >
          « First
        </button>
        <button
          className="btn btn-xs btn-g"
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage === 1 || isAll}
          style={{ padding: '3px 8px', fontSize: '11px' }}
        >
          ‹ Prev
        </button>

        {startPage > 1 && !isAll && <span style={{ padding: '0 4px', color: '#94a3b8' }}>...</span>}

        {!isAll && pages.map(p => (
          <button
            key={p}
            className={`btn btn-xs ${p === currentPage ? 'btn-p' : 'btn-g'}`}
            onClick={() => onPageChange(p)}
            style={{
              padding: '3px 8px', fontSize: '11px', fontWeight: p === currentPage ? 700 : 500,
              background: p === currentPage ? '#2563eb' : '#ffffff', color: p === currentPage ? '#ffffff' : '#334155',
              borderColor: '#cbd5e1'
            }}
          >
            {p}
          </button>
        ))}

        {endPage < totalPages && !isAll && <span style={{ padding: '0 4px', color: '#94a3b8' }}>...</span>}

        <button
          className="btn btn-xs btn-g"
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage === totalPages || totalPages === 0 || isAll}
          style={{ padding: '3px 8px', fontSize: '11px' }}
        >
          Next ›
        </button>
        <button
          className="btn btn-xs btn-g"
          onClick={() => onPageChange(totalPages)}
          disabled={currentPage === totalPages || totalPages === 0 || isAll}
          style={{ padding: '3px 8px', fontSize: '11px' }}
        >
          Last »
        </button>
      </div>
    </div>
  );
}

export function DataTable({ columns, rows = [], emptyText, renderRow, initialPageSize = 10, disablePagination = false }) {
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(initialPageSize);

  useEffect(() => {
    setCurrentPage(1);
  }, [rows?.length]);

  const totalItems = rows ? rows.length : 0;
  const paginatedRows = useMemo(() => {
    if (disablePagination || pageSize === 'all' || !rows) return rows;
    const start = (currentPage - 1) * pageSize;
    return rows.slice(start, start + pageSize);
  }, [rows, currentPage, pageSize, disablePagination]);

  return (
    <div className="tw" style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%' }}>
        <thead>
          <tr>
            {columns.map((col, i) => <th key={i}>{col}</th>)}
          </tr>
        </thead>
        <tbody>
          {paginatedRows && paginatedRows.length > 0 ? (
            paginatedRows.map(renderRow)
          ) : (
            <tr>
              <td colSpan={columns.length} style={{ textAlign: 'center', padding: '24px', color: 'var(--txt3)' }}>
                {emptyText || 'No records found'}
              </td>
            </tr>
          )}
        </tbody>
      </table>
      {!disablePagination && totalItems > 0 && (
        <PaginationBar
          currentPage={currentPage}
          totalItems={totalItems}
          pageSize={pageSize}
          onPageChange={setCurrentPage}
          onPageSizeChange={(newSize) => {
            setPageSize(newSize);
            setCurrentPage(1);
          }}
        />
      )}
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
