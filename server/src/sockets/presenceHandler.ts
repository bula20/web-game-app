// Obsługa rozłączeń i powrotów graczy. To centralne miejsce, w którym zarządzamy
// "gracjami" - czyli okresami ochronnymi po zerwaniu połączenia, w których gracz
// może wrócić i kontynuować, zanim system uzna, że odpadł na stałe.
// Trzy oddzielne grace periods (czasy ochrony):
//   GAME_DISCONNECT_GRACE  (20 s) - gracz rozłączył się w trakcie trwającej partii;
//                                   po tym czasie game handler decyduje co zrobić
//                                   (np. walkower lub adjust w kalamburach).
//   LOBBY_NON_HOST_GRACE   (20 s) - non-host w pokoju waiting/host_away;
//                                   po czasie usuwany z players[] i z pokoju.
//   HOST_AWAY_TTL         (120 s) - host w pokoju waiting/host_away ma najdłuższy
//                                   czas, bo to on tworzył pokój; po czasie host
//                                   jest promowany na kogoś innego (lub pokój ginie).
import { Server } from 'socket.io';
import { AuthenticatedSocket } from '../middleware/socketAuth.js';
import { Room, GameType } from '../models/Room.js';
import { User } from '../models/User.js';
import { guestActiveRooms } from './guestState.js';

export const GAME_DISCONNECT_GRACE = 20; // sekundy
export const LOBBY_NON_HOST_GRACE = 20; // sekundy
export const HOST_AWAY_TTL = 120; // sekundy

// Game handler (chess/checkers/charades) rejestruje swoje callbacki tu - presenceHandler
// nie wie nic o szczegółach gry, tylko deleguje "user X stracił połączenie w grze Y"
// do odpowiedniego handlera, który wie jak to obsłużyć (np. ogłosić walkower).
type GameDisconnectHandler = (io: Server, code: string, userId: string) => void | Promise<void>;
type GameReconnectHandler = (io: Server, socket: AuthenticatedSocket, code: string) => void | Promise<void>;

const disconnectHandlers = new Map<GameType, GameDisconnectHandler>();
const reconnectHandlers = new Map<GameType, GameReconnectHandler>();

export function registerGameDisconnectHandler(gameType: GameType, handler: GameDisconnectHandler) {
  disconnectHandlers.set(gameType, handler);
}

export function registerGameReconnectHandler(gameType: GameType, handler: GameReconnectHandler) {
  reconnectHandlers.set(gameType, handler);
}

// Trzy mapy timeoutów - po jednej dla każdego rodzaju grace period. Klucze różnią
// się celowo: dla per-gracza używamy "userId:code", bo w jednym pokoju może być
// kilku rozłączonych. Dla hosta wystarczy sam "code", bo host jest tylko jeden.
const pendingTimeouts = new Map<string, ReturnType<typeof setTimeout>>();
const hostAwayTimeouts = new Map<string, ReturnType<typeof setTimeout>>();
const lobbyTimeouts = new Map<string, ReturnType<typeof setTimeout>>();

function timeoutKey(userId: string, code: string) {
  return `${userId}:${code}`;
}

// Anulowanie timeoutu - wywoływane przy reconnect lub przy świadomym wyjściu z pokoju
// (np. host:leave_room). Bez tego po powrocie gracza nadal zegar tykałby do walkowera.
export function cancelGameDisconnectTimeout(userId: string, code: string) {
  const key = timeoutKey(userId, code);
  const t = pendingTimeouts.get(key);
  if (t) {
    clearTimeout(t);
    pendingTimeouts.delete(key);
  }
}

export function cancelLobbyDisconnectTimeout(userId: string, code: string) {
  const key = timeoutKey(userId, code);
  const t = lobbyTimeouts.get(key);
  if (t) {
    clearTimeout(t);
    lobbyTimeouts.delete(key);
  }
}

export function cancelHostAwayTimeout(code: string) {
  const t = hostAwayTimeouts.get(code);
  if (t) {
    clearTimeout(t);
    hostAwayTimeouts.delete(code);
  }
}

export function getHostAwayTimeoutMap() {
  return hostAwayTimeouts;
}

// Promocja kolejnego gracza na hosta po wygaśnięciu HOST_AWAY_TTL.
// Wybieramy gracza z indeksu 0 listy players (czyli pierwszy w kolejności wejścia
// po hoście). UWAGA: goście nie mogą zostać hostem, ponieważ Room.host trzyma
// ObjectId Usera - gość nie ma persystencji w kolekcji User. Jeśli na liście są
// tylko goście, room po prostu zostanie skasowany w innym miejscu.
async function promoteNextHost(io: Server, code: string) {
  try {
    const room = await Room.findOne({ code });
    if (!room) return;

    // Pokój pusty (wszyscy wyszli w czasie host_away) - kasujemy.
    if (room.players.length === 0) {
      await Room.deleteOne({ _id: room._id });
      io.to(`room:${code}`).emit('room:closed', { reason: 'host_left' });
      io.to(`lobby:${room.gameType}`).emit('lobby:room_removed', { roomId: room._id });
      return;
    }

    room.host = room.players[0].userId;
    room.status = 'waiting';
    room.hostDisconnectedAt = null;
    // Nowy host nie powinien już figurować na liście "rozłączonych"
    // (mógłby nim być, gdyby sam był rozłączony i wszedł jako pierwszy).
    room.disconnectedPlayers = room.disconnectedPlayers.filter(
      (d) => d.userId?.toString() !== room.players[0].userId?.toString(),
    ) as any;
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

// Usunięcie gracza non-host z pokoju waiting/host_away po wygaśnięciu LOBBY_NON_HOST_GRACE.
// Po usunięciu czyścimy też activeRoomCode usera, żeby auto-redirect (SocketContext)
// nie próbował wciąż wracać do nieistniejącego dla niego pokoju.
async function removePlayerFromLobby(io: Server, code: string, userId: string) {
  try {
    const room = await Room.findOne({ code });
    if (!room) return;
    if (room.status !== 'waiting' && room.status !== 'host_away') return;

    const isGuest = userId.startsWith('guest_');

    const before = room.players.length;
    if (isGuest) {
      room.players = room.players.filter((p) => p.guestId !== userId) as any;
      room.disconnectedPlayers = room.disconnectedPlayers.filter((d) => d.guestId !== userId) as any;
    } else {
      room.players = room.players.filter((p) => p.userId?.toString() !== userId) as any;
      room.disconnectedPlayers = room.disconnectedPlayers.filter((d) => d.userId?.toString() !== userId) as any;
    }
    if (before === room.players.length) return;

    if (isGuest) guestActiveRooms.delete(userId);
    else await User.findByIdAndUpdate(userId, { activeRoomCode: null }).catch(() => {});

    if (room.players.length === 0) {
      await Room.deleteOne({ _id: room._id });
      io.to(`room:${code}`).emit('room:closed', { reason: 'host_left' });
      io.to(`lobby:${room.gameType}`).emit('lobby:room_removed', { roomId: room._id });
      return;
    }

    await room.save();
    io.to(`room:${code}`).emit('room:player_left', { userId });
    io.to(`room:${code}`).emit('player:reconnect_expired', { userId });
    io.to(`lobby:${room.gameType}`).emit('lobby:room_updated', room);
  } catch (error) {
    console.error('removePlayerFromLobby error:', error);
  }
}

// Zapisuje informacje o rozłączonym graczu w pokoju (Room.disconnectedPlayers),
// żeby strona pokoju/gry mogła pokazać banner z countdownem nawet po odświeżeniu
// (DisconnectBanner odbiera również stan z bazy, nie tylko event live).
async function markPlayerDisconnected(code: string, userId: string, displayName: string, expiresIn: number) {
  try {
    const room = await Room.findOne({ code });
    if (!room) return;
    const isGuest = userId.startsWith('guest_');
    // Jeśli istnieje już wpis dla tego usera, zastępujemy (resetuje countdown).
    room.disconnectedPlayers = room.disconnectedPlayers.filter(
      (d) => isGuest ? d.guestId !== userId : d.userId?.toString() !== userId,
    ) as any;
    (room.disconnectedPlayers as any).push({
      userId: isGuest ? null : userId,
      guestId: isGuest ? userId : null,
      displayName,
      disconnectedAt: new Date(),
      expiresIn,
    });
    await room.save();
  } catch { /* ignorujemy: błąd zapisu nie powinien blokować innych graczy */ }
}

// Usuwa wpis "rozłączonego" gracza po jego powrocie albo po wygaśnięciu grace period.
async function clearPlayerDisconnected(code: string, userId: string) {
  try {
    const isGuest = userId.startsWith('guest_');
    await Room.findOneAndUpdate(
      { code },
      { $pull: { disconnectedPlayers: isGuest ? { guestId: userId } : { userId } } },
    );
  } catch { /* ignorujemy: brak pokoju lub problem sieciowy */ }
}

// Główny setup wywoływany dla każdego nowego socketa. Najpierw próbuje obsłużyć
// reconnect (gdyby user już był w jakimś pokoju), a potem rejestruje listener
// na rozłączenie, który wybierze odpowiednią ścieżkę grace period.
export function setupPresenceHandler(io: Server, socket: AuthenticatedSocket) {
  const userId = socket.userId;
  if (!userId) return;

  // Przy każdym połączeniu sprawdzamy, czy user był w jakimś pokoju i był rozłączony.
  // Jeśli tak: anuluj timeouty, zaktualizuj socketId, przywróć status host_away->waiting.
  handleReconnect(io, socket).catch((err) => console.error('handleReconnect error:', err));

  socket.on('disconnect', async () => {
    try {
      // Szukamy aktywnych pokojów, w których ten user/guest figuruje na liście players.
      const query = socket.isGuest
        ? { 'players.guestId': userId, status: { $in: ['waiting', 'host_away', 'in_progress'] } }
        : { 'players.userId': userId, status: { $in: ['waiting', 'host_away', 'in_progress'] } };
      const rooms = await Room.find(query);

      const matchPlayer = (p: { userId?: any; guestId?: string | null }) =>
        socket.isGuest ? p.guestId === userId : p.userId?.toString() === userId;

      for (const room of rooms) {
        const player = room.players.find(matchPlayer);
        if (!player) continue;
        // Race-protection: jeśli user połączył się z innego socketa od czasu tego
        // rozłączenia, jego player.socketId został już nadpisany - nie ruszamy go.
        if (player.socketId !== socket.id) continue;

        const isHost = room.players[0] ? matchPlayer(room.players[0]) : false;

        if (room.status === 'waiting' || room.status === 'host_away') {
          if (isHost) {
            // Ścieżka HOST_AWAY (120 s). Status pokoju zmienia się na host_away;
            // klient pokaże banner z countdownem, a tu ustawiamy timeout, który
            // zrobi promoteNextHost, gdyby host nie wrócił.
            room.status = 'host_away';
            room.hostDisconnectedAt = new Date();
            await room.save();

            io.to(`room:${room.code}`).emit('room:host_away', { expiresIn: HOST_AWAY_TTL });
            io.to(`lobby:${room.gameType}`).emit('lobby:room_updated', room);

            const code = room.code;
            cancelHostAwayTimeout(code);
            hostAwayTimeouts.set(
              code,
              setTimeout(() => {
                promoteNextHost(io, code);
                hostAwayTimeouts.delete(code);
              }, HOST_AWAY_TTL * 1000),
            );
          } else {
            // Ścieżka non-host w lobby (20 s). Po czasie usuwamy gracza z pokoju.
            const code = room.code;
            await markPlayerDisconnected(code, userId, player.displayName, LOBBY_NON_HOST_GRACE);
            io.to(`room:${code}`).emit('player:disconnected', {
              userId,
              displayName: player.displayName,
              expiresIn: LOBBY_NON_HOST_GRACE,
            });

            const key = timeoutKey(userId, code);
            cancelLobbyDisconnectTimeout(userId, code);
            lobbyTimeouts.set(
              key,
              setTimeout(() => {
                lobbyTimeouts.delete(key);
                removePlayerFromLobby(io, code, userId);
              }, LOBBY_NON_HOST_GRACE * 1000),
            );
          }
        } else if (room.status === 'in_progress') {
          // Ścieżka in-game (20 s). Po czasie deleguje do game handlera (np. chess
          // ogłosi walkower) - presenceHandler nie zna szczegółów konkretnej gry.
          const code = room.code;
          await markPlayerDisconnected(code, userId, player.displayName, GAME_DISCONNECT_GRACE);
          io.to(`room:${code}`).emit('player:disconnected', {
            userId,
            displayName: player.displayName,
            expiresIn: GAME_DISCONNECT_GRACE,
          });

          const key = timeoutKey(userId, code);
          cancelGameDisconnectTimeout(userId, code);
          pendingTimeouts.set(
            key,
            setTimeout(async () => {
              pendingTimeouts.delete(key);
              const handler = disconnectHandlers.get(room.gameType);
              if (handler) {
                try {
                  await handler(io, code, userId);
                } catch (err) {
                  console.error(`Game disconnect handler error (${room.gameType}):`, err);
                }
              }
              await clearPlayerDisconnected(code, userId);
              io.to(`room:${code}`).emit('player:reconnect_expired', { userId });
            }, GAME_DISCONNECT_GRACE * 1000),
          );
        }
      }
    } catch (error) {
      console.error('presenceHandler disconnect error:', error);
    }
  });
}

// Obsługuje powrót gracza po rozłączeniu. Dla każdego pokoju, w którym user
// figuruje, anuluje aktywne timeouty, zaktualizuje socketId, przywraca host_away
// na waiting (jeśli to oryginalny host) i deleguje reconnect do game handlera.
async function handleReconnect(io: Server, socket: AuthenticatedSocket) {
  const userId = socket.userId;
  if (!userId) return;

  const query = socket.isGuest
    ? { 'players.guestId': userId, status: { $in: ['waiting', 'host_away', 'in_progress'] } }
    : { 'players.userId': userId, status: { $in: ['waiting', 'host_away', 'in_progress'] } };
  const rooms = await Room.find(query);

  const matchPlayer = (p: { userId?: any; guestId?: string | null }) =>
    socket.isGuest ? p.guestId === userId : p.userId?.toString() === userId;
  const matchDisconnected = (d: { userId?: any; guestId?: string | null }) =>
    socket.isGuest ? d.guestId === userId : d.userId?.toString() === userId;

  for (const room of rooms) {
    const code = room.code;
    const player = room.players.find(matchPlayer);
    if (!player) continue;

    // Nowy socketId zastępuje stary - od tej pory eventy lecą do nowego połączenia.
    player.socketId = socket.id;

    cancelGameDisconnectTimeout(userId, code);
    cancelLobbyDisconnectTimeout(userId, code);

    // Czy ten user jest oryginalnym hostem? Goście nigdy nie są (room.host=null dla nich).
    const isOriginalHost = !socket.isGuest && room.host?.toString() === userId;
    const wasInDisconnected = room.disconnectedPlayers.some(matchDisconnected);

    if (room.status === 'host_away' && isOriginalHost) {
      // Powrót hosta: anuluj timeout promocji, wróć do waiting, host musi być na indeksie 0.
      cancelHostAwayTimeout(code);
      room.status = 'waiting';
      room.hostDisconnectedAt = null;
      const hostIdx = room.players.findIndex(matchPlayer);
      if (hostIdx > 0) {
        const [h] = room.players.splice(hostIdx, 1);
        room.players.unshift(h);
      }
    }

    if (wasInDisconnected) {
      room.disconnectedPlayers = room.disconnectedPlayers.filter(
        (d) => !matchDisconnected(d),
      ) as any;
    }

    await room.save();

    socket.join(`room:${code}`);

    io.to(`room:${code}`).emit('player:reconnected', {
      userId,
      displayName: player.displayName,
    });

    if (room.status === 'host_away' && isOriginalHost) {
      // Inni gracze zobaczą "Host wrócił" - sami nie wysyłamy do hosta, on i tak
      // rerenderuje pokój przy normalnym joinie.
      socket.to(`room:${code}`).emit('room:host_returned', { hostName: socket.displayName });
    }
    io.to(`lobby:${room.gameType}`).emit('lobby:room_updated', room);

    // Per-gra reconnect: chessHandler/checkersHandler aktualizuje socketId w in-memory
    // mapie aktywnych gier i wysyła aktualny stan rozgrywki do gracza, który wrócił.
    if (room.status === 'in_progress') {
      const handler = reconnectHandlers.get(room.gameType);
      if (handler) {
        try {
          await handler(io, socket, code);
        } catch (err) {
          console.error(`Game reconnect handler error (${room.gameType}):`, err);
        }
      }
    }
  }
}
