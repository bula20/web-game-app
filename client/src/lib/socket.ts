// Singleton klienta Socket.io. Trzymamy jedną instancję na całą aplikację, bo wiele
// komponentów (Sidebar, RoomPage, strony gier) słucha tych samych eventów. Token JWT
// przekazujemy w handshake (auth.token) - serwer weryfikuje go w socketAuthMiddleware.
import { io, type Socket } from 'socket.io-client';

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:3001';

let socket: Socket | null = null;

// Zwraca aktualne połączenie lub null, jeśli użytkownik nie jest zalogowany.
export function getSocket(): Socket | null {
  return socket;
}

// Tworzy połączenie z serwerem albo zwraca istniejące, jeśli jest aktywne.
// Najpierw próbujemy WebSocket, fallback do long-pollingu (środowiska za proxy).
export function connectSocket(token: string): Socket {
  if (socket?.connected) {
    return socket;
  }

  socket = io(SOCKET_URL, {
    auth: { token },
    transports: ['websocket', 'polling'],
  });

  return socket;
}

// Wywoływane przy logout - rozłącza i czyści singleton, żeby kolejny login
// utworzył świeże połączenie z nowym tokenem.
export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}
