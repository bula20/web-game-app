import { Server } from 'socket.io';
import { AuthenticatedSocket } from '../middleware/socketAuth.js';
import { Room, GameType } from '../models/Room.js';
import { User } from '../models/User.js';

export const GAME_DISCONNECT_GRACE = 20; // seconds
export const LOBBY_NON_HOST_GRACE = 20; // seconds
export const HOST_AWAY_TTL = 120; // seconds

type GameDisconnectHandler = (io: Server, code: string, userId: string) => void | Promise<void>;
type GameReconnectHandler = (io: Server, socket: AuthenticatedSocket, code: string) => void | Promise<void>;

const disconnectHandlers = new Map<GameType, GameDisconnectHandler>();
const reconnectHandlers = new Map<GameType, GameReconnectHandler>();

export function registerGameDisconnectHandler(gameType: GameType, handler: GameDisconnectHandler) {
  disconnectHandlers.set(gameType, handler);
}

export function registerGameReconnectHandler(gameType: GameType, handler: GameReconnectHandler) {
  reconnectHandlers.set(gameType, handler);
}

// pendingTimeouts: key = `${userId}:${code}` -> timeout handle
const pendingTimeouts = new Map<string, ReturnType<typeof setTimeout>>();

// Host-away timeouts: key = code
const hostAwayTimeouts = new Map<string, ReturnType<typeof setTimeout>>();

// Non-host lobby timeouts: key = `${userId}:${code}`
const lobbyTimeouts = new Map<string, ReturnType<typeof setTimeout>>();

function timeoutKey(userId: string, code: string) {
  return `${userId}:${code}`;
}

export function cancelGameDisconnectTimeout(userId: string, code: string) {
  const key = timeoutKey(userId, code);
  const t = pendingTimeouts.get(key);
  if (t) {
    clearTimeout(t);
    pendingTimeouts.delete(key);
  }
}

export function cancelLobbyDisconnectTimeout(userId: string, code: string) {
  const key = timeoutKey(userId, code);
  const t = lobbyTimeouts.get(key);
  if (t) {
    clearTimeout(t);
    lobbyTimeouts.delete(key);
  }
}

export function cancelHostAwayTimeout(code: string) {
  const t = hostAwayTimeouts.get(code);
  if (t) {
    clearTimeout(t);
    hostAwayTimeouts.delete(code);
  }
}

export function getHostAwayTimeoutMap() {
  return hostAwayTimeouts;
}

async function promoteNextHost(io: Server, code: string) {
  try {
    const room = await Room.findOne({ code });
    if (!room) return;

    if (room.players.length === 0) {
      await Room.deleteOne({ _id: room._id });
      io.to(`room:${code}`).emit('room:closed', { reason: 'host_left' });
      io.to(`lobby:${room.gameType}`).emit('lobby:room_removed', { roomId: room._id });
      return;
    }

    room.host = room.players[0].userId;
    room.status = 'waiting';
    room.hostDisconnectedAt = null;
    room.disconnectedPlayers = room.disconnectedPlayers.filter(
      (d) => d.userId?.toString() !== room.players[0].userId?.toString(),
    ) as any;
    await room.save();

    io.to(`room:${code}`).emit('room:host_changed', {
      newHostSocketId: room.players[0].socketId,
      newHostName: room.players[0].displayName,
    });
    io.to(`lobby:${room.gameType}`).emit('lobby:room_updated', room);
  } catch (error) {
    console.error('promoteNextHost error:', error);
  }
}

async function removePlayerFromLobby(io: Server, code: string, userId: string) {
  try {
    const room = await Room.findOne({ code });
    if (!room) return;
    if (room.status !== 'waiting' && room.status !== 'host_away') return;

    const before = room.players.length;
    room.players = room.players.filter((p) => p.userId?.toString() !== userId) as any;
    room.disconnectedPlayers = room.disconnectedPlayers.filter(
      (d) => d.userId?.toString() !== userId,
    ) as any;
    if (before === room.players.length) return;

    await User.findByIdAndUpdate(userId, { activeRoomCode: null }).catch(() => {});

    if (room.players.length === 0) {
      await Room.deleteOne({ _id: room._id });
      io.to(`room:${code}`).emit('room:closed', { reason: 'host_left' });
      io.to(`lobby:${room.gameType}`).emit('lobby:room_removed', { roomId: room._id });
      return;
    }

    await room.save();
    io.to(`room:${code}`).emit('room:player_left', { userId });
    io.to(`room:${code}`).emit('player:reconnect_expired', { userId });
    io.to(`lobby:${room.gameType}`).emit('lobby:room_updated', room);
  } catch (error) {
    console.error('removePlayerFromLobby error:', error);
  }
}

async function markPlayerDisconnected(code: string, userId: string, displayName: string, expiresIn: number) {
  try {
    const room = await Room.findOne({ code });
    if (!room) return;
    room.disconnectedPlayers = room.disconnectedPlayers.filter(
      (d) => d.userId?.toString() !== userId,
    ) as any;
    (room.disconnectedPlayers as any).push({
      userId,
      displayName,
      disconnectedAt: new Date(),
      expiresIn,
    });
    await room.save();
  } catch { /* ignore */ }
}

async function clearPlayerDisconnected(code: string, userId: string) {
  try {
    await Room.findOneAndUpdate(
      { code },
      { $pull: { disconnectedPlayers: { userId } } },
    );
  } catch { /* ignore */ }
}

export function setupPresenceHandler(io: Server, socket: AuthenticatedSocket) {
  const userId = socket.userId;
  if (!userId) return;

  // Handle reconnect: if this user had any pending disconnect timeouts, cancel them
  handleReconnect(io, socket).catch((err) => console.error('handleReconnect error:', err));

  socket.on('disconnect', async () => {
    try {
      const rooms = await Room.find({
        'players.userId': userId,
        status: { $in: ['waiting', 'host_away', 'in_progress'] },
      });

      for (const room of rooms) {
        // If user re-connected on another socket since this disconnect, ignore
        const player = room.players.find((p) => p.userId?.toString() === userId);
        if (!player) continue;
        if (player.socketId !== socket.id) continue; // already swapped by newer socket

        const isHost = room.players[0]?.userId?.toString() === userId;

        if (room.status === 'waiting' || room.status === 'host_away') {
          if (isHost) {
            // Legacy host-away flow (120s)
            room.status = 'host_away';
            room.hostDisconnectedAt = new Date();
            await room.save();

            io.to(`room:${room.code}`).emit('room:host_away', { expiresIn: HOST_AWAY_TTL });
            io.to(`lobby:${room.gameType}`).emit('lobby:room_updated', room);

            const code = room.code;
            cancelHostAwayTimeout(code);
            hostAwayTimeouts.set(
              code,
              setTimeout(() => {
                promoteNextHost(io, code);
                hostAwayTimeouts.delete(code);
              }, HOST_AWAY_TTL * 1000),
            );
          } else {
            // Non-host: 20s grace
            const code = room.code;
            await markPlayerDisconnected(code, userId, player.displayName, LOBBY_NON_HOST_GRACE);
            io.to(`room:${code}`).emit('player:disconnected', {
              userId,
              displayName: player.displayName,
              expiresIn: LOBBY_NON_HOST_GRACE,
            });

            const key = timeoutKey(userId, code);
            cancelLobbyDisconnectTimeout(userId, code);
            lobbyTimeouts.set(
              key,
              setTimeout(() => {
                lobbyTimeouts.delete(key);
                removePlayerFromLobby(io, code, userId);
              }, LOBBY_NON_HOST_GRACE * 1000),
            );
          }
        } else if (room.status === 'in_progress') {
          const code = room.code;
          await markPlayerDisconnected(code, userId, player.displayName, GAME_DISCONNECT_GRACE);
          io.to(`room:${code}`).emit('player:disconnected', {
            userId,
            displayName: player.displayName,
            expiresIn: GAME_DISCONNECT_GRACE,
          });

          const key = timeoutKey(userId, code);
          cancelGameDisconnectTimeout(userId, code);
          pendingTimeouts.set(
            key,
            setTimeout(async () => {
              pendingTimeouts.delete(key);
              const handler = disconnectHandlers.get(room.gameType);
              if (handler) {
                try {
                  await handler(io, code, userId);
                } catch (err) {
                  console.error(`Game disconnect handler error (${room.gameType}):`, err);
                }
              }
              await clearPlayerDisconnected(code, userId);
              io.to(`room:${code}`).emit('player:reconnect_expired', { userId });
            }, GAME_DISCONNECT_GRACE * 1000),
          );
        }
      }
    } catch (error) {
      console.error('presenceHandler disconnect error:', error);
    }
  });
}

async function handleReconnect(io: Server, socket: AuthenticatedSocket) {
  const userId = socket.userId;
  if (!userId) return;

  const rooms = await Room.find({
    'players.userId': userId,
    status: { $in: ['waiting', 'host_away', 'in_progress'] },
  });

  for (const room of rooms) {
    const code = room.code;
    const player = room.players.find((p) => p.userId?.toString() === userId);
    if (!player) continue;

    // Update socketId
    player.socketId = socket.id;

    // Cancel timeouts
    cancelGameDisconnectTimeout(userId, code);
    cancelLobbyDisconnectTimeout(userId, code);

    // If room was host_away and this user is the original host, restore
    const isOriginalHost = room.host?.toString() === userId;
    const wasInDisconnected = room.disconnectedPlayers.some((d) => d.userId?.toString() === userId);

    if (room.status === 'host_away' && isOriginalHost) {
      cancelHostAwayTimeout(code);
      room.status = 'waiting';
      room.hostDisconnectedAt = null;
      // Ensure host is at index 0
      const hostIdx = room.players.findIndex((p) => p.userId?.toString() === userId);
      if (hostIdx > 0) {
        const [h] = room.players.splice(hostIdx, 1);
        room.players.unshift(h);
      }
    }

    if (wasInDisconnected) {
      room.disconnectedPlayers = room.disconnectedPlayers.filter(
        (d) => d.userId?.toString() !== userId,
      ) as any;
    }

    await room.save();

    socket.join(`room:${code}`);

    io.to(`room:${code}`).emit('player:reconnected', {
      userId,
      displayName: player.displayName,
    });

    if (room.status === 'host_away' && isOriginalHost) {
      socket.to(`room:${code}`).emit('room:host_returned', { hostName: socket.displayName });
    }
    io.to(`lobby:${room.gameType}`).emit('lobby:room_updated', room);

    // Delegate to per-game reconnect (update socketId in activeGames)
    if (room.status === 'in_progress') {
      const handler = reconnectHandlers.get(room.gameType);
      if (handler) {
        try {
          await handler(io, socket, code);
        } catch (err) {
          console.error(`Game reconnect handler error (${room.gameType}):`, err);
        }
      }
    }
  }
}
