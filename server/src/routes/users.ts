import { Router, Request, Response } from "express";
import bcrypt from "bcryptjs";
import { User } from "../models/User.js";
import { Room } from "../models/Room.js";
import { authMiddleware, AuthRequest } from "../middleware/auth.js";
import { guestActiveRooms } from "../sockets/guestState.js";

const router = Router();

router.get(
  "/me/active-room",
  authMiddleware,
  async (req: Request, res: Response) => {
    try {
      const authReq = req as AuthRequest;
      let roomCode: string | null = null;

      if (authReq.isGuest && authReq.userId) {
        roomCode = guestActiveRooms.get(authReq.userId)?.code ?? null;
      } else {
        const user = await User.findById(authReq.userId).select(
          "activeRoomCode",
        );
        roomCode = user?.activeRoomCode ?? null;
      }

      if (!roomCode) {
        res.json(null);
        return;
      }

      const room = await Room.findOne({ code: roomCode });
      if (!room) {
        if (authReq.isGuest && authReq.userId)
          guestActiveRooms.delete(authReq.userId);
        else
          await User.findByIdAndUpdate(authReq.userId, {
            activeRoomCode: null,
          });
        res.json(null);
        return;
      }
      res.json({
        code: room.code,
        gameType: room.gameType,
        status: room.status,
        players: room.players.map((p) => ({
          displayName: p.displayName,
          userId: p.userId,
        })),
        maxPlayers: room.maxPlayers,
      });
    } catch (error) {
      console.error("Active room fetch error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

router.put(
  "/me/avatar",
  authMiddleware,
  async (req: Request, res: Response) => {
    try {
      const authReq = req as AuthRequest;
      if (authReq.isGuest) {
        res.status(403).json({ error: "Guests cannot change avatar" });
        return;
      }

      const { preset } = req.body as { preset: string };
      const validColor = /^color:[1-8]$/.test(preset);
      const validImg = /^img:[a-zA-Z0-9_\-]+\.(png|jpg|jpeg|webp)$/.test(
        preset,
      );
      if (!validColor && !validImg) {
        res.status(400).json({ error: "Invalid preset" });
        return;
      }

      const user = await User.findByIdAndUpdate(
        authReq.userId,
        { avatarPreset: preset },
        { new: true, select: "avatarPreset" },
      );
      res.json({ avatarPreset: user?.avatarPreset });
    } catch (error) {
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

router.put(
  "/me/password",
  authMiddleware,
  async (req: Request, res: Response) => {
    try {
      const authReq = req as AuthRequest;
      if (authReq.isGuest) {
        res.status(403).json({ error: "Guests cannot change password" });
        return;
      }

      const { currentPassword, newPassword } = req.body as {
        currentPassword: string;
        newPassword: string;
      };
      if (!currentPassword || !newPassword || newPassword.length < 6) {
        res.status(400).json({ error: "Invalid password data" });
        return;
      }

      const user = await User.findById(authReq.userId).select("+passwordHash");
      if (!user || !user.passwordHash) {
        res
          .status(400)
          .json({ error: "Password change not available for this account" });
        return;
      }

      const isMatch = await bcrypt.compare(currentPassword, user.passwordHash);
      if (!isMatch) {
        res.status(401).json({ error: "Current password is incorrect" });
        return;
      }

      user.passwordHash = await bcrypt.hash(newPassword, 12);
      await user.save();
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

router.put("/me/username", authMiddleware, async (req: Request, res: Response) => {
    try {
      const authReq = req as AuthRequest;
      if (authReq.isGuest) {
        res.status(403).json({ error: "Guests cannot change username" });
        return;
      }

      const { username } = req.body as { username: string };
      if (!username || username.length < 3 || username.length > 30 || !/^[a-zA-Z0-9_]+$/.test(username)) {
        res.status(400).json({
            error:"Nieprawidłowa nazwa użytkownika (3-30 znaków, litery/cyfry/podkreślnik)"});
        return;
      }

      const user = await User.findById(authReq.userId).select("username lastUsernameChange");
      if (!user) {
        res.status(404).json({ error: "User not found" });
        return;
      }

      const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
      if (user.lastUsernameChange) {
        const elapsed = Date.now() - user.lastUsernameChange.getTime();
        if (elapsed < WEEK_MS) {
          res.status(429).json({ error: "Zbyt wcześnie", retryAfter: WEEK_MS - elapsed });
          return;
        }
      }

      const taken = await User.findOne({
        username,
        _id: { $ne: authReq.userId },
      });
      if (taken) {
        res.status(400).json({ error: "Ta nazwa użytkownika jest już zajęta" });
        return;
      }

      user.username = username;
      user.lastUsernameChange = new Date();
      await user.save();

      res.json({
        username: user.username,
        lastUsernameChange: user.lastUsernameChange,
      });
    } catch (error) {
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

router.get("/search", authMiddleware, async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthRequest;
    const query = req.query.q as string;
    if (!query || query.length < 2) {
      res
        .status(400)
        .json({ error: "Search query must be at least 2 characters" });
      return;
    }

    const users = await User.find({
      username: { $regex: query, $options: "i" },
      _id: { $ne: authReq.userId },
      isGuest: false,
    })
      .select("username")
      .limit(10);

    res.json(users);
  } catch (error) {
    console.error("Search error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/:id", authMiddleware, async (req: Request, res: Response) => {
  try {
    const user = await User.findById(req.params.id).select(
      "username createdAt",
    );
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    res.json(user);
  } catch (error) {
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
