import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import passport from 'passport';
import { z } from 'zod';
import { User } from '../models/User.js';
import { generateToken, authMiddleware, AuthRequest } from '../middleware/auth.js';
import { env } from '../config/env.js';
import { guestActiveRooms } from '../sockets/guestState.js';

const router = Router();

const registerSchema = z.object({
  username: z.string().min(3).max(30).regex(/^[a-zA-Z0-9_]+$/, 'Username can only contain letters, numbers, and underscores'),
  email: z.string().email(),
  password: z.string().min(6).max(100),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

// Register
router.post('/register', async (req: Request, res: Response) => {
  try {
    const data = registerSchema.parse(req.body);

    const existingUser = await User.findOne({
      $or: [{ email: data.email }, { username: data.username }],
    });

    if (existingUser) {
      const field = existingUser.email === data.email ? 'email' : 'username';
      res.status(400).json({ error: `User with this ${field} already exists` });
      return;
    }

    const passwordHash = await bcrypt.hash(data.password, 12);
    const user = await User.create({
      username: data.username,
      email: data.email,
      passwordHash,
      isGuest: false,
    });

    const token = generateToken({ userId: user._id.toString(), isGuest: false, username: user.username });
    res.status(201).json({
      token,
      user: { id: user._id, username: user.username, email: user.email, isGuest: false, avatarPreset: user.avatarPreset ?? 'color:1', lastUsernameChange: user.lastUsernameChange ?? null },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: error.errors[0].message });
      return;
    }
    console.error('Register error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Login
router.post('/login', async (req: Request, res: Response) => {
  try {
    const data = loginSchema.parse(req.body);
    const user = await User.findOne({ email: data.email });

    if (!user || !user.passwordHash) {
      res.status(401).json({ error: 'Invalid email or password' });
      return;
    }

    const isMatch = await bcrypt.compare(data.password, user.passwordHash);
    if (!isMatch) {
      res.status(401).json({ error: 'Invalid email or password' });
      return;
    }

    const token = generateToken({ userId: user._id.toString(), isGuest: false, username: user.username });
    res.json({
      token,
      user: { id: user._id, username: user.username, email: user.email, isGuest: false, avatarPreset: user.avatarPreset ?? 'color:1', lastUsernameChange: user.lastUsernameChange ?? null },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: error.errors[0].message });
      return;
    }
    console.error('Login error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Guest login
router.post('/guest', (req: Request, res: Response) => {
  const guestName = `Guest_${Date.now().toString(36)}`;
  const guestId = `guest_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const token = generateToken({ userId: guestId, isGuest: true, guestName });
  res.json({ token, user: { id: guestId, username: guestName, isGuest: true } });
});

// Get current user
router.get('/me', authMiddleware, (req: Request, res: Response) => {
  const authReq = req as AuthRequest;
  if (authReq.isGuest) {
    const activeRoomCode = authReq.userId
      ? guestActiveRooms.get(authReq.userId)?.code ?? null
      : null;
    res.json({
      id: authReq.userId,
      username: authReq.guestName,
      isGuest: true,
      activeRoomCode,
    });
    return;
  }
  if (authReq.user) {
    res.json({
      id: authReq.user._id,
      username: authReq.user.username,
      email: authReq.user.email,
      isGuest: false,
      activeRoomCode: authReq.user.activeRoomCode ?? null,
      avatarPreset: authReq.user.avatarPreset ?? 'color:1',
      lastUsernameChange: authReq.user.lastUsernameChange ?? null,
    });
  }
});

// Google OAuth
router.get('/google', passport.authenticate('google', { scope: ['profile', 'email'], session: false }));

router.get('/google/callback',
  passport.authenticate('google', { session: false, failureRedirect: `${env.CLIENT_URL}/login?error=google_auth_failed` }),
  (req: Request, res: Response) => {
    const user = req.user as any;
    const token = generateToken({ userId: user._id.toString(), isGuest: false, username: user.username });
    res.redirect(`${env.CLIENT_URL}/auth/callback?token=${token}`);
  }
);

export default router;
