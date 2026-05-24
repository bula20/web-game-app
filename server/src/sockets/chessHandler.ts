

import { Server } from 'socket.io';
import { AuthenticatedSocket } from '../middleware/socketAuth.js';
import { Room } from '../models/Room.js';
import { Game, pruneOldGames } from '../models/Game.js';
import { User } from '../models/User.js';
import {
  createInitialState,
  getValidMoves,
  isValidMove,
  makeMove,
  isCheck,
  algebraicToSquare,
  squareToAlgebraic,
  type ChessState,
} from '../game-logic/chess.js';
import {
  registerGameDisconnectHandler,
  registerGameReconnectHandler,
} from './presenceHandler.js';
import { guestActiveRooms } from './guestState.js';

interface ChessPlayer {
  socketId: string;
  userId: string | null;
  displayName: string;
}

interface ChessGameState {
  gameState: ChessState;
  white: ChessPlayer;
  black: ChessPlayer;
  timeWhite: number;
  timeBlack: number;
  timerInterval: ReturnType<typeof setInterval> | null;
  startedAt: number;
  lastMoveAt: number;
  moves: string[];
  roomId: unknown;
}

const activeGames = new Map<string, ChessGameState>();


function playerColor(state: ChessGameState, socket: AuthenticatedSocket): 'w' | 'b' | null {
  const uid = socket.userId;
  if (uid) {
    if (state.white.userId === uid) return 'w';
    if (state.black.userId === uid) return 'b';
  }
  if (state.white.socketId === socket.id) return 'w';
  if (state.black.socketId === socket.id) return 'b';
  return null;
}


registerGameDisconnectHandler('chess', (io, code, userId) => {
  const state = activeGames.get(code);
  if (!state) return;
  let winner: 'white' | 'black' | null = null;
  if (state.white.userId === userId) winner = 'black';
  else if (state.black.userId === userId) winner = 'white';
  if (winner) endGame(io, code, winner, 'disconnect');
});


registerGameReconnectHandler('chess', (_io, socket, code) => {
  const state = activeGames.get(code);
  if (!state) return;
  const uid = socket.userId;
  if (!uid) return;
  if (state.white.userId === uid) state.white.socketId = socket.id;
  else if (state.black.userId === uid) state.black.socketId = socket.id;
  else return;

  socket.emit('chess:state', {
    white: state.white.socketId,
    black: state.black.socketId,
    board: state.gameState.board,
    turn: state.gameState.turn,
    timeWhite: Math.max(0, state.timeWhite),
    timeBlack: Math.max(0, state.timeBlack),
    moves: state.moves,
    isCheck: isCheck(state.gameState),
  });
});

export function setupChessHandler(io: Server, socket: AuthenticatedSocket) {
  socket.on('game:start', async ({ code }: { code: string }) => {
    try {
      const room = await Room.findOne({ code, gameType: 'chess', status: 'waiting' });
      if (!room || room.players.length < 2) return;

      
      
      if (room.players[0].socketId !== socket.id) return;

      if (activeGames.has(code)) return;

      room.status = 'in_progress';
      await room.save();

      const gameState = createInitialState();
      const timerSeconds = room.timerMinutes * 60;

      
      const shuffled = Math.random() > 0.5 ? [room.players[0], room.players[1]] : [room.players[1], room.players[0]];

      const state: ChessGameState = {
        gameState,
        white: { socketId: shuffled[0].socketId, userId: shuffled[0].userId?.toString() || shuffled[0].guestId || null, displayName: shuffled[0].displayName },
        black: { socketId: shuffled[1].socketId, userId: shuffled[1].userId?.toString() || shuffled[1].guestId || null, displayName: shuffled[1].displayName },
        timeWhite: timerSeconds,
        timeBlack: timerSeconds,
        timerInterval: null,
        startedAt: Date.now(),
        lastMoveAt: Date.now(),
        moves: [],
        roomId: room._id,
      };

      activeGames.set(code, state);

      
      
      state.timerInterval = setInterval(() => {
        if (state.gameState.turn === 'w') {
          state.timeWhite -= 1;
        } else {
          state.timeBlack -= 1;
        }

        io.to(`room:${code}`).emit('chess:timer_update', {
          timeWhite: Math.max(0, state.timeWhite),
          timeBlack: Math.max(0, state.timeBlack),
        });

        if (state.timeWhite <= 0 || state.timeBlack <= 0) {
          const winner = state.timeWhite <= 0 ? 'black' : 'white';
          endGame(io, code, winner, 'timeout');
        }
      }, 1000);

      io.to(`room:${code}`).emit('chess:start', {
        white: state.white.socketId,
        black: state.black.socketId,
        board: state.gameState.board,
        turn: state.gameState.turn,
        timeWhite: timerSeconds,
        timeBlack: timerSeconds,
      });
    } catch (error) {
      console.error('Chess start error:', error);
    }
  });

  
  
  
  socket.on('chess:get_state', ({ code }: { code: string }) => {
    const state = activeGames.get(code);
    if (!state) return;

    const myColor = playerColor(state, socket);
    if (myColor === 'w') state.white.socketId = socket.id;
    else if (myColor === 'b') state.black.socketId = socket.id;

    socket.emit('chess:state', {
      white: state.white.socketId,
      black: state.black.socketId,
      board: state.gameState.board,
      turn: state.gameState.turn,
      timeWhite: Math.max(0, state.timeWhite),
      timeBlack: Math.max(0, state.timeBlack),
      moves: state.moves,
      isCheck: isCheck(state.gameState),
    });
  });

  socket.on('chess:get_moves', ({ code, position }: { code: string; position: string }) => {
    const state = activeGames.get(code);
    if (!state) return;

    const myColor = playerColor(state, socket);
    if (myColor !== state.gameState.turn) {
      socket.emit('chess:valid_moves', { moves: [] });
      return;
    }

    const [row, col] = algebraicToSquare(position);
    const moves = getValidMoves(state.gameState, row, col);
    socket.emit('chess:valid_moves', {
      moves: moves.map(([r, c]) => squareToAlgebraic(r, c)),
    });
  });

  
  
  
  socket.on('chess:move', ({ code, from, to, promotion }: { code: string; from: string; to: string; promotion?: string }) => {
    const state = activeGames.get(code);
    if (!state) return;

    const currentTurn = state.gameState.turn;
    const myColor = playerColor(state, socket);

    if (myColor !== currentTurn) {
      socket.emit('chess:invalid_move', { message: 'Not your turn' });
      return;
    }

    const fromPos = algebraicToSquare(from);
    const toPos = algebraicToSquare(to);

    if (!isValidMove(state.gameState, fromPos, toPos)) {
      socket.emit('chess:invalid_move', { message: 'Invalid move' });
      return;
    }

    const result = makeMove(state.gameState, fromPos, toPos, promotion);
    state.gameState = result.state;
    state.moves.push(result.san);
    state.lastMoveAt = Date.now();

    io.to(`room:${code}`).emit('chess:moved', {
      board: result.state.board,
      turn: result.state.turn,
      timeWhite: Math.max(0, state.timeWhite),
      timeBlack: Math.max(0, state.timeBlack),
      san: result.san,
      color: currentTurn,
      isCheck: result.isCheck,
    });

    if (result.isCheckmate) {
      const winner = currentTurn === 'w' ? 'white' : 'black';
      endGame(io, code, winner, 'checkmate');
    } else if (result.isDraw) {
      const reason = result.isStalemate ? 'stalemate' : 'draw';
      endGame(io, code, 'draw', reason);
    }
  });

  socket.on('chess:resign', ({ code }: { code: string }) => {
    const state = activeGames.get(code);
    if (!state) return;

    const myColor = playerColor(state, socket);
    if (!myColor) return;
    const winner = myColor === 'w' ? 'black' : 'white';
    endGame(io, code, winner, 'resignation');
  });

  
}


async function endGame(io: Server, code: string, winner: string, reason: string) {
  const state = activeGames.get(code);
  if (!state) return;

  if (state.timerInterval) clearInterval(state.timerInterval);

  io.to(`room:${code}`).emit('chess:game_over', { result: winner, reason });

  try {
    const duration = Math.floor((Date.now() - state.startedAt) / 1000);
    await Game.create({
      roomId: state.roomId,
      gameType: 'chess',
      players: [
        { userId: state.white.userId?.startsWith('guest_') ? null : state.white.userId, displayName: state.white.displayName },
        { userId: state.black.userId?.startsWith('guest_') ? null : state.black.userId, displayName: state.black.displayName },
      ],
      winner: winner === 'white'
        ? (state.white.userId?.startsWith('guest_') ? null : state.white.userId)
        : winner === 'black'
          ? (state.black.userId?.startsWith('guest_') ? null : state.black.userId)
          : null,
      result: winner as any,
      moves: state.moves,
      duration,
      finishedAt: new Date(),
    });
    
    await pruneOldGames([state.white.userId, state.black.userId]);
  } catch (error) {
    console.error('Failed to save chess game:', error);
  }

  try {
    await Room.findOneAndUpdate({ code }, { status: 'finished' });
    
    const ids = [state.white.userId, state.black.userId].filter(Boolean) as string[];
    const userIds = ids.filter((id) => !id.startsWith('guest_'));
    if (userIds.length) {
      await User.updateMany({ _id: { $in: userIds } }, { activeRoomCode: null });
    }
    ids.filter((id) => id.startsWith('guest_')).forEach((gid) => guestActiveRooms.delete(gid));
  } catch {  }

  activeGames.delete(code);
}
