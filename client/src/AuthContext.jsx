import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api, getToken } from './api';

const Ctx = createContext(null);
export const useAuth = () => useContext(Ctx);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(!getToken());

  useEffect(() => {
    if (getToken()) api.get('/auth/me').then((d) => setUser(d.user)).catch(() => localStorage.removeItem('token')).finally(() => setReady(true));
    const expire = () => setUser(null);
    window.addEventListener('auth:expired', expire);
    return () => window.removeEventListener('auth:expired', expire);
  }, []);

  const enter = (d) => { localStorage.setItem('token', d.token); setUser(d.user); };
  const login = useCallback(async (email, password) => enter(await api.post('/auth/login', { email, password })), []);
  const register = useCallback(async (body) => enter(await api.post('/auth/register', body)), []);
  const registerEmployee = useCallback(async (body) => enter(await api.post('/auth/join-company', body)), []);
  const acceptInvite = useCallback(async (body) => enter(await api.post('/auth/accept-invite', body)), []);
  const logout = useCallback(() => { localStorage.removeItem('token'); setUser(null); }, []);

  return <Ctx.Provider value={{ user, setUser, ready, login, register, registerEmployee, acceptInvite, logout }}>{children}</Ctx.Provider>;
}
