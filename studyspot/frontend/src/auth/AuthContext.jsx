// AuthContext.jsx - who is logged in. Use it in any page:  const { user, login, logout } = useAuth();
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, tokenStore } from '../api';

const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(!!tokenStore.get()); // true while checking a saved login

  // On page load: if a token is saved, ask the server who it belongs to.
  useEffect(() => {
    if (!tokenStore.get()) return;
    api.get('/auth/me')
      .then((r) => setUser(r.user))
      .catch(() => tokenStore.clear())
      .finally(() => setLoading(false));
  }, []);

  const logout = useCallback(async () => {
    try { await api.post('/auth/logout'); } catch (e) { /* ignore: we log out anyway */ }
    tokenStore.clear();
    setUser(null);
  }, []);

  // The api helper announces a rejected token (expired / suspended); log out locally.
  useEffect(() => {
    const onUnauthorized = () => { tokenStore.clear(); setUser(null); };
    window.addEventListener('studyspot:unauthorized', onUnauthorized);
    return () => window.removeEventListener('studyspot:unauthorized', onUnauthorized);
  }, []);

  const login = useCallback(async (email, password) => {
    const r = await api.post('/auth/login', { email, password });
    tokenStore.set(r.token);
    setUser(r.user);
    return r.user;
  }, []);

  const value = useMemo(() => ({
    user,
    loading,
    login,
    logout,
    setUser,
    isAdmin: !!user && (user.role === 'Administrator' || user.role === 'Super Administrator'),
    isSuper: !!user && user.role === 'Super Administrator',
  }), [user, loading, login, logout]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
