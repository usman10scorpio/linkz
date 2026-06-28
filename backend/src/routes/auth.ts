import { Router, Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { User } from '../models/User';
import { requireAuth } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';
import { logger } from '../config/logger';

const router = Router();

const SESSION_DURATION_DAYS = 90;
const SESSION_DURATION_MS = SESSION_DURATION_DAYS * 24 * 60 * 60 * 1000;

const registerSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Password must contain an uppercase letter')
    .regex(/[0-9]/, 'Password must contain a number'),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

function issueToken(userId: string, email: string): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET not configured');

  return jwt.sign({ userId, email }, secret, {
    expiresIn: `${SESSION_DURATION_DAYS}d`,
  });
}

function setAuthCookie(res: Response, token: string): void {
  res.cookie('token', token, {
    httpOnly: true,               // Prevents XSS access to the token
    secure: process.env.NODE_ENV === 'production', // HTTPS only in production
    sameSite: 'lax',              // CSRF protection
    maxAge: SESSION_DURATION_MS,
    path: '/',
  });
}

router.post('/register', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { email, password } = registerSchema.parse(req.body);

    const existing = await User.findOne({ email });
    if (existing) {
      throw new AppError(409, 'An account with this email already exists');
    }

    // Cost factor 12 is a reasonable balance between security and latency (~300ms on modern hardware)
    const passwordHash = await bcrypt.hash(password, 12);
    const user = await User.create({ email, passwordHash });

    const token = issueToken(user._id.toString(), user.email);
    setAuthCookie(res, token);

    logger.info('User registered', { userId: user._id });
    res.status(201).json({ user: { id: user._id, email: user.email } });
  } catch (err) {
    next(err);
  }
});

router.post('/login', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { email, password } = loginSchema.parse(req.body);

    const user = await User.findOne({ email });
    if (!user) {
      // Deliberately vague to prevent user enumeration
      throw new AppError(401, 'Invalid email or password');
    }

    const valid = await user.comparePassword(password);
    if (!valid) {
      throw new AppError(401, 'Invalid email or password');
    }

    const token = issueToken(user._id.toString(), user.email);
    setAuthCookie(res, token);

    logger.info('User logged in', { userId: user._id });
    res.json({ user: { id: user._id, email: user.email } });
  } catch (err) {
    next(err);
  }
});

router.post('/logout', (_req: Request, res: Response): void => {
  res.clearCookie('token', { path: '/' });
  res.json({ message: 'Logged out successfully' });
});

router.get('/me', requireAuth, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const user = await User.findById(req.user!.userId).select('-passwordHash');
    if (!user) {
      res.status(401).json({ error: 'User not found' });
      return;
    }
    res.json({ user: { id: user._id, email: user.email } });
  } catch (err) {
    next(err);
  }
});

export default router;
