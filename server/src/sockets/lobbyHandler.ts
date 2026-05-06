import { Server } from 'socket.io';
import { nanoid } from 'nanoid';
import { AuthenticatedSocket } from '../middleware/socketAuth.js';
import { Room, GameType } from '../models/Room.js';
import { User } from '../models/User.js';
import { addPlayerToCharadesGame } from './charadesHandler.js';
import {
  cancelHostAwayTimeout,
  cancelGameDisconnectTimeout,
  cancelLobbyDisconnectTimeout,
} from './presenceHandler.js';

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

import { guestActiveRooms } from './guestState.js';

async function setActiveRoom(userId: string | undefined, code: string | null, displayName?: string) {
  if (!userId) return;
  if (userId.startsWith('guest_')) {
    if (code && displayName) guestActiveRooms.set(userId, { code, displayName });
    else guestActiveRooms.delete(userId);
    return;
  }
  try {
    await User.findByIdAndUpdate(userId, { activeRoomCode: code });
  } catch { /* ignore */ }
}

export function setupLobbyHandler(io: Server, socket: AuthenticatedSocket) {
  // Join lobby for a game type (subscribe to room list updates)
  socket.on('lobby:join', async ({ gameType }: { gameType: GameType }) => {
    socket.join(`lobby:${gameType}`);
    const rooms = await Room.find({
      gameType,
      isPublic: true,
      $or: [
        { status: { $in: ['waiting', 'host_away'] } },
        { gameType: 'charades', status: 'in_progress', $expr: { $lt: [{ $size: '$players' }, '$maxPlayers'] } },
      ],
    }).sort({ createdAt: -1 }).limit(50);
    socket.emit('lobby:rooms', rooms);
  });

  socket.on('lobby:leave', ({ gameType }: { gameType: GameType }) => {
    socket.leave(`lobby:${gameType}`);
  });

  socket.on('user:get_active_room', async () => {
    if (!socket.userId) {
      socket.emit('user:active_room', null);
      return;
    }
    try {
      let code: string | null = null;
      if (socket.isGuest) {
        code = guestActiveRooms.get(socket.userId)?.code ?? null;
      } else {
        const user = await User.findById(socket.userId).select('activeRoomCode');
        code = user?.activeRoomCode || null;
      }
      if (!code) {
        socket.emit('user:active_room', null);
        return;
      }
      const room = await Room.findOne({ code });
      if (!room) {
        if (socket.isGuest) guestActiveRooms.delete(socket.userId);
        else await User.findByIdAndUpdate(socket.userId, { activeRoomCode: null });
        socket.emit('user:active_room', null);
        return;
      }
      socket.emit('user:active_room', {
        code: room.code,
        gameType: room.gameType,
        status: room.status,
      });
    } catch (error) {
      socket.emit('user:active_room', null);
    }
  });

  // Create a new room
  socket.on('room:create', async (data: {
    gameType: GameType;
    isPublic: boolean;
    maxPlayers?: number;
    timerMinutes?: number;
    rounds?: number;
    drawingTime?: number;
  }) => {
    try {
      const code = nanoid(6).toUpperCase();
      const maxPlayers = data.gameType === 'charades'
        ? Math.min(Math.max(data.maxPlayers || 8, 2), 12)
        : 2;

      const room = await Room.create({
        code,
        gameType: data.gameType,
        isPublic: data.isPublic,
        host: socket.isGuest ? null : socket.userId,
        players: [{
          userId: socket.isGuest ? null : socket.userId,
          guestId: (socket.isGuest ? socket.userId : null) ?? null,
          displayName: socket.displayName || 'Unknown',
          socketId: socket.id,
          avatarPreset: socket.avatarPreset,
        }],
        maxPlayers,
        timerMinutes: data.timerMinutes || 10,
        rounds: data.gameType === 'charades'
          ? Math.min(Math.max(data.rounds ?? 3, 1), 10)
          : 1,
        drawingTime: data.gameType === 'charades'
          ? Math.min(Math.max(data.drawingTime ?? 60, 30), 120)
          : 60,
        status: 'waiting',
      });

      socket.join(`room:${code}`);
      socket.emit('room:joined', { room, you: room.players[0] });
      await setActiveRoom(socket.userId, code, socket.displayName);
      socket.emit('user:active_room_changed', { code, gameType: data.gameType, status: 'waiting' });

      if (data.isPublic) {
        io.to(`lobby:${data.gameType}`).emit('lobby:room_created', room);
      }
    } catch (error) {
      socket.emit('room:error', { message: 'Failed to create room' });
    }
  });

  // Join existing room
  socket.on('room:join', async ({ code }: { code: string }) => {
    try {
      const room = await Room.findOne({
        code,
        $or: [
          { status: { $in: ['waiting', 'host_away'] } },
          { gameType: 'charades', status: 'in_progress' },
        ],
      });

      if (!room) {
        socket.emit('room:error', { message: 'Room not found or game already started' });
        return;
      }

      // Returning host scenario: userId matches room.host and room is in host_away state
      if (room.status === 'host_away' && !socket.isGuest && socket.userId) {
        const isOriginalHost = room.host?.toString() === socket.userId;
        if (isOriginalHost) {
          cancelHostAwayTimeout(code);

          // If host already in players list (e.g. re-join via room:join while still listed), do not duplicate
          const existingIdx = room.players.findIndex((p) => p.userId?.toString() === socket.userId);
          if (existingIdx >= 0) {
            room.players[existingIdx].socketId = socket.id;
            if (existingIdx > 0) {
              const [h] = room.players.splice(existingIdx, 1);
              room.players.unshift(h);
            }
          } else {
            room.players.unshift({
              userId: socket.userId as any,
              guestId: null,
              displayName: socket.displayName || 'Unknown',
              socketId: socket.id,
            } as any);
          }
          room.status = 'waiting';
          room.hostDisconnectedAt = null;
          await room.save();

          socket.join(`room:${code}`);
          socket.emit('room:joined', { room, you: room.players[0] });
          await setActiveRoom(socket.userId, code, socket.displayName);
          socket.emit('user:active_room_changed', { code, gameType: room.gameType, status: 'waiting' });
          socket.to(`room:${code}`).emit('room:host_returned', { hostName: socket.displayName });
          io.to(`lobby:${room.gameType}`).emit('lobby:room_updated', room);
          return;
        }
      }

      // Reconnect path: user is already listed — update socket ID instead of rejecting
      const existingPlayer = socket.userId
        ? (socket.isGuest
            ? room.players.find((p) => p.guestId === socket.userId)
            : room.players.find((p) => p.userId?.toString() === socket.userId))
        : null;
      if (existingPlayer) {
        existingPlayer.socketId = socket.id;
        await room.save();
        socket.join(`room:${code}`);
        if (socket.userId) {
          cancelLobbyDisconnectTimeout(socket.userId, code);
          cancelGameDisconnectTimeout(socket.userId, code);
        }
        socket.emit('room:joined', { room, you: existingPlayer });
        await setActiveRoom(socket.userId, code, socket.displayName);
        socket.emit('user:active_room_changed', { code, gameType: room.gameType, status: room.status });
        return;
      }

      if (room.players.length >= room.maxPlayers) {
        socket.emit('room:error', { message: 'Room is full' });
        return;
      }

      const player = {
        userId: socket.isGuest ? null : socket.userId as any,
        guestId: (socket.isGuest ? socket.userId : null) ?? null,
        displayName: socket.displayName || 'Unknown',
        socketId: socket.id,
        avatarPreset: socket.avatarPreset,
      };

      room.players.push(player);
      await room.save();

      socket.join(`room:${code}`);
      socket.to(`room:${code}`).emit('room:player_joined', { player });
      await setActiveRoom(socket.userId, code, socket.displayName);
      socket.emit('user:active_room_changed', { code, gameType: room.gameType, status: room.status });

      if (room.gameType === 'charades' && room.status === 'in_progress') {
        socket.emit('room:joined_in_progress', { room, you: player });
        addPlayerToCharadesGame(io, socket, code);
      } else {
        socket.emit('room:joined', { room, you: player });
      }

      io.to(`lobby:${room.gameType}`).emit('lobby:room_updated', room);
    } catch (error) {
      socket.emit('room:error', { message: 'Failed to join room' });
    }
  });

  // Leave room (explicit user action — final, not a temp disconnect)
  socket.on('room:leave', async ({ code }: { code: string }) => {
    try {
      const room = await Room.findOne({ code });
      if (!room) return;

      const userId = socket.userId;
      const playerIdx = userId
        ? (socket.isGuest
            ? room.players.findIndex((p) => p.guestId === userId)
            : room.players.findIndex((p) => p.userId?.toString() === userId))
        : room.players.findIndex((p) => p.socketId === socket.id);
      if (playerIdx === -1) return;

      const isHost = playerIdx === 0;
      room.players.splice(playerIdx, 1);
      room.disconnectedPlayers = room.disconnectedPlayers.filter(
        (d) => (userId
          ? (socket.isGuest ? d.guestId !== userId : d.userId?.toString() !== userId)
          : true),
      ) as any;

      cancelHostAwayTimeout(code);
      if (userId) {
        cancelGameDisconnectTimeout(userId, code);
        cancelLobbyDisconnectTimeout(userId, code);
      }

      await setActiveRoom(userId, null);
      socket.emit('user:active_room_changed', null);

      if (room.players.length === 0) {
        await Room.deleteOne({ _id: room._id });
        io.to(`room:${code}`).emit('room:closed', { reason: 'host_left' });
        io.to(`lobby:${room.gameType}`).emit('lobby:room_removed', { roomId: room._id });
      } else if (isHost) {
        await room.save();
        await promoteNextHost(io, code);
      } else {
        await room.save();
        socket.to(`room:${code}`).emit('room:player_left', { socketId: socket.id, userId });
        io.to(`lobby:${room.gameType}`).emit('lobby:room_updated', room);
      }

      socket.leave(`room:${code}`);
    } catch (error) {
      console.error('Leave room error:', error);
    }
  });

  // NOTE: disconnect handling moved to presenceHandler.ts — do not register here.
}
