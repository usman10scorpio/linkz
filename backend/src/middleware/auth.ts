import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { User } from '../models/User';
import { logger } from '../config/logger';

interface JwtPayload {
  userId: string;
  email: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: {
        userId: string;
        email: string;
      };
    }
  }
}

export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const token = req.cookies?.token;

  if (!token) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  try {
    const secret = process.env.JWT_SECRET;
    if (!secret) throw new Error('JWT_SECRET not configured');

    const payload = jwt.verify(token, secret) as JwtPayload;

    // Lightweight check that user still exists — important for long-lived 90-day tokens
    const user = await User.findById(payload.userId).select('_id email').lean();
    if (!user) {
      res.clearCookie('token');
      res.status(401).json({ error: 'User no longer exists' });
      return;
    }

    req.user = { userId: payload.userId, email: payload.email };
    next();
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      res.status(401).json({ error: 'Session expired, please log in again' });
      return;
    }
    if (err instanceof jwt.JsonWebTokenError) {
      res.status(401).json({ error: 'Invalid session token' });
      return;
    }
    logger.error('Auth middleware error', { error: err });
    res.status(500).json({ error: 'Authentication check failed' });
  }
}
