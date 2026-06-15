import React, { useState, useEffect } from 'react';
import { GET, POST } from '../utils/api';
import { InputField, SelectField, Button } from '../components/UIComponents';

export function UserManagementPage() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    role: 'officer',
    department: 'Operations',
  });

  useEffect(() => {
    loadUsers();
  }, []);

  async function loadUsers() {
    setLoading(true);
    try {
      const res = await GET('/admin/users');
      if (res?.users) {
        setUsers(res.users);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  const handleChange = (e) => {
    setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    
    if (!formData.name || !formData.email || !formData.password) {
      setError('Please fill in all required fields.');
      return;
    }

    try {
      const { data, status } = await POST('/admin/users', formData);
      if (status === 200) {
        setSuccess('User created successfully.');
        setFormData({
          name: '',
          email: '',
          password: '',
          role: 'officer',
          department: 'Operations',
        });
        loadUsers();
      } else {
        setError(data?.error || 'Failed to create user.');
      }
    } catch (err) {
      setError('Network error.');
    }
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
      <div className="card">
        <div className="card-hd"><div className="card-t">Add New User</div></div>
        <div className="card-b">
          {error && <div style={{ color: 'var(--red)', marginBottom: '15px', fontSize: '13px', background: '#fef2f2', padding: '10px', borderRadius: '4px' }}>{error}</div>}
          {success && <div style={{ color: 'var(--green)', marginBottom: '15px', fontSize: '13px', background: '#f0fdf4', padding: '10px', borderRadius: '4px' }}>{success}</div>}
          
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
            <InputField label="Full Name" name="name" value={formData.name} onChange={handleChange} required />
            <InputField label="Email Address" name="email" type="email" value={formData.email} onChange={handleChange} required />
            <InputField label="Password" name="password" type="password" value={formData.password} onChange={handleChange} required />
            
            <SelectField label="Role" name="role" value={formData.role} onChange={handleChange}>
              <option value="officer">Officer (Standard)</option>
              <option value="supervisor">Supervisor</option>
              <option value="admin">Administrator</option>
            </SelectField>
            
            <SelectField label="Department" name="department" value={formData.department} onChange={handleChange}>
              <option value="Operations">Operations</option>
              <option value="Trade Finance">Trade Finance</option>
              <option value="Outward Remittance">Outward Remittance</option>
              <option value="IT Operations">IT Operations</option>
            </SelectField>

            <div style={{ marginTop: '10px' }}>
              <Button label="Create User" variant="bl" onClick={handleSubmit} />
            </div>
          </form>
        </div>
      </div>

      <div className="card">
        <div className="card-hd"><div className="card-t">System Users</div></div>
        <div className="card-b" style={{ padding: 0 }}>
          {loading ? (
            <div style={{ padding: '20px' }}>Loading...</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'var(--bg)', borderBottom: '1px solid var(--bdr)' }}>
                  <th style={{ padding: '10px 15px', textAlign: 'left', fontSize: '11px', color: 'var(--txt2)' }}>Name</th>
                  <th style={{ padding: '10px 15px', textAlign: 'left', fontSize: '11px', color: 'var(--txt2)' }}>Email</th>
                  <th style={{ padding: '10px 15px', textAlign: 'center', fontSize: '11px', color: 'var(--txt2)' }}>Role</th>
                  <th style={{ padding: '10px 15px', textAlign: 'left', fontSize: '11px', color: 'var(--txt2)' }}>Department</th>
                </tr>
              </thead>
              <tbody>
                {users.map(u => (
                  <tr key={u.id} style={{ borderBottom: '1px solid var(--bdr)' }}>
                    <td style={{ padding: '10px 15px', fontSize: '13px' }}>{u.name}</td>
                    <td style={{ padding: '10px 15px', fontSize: '13px', color: 'var(--txt2)' }}>{u.email}</td>
                    <td style={{ padding: '10px 15px', textAlign: 'center' }}>
                      <span className={`sb-tag ${u.role === 'admin' ? 'sb-tag-r' : u.role === 'supervisor' ? 'sb-tag-y' : 'sb-tag-g'}`}>
                        {u.role.toUpperCase()}
                      </span>
                    </td>
                    <td style={{ padding: '10px 15px', fontSize: '12px' }}>{u.department}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
