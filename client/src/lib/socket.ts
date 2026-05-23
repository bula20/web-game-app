// Singleton klienta Socket.io. Trzymamy jedną instancję na całą aplikację, bo wiele
// komponentów (Sidebar, RoomPage, strony gier) słucha tych samych eventów. Token JWT
// przekazujemy w handshake (auth.token) - serwer weryfikuje go w socketAuthMiddleware.
import { io, type Socket } from "socket.io-client";

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || "http://localhost:3001";

let socket: Socket | null = null;

export function getSocket(): Socket | null {
  return socket;
}

export function connectSocket(token: string): Socket {
  if (socket?.connected) {
    return socket;
  }

  socket = io(SOCKET_URL, {
    auth: { token },
    transports: ["websocket", "polling"],
  });

  return socket;
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}
