// Handler eventów Socket.io dla kalamburów. Najbardziej złożona z trzech gier:
// rundy z rotującym drawerem, broadcast kresek na canvas live, system zgadywania
// z tolerancją na literówki (Levenshtein). Słowa pobierane z words.json (PL+EN
// pogrupowane po kategoriach). Stan wszystkich aktywnych pokojów w activeGames.
import { Server } from "socket.io";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { AuthenticatedSocket } from "../middleware/socketAuth.js";
import { Room } from "../models/Room.js";
import { Game, pruneOldGames } from "../models/Game.js";
import { User } from "../models/User.js";
import {
  registerGameDisconnectHandler,
  registerGameReconnectHandler,
} from "./presenceHandler.js";
import { guestActiveRooms } from "./guestState.js";

// Wczytujemy bank słów raz, przy starcie modułu. Struktura JSON-a:
// { en: { kategoria1: [...], kategoria2: [...] }, pl: {...} }.
// Awaria odczytu nie wywala serwera - kalambury po prostu nie wystartują.
let wordBank: Record<string, Record<string, string[]>> = { en: {}, pl: {} };
try {
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const data = readFileSync(
    join(__dirname, "..", "data", "words.json"),
    "utf-8",
  );
  wordBank = JSON.parse(data);
} catch (error) {
  console.error("Failed to load words.json:", error);
}

interface CharadesPlayer {
  socketId: string;
  userId: string | null;
  displayName: string;
  points: number;
  hasGuessedCorrectly: boolean;
  drawCount: number;
}

interface CharadesGameState {
  players: CharadesPlayer[];
  // Indeks aktualnego rysującego w players[].
  currentDrawerIndex: number;
  // Indeks następnego drawera (zwykle currentDrawerIndex+1, ale może się przesuwać
  // po removePlayer, żeby utrzymać sprawiedliwą rotację).
  nextDrawerSlot: number;
  currentWord: string;
  // totalCycles = round * players, currentCycle rośnie po każdej rundzie.
  totalCycles: number;
  currentCycle: number;
  drawingTime: number;
  timeLeft: number;
  timerInterval: ReturnType<typeof setInterval> | null;
  startedAt: number;
  lang: string;
  // Słowa już wybrane w tej grze - unikamy powtórzeń, dopóki bank ma świeże.
  usedWords: Set<string>;
  roomId: unknown;
  roundInProgress: boolean;
  // Pauza zegara podczas gdy drawer się rozłączył (czeka na powrót do GAME_DISCONNECT_GRACE).
  paused: boolean;
}

const activeGames = new Map<string, CharadesGameState>();

// Klasyczna odległość edycyjna (algorytm Wagnera-Fischera, programowanie dynamiczne O(m*n)).
// Mówi ile pojedynczych operacji (insercja/delecja/substytucja) trzeba, żeby
// zamienić ciąg a na b. Używana do wykrywania zgadywań "blisko".
function levenshtein(a: string, b: string): number {
  const m = a.length,
    n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) => [
    i,
    ...Array(n).fill(0),
  ]);
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

// Czy zgadywanie jest "blisko" hasła, ale nie identyczne? Tolerujemy 2 znaki
// różnicy ALBO 30% długości słowa (dłuższe słowa - większa tolerancja literówek).
// Dokładne trafienie zwraca false, bo wtedy traktujemy to jako pełną odpowiedź,
// nie sygnał "ciepło".
function isClose(guess: string, word: string): boolean {
  const g = guess.trim().toLowerCase();
  const w = word.toLowerCase();
  if (g === w) return false;
  const dist = levenshtein(g, w);
  return dist <= 2 || dist <= Math.floor(w.length * 0.3);
}

// Losuje słowo z banku w danym języku, pomijając te już wybrane w tej grze.
// Gdy wyczerpiemy pulę - resetujemy usedWords i zaczynamy od nowa.
function getRandomWord(lang: string, usedWords: Set<string>): string {
  const langWords = wordBank[lang] || wordBank["en"];
  const allWords = Object.values(langWords).flat();
  const available = allWords.filter((w) => !usedWords.has(w));
  if (available.length === 0) {
    usedWords.clear();
    return allWords[Math.floor(Math.random() * allWords.length)];
  }
  return available[Math.floor(Math.random() * available.length)];
}

function findPlayer(
  state: CharadesGameState,
  socket: AuthenticatedSocket,
): number {
  const uid = socket.userId;
  if (uid) {
    const idx = state.players.findIndex((p) => p.userId === uid);
    if (idx !== -1) return idx;
  }
  return state.players.findIndex((p) => p.socketId === socket.id);
}

// Zegar rundy - tyka co sekundę, ale zatrzymuje się gdy drawer rozłączony.
// Po dojściu do 0 wymusza koniec rundy (endRound) niezależnie od tego, czy
// ktoś zgadł.
function startTimer(io: Server, code: string) {
  const state = activeGames.get(code);
  if (!state) return;
  if (state.timerInterval) clearInterval(state.timerInterval);
  state.timerInterval = setInterval(() => {
    if (state.paused) return;
    state.timeLeft -= 1;
    io.to(`room:${code}`).emit("charades:timer", {
      timeLeft: Math.max(0, state.timeLeft),
    });
    if (state.timeLeft <= 0) {
      endRound(io, code);
    }
  }, 1000);
}

// Callbacki presence dla kalamburów. Asymetryczne traktowanie:
//   - DRAWER (rysujący) który nie wrócił po grace period - pomijamy rundę
//     (drawer zostaje w grze, dostanie kolejną szansę w następnej rundzie),
//   - GUESSER (zgadujący) który nie wrócił - usuwamy z gry, bo jego nieobecność
//     nie zatrzymuje rundy.
// Drawer-disconnect natychmiastowy: zerujemy paused (żeby zegar mógł wybrać
// timeout naturalnie), drugiej szansy mu już nie damy w tej rundzie.
registerGameDisconnectHandler("charades", (io, code, userId) => {
  const state = activeGames.get(code);
  if (!state) return;
  const idx = state.players.findIndex((p) => p.userId === userId);
  if (idx === -1) return;

  if (idx === state.currentDrawerIndex && state.roundInProgress) {
    state.paused = false;
    io.to(`room:${code}`).emit("charades:drawer_skipped", {
      displayName: state.players[idx].displayName,
    });
    endRound(io, code);
  } else {
    removePlayer(io, code, idx);
  }
});

registerGameReconnectHandler("charades", (io, socket, code) => {
  const state = activeGames.get(code);
  if (!state) return;
  const uid = socket.userId;
  if (!uid) return;
  const idx = state.players.findIndex((p) => p.userId === uid);
  if (idx === -1) return;

  state.players[idx].socketId = socket.id;

  if (idx === state.currentDrawerIndex && state.paused) {
    state.paused = false;
    io.to(`room:${code}`).emit("charades:resumed", {
      drawerName: state.players[idx].displayName,
      timeLeft: state.timeLeft,
    });
  }

  const currentDrawer = state.players[state.currentDrawerIndex];
  socket.emit("charades:current_state", {
    drawerSocketId: currentDrawer.socketId,
    drawerName: currentDrawer.displayName,
    timeLeft: state.timeLeft,
    scores: state.players.map((p) => ({
      displayName: p.displayName,
      points: p.points,
    })),
    cycle: state.currentCycle,
    totalCycles: state.totalCycles,
  });
  // Re-send the word if reconnecting user is the drawer
  if (idx === state.currentDrawerIndex && state.currentWord) {
    socket.emit("charades:word", { word: state.currentWord, category: "" });
  }
});

export function setupCharadesHandler(io: Server, socket: AuthenticatedSocket) {
  socket.on("game:start", async ({ code }: { code: string }) => {
    const room = await Room.findOne({
      code,
      gameType: "charades",
      status: "waiting",
    });
    if (!room || room.players.length < 2) return;
    if (room.players[0].socketId !== socket.id) return;
    if (activeGames.has(code)) return;

    room.status = "in_progress";
    await room.save();

    const players: CharadesPlayer[] = room.players.map((p) => ({
      socketId: p.socketId,
      userId: p.userId?.toString() || p.guestId || null,
      displayName: p.displayName,
      points: 0,
      hasGuessedCorrectly: false,
      drawCount: 0,
    }));

    const state: CharadesGameState = {
      players,
      currentDrawerIndex: 0,
      nextDrawerSlot: 0,
      currentWord: "",
      totalCycles: room.rounds ?? 3,
      currentCycle: 1,
      drawingTime: room.drawingTime ?? 60,
      timeLeft: 0,
      timerInterval: null,
      startedAt: Date.now(),
      lang: "pl",
      usedWords: new Set(),
      roomId: room._id,
      roundInProgress: false,
      paused: false,
    };

    activeGames.set(code, state);

    io.to(`room:${code}`).emit("charades:start", {
      players: players.map((p) => ({ displayName: p.displayName, points: 0 })),
    });

    startNewRound(io, code);
  });

  socket.on("charades:get_state", ({ code }: { code: string }) => {
    const state = activeGames.get(code);
    if (!state) return;
    // Update socketId on state request (also acts as reconnect fallback)
    const idx = findPlayer(state, socket);
    if (idx !== -1) state.players[idx].socketId = socket.id;

    const drawer = state.players[state.currentDrawerIndex];
    socket.emit("charades:state", {
      drawerSocketId: drawer.socketId,
      drawerName: drawer.displayName,
      timeLeft: state.timeLeft,
      scores: state.players.map((p) => ({
        displayName: p.displayName,
        points: p.points,
      })),
      word: idx === state.currentDrawerIndex ? state.currentWord : undefined,
      cycle: state.currentCycle,
      totalCycles: state.totalCycles,
    });
  });

  socket.on(
    "charades:draw",
    ({ code, stroke }: { code: string; stroke: any }) => {
      const state = activeGames.get(code);
      if (!state) return;
      const idx = findPlayer(state, socket);
      if (idx !== state.currentDrawerIndex) return;
      socket.to(`room:${code}`).emit("charades:draw", { stroke });
    },
  );

  socket.on("charades:clear", ({ code }: { code: string }) => {
    const state = activeGames.get(code);
    if (!state) return;
    const idx = findPlayer(state, socket);
    if (idx !== state.currentDrawerIndex) return;
    socket.to(`room:${code}`).emit("charades:cleared");
  });

  socket.on(
    "charades:guess",
    ({ code, text }: { code: string; text: string }) => {
      const state = activeGames.get(code);
      if (!state) return;

      const playerIndex = findPlayer(state, socket);
      if (playerIndex === -1) return;
      if (playerIndex === state.currentDrawerIndex) return;
      if (state.players[playerIndex].hasGuessedCorrectly) return;

      const isCorrect =
        text.trim().toLowerCase() === state.currentWord.toLowerCase();

      if (isCorrect) {
        state.players[playerIndex].hasGuessedCorrectly = true;
        const points = Math.max(10, Math.floor(state.timeLeft * 1.5));
        state.players[playerIndex].points += points;
        state.players[state.currentDrawerIndex].points += Math.floor(
          points / 2,
        );

        io.to(`room:${code}`).emit("charades:guess_result", {
          player: state.players[playerIndex].displayName,
          text: "***",
          correct: true,
        });

        const allGuessed = state.players.every(
          (p, i) => i === state.currentDrawerIndex || p.hasGuessedCorrectly,
        );
        if (allGuessed) {
          endRound(io, code);
        }
      } else {
        io.to(`room:${code}`).emit("charades:guess_result", {
          player: state.players[playerIndex].displayName,
          text,
          correct: false,
          close: isClose(text, state.currentWord),
        });
      }
    },
  );

  socket.on("charades:leave", ({ code }: { code: string }) => {
    const state = activeGames.get(code);
    if (!state) return;
    const idx = findPlayer(state, socket);
    if (idx === -1) return;

    const uid = state.players[idx].userId;
    const isGuestId = !!uid && uid.startsWith("guest_");
    const wasDrawer = idx === state.currentDrawerIndex;
    removePlayer(io, code, idx);

    // Explicit leave clears activeRoomCode
    if (uid) {
      if (isGuestId) guestActiveRooms.delete(uid);
      else
        User.findByIdAndUpdate(uid, { activeRoomCode: null }).catch(() => {});
    }
    Room.findOneAndUpdate(
      { code },
      {
        $pull: {
          players: isGuestId
            ? { guestId: uid }
            : { userId: uid ? (uid as any) : undefined, socketId: socket.id },
        },
      },
    ).catch(() => {});

    socket.leave(`room:${code}`);

    // If drawer left during a round and game still running, skip round
    const stillRunning = activeGames.get(code);
    if (stillRunning && wasDrawer && stillRunning.roundInProgress) {
      endRound(io, code);
    }
  });

  // NOTE: socket.on('disconnect') is handled by presenceHandler.
  // On disconnect, if user is the drawer we pause the round immediately (before the grace expires)
  // so the timer doesn't bleed out. The final outcome (skip/remove) is applied only after grace.
  socket.on("disconnect", () => {
    for (const [code, state] of activeGames) {
      const idx = state.players.findIndex((p) => p.socketId === socket.id);
      if (idx === -1) continue;
      if (idx === state.currentDrawerIndex && state.roundInProgress) {
        state.paused = true;
        io.to(`room:${code}`).emit("charades:paused", {
          drawerName: state.players[idx].displayName,
        });
      }
    }
  });
}

function removePlayer(io: Server, code: string, playerIndex: number) {
  const state = activeGames.get(code);
  if (!state) return;
  const wasDrawer = playerIndex === state.currentDrawerIndex;
  const removed = state.players[playerIndex];
  state.players.splice(playerIndex, 1);

  // Adjust currentDrawerIndex
  if (playerIndex < state.currentDrawerIndex) {
    state.currentDrawerIndex--;
  } else if (playerIndex === state.currentDrawerIndex) {
    state.currentDrawerIndex =
      state.currentDrawerIndex % Math.max(state.players.length, 1);
  }

  if (state.players.length > 0) {
    if (playerIndex < state.nextDrawerSlot) {
      state.nextDrawerSlot--;
    }
    state.nextDrawerSlot = state.nextDrawerSlot % state.players.length;
  }

  if (removed.userId) {
    const isGuestId = removed.userId.startsWith("guest_");
    Room.findOneAndUpdate(
      { code },
      {
        $pull: {
          players: isGuestId
            ? { guestId: removed.userId }
            : { userId: removed.userId as any },
        },
      },
    ).catch(() => {});
    if (isGuestId) guestActiveRooms.delete(removed.userId);
  }

  io.to(`room:${code}`).emit("charades:player_left", {
    displayName: removed.displayName,
    scores: state.players.map((p) => ({
      displayName: p.displayName,
      points: p.points,
    })),
  });

  if (state.players.length < 2) {
    endCharadesGame(io, code);
    return;
  }

  if (wasDrawer && state.roundInProgress) {
    endRound(io, code);
  }
}

function startNewRound(io: Server, code: string) {
  const state = activeGames.get(code);
  if (!state) return;

  const minDraws = Math.min(...state.players.map((p) => p.drawCount));
  if (minDraws >= state.totalCycles) {
    endCharadesGame(io, code);
    return;
  }

  state.currentDrawerIndex = state.nextDrawerSlot;
  state.nextDrawerSlot = (state.nextDrawerSlot + 1) % state.players.length;
  state.players[state.currentDrawerIndex].drawCount++;
  if (state.nextDrawerSlot === 0) {
    state.currentCycle++;
  }
  state.players.forEach((p) => {
    p.hasGuessedCorrectly = false;
  });
  state.roundInProgress = true;
  state.paused = false;

  const word = getRandomWord(state.lang, state.usedWords);
  state.usedWords.add(word);
  state.currentWord = word;
  state.timeLeft = state.drawingTime;

  const drawer = state.players[state.currentDrawerIndex];

  io.to(`room:${code}`).emit("charades:new_round", {
    drawer: drawer.socketId,
    drawerName: drawer.displayName,
    timeLeft: state.drawingTime,
    cycle: state.currentCycle,
    totalCycles: state.totalCycles,
  });

  io.to(drawer.socketId).emit("charades:word", { word, category: "" });

  startTimer(io, code);
}

function endRound(io: Server, code: string) {
  const state = activeGames.get(code);
  if (!state) return;
  if (!state.roundInProgress) return;

  state.roundInProgress = false;
  state.paused = false;

  if (state.timerInterval) {
    clearInterval(state.timerInterval);
    state.timerInterval = null;
  }

  io.to(`room:${code}`).emit("charades:round_over", {
    word: state.currentWord,
    scores: state.players.map((p) => ({
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

  const finalScores = state.players.map((p) => ({
    userId: p.userId,
    displayName: p.displayName,
    points: p.points,
  }));

  io.to(`room:${code}`).emit("charades:game_over", { scores: finalScores });

  try {
    const duration = Math.floor((Date.now() - state.startedAt) / 1000);
    const sortedScores = [...finalScores].sort((a, b) => b.points - a.points);
    await Game.create({
      roomId: state.roomId,
      gameType: "charades",
      players: state.players.map((p) => ({
        userId: p.userId?.startsWith("guest_") ? null : p.userId,
        displayName: p.displayName,
      })),
      winner: sortedScores[0]?.userId?.startsWith("guest_")
        ? null
        : sortedScores[0]?.userId || null,
      scores: finalScores.map((s) => ({
        ...s,
        userId: s.userId?.startsWith("guest_") ? null : s.userId,
      })),
      duration,
      finishedAt: new Date(),
    });
    await pruneOldGames(state.players.map((p) => p.userId));
  } catch (error) {
    console.error("Failed to save charades game:", error);
  }

  try {
    await Room.findOneAndUpdate({ code }, { status: "finished" });
    const ids = state.players.map((p) => p.userId).filter(Boolean) as string[];
    const userIds = ids.filter((id) => !id.startsWith("guest_"));
    if (userIds.length) {
      await User.updateMany(
        { _id: { $in: userIds } },
        { activeRoomCode: null },
      );
    }
    ids
      .filter((id) => id.startsWith("guest_"))
      .forEach((gid) => guestActiveRooms.delete(gid));
  } catch {
    /* ignore */
  }
}

// Called by lobbyHandler when a player joins a charades game already in progress
export function addPlayerToCharadesGame(
  io: Server,
  socket: AuthenticatedSocket,
  code: string,
) {
  const state = activeGames.get(code);
  if (!state) return;

  const uid = socket.userId;
  // If this user is already in state, it's a reconnect — just refresh socketId.
  const existingIdx = uid
    ? state.players.findIndex((p) => p.userId === uid)
    : state.players.findIndex((p) => p.socketId === socket.id);
  if (existingIdx !== -1) {
    state.players[existingIdx].socketId = socket.id;
    const currentDrawer = state.players[state.currentDrawerIndex];
    socket.emit("charades:current_state", {
      drawerSocketId: currentDrawer.socketId,
      drawerName: currentDrawer.displayName,
      timeLeft: state.timeLeft,
      scores: state.players.map((p) => ({
        displayName: p.displayName,
        points: p.points,
      })),
      cycle: state.currentCycle,
      totalCycles: state.totalCycles,
    });
    if (existingIdx === state.currentDrawerIndex && state.currentWord) {
      socket.emit("charades:word", { word: state.currentWord, category: "" });
    }
    return;
  }

  const minDraws = Math.min(...state.players.map((p) => p.drawCount));
  const newPlayer: CharadesPlayer = {
    socketId: socket.id,
    userId: socket.userId || null,
    displayName: socket.displayName || "Unknown",
    points: 0,
    hasGuessedCorrectly: false,
    drawCount: minDraws,
  };

  state.players.push(newPlayer);

  const currentDrawer = state.players[state.currentDrawerIndex];
  socket.emit("charades:current_state", {
    drawerSocketId: currentDrawer.socketId,
    drawerName: currentDrawer.displayName,
    timeLeft: state.timeLeft,
    scores: state.players.map((p) => ({
      displayName: p.displayName,
      points: p.points,
    })),
    cycle: state.currentCycle,
    totalCycles: state.totalCycles,
  });

  io.to(`room:${code}`).emit("charades:player_joined", {
    displayName: newPlayer.displayName,
    scores: state.players.map((p) => ({
      displayName: p.displayName,
      points: p.points,
    })),
  });
}
