import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import type { User } from '@/types/user';
import api from '@/lib/api';
import { connectSocket, disconnectSocket, getSocket } from '@/lib/socket';

interface AuthContextType {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (username: string, email: string, password: string) => Promise<void>;
  loginAsGuest: () => Promise<void>;
  handleGoogleCallback: (token: string) => Promise<void>;
  logout: () => void;
  setActiveRoomCode: (code: string | null) => void;
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

  const setActiveRoomCode = useCallback((code: string | null) => {
    setUser((prev) => (prev ? { ...prev, activeRoomCode: code } : prev));
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

  // Listen to socket events for activeRoomCode updates
  useEffect(() => {
    if (!token) return;
    let cancelled = false;

    const attach = () => {
      const s = getSocket();
      if (!s) return false;

      const onChanged = (data: { code: string; gameType: string; status: string } | null) => {
        if (cancelled) return;
        setUser((prev) => (prev ? { ...prev, activeRoomCode: data?.code ?? null } : prev));
      };
      const onActive = (data: { code: string; gameType: string; status: string } | null) => {
        if (cancelled) return;
        setUser((prev) => (prev ? { ...prev, activeRoomCode: data?.code ?? null } : prev));
      };

      s.on('user:active_room_changed', onChanged);
      s.on('user:active_room', onActive);
      return () => {
        s.off('user:active_room_changed', onChanged);
        s.off('user:active_room', onActive);
      };
    };

    let detach = attach();
    const interval = window.setInterval(() => {
      if (!detach) detach = attach();
    }, 500);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      if (typeof detach === 'function') detach();
    };
  }, [token]);

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
    <AuthContext.Provider value={{ user, token, isLoading, login, register, loginAsGuest, handleGoogleCallback, logout, setActiveRoomCode }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
