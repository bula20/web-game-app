import { Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { JwtPayload } from './auth.js';

export interface AuthenticatedSocket extends Socket {
  userId?: string;
  isGuest?: boolean;
  guestName?: string;
  displayName?: string;
}

export function socketAuthMiddleware(socket: AuthenticatedSocket, next: (err?: Error) => void) {
  const token = socket.handshake.auth?.token;

  if (!token) {
    return next(new Error('Authentication required'));
  }

  try {
    const decoded = jwt.verify(token, env.JWT_SECRET) as JwtPayload;
    socket.userId = decoded.userId;
    socket.isGuest = decoded.isGuest;
    socket.guestName = decoded.guestName;
    socket.displayName = decoded.guestName || decoded.username || decoded.userId;
    next();
  } catch {
    next(new Error('Invalid token'));
  }
}
