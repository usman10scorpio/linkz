import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';

import { connectDB } from './config/db';
import { logger } from './config/logger';
import { errorHandler } from './middleware/errorHandler';

import authRoutes from './routes/auth';
import seatRoutes from './routes/seats';
import paymentRoutes from './routes/payments';

const app = express();
const PORT = process.env.PORT || 4000;
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || 'http://localhost:5173';

// Security headers
app.use(helmet());

// CORS: only allow the frontend origin and always include credentials
app.use(
  cors({
    origin: CLIENT_ORIGIN,
    credentials: true,
  }),
);

// Rate limiting — intentionally generous for a local dev environment.
// In production, auth endpoints should have much tighter limits.
const authLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  message: { error: 'Too many requests, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
});

const generalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
});

app.use(cookieParser());
app.use(express.json());
app.use(morgan('dev'));
app.use(generalLimiter);

app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/seats', seatRoutes);
app.use('/api/payments', paymentRoutes);

app.get('/healthz', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use(errorHandler);

async function bootstrap() {
  try {
    await connectDB();
    app.listen(PORT, () => {
      logger.info(`Server running on http://localhost:${PORT}`);
      logger.info(`Accepting requests from ${CLIENT_ORIGIN}`);
    });
  } catch (err) {
    logger.error('Failed to start server', { error: err });
    process.exit(1);
  }
}

bootstrap();
