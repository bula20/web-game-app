import { Request, Response, NextFunction, RequestHandler } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { User, IUser } from '../models/User.js';

export interface AuthRequest extends Request {
  user?: IUser;
  userId?: string;
  isGuest?: boolean;
  guestName?: string;
}

export interface JwtPayload {
  userId: string;
  isGuest: boolean;
  guestName?: string;
  username?: string;
}

export function generateToken(payload: JwtPayload): string {
  return jwt.sign(payload, env.JWT_SECRET, { expiresIn: env.JWT_EXPIRES_IN } as jwt.SignOptions);
}

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

    if (!decoded.isGuest) {
      const user = await User.findById(decoded.userId);
      if (!user) {
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
    // ignore invalid token
  }
  next();
};
