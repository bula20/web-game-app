// Handler czatu - obsługuje dwa rodzaje wiadomości:
//   - chat:room_message - czat w pokoju (każdy w pokoju widzi),
//   - chat:direct_message - DM między dwoma zalogowanymi userami (goście DM nie mogą).
// Wiadomości DM zapisujemy do bazy (kolekcja Message), żeby historia DM przeżyła
// odświeżenie. Wiadomości pokojowe - tylko ulotnie do historii MongoDB
// (nie są ładowane przy odświeżeniu pokoju).
import { Server } from 'socket.io';
import { AuthenticatedSocket } from '../middleware/socketAuth.js';
import { Message } from '../models/Message.js';
import { onlineUsers } from './index.js';

export function setupChatHandler(io: Server, socket: AuthenticatedSocket) {
  // Wiadomość w czacie pokoju. Limit 1000 znaków, pusta wiadomość ignorowana.
  socket.on('chat:room_message', async ({ code, text }: { code: string; text: string }) => {
    if (!text?.trim()) return;

    const message = {
      from: socket.displayName,
      fromId: socket.userId,
      text: text.trim().slice(0, 1000),
      timestamp: new Date().toISOString(),
    };

    // Rozsyłamy do wszystkich pozostałych w pokoju (sender już ma swoją wiadomość lokalnie).
    socket.to(`room:${code}`).emit('chat:room_message', message);

    // Zapis do bazy tylko dla zalogowanych - goście nie mają persystencji.
    if (!socket.isGuest && socket.userId) {
      try {
        await Message.create({
          type: 'room',
          roomId: code,
          from: socket.userId,
          content: text.trim().slice(0, 1000),
        });
      } catch {
        // non-critical, don't fail the message delivery
      }
    }
  });

  // DM do innego zalogowanego usera. Goście nie mogą wysyłać DM (brak listy znajomych).
  // Jeśli adresat jest aktualnie online (figuruje w onlineUsers Map), wiadomość trafia
  // do niego natychmiast; w każdym razie zapisujemy do bazy do historii.
  socket.on('chat:direct_message', async ({ toUserId, text }: { toUserId: string; text: string }) => {
    if (!text?.trim() || socket.isGuest) return;

    const targetSocketId = onlineUsers.get(toUserId);
    const message = {
      from: socket.displayName,
      fromId: socket.userId,
      text: text.trim().slice(0, 1000),
      timestamp: new Date().toISOString(),
    };

    if (targetSocketId) {
      io.to(targetSocketId).emit('chat:direct_message', message);
    }

    // Save to DB
    if (socket.userId) {
      try {
        await Message.create({
          type: 'direct',
          from: socket.userId,
          to: toUserId,
          content: text.trim().slice(0, 1000),
        });
      } catch {
        // non-critical
      }
    }
  });

  // Historia konwersacji DM między mną a withUserId. Zwracamy 50 najnowszych
  // (od końca w stronę początku, potem reverse - chronologicznie rosnąco).
  // Używamy callbacka, bo socket.io socket.on z drugim argumentem to ack pattern.
  socket.on('chat:get_history', async ({ withUserId }: { withUserId: string }, callback: (messages: any[]) => void) => {
    if (socket.isGuest || !socket.userId) {
      callback([]);
      return;
    }

    try {
      const messages = await Message.find({
        type: 'direct',
        $or: [
          { from: socket.userId, to: withUserId },
          { from: withUserId, to: socket.userId },
        ],
      })
        .sort({ createdAt: -1 })
        .limit(50)
        .lean();

      callback(messages.reverse());
    } catch {
      callback([]);
    }
  });
}
