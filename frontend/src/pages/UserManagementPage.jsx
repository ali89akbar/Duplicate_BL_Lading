import React, { useState, useEffect } from 'react';
import { GET, POST, PATCH, DELETE } from '../utils/api';
import { InputField, SelectField, Button } from '../components/UIComponents';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faEdit, faTrash } from '@fortawesome/free-solid-svg-icons';

export function UserManagementPage() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  // Edit / Reset Password Modal State
  const [editUser, setEditUser] = useState(null);
  const [editForm, setEditForm] = useState({ name: '', role: '', department: '', password: '' });
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState(null);

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

  const handleOpenEdit = (user) => {
    setEditUser(user);
    setEditForm({
      name: user.name || '',
      role: user.role || 'officer',
      department: user.department || 'Operations',
      password: ''
    });
    setEditError(null);
  };

  const handleSaveEdit = async (e) => {
    e.preventDefault();
    setEditSaving(true);
    setEditError(null);
    try {
      const { data, status } = await PATCH(`/admin/users/${editUser.id}`, editForm);
      if (status === 200) {
        setEditUser(null);
        setSuccess(`User ${editUser.email} updated successfully.`);
        loadUsers();
      } else {
        setEditError(data?.error || 'Failed to update user.');
      }
    } catch (err) {
      setEditError('Network error while updating user.');
    } finally {
      setEditSaving(false);
    }
  };

  const handleDeleteUser = async (user) => {
    if (!window.confirm(`Are you sure you want to delete user ${user.name} (${user.email})?`)) return;
    try {
      const { data, status } = await DELETE(`/admin/users/${user.id}`);
      if (status === 200) {
        setSuccess(`User ${user.email} deleted successfully.`);
        loadUsers();
      } else {
        alert(data?.error || 'Failed to delete user.');
      }
    } catch (err) {
      console.error(err);
      alert('Error deleting user');
    }
  };

  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: '360px 1fr', gap: '20px' }}>
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
                    <th style={{ padding: '10px 15px', textAlign: 'right', fontSize: '11px', color: 'var(--txt2)' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map(u => (
                    <tr key={u.id} style={{ borderBottom: '1px solid var(--bdr)' }}>
                      <td style={{ padding: '10px 15px', fontSize: '13px', fontWeight: 500 }}>{u.name}</td>
                      <td style={{ padding: '10px 15px', fontSize: '13px', color: 'var(--txt2)' }}>{u.email}</td>
                      <td style={{ padding: '10px 15px', textAlign: 'center' }}>
                        <span className={`sb-tag ${u.role === 'admin' ? 'sb-tag-r' : u.role === 'supervisor' ? 'sb-tag-y' : 'sb-tag-g'}`}>
                          {u.role.toUpperCase()}
                        </span>
                      </td>
                      <td style={{ padding: '10px 15px', fontSize: '12px' }}>{u.department}</td>
                      <td style={{ padding: '10px 15px', textAlign: 'right' }}>
                        <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                          <button 
                            className="btn btn-xs" 
                            style={{ background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '4px', padding: '4px 8px', cursor: 'pointer', fontSize: '11px' }} 
                            onClick={() => handleOpenEdit(u)}
                            title="Edit User or Reset Password"
                          >
                            <FontAwesomeIcon icon={faEdit} /> Edit / Reset Pass
                          </button>
                          <button 
                            className="btn btn-xs" 
                            style={{ background: '#ef4444', color: '#fff', border: 'none', borderRadius: '4px', padding: '4px 8px', cursor: 'pointer', fontSize: '11px' }} 
                            onClick={() => handleDeleteUser(u)}
                            title="Delete User"
                          >
                            <FontAwesomeIcon icon={faTrash} /> Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      {/* Edit / Reset Password Modal */}
      {editUser && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: '#fff', borderRadius: '10px', padding: '24px', width: '420px', maxWidth: '90vw' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px', alignItems: 'center' }}>
              <strong style={{ fontSize: '15px' }}>Edit User — <code style={{ fontSize: '12px', color: '#2563eb' }}>{editUser.email}</code></strong>
              <span style={{ cursor: 'pointer', fontSize: '20px', color: '#888' }} onClick={() => setEditUser(null)}>×</span>
            </div>

            {editError && <div style={{ color: 'var(--red)', marginBottom: '12px', fontSize: '12px', background: '#fef2f2', padding: '8px', borderRadius: '4px' }}>{editError}</div>}

            <form onSubmit={handleSaveEdit} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <InputField 
                label="Full Name" 
                value={editForm.name} 
                onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))} 
                required 
              />

              <SelectField 
                label="Role" 
                value={editForm.role} 
                onChange={e => setEditForm(f => ({ ...f, role: e.target.value }))}
              >
                <option value="officer">Officer (Standard)</option>
                <option value="supervisor">Supervisor</option>
                <option value="admin">Administrator</option>
              </SelectField>

              <SelectField 
                label="Department" 
                value={editForm.department} 
                onChange={e => setEditForm(f => ({ ...f, department: e.target.value }))}
              >
                <option value="Operations">Operations</option>
                <option value="Trade Finance">Trade Finance</option>
                <option value="Outward Remittance">Outward Remittance</option>
                <option value="IT Operations">IT Operations</option>
              </SelectField>

              <div style={{ borderTop: '1px solid #eee', paddingTop: '10px', marginTop: '4px' }}>
                <InputField 
                  label="New Password (Leave empty to keep existing password)" 
                  type="password"
                  placeholder="Enter new password to reset..."
                  value={editForm.password} 
                  onChange={e => setEditForm(f => ({ ...f, password: e.target.value }))} 
                />
              </div>

              <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '16px' }}>
                <button type="button" className="btn" onClick={() => setEditUser(null)}>Cancel</button>
                <button type="submit" className="btn btn-a" disabled={editSaving}>
                  {editSaving ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
