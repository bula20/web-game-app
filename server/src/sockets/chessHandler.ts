import { Server } from 'socket.io';
import { AuthenticatedSocket } from '../middleware/socketAuth.js';
import { Room } from '../models/Room.js';
import { Game } from '../models/Game.js';
import {
  createInitialState,
  getValidMoves,
  isValidMove,
  makeMove,
  isCheck,
  algebraicToSquare,
  squareToAlgebraic,
  type ChessState,
  type Board,
} from '../game-logic/chess.js';

interface ChessGameState {
  gameState: ChessState;
  white: { socketId: string; userId: string | null; displayName: string };
  black: { socketId: string; userId: string | null; displayName: string };
  timeWhite: number;
  timeBlack: number;
  timerInterval: ReturnType<typeof setInterval> | null;
  startedAt: number;
  lastMoveAt: number;
  moves: string[]; // SAN notation
}

const activeGames = new Map<string, ChessGameState>();

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
        white: { socketId: shuffled[0].socketId, userId: shuffled[0].userId?.toString() || null, displayName: shuffled[0].displayName },
        black: { socketId: shuffled[1].socketId, userId: shuffled[1].userId?.toString() || null, displayName: shuffled[1].displayName },
        timeWhite: timerSeconds,
        timeBlack: timerSeconds,
        timerInterval: null,
        startedAt: Date.now(),
        lastMoveAt: Date.now(),
        moves: [],
      };

      activeGames.set(code, state);

      // Start timer
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

    const isWhitePlayer = state.white.socketId === socket.id;
    const isBlackPlayer = state.black.socketId === socket.id;
    const myColor = isWhitePlayer ? 'w' : isBlackPlayer ? 'b' : null;

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
    const isWhite = state.white.socketId === socket.id;
    const isBlack = state.black.socketId === socket.id;

    if ((currentTurn === 'w' && !isWhite) || (currentTurn === 'b' && !isBlack)) {
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

    const isWhite = state.white.socketId === socket.id;
    const winner = isWhite ? 'black' : 'white';
    endGame(io, code, winner, 'resignation');
  });

  socket.on('disconnect', () => {
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
      moves: state.moves,
      duration,
      finishedAt: new Date(),
    });
  } catch (error) {
    console.error('Failed to save chess game:', error);
  }

  try {
    await Room.findOneAndUpdate({ code }, { status: 'finished' });
  } catch { /* ignore */ }

  activeGames.delete(code);
}
