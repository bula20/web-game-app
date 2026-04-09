import { Router, Request, Response } from 'express';
import { Room } from '../models/Room.js';
import { authMiddleware } from '../middleware/auth.js';

const router = Router();

// Get public rooms by game type
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

// Get room by code
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
