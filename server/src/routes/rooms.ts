// Router pokojów - tylko odczyt. Tworzenie/dołączanie/opuszczanie odbywa się
// przez Socket.io (lobbyHandler), bo wymaga real-time'owej propagacji do innych
// graczy. Tu mamy tylko REST do listingu i pobrania szczegółów po kodzie.
import { Router, Request, Response } from 'express';
import { Room } from '../models/Room.js';
import { authMiddleware } from '../middleware/auth.js';

const router = Router();

// GET /?gameType=chess [auth] - lista publicznych pokojów ze statusem waiting,
// max 50 wyników, najnowsze najpierw. Używana przez Lobby przy fallback initial load.
router.get('/', authMiddleware, async (req: Request, res: Response) => {
  try {
    const gameType = req.query.gameType as string;
    const query: any = { status: 'waiting', isPublic: true };
    if (gameType) query.gameType = gameType;

    const rooms = await Room.find(query)
      .sort({ createdAt: -1 })
      .limit(50);

    res.json(rooms);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /:code [auth] - szczegóły pokoju po 6-znakowym kodzie. Używane głównie
// przez RoomPage przy entry, zanim jeszcze socket dosłał świeży stan.
router.get('/:code', authMiddleware, async (req: Request, res: Response) => {
  try {
    const room = await Room.findOne({ code: req.params.code });
    if (!room) {
      res.status(404).json({ error: 'Room not found' });
      return;
    }
    res.json(room);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
