import { Server } from 'socket.io';
import { nanoid } from 'nanoid';
import { AuthenticatedSocket } from '../middleware/socketAuth.js';
import { Room, GameType } from '../models/Room.js';
import { addPlayerToCharadesGame } from './charadesHandler.js';

const HOST_AWAY_TTL = 120; // seconds

const hostAwayTimeouts = new Map<string, ReturnType<typeof setTimeout>>();

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

export function setupLobbyHandler(io: Server, socket: AuthenticatedSocket) {
  // Join lobby for a game type (subscribe to room list updates)
  socket.on('lobby:join', async ({ gameType }: { gameType: GameType }) => {
    socket.join(`lobby:${gameType}`);
    // For charades, also show in_progress rooms that still have open slots
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
          displayName: socket.displayName || 'Unknown',
          socketId: socket.id,
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
          // Cancel the host away timeout
          const t = hostAwayTimeouts.get(code);
          if (t) { clearTimeout(t); hostAwayTimeouts.delete(code); }

          // Re-add host at the front of the players list
          room.players.unshift({
            userId: socket.userId as any,
            displayName: socket.displayName || 'Unknown',
            socketId: socket.id,
          } as any);
          room.status = 'waiting';
          room.hostDisconnectedAt = null;
          await room.save();

          socket.join(`room:${code}`);
          socket.emit('room:joined', { room, you: room.players[0] });
          socket.to(`room:${code}`).emit('room:host_returned', { hostName: socket.displayName });
          io.to(`lobby:${room.gameType}`).emit('lobby:room_updated', room);
          return;
        }
      }

      if (room.players.length >= room.maxPlayers) {
        socket.emit('room:error', { message: 'Room is full' });
        return;
      }

      const alreadyInRoom = room.players.some(p => p.socketId === socket.id);
      if (alreadyInRoom) {
        socket.emit('room:error', { message: 'Already in this room' });
        return;
      }

      const player = {
        userId: socket.isGuest ? null : socket.userId as any,
        displayName: socket.displayName || 'Unknown',
        socketId: socket.id,
      };

      room.players.push(player);
      await room.save();

      socket.join(`room:${code}`);
      socket.to(`room:${code}`).emit('room:player_joined', { player });

      // If joining a charades game in progress, go straight into the game
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

  // Leave room
  socket.on('room:leave', async ({ code }: { code: string }) => {
    try {
      const room = await Room.findOne({ code });
      if (!room) return;

      const isHost = room.players.length > 0 && room.players[0].socketId === socket.id;

      room.players = room.players.filter(p => p.socketId !== socket.id) as any;

      // Cancel any pending host-away timeout
      const t = hostAwayTimeouts.get(code);
      if (t) { clearTimeout(t); hostAwayTimeouts.delete(code); }

      if (room.players.length === 0) {
        await Room.deleteOne({ _id: room._id });
        io.to(`room:${code}`).emit('room:closed', { reason: 'host_left' });
        io.to(`lobby:${room.gameType}`).emit('lobby:room_removed', { roomId: room._id });
      } else if (isHost) {
        // Immediate succession
        await room.save();
        await promoteNextHost(io, code);
      } else {
        await room.save();
        socket.to(`room:${code}`).emit('room:player_left', { socketId: socket.id });
        io.to(`lobby:${room.gameType}`).emit('lobby:room_updated', room);
      }

      socket.leave(`room:${code}`);
    } catch (error) {
      console.error('Leave room error:', error);
    }
  });

  // Handle disconnect - remove from rooms
  socket.on('disconnect', async () => {
    try {
      const rooms = await Room.find({
        'players.socketId': socket.id,
        status: { $in: ['waiting', 'host_away'] },
      });

      for (const room of rooms) {
        const isHost = room.players.length > 0 && room.players[0].socketId === socket.id;

        room.players = room.players.filter(p => p.socketId !== socket.id) as any;

        if (room.players.length === 0) {
          // Cancel timeout if any, then delete
          const t = hostAwayTimeouts.get(room.code);
          if (t) { clearTimeout(t); hostAwayTimeouts.delete(room.code); }
          await Room.deleteOne({ _id: room._id });
          io.to(`lobby:${room.gameType}`).emit('lobby:room_removed', { roomId: room._id });
        } else if (isHost) {
          // Host disconnected — start the host_away timer
          room.status = 'host_away';
          room.hostDisconnectedAt = new Date();
          await room.save();

          io.to(`room:${room.code}`).emit('room:host_away', { expiresIn: HOST_AWAY_TTL });
          io.to(`lobby:${room.gameType}`).emit('lobby:room_updated', room);

          const code = room.code;
          hostAwayTimeouts.set(code, setTimeout(() => {
            promoteNextHost(io, code);
            hostAwayTimeouts.delete(code);
          }, HOST_AWAY_TTL * 1000));
        } else {
          // Non-host player disconnected
          await room.save();
          io.to(`room:${room.code}`).emit('room:player_left', { socketId: socket.id });
          io.to(`lobby:${room.gameType}`).emit('lobby:room_updated', room);
        }
      }
    } catch (error) {
      console.error('Disconnect cleanup error:', error);
    }
  });
}
