import React, { createContext, useState, useEffect } from 'react';
import { GET } from '../utils/api';

export const AuthContext = createContext();

export function AuthProvider({ children }) {
  const [authToken, setAuthToken] = useState(localStorage.getItem('ocr_token') || '');
  const [authUser, setAuthUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(!!authToken);

  useEffect(() => {
    if (authToken) {
      localStorage.setItem('ocr_token', authToken);
      setIsAuthenticated(true);
      if (!authUser) {
        GET('/auth/me').then(res => {
          if (res?.user) {
            setAuthUser(res.user);
          } else {
            setAuthToken('');
            localStorage.removeItem('ocr_token');
            setIsAuthenticated(false);
          }
        });
      }
    } else {
      localStorage.removeItem('ocr_token');
      setIsAuthenticated(false);
      setAuthUser(null);
    }
  }, [authToken]);

  const login = (token, user) => {
    setAuthToken(token);
    setAuthUser(user);
  };

  const logout = () => {
    setAuthToken('');
    setAuthUser(null);
  };

  return (
    <AuthContext.Provider value={{ authToken, authUser, isAuthenticated, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}
