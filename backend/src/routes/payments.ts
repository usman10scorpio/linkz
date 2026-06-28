import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth';
import { processPayment, getBookingById } from '../services/paymentService';

const router = Router();

const processPaymentSchema = z.object({
  bookingId: z.string().min(1, 'Booking ID is required'),
  card: z.object({
    cardNumber: z
      .string()
      .min(1)
      .transform((val) => val.replace(/\s/g, ''))
      .refine((val) => /^\d{16}$/.test(val), 'Card number must be 16 digits'),
    expiry: z
      .string()
      .regex(/^(0[1-9]|1[0-2])\/\d{2}$/, 'Expiry must be in MM/YY format'),
    cvv: z.string().regex(/^\d{3,4}$/, 'CVV must be 3 or 4 digits'),
    cardholderName: z.string().min(2, 'Cardholder name is required').max(100),
  }),
});

router.post('/process', requireAuth, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { bookingId, card } = processPaymentSchema.parse(req.body);
    const result = await processPayment(bookingId, req.user!.userId, card);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.get('/booking/:bookingId', requireAuth, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const booking = await getBookingById(req.params.bookingId, req.user!.userId);
    res.json({ booking });
  } catch (err) {
    next(err);
  }
});

export default router;
