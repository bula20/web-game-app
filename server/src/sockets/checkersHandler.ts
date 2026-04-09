import { Server } from 'socket.io';
import { AuthenticatedSocket } from '../middleware/socketAuth.js';
import { Room } from '../models/Room.js';
import { Game } from '../models/Game.js';
import {
  createInitialBoard,
  getValidMoves,
  makeMove,
  isValidMove,
  hasMovesForColor,
  countPieces,
  type Board,
} from '../game-logic/checkers.js';

interface CheckersGameState {
  board: Board;
  turn: 'w' | 'b';
  white: { socketId: string; userId: string | null; displayName: string };
  black: { socketId: string; userId: string | null; displayName: string };
  timeWhite: number;
  timeBlack: number;
  timerInterval: ReturnType<typeof setInterval> | null;
  startedAt: number;
  continuingFrom: [number, number] | null; // multi-jump tracking
  moves: string[];
}

const activeGames = new Map<string, CheckersGameState>();

export function setupCheckersHandler(io: Server, socket: AuthenticatedSocket) {
  socket.on('game:start', async ({ code }: { code: string }) => {
    // Only handle checkers rooms
    const room = await Room.findOne({ code, gameType: 'checkers', status: 'waiting' });
    if (!room || room.players.length < 2) return;
    if (room.players[0].socketId !== socket.id) return;

    // Prevent double-start
    if (activeGames.has(code)) return;

    room.status = 'in_progress';
    await room.save();

    const board = createInitialBoard();
    const timerSeconds = room.timerMinutes * 60;

    const shuffled = Math.random() > 0.5
      ? [room.players[0], room.players[1]]
      : [room.players[1], room.players[0]];

    const state: CheckersGameState = {
      board,
      turn: 'w',
      white: { socketId: shuffled[0].socketId, userId: shuffled[0].userId?.toString() || null, displayName: shuffled[0].displayName },
      black: { socketId: shuffled[1].socketId, userId: shuffled[1].userId?.toString() || null, displayName: shuffled[1].displayName },
      timeWhite: timerSeconds,
      timeBlack: timerSeconds,
      timerInterval: null,
      startedAt: Date.now(),
      continuingFrom: null,
      moves: [],
    };

    activeGames.set(code, state);

    state.timerInterval = setInterval(() => {
      if (state.turn === 'w') {
        state.timeWhite -= 1;
      } else {
        state.timeBlack -= 1;
      }

      io.to(`room:${code}`).emit('checkers:timer_update', {
        white: Math.max(0, state.timeWhite),
        black: Math.max(0, state.timeBlack),
      });

      if (state.timeWhite <= 0 || state.timeBlack <= 0) {
        const winner = state.timeWhite <= 0 ? 'black' : 'white';
        endGame(io, code, winner, 'timeout');
      }
    }, 1000);

    // Emit to white player
    io.to(state.white.socketId).emit('checkers:start', {
      board,
      playerColor: 'w',
      times: { white: timerSeconds, black: timerSeconds },
    });

    // Emit to black player
    io.to(state.black.socketId).emit('checkers:start', {
      board,
      playerColor: 'b',
      times: { white: timerSeconds, black: timerSeconds },
    });
  });

  socket.on('checkers:get_moves', ({ code, position }: { code: string; position: [number, number] }) => {
    const state = activeGames.get(code);
    if (!state) return;

    const isWhitePlayer = state.white.socketId === socket.id;
    const isBlackPlayer = state.black.socketId === socket.id;
    const myColor = isWhitePlayer ? 'w' : isBlackPlayer ? 'b' : null;

    if (myColor !== state.turn) {
      socket.emit('checkers:valid_moves', { moves: [] });
      return;
    }

    // If continuing a multi-jump, only allow moves from that piece
    if (state.continuingFrom) {
      if (position[0] !== state.continuingFrom[0] || position[1] !== state.continuingFrom[1]) {
        socket.emit('checkers:valid_moves', { moves: [] });
        return;
      }
    }

    const moves = getValidMoves(state.board, position[0], position[1]);
    socket.emit('checkers:valid_moves', { moves });
  });

  socket.on('checkers:move', ({ code, from, to }: { code: string; from: [number, number]; to: [number, number] }) => {
    const state = activeGames.get(code);
    if (!state) return;

    const isWhitePlayer = state.white.socketId === socket.id;
    const isBlackPlayer = state.black.socketId === socket.id;
    const myColor = isWhitePlayer ? 'w' : isBlackPlayer ? 'b' : null;

    if (myColor !== state.turn) return;

    // If continuing multi-jump, must use the same piece
    if (state.continuingFrom) {
      if (from[0] !== state.continuingFrom[0] || from[1] !== state.continuingFrom[1]) return;
    }

    if (!isValidMove(state.board, from, to, state.turn)) return;

    const result = makeMove(state.board, from, to);
    state.board = result.board;
    state.moves.push(`${from[0]},${from[1]}-${to[0]},${to[1]}`);

    if (result.canContinue) {
      // Multi-jump: same player continues
      state.continuingFrom = to;
      io.to(`room:${code}`).emit('checkers:moved', {
        board: state.board,
        turn: state.turn,
        times: { white: state.timeWhite, black: state.timeBlack },
      });
      return;
    }

    // Switch turn
    state.continuingFrom = null;
    state.turn = state.turn === 'w' ? 'b' : 'w';

    io.to(`room:${code}`).emit('checkers:moved', {
      board: state.board,
      turn: state.turn,
      times: { white: state.timeWhite, black: state.timeBlack },
    });

    // Check game over
    if (!hasMovesForColor(state.board, state.turn)) {
      const winner = state.turn === 'w' ? 'black' : 'white';
      endGame(io, code, winner, 'no_moves');
      return;
    }

    if (countPieces(state.board, 'w') === 0) {
      endGame(io, code, 'black', 'all_captured');
    } else if (countPieces(state.board, 'b') === 0) {
      endGame(io, code, 'white', 'all_captured');
    }
  });

  socket.on('checkers:resign', ({ code }: { code: string }) => {
    const state = activeGames.get(code);
    if (!state) return;
    const isWhite = state.white.socketId === socket.id;
    endGame(io, code, isWhite ? 'black' : 'white', 'resignation');
  });

  socket.on('disconnect', () => {
    for (const [code, state] of activeGames) {
      if (state.white.socketId === socket.id || state.black.socketId === socket.id) {
        const isWhite = state.white.socketId === socket.id;
        endGame(io, code, isWhite ? 'black' : 'white', 'disconnect');
      }
    }
  });
}

async function endGame(io: Server, code: string, winner: string, reason: string) {
  const state = activeGames.get(code);
  if (!state) return;

  if (state.timerInterval) clearInterval(state.timerInterval);

  io.to(`room:${code}`).emit('checkers:game_over', { result: winner, reason });

  try {
    const duration = Math.floor((Date.now() - state.startedAt) / 1000);
    await Game.create({
      roomId: code,
      gameType: 'checkers',
      players: [
        { userId: state.white.userId, displayName: state.white.displayName },
        { userId: state.black.userId, displayName: state.black.displayName },
      ],
      winner: winner === 'white' ? state.white.userId : winner === 'black' ? state.black.userId : null,
      result: winner as any,
      moves: state.moves,
      duration,
      finishedAt: new Date(),
    });
  } catch (error) {
    console.error('Failed to save checkers game:', error);
  }

  try {
    await Room.findOneAndUpdate({ code }, { status: 'finished' });
  } catch { /* ignore */ }

  activeGames.delete(code);
}
