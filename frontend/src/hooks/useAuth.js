import { useContext, useState } from 'react';
import { AuthContext } from '../context/AuthContext';
import { POST } from '../utils/api';

export function useAuth() {
  const { login, logout, isAuthenticated, authUser } = useContext(AuthContext);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const doLogin = async (email, password) => {
    setLoading(true);
    setError(null);
    try {
      const { data, status } = await POST('/auth/login', { email, password });
      if (status === 200 && data?.token) {
        login(data.token, data.user);
        return true;
      } else {
        setError(data?.error || 'Invalid credentials');
        return false;
      }
    } catch (err) {
      setError('Network error');
      return false;
    } finally {
      setLoading(false);
    }
  };

  return { doLogin, doLogout: logout, isAuthenticated, loading, error, authUser };
}
