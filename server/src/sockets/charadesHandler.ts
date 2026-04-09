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
}

interface CharadesGameState {
  players: CharadesPlayer[];
  currentDrawerIndex: number;
  currentWord: string;
  round: number;
  totalRounds: number;
  timeLeft: number;
  timerInterval: ReturnType<typeof setInterval> | null;
  startedAt: number;
  lang: string;
  usedWords: Set<string>;
}

const activeGames = new Map<string, CharadesGameState>();

function getRandomWord(lang: string, usedWords: Set<string>): string {
  const langWords = wordBank[lang] || wordBank['en'];
  const allWords = Object.values(langWords).flat();
  const available = allWords.filter(w => !usedWords.has(w));
  if (available.length === 0) {
    // Reset if all words used
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

    room.status = 'in_progress';
    await room.save();

    const players: CharadesPlayer[] = room.players.map(p => ({
      socketId: p.socketId,
      userId: p.userId?.toString() || null,
      displayName: p.displayName,
      points: 0,
      hasGuessedCorrectly: false,
    }));

    const state: CharadesGameState = {
      players,
      currentDrawerIndex: 0,
      currentWord: '',
      round: 0,
      totalRounds: players.length * 2, // each player draws twice
      timeLeft: 0,
      timerInterval: null,
      startedAt: Date.now(),
      lang: 'pl', // default to Polish
      usedWords: new Set(),
    };

    activeGames.set(code, state);

    io.to(`room:${code}`).emit('charades:start', {
      players: players.map(p => ({ displayName: p.displayName, points: 0 })),
      roundCount: state.totalRounds,
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
    if (playerIndex === state.currentDrawerIndex) return; // drawer can't guess
    if (state.players[playerIndex].hasGuessedCorrectly) return; // already guessed

    const isCorrect = text.trim().toLowerCase() === state.currentWord.toLowerCase();

    if (isCorrect) {
      state.players[playerIndex].hasGuessedCorrectly = true;
      // Points: more time left = more points
      const points = Math.max(10, Math.floor(state.timeLeft * 1.5));
      state.players[playerIndex].points += points;
      // Drawer also gets points
      state.players[state.currentDrawerIndex].points += Math.floor(points / 2);

      io.to(`room:${code}`).emit('charades:guess_result', {
        player: state.players[playerIndex].displayName,
        text: '***',
        correct: true,
      });

      // Check if all guessers have guessed
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
      });
    }
  });

  socket.on('disconnect', () => {
    for (const [code, state] of activeGames) {
      const playerIndex = state.players.findIndex(p => p.socketId === socket.id);
      if (playerIndex !== -1) {
        state.players.splice(playerIndex, 1);
        if (state.players.length < 2) {
          endCharadesGame(io, code);
        } else if (playerIndex === state.currentDrawerIndex) {
          // Current drawer left, skip to next round
          state.currentDrawerIndex = state.currentDrawerIndex % state.players.length;
          endRound(io, code);
        }
      }
    }
  });
}

function startNewRound(io: Server, code: string) {
  const state = activeGames.get(code);
  if (!state) return;

  state.round++;
  if (state.round > state.totalRounds) {
    endCharadesGame(io, code);
    return;
  }

  // Reset guesses
  state.players.forEach(p => { p.hasGuessedCorrectly = false; });

  // Pick word
  const word = getRandomWord(state.lang, state.usedWords);
  state.usedWords.add(word);
  state.currentWord = word;
  state.timeLeft = 60;

  const drawer = state.players[state.currentDrawerIndex];

  // Notify all players about new round
  io.to(`room:${code}`).emit('charades:new_round', {
    drawer: drawer.socketId,
    drawerName: drawer.displayName,
    timeLeft: 60,
  });

  // Send word only to the drawer
  io.to(drawer.socketId).emit('charades:word', { word, category: '' });

  // Start timer
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

  // Next drawer
  state.currentDrawerIndex = (state.currentDrawerIndex + 1) % state.players.length;

  // Start next round after a delay
  setTimeout(() => {
    startNewRound(io, code);
  }, 5000);
}

async function endCharadesGame(io: Server, code: string) {
  const state = activeGames.get(code);
  if (!state) return;

  if (state.timerInterval) clearInterval(state.timerInterval);

  const finalScores = state.players.map(p => ({
    userId: p.userId,
    displayName: p.displayName,
    points: p.points,
  }));

  io.to(`room:${code}`).emit('charades:game_over', { scores: finalScores });

  // Save to DB
  try {
    const duration = Math.floor((Date.now() - state.startedAt) / 1000);
    const sortedScores = [...finalScores].sort((a, b) => b.points - a.points);
    await Game.create({
      roomId: code,
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

  activeGames.delete(code);
}
