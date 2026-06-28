import { Router, Request, Response, NextFunction } from 'express';
import { requireAuth } from '../middleware/auth';
import { getAllSeats, holdSeat, releaseSeatHold } from '../services/seatService';

const router = Router();

router.get('/', requireAuth, async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const seats = await getAllSeats();
    res.json({ seats });
  } catch (err) {
    next(err);
  }
});

router.post('/:seatId/hold', requireAuth, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { seat, bookingId } = await holdSeat(req.params.seatId, req.user!.userId);
    res.status(200).json({ seat, bookingId });
  } catch (err) {
    next(err);
  }
});

router.delete('/:seatId/hold', requireAuth, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    await releaseSeatHold(req.params.seatId, req.user!.userId);
    res.json({ message: 'Hold released' });
  } catch (err) {
    next(err);
  }
});

export default router;
