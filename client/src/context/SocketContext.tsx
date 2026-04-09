import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Socket } from 'socket.io-client';
import { getSocket } from '@/lib/socket';
import { useAuth } from './AuthContext';

interface SocketContextType {
  socket: Socket | null;
  isConnected: boolean;
}

const SocketContext = createContext<SocketContextType>({ socket: null, isConnected: false });

export function SocketProvider({ children }: { children: ReactNode }) {
  const { token } = useAuth();
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);

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

        s.on('connect', () => setIsConnected(true));
        s.on('disconnect', () => setIsConnected(false));
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
      }
    };
  }, [token]);

  return (
    <SocketContext.Provider value={{ socket, isConnected }}>
      {children}
    </SocketContext.Provider>
  );
}

export function useSocket() {
  return useContext(SocketContext);
}
