// Router historii gier - paginowana lista partii zalogowanego usera oraz pobranie
// pojedynczej partii po id (do replaya/podglądu).
import { Router, Request, Response } from 'express';
import { Game } from '../models/Game.js';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';

const router = Router();

// GET /history?page=N&limit=M [auth] - paginowana lista partii usera (max 50/strona).
// Goście dostają puste wyniki, bo ich partie nie są zapisywane do bazy.
router.get('/history', authMiddleware, async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthRequest;
    if (authReq.isGuest) {
      res.json({ games: [], total: 0, page: 1, pages: 0 });
      return;
    }

    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 50);

    const games = await Game.find({ 'players.userId': authReq.userId })
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit);

    const total = await Game.countDocuments({ 'players.userId': authReq.userId });

    res.json({ games, total, page, pages: Math.ceil(total / limit) });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /:id [auth] - szczegóły jednej partii (board moves dla szachów/warcabów,
// scores dla kalamburów). Brak własnościowej walidacji - można obejrzeć cudzą
// grę znając id, co jest świadome (gry są publiczne między uczestnikami).
router.get('/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    const game = await Game.findById(req.params.id);
    if (!game) {
      res.status(404).json({ error: 'Game not found' });
      return;
    }
    res.json(game);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
