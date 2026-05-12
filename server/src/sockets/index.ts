// Punkt wejścia serwera Socket.io. Konfiguruje CORS, middleware uwierzytelniający
// i rejestruje wszystkie handlery (presence, lobby, chat, chess, checkers, charades).
// Trzyma globalną mapę online users (po userId), używaną do propagacji statusu
// online/offline do listy znajomych.
import { Server as HttpServer } from 'http';
import { Server } from 'socket.io';
import { env } from '../config/env.js';
import { socketAuthMiddleware, AuthenticatedSocket } from '../middleware/socketAuth.js';
import { User } from '../models/User.js';
import { setupLobbyHandler } from './lobbyHandler.js';
import { setupChatHandler } from './chatHandler.js';
import { setupChessHandler } from './chessHandler.js';
import { setupCheckersHandler } from './checkersHandler.js';
import { setupCharadesHandler } from './charadesHandler.js';
import { setupPresenceHandler } from './presenceHandler.js';

// userId -> socketId aktualnie zalogowanego usera (tylko zalogowani, nie goście).
// Używamy do wysłania friend:online_status do znajomych przy connect/disconnect.
const onlineUsers = new Map<string, string>();

export function setupSocketServer(httpServer: HttpServer) {
  const io = new Server(httpServer, {
    cors: {
      origin: env.CLIENT_URL,
      methods: ['GET', 'POST'],
    },
  });

  io.use(socketAuthMiddleware);

  io.on('connection', async (socket: AuthenticatedSocket) => {
    // Aktualizacja stanu online tylko dla zalogowanych userów. Goście nie mają
    // znajomych, więc nie ma do kogo wysyłać statusu.
    if (socket.userId && !socket.isGuest) {
      onlineUsers.set(socket.userId, socket.id);
      const user = await User.findById(socket.userId).select('friends avatarPreset');
      if (user) socket.avatarPreset = user.avatarPreset ?? 'color:1';
      // Powiadom każdego online znajomego, że ja jestem online; jednocześnie
      // sam dostaję informację, którzy z moich znajomych są w danej chwili online.
      if (user?.friends) {
        for (const friendId of user.friends) {
          const friendSocketId = onlineUsers.get(friendId.toString());
          if (friendSocketId) {
            io.to(friendSocketId).emit('friend:online_status', { userId: socket.userId, online: true });
            socket.emit('friend:online_status', { userId: friendId.toString(), online: true });
          }
        }
      }
    }

    // Klient wywołuje to po zamontowaniu Sidebar - na wypadek, gdyby propagacja
    // friend:online_status z connection nie zdążyła trafić do interfejsu.
    socket.on('friend:get_online', async () => {
      if (!socket.userId || socket.isGuest) return;
      try {
        const user = await User.findById(socket.userId).select('friends');
        if (!user?.friends) return;
        for (const friendId of user.friends) {
          const online = onlineUsers.has(friendId.toString());
          socket.emit('friend:online_status', { userId: friendId.toString(), online });
        }
      } catch { /* ignorujemy: brak Usera w bazie lub problem z bazą */ }
    });

    // Kolejność handlerów ma znaczenie: presenceHandler najpierw, żeby logika
    // reconnect (anulowanie timeoutów, restore host_away->waiting) wykonała się
    // ZANIM game handlery zarejestrują listenery na chess:get_state itp.
    setupPresenceHandler(io, socket);
    setupLobbyHandler(io, socket);
    setupChatHandler(io, socket);
    setupChessHandler(io, socket);
    setupCheckersHandler(io, socket);
    setupCharadesHandler(io, socket);

    socket.on('disconnect', async () => {
      // Wyczyść online tracking i rozesłaj friend:online_status do online znajomych.
      if (socket.userId && !socket.isGuest) {
        onlineUsers.delete(socket.userId);
        const user = await User.findById(socket.userId).select('friends');
        if (user?.friends) {
          for (const friendId of user.friends) {
            const friendSocketId = onlineUsers.get(friendId.toString());
            if (friendSocketId) {
              io.to(friendSocketId).emit('friend:online_status', { userId: socket.userId, online: false });
            }
          }
        }
      }
    });
  });

  return io;
}

export { onlineUsers };
