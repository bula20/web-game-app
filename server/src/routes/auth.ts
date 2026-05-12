// Router uwierzytelniania - rejestracja, logowanie, gość, GET /me oraz Google OAuth.
// Endpointy publiczne oprócz GET /me, ktore wymaga waznego JWT.

import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import passport from 'passport';
import { z } from 'zod';
import { User } from '../models/User.js';
import { generateToken, authMiddleware, AuthRequest } from '../middleware/auth.js';
import { env } from '../config/env.js';
import { guestActiveRooms } from '../sockets/guestState.js';

const router = Router();

// Schemat walidacji rejestracji - login alfanumeryczny + podkreslnik, e-mail, haslo min. 6 znakow.
const registerSchema = z.object({
  username: z.string().min(3).max(30).regex(/^[a-zA-Z0-9_]+$/, 'Username can only contain letters, numbers, and underscores'),
  email: z.string().email(),
  password: z.string().min(6).max(100),
});

// Schemat walidacji logowania - tylko poprawny e-mail i niepuste haslo.
const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

// POST /register [public] - tworzy nowe konto uzytkownika i zwraca token JWT.
router.post('/register', async (req: Request, res: Response) => {
  try {
    // Walidacja Zod - rzuca ZodError przechwytywany ponizej i zwracany jako 400.
    const data = registerSchema.parse(req.body);

    // Sprawdzenie unikalnosci - nie mozemy miec dwoch kont z tym samym e-mailem lub loginem.
    const existingUser = await User.findOne({
      $or: [{ email: data.email }, { username: data.username }],
    });

    if (existingUser) {
      const field = existingUser.email === data.email ? 'email' : 'username';
      res.status(400).json({ error: `User with this ${field} already exists` });
      return;
    }

    // Haslo hashowane bcryptem (12 rund) - nigdy nie zapisujemy plain textu.
    const passwordHash = await bcrypt.hash(data.password, 12);
    const user = await User.create({
      username: data.username,
      email: data.email,
      passwordHash,
      isGuest: false,
    });

    // Wygenerowanie JWT - klient zapisuje token i wysyla go w naglowku Authorization.
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

// POST /login [public] - logowanie e-mail/haslo, zwraca JWT i podstawowe dane uzytkownika.
router.post('/login', async (req: Request, res: Response) => {
  try {
    const data = loginSchema.parse(req.body);
    const user = await User.findOne({ email: data.email });

    // Brak passwordHash oznacza konto OAuth (np. Google) - logowanie haslem niedozwolone.
    if (!user || !user.passwordHash) {
      res.status(401).json({ error: 'Invalid email or password' });
      return;
    }

    // bcrypt.compare odporne na timing attack - weryfikuje haslo wzgledem zapisanego hasha.
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

// POST /guest [public] - tworzy tymczasowe konto goscia bez zapisu w bazie danych.
// Identyfikator i nazwa generowane na podstawie timestampu, JWT oznaczony flaga isGuest.
router.post('/guest', (req: Request, res: Response) => {
  const guestName = `Guest_${Date.now().toString(36)}`;
  const guestId = `guest_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const token = generateToken({ userId: guestId, isGuest: true, guestName });
  res.json({ token, user: { id: guestId, username: guestName, isGuest: true } });
});

// GET /me [auth] - zwraca dane aktualnie zalogowanego uzytkownika lub goscia.
router.get('/me', authMiddleware, (req: Request, res: Response) => {
  const authReq = req as AuthRequest;
  // Goscie nie maja rekordu w bazie - dane czytamy z payloadu JWT i pamieci sesji guestActiveRooms.
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

// GET /google [public] - inicjuje proces logowania przez Google OAuth (przekierowanie do Google).
router.get('/google', passport.authenticate('google', { scope: ['profile', 'email'], session: false }));

// GET /google/callback [public] - callback Google'a; po sukcesie generuje JWT i wraca do klienta.
// Token przekazywany w query stringu - klient na stronie /auth/callback zapisze go i zaloguje uzytkownika.
router.get('/google/callback',
  passport.authenticate('google', { session: false, failureRedirect: `${env.CLIENT_URL}/login?error=google_auth_failed` }),
  (req: Request, res: Response) => {
    const user = req.user as any;
    const token = generateToken({ userId: user._id.toString(), isGuest: false, username: user.username });
    res.redirect(`${env.CLIENT_URL}/auth/callback?token=${token}`);
  }
);

export default router;
