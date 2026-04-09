import { Server } from 'socket.io';
import { Chess } from 'chess.js';
import { AuthenticatedSocket } from '../middleware/socketAuth.js';
import { Room } from '../models/Room.js';
import { Game } from '../models/Game.js';

interface ChessGameState {
  chess: Chess;
  white: { socketId: string; userId: string | null; displayName: string };
  black: { socketId: string; userId: string | null; displayName: string };
  timeWhite: number;
  timeBlack: number;
  timerInterval: ReturnType<typeof setInterval> | null;
  startedAt: number;
  lastMoveAt: number;
}

const activeGames = new Map<string, ChessGameState>();

export function setupChessHandler(io: Server, socket: AuthenticatedSocket) {
  socket.on('game:start', async ({ code }: { code: string }) => {
    try {
      const room = await Room.findOne({ code, gameType: 'chess', status: 'waiting' });
      if (!room || room.players.length < 2) return;

      // Check if socket is the host
      if (room.players[0].socketId !== socket.id) return;

      room.status = 'in_progress';
      await room.save();

      const chess = new Chess();
      const timerSeconds = room.timerMinutes * 60;

      // Randomly assign colors
      const shuffled = Math.random() > 0.5 ? [room.players[0], room.players[1]] : [room.players[1], room.players[0]];

      const state: ChessGameState = {
        chess,
        white: { socketId: shuffled[0].socketId, userId: shuffled[0].userId?.toString() || null, displayName: shuffled[0].displayName },
        black: { socketId: shuffled[1].socketId, userId: shuffled[1].userId?.toString() || null, displayName: shuffled[1].displayName },
        timeWhite: timerSeconds,
        timeBlack: timerSeconds,
        timerInterval: null,
        startedAt: Date.now(),
        lastMoveAt: Date.now(),
      };

      activeGames.set(code, state);

      // Start timer
      state.timerInterval = setInterval(() => {
        const elapsed = 1;
        if (state.chess.turn() === 'w') {
          state.timeWhite -= elapsed;
        } else {
          state.timeBlack -= elapsed;
        }

        io.to(`room:${code}`).emit('chess:timer_update', {
          timeWhite: Math.max(0, state.timeWhite),
          timeBlack: Math.max(0, state.timeBlack),
        });

        // Check timeout
        if (state.timeWhite <= 0 || state.timeBlack <= 0) {
          const winner = state.timeWhite <= 0 ? 'black' : 'white';
          endGame(io, code, winner, 'timeout');
        }
      }, 1000);

      // Emit start to both players
      io.to(`room:${code}`).emit('chess:start', {
        white: state.white.socketId,
        black: state.black.socketId,
        fen: chess.fen(),
        timeWhite: timerSeconds,
        timeBlack: timerSeconds,
      });
    } catch (error) {
      console.error('Chess start error:', error);
    }
  });

  socket.on('chess:move', ({ code, from, to, promotion }: { code: string; from: string; to: string; promotion?: string }) => {
    const state = activeGames.get(code);
    if (!state) return;

    // Verify it's the right player's turn
    const currentTurn = state.chess.turn();
    const isWhite = state.white.socketId === socket.id;
    const isBlack = state.black.socketId === socket.id;

    if ((currentTurn === 'w' && !isWhite) || (currentTurn === 'b' && !isBlack)) {
      socket.emit('chess:invalid_move', { message: 'Not your turn' });
      return;
    }

    try {
      const move = state.chess.move({ from, to, promotion: promotion || undefined });
      if (!move) {
        socket.emit('chess:invalid_move', { message: 'Invalid move' });
        return;
      }

      state.lastMoveAt = Date.now();

      io.to(`room:${code}`).emit('chess:moved', {
        from,
        to,
        promotion: move.promotion,
        fen: state.chess.fen(),
        timeWhite: Math.max(0, state.timeWhite),
        timeBlack: Math.max(0, state.timeBlack),
      });

      // Check game over conditions
      if (state.chess.isCheckmate()) {
        const winner = state.chess.turn() === 'w' ? 'black' : 'white';
        endGame(io, code, winner, 'checkmate');
      } else if (state.chess.isDraw()) {
        endGame(io, code, 'draw', 'draw');
      } else if (state.chess.isStalemate()) {
        endGame(io, code, 'draw', 'stalemate');
      }
    } catch {
      socket.emit('chess:invalid_move', { message: 'Invalid move' });
    }
  });

  socket.on('chess:resign', ({ code }: { code: string }) => {
    const state = activeGames.get(code);
    if (!state) return;

    const isWhite = state.white.socketId === socket.id;
    const winner = isWhite ? 'black' : 'white';
    endGame(io, code, winner, 'resignation');
  });

  socket.on('disconnect', () => {
    // Check if player was in an active game
    for (const [code, state] of activeGames) {
      if (state.white.socketId === socket.id || state.black.socketId === socket.id) {
        const isWhite = state.white.socketId === socket.id;
        const winner = isWhite ? 'black' : 'white';
        endGame(io, code, winner, 'disconnect');
      }
    }
  });
}

async function endGame(io: Server, code: string, winner: string, reason: string) {
  const state = activeGames.get(code);
  if (!state) return;

  if (state.timerInterval) clearInterval(state.timerInterval);

  io.to(`room:${code}`).emit('chess:game_over', { result: winner, reason });

  // Save to DB
  try {
    const duration = Math.floor((Date.now() - state.startedAt) / 1000);
    await Game.create({
      roomId: code,
      gameType: 'chess',
      players: [
        { userId: state.white.userId, displayName: state.white.displayName },
        { userId: state.black.userId, displayName: state.black.displayName },
      ],
      winner: winner === 'white' ? state.white.userId : winner === 'black' ? state.black.userId : null,
      result: winner as any,
      moves: state.chess.history(),
      duration,
      finishedAt: new Date(),
    });
  } catch (error) {
    console.error('Failed to save chess game:', error);
  }

  // Update room
  try {
    await Room.findOneAndUpdate({ code }, { status: 'finished' });
  } catch { /* ignore */ }

  activeGames.delete(code);
}
