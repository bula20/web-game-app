import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import type { User } from '@/types/user';
import api from '@/lib/api';
import { connectSocket, disconnectSocket } from '@/lib/socket';

interface AuthContextType {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (username: string, email: string, password: string) => Promise<void>;
  loginAsGuest: () => Promise<void>;
  handleGoogleCallback: (token: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(localStorage.getItem('token'));
  const [isLoading, setIsLoading] = useState(true);

  const setAuth = useCallback((newToken: string, newUser: User) => {
    localStorage.setItem('token', newToken);
    setToken(newToken);
    setUser(newUser);
    connectSocket(newToken);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('token');
    setToken(null);
    setUser(null);
    disconnectSocket();
  }, []);

  useEffect(() => {
    if (token) {
      api.get('/auth/me')
        .then(res => {
          setUser(res.data);
          connectSocket(token);
        })
        .catch(() => {
          logout();
        })
        .finally(() => setIsLoading(false));
    } else {
      setIsLoading(false);
    }
  }, []);

  const login = async (email: string, password: string) => {
    const res = await api.post('/auth/login', { email, password });
    setAuth(res.data.token, res.data.user);
  };

  const register = async (username: string, email: string, password: string) => {
    const res = await api.post('/auth/register', { username, email, password });
    setAuth(res.data.token, res.data.user);
  };

  const loginAsGuest = async () => {
    const res = await api.post('/auth/guest');
    setAuth(res.data.token, res.data.user);
  };

  const handleGoogleCallback = async (callbackToken: string) => {
    localStorage.setItem('token', callbackToken);
    setToken(callbackToken);
    const res = await api.get('/auth/me', {
      headers: { Authorization: `Bearer ${callbackToken}` },
    });
    setUser(res.data);
    connectSocket(callbackToken);
  };

  return (
    <AuthContext.Provider value={{ user, token, isLoading, login, register, loginAsGuest, handleGoogleCallback, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
