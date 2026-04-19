import { createContext, useContext, useEffect, useState, useRef, type ReactNode } from 'react';
import type { Socket } from 'socket.io-client';
import { getSocket } from '@/lib/socket';
import { useAuth } from './AuthContext';
import { useNavigate, useLocation } from 'react-router-dom';

interface SocketContextType {
  socket: Socket | null;
  isConnected: boolean;
}

const SocketContext = createContext<SocketContextType>({ socket: null, isConnected: false });

export function SocketProvider({ children }: { children: ReactNode }) {
  const { token } = useAuth();
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const locationRef = useRef(location);
  useEffect(() => { locationRef.current = location; }, [location]);

  useEffect(() => {
    if (!token) {
      setSocket(null);
      setIsConnected(false);
      return;
    }

    const checkSocket = () => {
      const s = getSocket();
      if (s) {
        setSocket(s);
        setIsConnected(s.connected);

        s.on('connect', () => {
          setIsConnected(true);
          // On connect/reconnect, ask server for active room so we can re-navigate if user
          // is on a "neutral" page like / or /lobby/*
          s.emit('user:get_active_room');
        });
        s.on('disconnect', () => setIsConnected(false));

        s.on('user:active_room', (data: { code: string; gameType: string; status: string } | null) => {
          if (!data) return;
          const path = locationRef.current.pathname;
          // Don't auto-navigate if user is already on a room or game page
          if (path.startsWith('/room/') || path.startsWith('/game/') || path === '/my-room') return;
          // Only auto-navigate from neutral pages (home, lobby)
          if (path === '/' || path.startsWith('/lobby/')) {
            if (data.status === 'in_progress') {
              navigate(`/game/${data.gameType}/${data.code}`);
            } else {
              navigate(`/room/${data.code}`);
            }
          }
        });

        // When someone else's activeRoom changes (emitted for self) — noop here (AuthContext handles it)
      }
    };

    checkSocket();
    const interval = setInterval(checkSocket, 1000);

    return () => {
      clearInterval(interval);
      const s = getSocket();
      if (s) {
        s.off('connect');
        s.off('disconnect');
        s.off('user:active_room');
      }
    };
  }, [token, navigate]);

  return (
    <SocketContext.Provider value={{ socket, isConnected }}>
      {children}
    </SocketContext.Provider>
  );
}

export function useSocket() {
  return useContext(SocketContext);
}
