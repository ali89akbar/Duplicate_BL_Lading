import React, { useEffect, useState } from 'react';
import { GET, PATCH } from '../utils/api';
import { StatusBadge, CurrentStatusBadge, fmtNum } from '../utils/formatters';
import { useDebounce } from '../hooks/useDebounce';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faPause, faChevronDown, faChevronRight } from '@fortawesome/free-solid-svg-icons';


export function HoldCasesPanel() {
  const [groups, setGroups] = useState([]);
  const [expandedGroups, setExpandedGroups] = useState({});
  const [searchQuery, setSearchQuery] = useState('');
  const debouncedSearchQuery = useDebounce(searchQuery, 500);
  const [misStartDate, setMisStartDate] = useState('');
  const [misEndDate, setMisEndDate] = useState('');

  const load = async () => {
    const r = await GET('/admin/hold_cases');
    setGroups(r?.hold_cases || []);
  };

  useEffect(() => { load(); }, []);

  const toggleGroup = (ref) => {
    setExpandedGroups(prev => ({ ...prev, [ref]: !prev[ref] }));
  };

  const filteredGroups = groups.filter(g => {
    if (misStartDate && g.screening_date && g.screening_date < misStartDate) return false;
    if (misEndDate && g.screening_date && g.screening_date > misEndDate) return false;
    if (debouncedSearchQuery) {
      const q = debouncedSearchQuery.toLowerCase();
      const matchRef = g.portal_ref_no?.toLowerCase().includes(q);
      const matchBl = g.bls.some(b => b.bl_number.toLowerCase().includes(q));
      if (!matchRef && !matchBl) return false;
    }
    return true;
  });

  if (groups.length === 0) {
    return (
      <div className="card" style={{ padding: '24px', textAlign: 'center', color: 'var(--txt3)' }}>
        No records currently on hold.
      </div>
    );
  }

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginBottom: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <label style={{ fontSize: '11px', color: 'var(--txt2)' }}>From:</label>
          <input type="date" className="fi" style={{ height: '34px' }} value={misStartDate} onChange={e => setMisStartDate(e.target.value)} />
          <label style={{ fontSize: '11px', color: 'var(--txt2)', marginLeft: '4px' }}>To:</label>
          <input type="date" className="fi" style={{ height: '34px' }} value={misEndDate} onChange={e => setMisEndDate(e.target.value)} />
        </div>
        <input className="fi" style={{ width: '220px', height: '34px' }} placeholder="Search Reference, BL..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
      </div>

      <div className="card" style={{ borderLeft: '3px solid #b45309', marginBottom: '16px' }}>
        <div className="card-hd">
          <div className="card-t">
            <FontAwesomeIcon icon={faPause} /> Hold Cases
            <span style={{ background:'#fef3c7', color:'#b45309', borderRadius:'10px', fontSize:'10px', padding:'1px 7px', marginLeft:'8px' }}>{filteredGroups.length}</span>
          </div>
        </div>
        <table style={{ width:'100%', fontSize:'12px' }}>
          <thead>
            <tr style={{ color:'var(--txt3)' }}>
              <th style={{ padding:'6px 8px', textAlign:'left' }}>Ref No / Comment</th>
              <th>Total Cases</th>
              <th>Hold Since</th>
              <th>Days on Hold</th>
              <th>By</th>
            </tr>
          </thead>
          <tbody>
            {filteredGroups.map(g => (
            <React.Fragment key={g.portal_ref_no}>
              <tr style={{ borderTop:'1px solid var(--brd)', background: expandedGroups[g.portal_ref_no] ? '#fafafa' : 'transparent' }}>
                <td style={{ padding:'6px 8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <button className="btn btn-xs" onClick={() => toggleGroup(g.portal_ref_no)} style={{ padding: '2px 6px' }}>
                      {expandedGroups[g.portal_ref_no] ? <FontAwesomeIcon icon={faChevronDown} /> : <FontAwesomeIcon icon={faChevronRight} />}
                    </button>
                    <code style={{ fontSize:'11px', fontWeight:600 }}>{g.portal_ref_no}</code>
                  </div>
                  {g.comments && (
                    <div style={{ marginLeft: '32px', marginTop: '4px', fontSize: '11px', color: 'var(--txt2)', fontStyle: 'italic' }}>
                      "{g.comments}"
                    </div>
                  )}
                </td>
                <td style={{ fontWeight: 500 }}>{g.total_hold_cases}</td>
                <td className="mono" style={{ fontSize:'11px' }}>{g.hold_since ? g.hold_since.split('T')[0] : '—'}</td>
                <td>
                  <span className={`badge ${g.days_on_hold >= 7 ? 'b-rd' : 'b-am'}`}>{g.days_on_hold} Days</span>
                </td>
                <td style={{ fontSize:'11px' }}>{g.uploaded_by}</td>
              </tr>
              {expandedGroups[g.portal_ref_no] && (
                <tr>
                  <td colSpan="5" style={{ padding: 0 }}>
                    <div style={{ padding: '10px 10px 10px 40px', borderBottom: '1px solid var(--brd)', background: '#fff' }}>
                      <table style={{ width: '100%', fontSize: '11px' }}>
                        <thead>
                          <tr style={{ color: 'var(--txt3)' }}>
                            <th style={{ textAlign: 'left', paddingBottom: '4px' }}>ID</th>
                            <th style={{ textAlign: 'left' }}>BL Number</th>
                            <th style={{ textAlign: 'left' }}>Product</th>
                            <th style={{ textAlign: 'left' }}>Current Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {g.bls.map(b => (
                            <tr key={b.id} style={{ borderTop: '1px solid #f0f0f0' }}>
                              <td style={{ padding: '4px 0' }}><code style={{ background: 'var(--bg)', padding: '2px 4px', borderRadius: '4px' }}>{b.id}</code></td>
                              <td className="mono">{b.bl_number} {b.is_master && <span style={{ color: '#d97706' }}>(Master)</span>}</td>
                              <td>{b.product}</td>
                              <td><CurrentStatusBadge cs={b.current_status} /></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </td>
                </tr>
              )}
            </React.Fragment>
          ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
