import express from 'express';
import cors from 'cors';
import passport from 'passport';
import { env } from './config/env.js';
import { configurePassport } from './config/passport.js';
import authRoutes from './routes/auth.js';
import userRoutes from './routes/users.js';
import friendRoutes from './routes/friends.js';
import roomRoutes from './routes/rooms.js';
import gameRoutes from './routes/games.js';

const app = express();

// Middleware
app.use(cors({ origin: env.CLIENT_URL, credentials: true }));
app.use(express.json());
app.use(passport.initialize());

// Configure passport strategies
configurePassport();

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/friends', friendRoutes);
app.use('/api/rooms', roomRoutes);
app.use('/api/games', gameRoutes);

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

export default app;
