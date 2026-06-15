import React, { useState } from 'react';
import { useAuth } from '../hooks/useAuth';

export function LoginPage() {
  const { doLogin, loading, error } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email || !password) return;
    await doLogin(email, password);
  };

  const quickLogin = (e, p) => {
    setEmail(e);
    setPassword(p);
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#f5f4f0', zIndex: 1000, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: '#fff', borderRadius: '12px', width: '100%', maxWidth: '380px', padding: '32px', boxShadow: '0 4px 16px rgba(0,0,0,.09)', border: '1px solid #e4e1db' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
          <div style={{ width: '44px', height: '44px', background: '#0075bf', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
             <img src="/UBL.png" alt="UBL" style={{ width: '34px', filter: 'brightness(0) invert(1)' }} />
          </div>
          <div>
            <div style={{ fontSize: '18px', fontWeight: 700, lineHeight: 1.2 }}>Trade Finance</div>
            <div style={{ fontSize: '12px', color: '#8c8880' }}>Duplicate Detection</div>
          </div>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div className="fg">
            <label className="fl">Email Address</label>
            <input className="fi" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="operator@bank.com" />
          </div>
          <div className="fg">
            <label className="fl">Password</label>
            <div style={{ position: 'relative' }}>
              <input className="fi" type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" />
            </div>
          </div>
          {error && <div style={{ fontSize: '12px', color: '#b91818', background: '#fef2f2', padding: '8px', borderRadius: '6px' }}>{error}</div>}
          <button type="submit" className="btn btn-p" disabled={loading} style={{ width: '100%', justifyContent: 'center', height: '42px', marginTop: '4px' }}>
            {loading ? <div className="spin"></div> : 'Sign In'}
          </button>
        </form>

        <div style={{ marginTop: '24px', paddingTop: '20px', borderTop: '1px solid #e4e1db' }}>
          <div style={{ fontSize: '11px', fontWeight: 600, color: '#8c8880', marginBottom: '10px', textTransform: 'uppercase' }}>Test Accounts</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <button className="btn btn-g btn-sm" onClick={() => quickLogin('admin@bank.com', 'Admin@123')} style={{ width: '100%', justifyContent: 'flex-start' }}>System Admin (admin@bank.com)</button>
            <button className="btn btn-g btn-sm" onClick={() => quickLogin('trade.ops@bank.com', 'Trade@123')} style={{ width: '100%', justifyContent: 'flex-start' }}>Trade Operations (trade.ops@bank.com)</button>
            <button className="btn btn-g btn-sm" onClick={() => quickLogin('supervisor@bank.com', 'Super@123')} style={{ width: '100%', justifyContent: 'flex-start' }}>Supervisor (supervisor@bank.com)</button>
          </div>
        </div>
      </div>
    </div>
  );
}
