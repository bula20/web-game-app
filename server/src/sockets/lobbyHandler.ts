import { Server } from 'socket.io';
import { nanoid } from 'nanoid';
import { AuthenticatedSocket } from '../middleware/socketAuth.js';
import { Room, GameType } from '../models/Room.js';

export function setupLobbyHandler(io: Server, socket: AuthenticatedSocket) {
  // Join lobby for a game type (subscribe to room list updates)
  socket.on('lobby:join', async ({ gameType }: { gameType: GameType }) => {
    socket.join(`lobby:${gameType}`);
    const rooms = await Room.find({ gameType, isPublic: true, status: 'waiting' }).sort({ createdAt: -1 }).limit(50);
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
      const room = await Room.findOne({ code, status: 'waiting' });

      if (!room) {
        socket.emit('room:error', { message: 'Room not found or game already started' });
        return;
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
      socket.emit('room:joined', { room, you: player });
      socket.to(`room:${code}`).emit('room:player_joined', { player });

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

      room.players = room.players.filter(p => p.socketId !== socket.id) as any;

      if (room.players.length === 0) {
        await Room.deleteOne({ _id: room._id });
        io.to(`lobby:${room.gameType}`).emit('lobby:room_removed', { roomId: room._id });
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
      const rooms = await Room.find({ 'players.socketId': socket.id });
      for (const room of rooms) {
        room.players = room.players.filter(p => p.socketId !== socket.id) as any;

        if (room.players.length === 0) {
          await Room.deleteOne({ _id: room._id });
          io.to(`lobby:${room.gameType}`).emit('lobby:room_removed', { roomId: room._id });
        } else {
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
