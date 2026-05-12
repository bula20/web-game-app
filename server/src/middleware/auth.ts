// Middleware autoryzacji HTTP - generowanie i weryfikacja tokenow JWT.
// Tokeny przechodza w naglowku Authorization: Bearer <token>.
// Payload zawiera userId, flage isGuest oraz opcjonalny username/guestName uzywany przy wyswietlaniu nazwy.
import { Request, Response, NextFunction, RequestHandler } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { User, IUser } from '../models/User.js';

// Rozszerzenie Request o pola wstrzykiwane przez middleware - dzieki temu handlery
// API maja typowany dostep do danych zalogowanego uzytkownika.
export interface AuthRequest extends Request {
  user?: IUser;
  userId?: string;
  isGuest?: boolean;
  guestName?: string;
}

// Struktura zapisana w tokenie. Pole username pozwala uniknac dodatkowego query do bazy
// przy wyswietlaniu nazwy zalogowanego uzytkownika (np. w socketach).
export interface JwtPayload {
  userId: string;
  isGuest: boolean;
  guestName?: string;
  username?: string;
}

export function generateToken(payload: JwtPayload): string {
  return jwt.sign(payload, env.JWT_SECRET, { expiresIn: env.JWT_EXPIRES_IN } as jwt.SignOptions);
}

// Middleware wymagajace zalogowania - bez poprawnego tokenu zwraca 401.
export const authMiddleware: RequestHandler = async (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'No token provided' });
    return;
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, env.JWT_SECRET) as JwtPayload;
    (req as AuthRequest).userId = decoded.userId;
    (req as AuthRequest).isGuest = decoded.isGuest;
    (req as AuthRequest).guestName = decoded.guestName;

    // Tylko dla niegoscia pobieramy pelny rekord z bazy - goscie nie maja wpisu w User collection.
    if (!decoded.isGuest) {
      const user = await User.findById(decoded.userId);
      if (!user) {
        // Token wazny ale user usuniety - traktujemy jak brak autoryzacji.
        res.status(401).json({ error: 'User not found' });
        return;
      }
      (req as AuthRequest).user = user;
    }

    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
};

// Wariant middleware ktory nie wymaga tokenu - jesli jest poprawny, dolaczamy dane
// uzytkownika; jesli nie, idziemy dalej anonimowo. Uzywane np. dla endpointow ktore
// inaczej zachowuja sie dla zalogowanych vs niezalogowanych.
export const optionalAuth: RequestHandler = (req: Request, _res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return next();
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, env.JWT_SECRET) as JwtPayload;
    (req as AuthRequest).userId = decoded.userId;
    (req as AuthRequest).isGuest = decoded.isGuest;
    (req as AuthRequest).guestName = decoded.guestName;
  } catch {
    // Niepoprawny token traktujemy jak jego brak - po prostu nie ustawiamy danych usera.
  }
  next();
};
