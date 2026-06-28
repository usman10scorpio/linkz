import { Types } from 'mongoose';
import { Seat, ISeat } from '../models/Seat';
import { Booking } from '../models/Booking';
import { AppError } from '../middleware/errorHandler';
import { logger } from '../config/logger';

const HOLD_DURATION_MS = 2 * 60 * 1000; // 2 minutes

/**
 * Release any holds that have expired. This is called lazily on every GET /seats
 * request, which is a pragmatic trade-off: it avoids needing a background scheduler
 * while still ensuring stale holds are cleared promptly in a low-traffic app.
 *
 * In a high-traffic production system, this would be handled by a dedicated
 * scheduler (e.g. a cron job or a MongoDB TTL index triggering a change stream).
 */
async function releaseExpiredHolds(): Promise<void> {
  const now = new Date();

  // Find expired holds first so we know exactly which seat IDs to expire bookings for.
  // Querying after the update would be ambiguous — available seats could be seats that
  // were always free, not necessarily ones we just released.
  const expiredSeats = await Seat.find(
    { status: 'held', heldUntil: { $lt: now } },
    { _id: 1 },
  ).lean();

  if (expiredSeats.length === 0) return;

  const expiredSeatIds = expiredSeats.map((s) => s._id);

  await Seat.updateMany(
    { _id: { $in: expiredSeatIds } },
    { $set: { status: 'available', heldBy: null, heldUntil: null } },
  );

  await Booking.updateMany(
    { seatId: { $in: expiredSeatIds }, status: 'pending' },
    { $set: { status: 'expired' } },
  );

  logger.info(`Released ${expiredSeats.length} expired seat hold(s)`);
}

export async function getAllSeats(): Promise<ISeat[]> {
  await releaseExpiredHolds();
  return Seat.find().sort({ number: 1 }).lean<ISeat[]>();
}

/**
 * Atomically attempt to hold a seat for the given user.
 *
 * The key to concurrency safety here is the atomic `findOneAndUpdate` with a
 * filter condition: `{ _id: seatId, status: 'available' }`. MongoDB guarantees
 * that only one caller can win this race — any concurrent request will find the
 * document no longer matches the filter and receive null back.
 *
 * This is effectively optimistic concurrency without explicit locking. We don't
 * use multi-document transactions here because this is a single-document update,
 * and MongoDB document-level atomicity is sufficient.
 */
export async function holdSeat(
  seatId: string,
  userId: string,
): Promise<{ seat: ISeat; bookingId: string }> {
  await releaseExpiredHolds();

  if (!Types.ObjectId.isValid(seatId)) {
    throw new AppError(400, 'Invalid seat ID');
  }

  // If the user already holds this exact seat, return their existing pending booking
  // so the frontend can send them straight back to checkout without creating a duplicate.
  const sameHold = await Seat.findOne({ _id: seatId, heldBy: new Types.ObjectId(userId), status: 'held' });
  if (sameHold) {
    const existingBooking = await Booking.findOne({
      seatId: new Types.ObjectId(seatId),
      userId: new Types.ObjectId(userId),
      status: 'pending',
    });
    if (existingBooking) {
      logger.info('Returning existing hold', { seatId, userId, bookingId: existingBooking._id });
      return { seat: sameHold as unknown as ISeat, bookingId: existingBooking._id.toString() };
    }
  }

  // If the user holds a different seat, release it first so they can switch freely.
  const otherHold = await Seat.findOne({ heldBy: new Types.ObjectId(userId), status: 'held' });
  if (otherHold) {
    await Seat.findByIdAndUpdate(otherHold._id, {
      $set: { status: 'available', heldBy: null, heldUntil: null },
    });
    await Booking.updateMany(
      { seatId: otherHold._id, userId: new Types.ObjectId(userId), status: 'pending' },
      { $set: { status: 'expired' } },
    );
    logger.info('Auto-released previous hold to allow seat switch', {
      releasedSeat: otherHold._id,
      userId,
    });
  }

  const heldUntil = new Date(Date.now() + HOLD_DURATION_MS);

  const seat = await Seat.findOneAndUpdate(
    { _id: seatId, status: 'available' },
    {
      $set: {
        status: 'held',
        heldBy: new Types.ObjectId(userId),
        heldUntil,
      },
    },
    { new: true },
  );

  if (!seat) {
    // Either the seat doesn't exist, or it was grabbed by another user first
    const seatExists = await Seat.findById(seatId);
    if (!seatExists) throw new AppError(404, 'Seat not found');
    throw new AppError(409, 'This seat was just taken. Please choose another.');
  }

  // Create the booking record upfront so the checkout page has something to reference
  const { v4: uuidv4 } = await import('uuid');
  const booking = await Booking.create({
    seatId: seat._id,
    userId: new Types.ObjectId(userId),
    status: 'pending',
    idempotencyKey: uuidv4(),
    amount: 5000,
  });

  logger.info('Seat held', { seatId, userId, bookingId: booking._id, heldUntil });
  return { seat, bookingId: booking._id.toString() };
}

export async function releaseSeatHold(seatId: string, userId: string): Promise<void> {
  if (!Types.ObjectId.isValid(seatId)) {
    throw new AppError(400, 'Invalid seat ID');
  }

  const seat = await Seat.findOneAndUpdate(
    { _id: seatId, heldBy: new Types.ObjectId(userId), status: 'held' },
    { $set: { status: 'available', heldBy: null, heldUntil: null } },
  );

  if (!seat) {
    throw new AppError(404, 'No active hold found for this seat');
  }

  // Mark any pending bookings for this seat as expired
  await Booking.updateMany(
    { seatId: new Types.ObjectId(seatId), userId: new Types.ObjectId(userId), status: 'pending' },
    { $set: { status: 'expired' } },
  );

  logger.info('Seat hold released', { seatId, userId });
}
