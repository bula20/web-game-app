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

// Online users tracking: userId -> socketId
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
    console.log(`User connected: ${socket.displayName} (${socket.id})`);

    // Track online status
    if (socket.userId && !socket.isGuest) {
      onlineUsers.set(socket.userId, socket.id);
      const user = await User.findById(socket.userId).select('friends avatarPreset');
      if (user) socket.avatarPreset = user.avatarPreset ?? 'color:1';
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

    // Client requests current online status of all friends (called after Sidebar mounts)
    socket.on('friend:get_online', async () => {
      if (!socket.userId || socket.isGuest) return;
      try {
        const user = await User.findById(socket.userId).select('friends');
        if (!user?.friends) return;
        for (const friendId of user.friends) {
          const online = onlineUsers.has(friendId.toString());
          socket.emit('friend:online_status', { userId: friendId.toString(), online });
        }
      } catch { /* ignore */ }
    });

    // Setup handlers (presence first so reconnect runs before game handlers register listeners)
    setupPresenceHandler(io, socket);
    setupLobbyHandler(io, socket);
    setupChatHandler(io, socket);
    setupChessHandler(io, socket);
    setupCheckersHandler(io, socket);
    setupCharadesHandler(io, socket);

    socket.on('disconnect', async () => {
      console.log(`User disconnected: ${socket.displayName} (${socket.id})`);

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
