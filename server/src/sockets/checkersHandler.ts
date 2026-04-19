import { Server } from 'socket.io';
import { AuthenticatedSocket } from '../middleware/socketAuth.js';
import { Room } from '../models/Room.js';
import { Game } from '../models/Game.js';
import { User } from '../models/User.js';
import {
  createInitialBoard,
  getValidMoves,
  makeMove,
  isValidMove,
  hasMovesForColor,
  countPieces,
  type Board,
} from '../game-logic/checkers.js';
import {
  registerGameDisconnectHandler,
  registerGameReconnectHandler,
} from './presenceHandler.js';

interface CheckersPlayer {
  socketId: string;
  userId: string | null;
  displayName: string;
}

interface CheckersGameState {
  board: Board;
  turn: 'w' | 'b';
  white: CheckersPlayer;
  black: CheckersPlayer;
  timeWhite: number;
  timeBlack: number;
  timerInterval: ReturnType<typeof setInterval> | null;
  startedAt: number;
  continuingFrom: [number, number] | null;
  moves: string[];
  roomId: unknown;
}

const activeGames = new Map<string, CheckersGameState>();

function playerColor(state: CheckersGameState, socket: AuthenticatedSocket): 'w' | 'b' | null {
  const uid = socket.userId;
  if (uid) {
    if (state.white.userId === uid) return 'w';
    if (state.black.userId === uid) return 'b';
  }
  if (state.white.socketId === socket.id) return 'w';
  if (state.black.socketId === socket.id) return 'b';
  return null;
}

registerGameDisconnectHandler('checkers', (io, code, userId) => {
  const state = activeGames.get(code);
  if (!state) return;
  let winner: 'white' | 'black' | null = null;
  if (state.white.userId === userId) winner = 'black';
  else if (state.black.userId === userId) winner = 'white';
  if (winner) endGame(io, code, winner, 'disconnect');
});

registerGameReconnectHandler('checkers', (_io, socket, code) => {
  const state = activeGames.get(code);
  if (!state) return;
  const uid = socket.userId;
  if (!uid) return;
  const myColor = state.white.userId === uid ? 'w' : state.black.userId === uid ? 'b' : null;
  if (!myColor) return;
  if (myColor === 'w') state.white.socketId = socket.id;
  else state.black.socketId = socket.id;

  socket.emit('checkers:state', {
    board: state.board,
    playerColor: myColor,
    turn: state.turn,
    times: { white: Math.max(0, state.timeWhite), black: Math.max(0, state.timeBlack) },
    moves: state.moves,
  });
});

export function setupCheckersHandler(io: Server, socket: AuthenticatedSocket) {
  socket.on('game:start', async ({ code }: { code: string }) => {
    const room = await Room.findOne({ code, gameType: 'checkers', status: 'waiting' });
    if (!room || room.players.length < 2) return;
    if (room.players[0].socketId !== socket.id) return;

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
      roomId: room._id,
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

    io.to(state.white.socketId).emit('checkers:start', {
      board,
      playerColor: 'w',
      times: { white: timerSeconds, black: timerSeconds },
    });

    io.to(state.black.socketId).emit('checkers:start', {
      board,
      playerColor: 'b',
      times: { white: timerSeconds, black: timerSeconds },
    });
  });

  socket.on('checkers:get_state', ({ code }: { code: string }) => {
    const state = activeGames.get(code);
    if (!state) return;

    const myColor = playerColor(state, socket);
    if (myColor === 'w') state.white.socketId = socket.id;
    else if (myColor === 'b') state.black.socketId = socket.id;

    socket.emit('checkers:state', {
      board: state.board,
      playerColor: myColor ?? (state.white.socketId === socket.id ? 'w' : 'b'),
      turn: state.turn,
      times: { white: Math.max(0, state.timeWhite), black: Math.max(0, state.timeBlack) },
      moves: state.moves,
    });
  });

  socket.on('checkers:get_moves', ({ code, position }: { code: string; position: [number, number] }) => {
    const state = activeGames.get(code);
    if (!state) return;

    const myColor = playerColor(state, socket);

    if (myColor !== state.turn) {
      socket.emit('checkers:valid_moves', { moves: [] });
      return;
    }

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

    const myColor = playerColor(state, socket);

    if (myColor !== state.turn) return;

    if (state.continuingFrom) {
      if (from[0] !== state.continuingFrom[0] || from[1] !== state.continuingFrom[1]) return;
    }

    if (!isValidMove(state.board, from, to, state.turn)) return;

    const result = makeMove(state.board, from, to);
    state.board = result.board;
    state.moves.push(`${from[0]},${from[1]}-${to[0]},${to[1]}`);

    if (result.canContinue) {
      state.continuingFrom = to;
      io.to(`room:${code}`).emit('checkers:moved', {
        board: state.board,
        turn: state.turn,
        times: { white: state.timeWhite, black: state.timeBlack },
        lastMove: `${from[0]},${from[1]}-${to[0]},${to[1]}`,
        moveBy: myColor,
      });
      return;
    }

    state.continuingFrom = null;
    state.turn = state.turn === 'w' ? 'b' : 'w';

    io.to(`room:${code}`).emit('checkers:moved', {
      board: state.board,
      turn: state.turn,
      times: { white: state.timeWhite, black: state.timeBlack },
      lastMove: `${from[0]},${from[1]}-${to[0]},${to[1]}`,
      moveBy: myColor,
    });

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
    const myColor = playerColor(state, socket);
    if (!myColor) return;
    endGame(io, code, myColor === 'w' ? 'black' : 'white', 'resignation');
  });

  // NOTE: no socket.on('disconnect') — presenceHandler handles grace period.
}

async function endGame(io: Server, code: string, winner: string, reason: string) {
  const state = activeGames.get(code);
  if (!state) return;

  if (state.timerInterval) clearInterval(state.timerInterval);

  io.to(`room:${code}`).emit('checkers:game_over', { result: winner, reason });

  try {
    const duration = Math.floor((Date.now() - state.startedAt) / 1000);
    await Game.create({
      roomId: state.roomId,
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
    const ids = [state.white.userId, state.black.userId].filter(Boolean) as string[];
    if (ids.length) {
      await User.updateMany({ _id: { $in: ids } }, { activeRoomCode: null });
    }
  } catch { /* ignore */ }

  activeGames.delete(code);
}
