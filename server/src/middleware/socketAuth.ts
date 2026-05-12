// Middleware uwierzytelniający dla Socket.io. Token JWT przekazywany jest w
// handshake (auth.token), nie w cookie ani nagłówkach. Po weryfikacji wzbogacamy
// instancję Socket o pola userId/isGuest/displayName, dzięki czemu pozostałe
// handlery mają od razu dane bez dodatkowego query.
import { Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { JwtPayload } from './auth.js';

// Interface rozszerzający Socket - używany w typach handlerów do dostępu do
// danych zalogowanego użytkownika. avatarPreset doklejany później w sockets/index.ts.
export interface AuthenticatedSocket extends Socket {
  userId?: string;
  isGuest?: boolean;
  guestName?: string;
  displayName?: string;
  avatarPreset?: string;
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
    // displayName preferuje guestName/username z payloadu, żeby uniknąć fetcha do bazy.
    // Fallback na userId istnieje na wszelki wypadek (stary token bez username).
    socket.displayName = decoded.guestName || decoded.username || decoded.userId;
    next();
  } catch {
    next(new Error('Invalid token'));
  }
}
