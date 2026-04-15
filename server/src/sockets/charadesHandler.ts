import { Server } from 'socket.io';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { AuthenticatedSocket } from '../middleware/socketAuth.js';
import { Room } from '../models/Room.js';
import { Game } from '../models/Game.js';

// Load word bank
let wordBank: Record<string, Record<string, string[]>> = { en: {}, pl: {} };
try {
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const data = readFileSync(join(__dirname, '..', 'data', 'words.json'), 'utf-8');
  wordBank = JSON.parse(data);
} catch (error) {
  console.error('Failed to load words.json:', error);
}

interface CharadesPlayer {
  socketId: string;
  userId: string | null;
  displayName: string;
  points: number;
  hasGuessedCorrectly: boolean;
  drawCount: number; // how many times this player has drawn
}

interface CharadesGameState {
  players: CharadesPlayer[];
  // Index into players[] of who is currently drawing
  currentDrawerIndex: number;
  currentWord: string;
  // Total full cycles (each player draws once = 1 cycle) to play
  totalCycles: number;
  // How many full cycles have been completed
  completedCycles: number;
  // How many players have drawn in the current cycle
  drawnThisCycle: number;
  timeLeft: number;
  timerInterval: ReturnType<typeof setInterval> | null;
  startedAt: number;
  lang: string;
  usedWords: Set<string>;
  roomId: unknown;
  roundInProgress: boolean;
}

const activeGames = new Map<string, CharadesGameState>();

function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

function isClose(guess: string, word: string): boolean {
  const g = guess.trim().toLowerCase();
  const w = word.toLowerCase();
  if (g === w) return false;
  const dist = levenshtein(g, w);
  return dist <= 2 || dist <= Math.floor(w.length * 0.3);
}

function getRandomWord(lang: string, usedWords: Set<string>): string {
  const langWords = wordBank[lang] || wordBank['en'];
  const allWords = Object.values(langWords).flat();
  const available = allWords.filter(w => !usedWords.has(w));
  if (available.length === 0) {
    usedWords.clear();
    return allWords[Math.floor(Math.random() * allWords.length)];
  }
  return available[Math.floor(Math.random() * available.length)];
}

export function setupCharadesHandler(io: Server, socket: AuthenticatedSocket) {
  socket.on('game:start', async ({ code }: { code: string }) => {
    const room = await Room.findOne({ code, gameType: 'charades', status: 'waiting' });
    if (!room || room.players.length < 2) return;
    if (room.players[0].socketId !== socket.id) return;
    if (activeGames.has(code)) return;

    // Keep room in_progress but still joinable (lobby handler will handle visibility)
    room.status = 'in_progress';
    await room.save();

    const players: CharadesPlayer[] = room.players.map(p => ({
      socketId: p.socketId,
      userId: p.userId?.toString() || null,
      displayName: p.displayName,
      points: 0,
      hasGuessedCorrectly: false,
      drawCount: 0,
    }));

    const state: CharadesGameState = {
      players,
      currentDrawerIndex: 0,
      currentWord: '',
      totalCycles: 2, // each player draws twice total
      completedCycles: 0,
      drawnThisCycle: 0,
      timeLeft: 0,
      timerInterval: null,
      startedAt: Date.now(),
      lang: 'pl',
      usedWords: new Set(),
      roomId: room._id,
      roundInProgress: false,
    };

    activeGames.set(code, state);

    io.to(`room:${code}`).emit('charades:start', {
      players: players.map(p => ({ displayName: p.displayName, points: 0 })),
    });

    startNewRound(io, code);
  });

  socket.on('charades:draw', ({ code, stroke }: { code: string; stroke: any }) => {
    const state = activeGames.get(code);
    if (!state) return;
    if (state.players[state.currentDrawerIndex].socketId !== socket.id) return;
    socket.to(`room:${code}`).emit('charades:draw', { stroke });
  });

  socket.on('charades:clear', ({ code }: { code: string }) => {
    const state = activeGames.get(code);
    if (!state) return;
    if (state.players[state.currentDrawerIndex].socketId !== socket.id) return;
    socket.to(`room:${code}`).emit('charades:cleared');
  });

  socket.on('charades:guess', ({ code, text }: { code: string; text: string }) => {
    const state = activeGames.get(code);
    if (!state) return;

    const playerIndex = state.players.findIndex(p => p.socketId === socket.id);
    if (playerIndex === -1) return;
    if (playerIndex === state.currentDrawerIndex) return;
    if (state.players[playerIndex].hasGuessedCorrectly) return;

    const isCorrect = text.trim().toLowerCase() === state.currentWord.toLowerCase();

    if (isCorrect) {
      state.players[playerIndex].hasGuessedCorrectly = true;
      const points = Math.max(10, Math.floor(state.timeLeft * 1.5));
      state.players[playerIndex].points += points;
      state.players[state.currentDrawerIndex].points += Math.floor(points / 2);

      io.to(`room:${code}`).emit('charades:guess_result', {
        player: state.players[playerIndex].displayName,
        text: '***',
        correct: true,
      });

      const allGuessed = state.players.every((p, i) =>
        i === state.currentDrawerIndex || p.hasGuessedCorrectly
      );
      if (allGuessed) {
        endRound(io, code);
      }
    } else {
      io.to(`room:${code}`).emit('charades:guess_result', {
        player: state.players[playerIndex].displayName,
        text,
        correct: false,
        close: isClose(text, state.currentWord),
      });
    }
  });


  socket.on('charades:leave', ({ code }: { code: string }) => {
    handlePlayerLeave(io, socket.id, code);
  });

  socket.on('disconnect', () => {
    for (const [code] of activeGames) {
      handlePlayerLeave(io, socket.id, code);
    }
  });
}

function handlePlayerLeave(io: Server, socketId: string, code: string) {
  const state = activeGames.get(code);
  if (!state) return;
  const playerIndex = state.players.findIndex(p => p.socketId === socketId);
  if (playerIndex === -1) return;

  const wasDrawer = playerIndex === state.currentDrawerIndex;
  state.players.splice(playerIndex, 1);

  // Adjust currentDrawerIndex after removal
  if (playerIndex < state.currentDrawerIndex) {
    state.currentDrawerIndex--;
  } else if (playerIndex === state.currentDrawerIndex) {
    // Wrap around if needed
    state.currentDrawerIndex = state.currentDrawerIndex % Math.max(state.players.length, 1);
  }

  // Update lobby so freed slot shows up
  Room.findOneAndUpdate(
    { code },
    { $pull: { players: { socketId: socketId } } }
  ).catch(() => {});

  if (state.players.length < 2) {
    endCharadesGame(io, code);
    return;
  }

  if (wasDrawer && state.roundInProgress) {
    // Skip to next player's turn
    endRound(io, code);
  }
}

function getNextDrawerIndex(state: CharadesGameState): number | null {
  // Find player who has drawn the fewest times (round-robin by draw count)
  const minDraws = Math.min(...state.players.map(p => p.drawCount));

  // Among players with min draws, pick the next one after currentDrawerIndex (circular)
  const candidates = state.players
    .map((p, i) => ({ p, i }))
    .filter(({ p }) => p.drawCount === minDraws);

  if (candidates.length === 0) return null;

  // Find the first candidate that comes after currentDrawerIndex (wrapping)
  for (let offset = 1; offset <= state.players.length; offset++) {
    const idx = (state.currentDrawerIndex + offset) % state.players.length;
    if (candidates.some(c => c.i === idx)) return idx;
  }

  return candidates[0].i;
}

function startNewRound(io: Server, code: string) {
  const state = activeGames.get(code);
  if (!state) return;

  // Check if all players have completed totalCycles rounds
  const minDraws = Math.min(...state.players.map(p => p.drawCount));
  if (minDraws >= state.totalCycles) {
    endCharadesGame(io, code);
    return;
  }

  const nextDrawerIndex = getNextDrawerIndex(state);
  if (nextDrawerIndex === null) {
    endCharadesGame(io, code);
    return;
  }

  state.currentDrawerIndex = nextDrawerIndex;
  state.players[nextDrawerIndex].drawCount++;
  state.players.forEach(p => { p.hasGuessedCorrectly = false; });
  state.roundInProgress = true;

  const word = getRandomWord(state.lang, state.usedWords);
  state.usedWords.add(word);
  state.currentWord = word;
  state.timeLeft = 60;

  const drawer = state.players[state.currentDrawerIndex];

  io.to(`room:${code}`).emit('charades:new_round', {
    drawer: drawer.socketId,
    drawerName: drawer.displayName,
    timeLeft: 60,
  });

  io.to(drawer.socketId).emit('charades:word', { word, category: '' });

  if (state.timerInterval) clearInterval(state.timerInterval);
  state.timerInterval = setInterval(() => {
    state.timeLeft -= 1;
    io.to(`room:${code}`).emit('charades:timer', { timeLeft: Math.max(0, state.timeLeft) });

    if (state.timeLeft <= 0) {
      endRound(io, code);
    }
  }, 1000);
}

function endRound(io: Server, code: string) {
  const state = activeGames.get(code);
  if (!state) return;
  if (!state.roundInProgress) return;

  state.roundInProgress = false;

  if (state.timerInterval) {
    clearInterval(state.timerInterval);
    state.timerInterval = null;
  }

  io.to(`room:${code}`).emit('charades:round_over', {
    word: state.currentWord,
    scores: state.players.map(p => ({
      userId: p.userId,
      displayName: p.displayName,
      points: p.points,
    })),
  });

  setTimeout(() => {
    startNewRound(io, code);
  }, 5000);
}

async function endCharadesGame(io: Server, code: string) {
  const state = activeGames.get(code);
  if (!state) return;

  activeGames.delete(code);

  if (state.timerInterval) clearInterval(state.timerInterval);

  const finalScores = state.players.map(p => ({
    userId: p.userId,
    displayName: p.displayName,
    points: p.points,
  }));

  io.to(`room:${code}`).emit('charades:game_over', { scores: finalScores });

  try {
    const duration = Math.floor((Date.now() - state.startedAt) / 1000);
    const sortedScores = [...finalScores].sort((a, b) => b.points - a.points);
    await Game.create({
      roomId: state.roomId,
      gameType: 'charades',
      players: state.players.map(p => ({ userId: p.userId, displayName: p.displayName })),
      winner: sortedScores[0]?.userId || null,
      scores: finalScores,
      duration,
      finishedAt: new Date(),
    });
  } catch (error) {
    console.error('Failed to save charades game:', error);
  }

  try {
    await Room.findOneAndUpdate({ code }, { status: 'finished' });
  } catch { /* ignore */ }
}

// Called by lobbyHandler when a player joins a charades game already in progress
export function addPlayerToCharadesGame(io: Server, socket: AuthenticatedSocket, code: string) {
  const state = activeGames.get(code);
  if (!state) return;

  const alreadyIn = state.players.some(p => p.socketId === socket.id);
  if (alreadyIn) return;

  const newPlayer: CharadesPlayer = {
    socketId: socket.id,
    userId: socket.isGuest ? null : socket.userId || null,
    displayName: socket.displayName || 'Unknown',
    points: 0,
    hasGuessedCorrectly: false,
    drawCount: 0,
  };

  state.players.push(newPlayer);

  // Send current game state to the joining player
  const currentDrawer = state.players[state.currentDrawerIndex];
  socket.emit('charades:current_state', {
    drawerSocketId: currentDrawer.socketId,
    drawerName: currentDrawer.displayName,
    timeLeft: state.timeLeft,
    scores: state.players.map(p => ({ displayName: p.displayName, points: p.points })),
  });

  io.to(`room:${code}`).emit('charades:player_joined', {
    displayName: newPlayer.displayName,
    scores: state.players.map(p => ({ displayName: p.displayName, points: p.points })),
  });
}
