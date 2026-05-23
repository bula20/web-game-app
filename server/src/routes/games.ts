import { Router, Request, Response } from "express";
import { Game } from "../models/Game.js";
import { authMiddleware, AuthRequest } from "../middleware/auth.js";

const router = Router();

router.get("/history", authMiddleware, async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthRequest;
    if (authReq.isGuest) {
      res.json({ games: [], total: 0, page: 1, pages: 0 });
      return;
    }

    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 50);

    const games = await Game.find({ "players.userId": authReq.userId })
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit);

    const total = await Game.countDocuments({
      "players.userId": authReq.userId,
    });

    res.json({ games, total, page, pages: Math.ceil(total / limit) });
  } catch (error) {
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/:id", authMiddleware, async (req: Request, res: Response) => {
  try {
    const game = await Game.findById(req.params.id);
    if (!game) {
      res.status(404).json({ error: "Game not found" });
      return;
    }
    res.json(game);
  } catch (error) {
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
