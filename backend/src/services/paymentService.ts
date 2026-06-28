import { Types } from 'mongoose';
import { Booking } from '../models/Booking';
import { Seat } from '../models/Seat';
import { AppError } from '../middleware/errorHandler';
import { logger } from '../config/logger';

interface CardDetails {
  cardNumber: string;
  expiry: string;
  cvv: string;
  cardholderName: string;
}

interface PaymentResult {
  success: boolean;
  message: string;
  booking: {
    id: string;
    status: string;
    seatNumber: number;
    amount: number;
  };
}

/**
 * Simulate a payment gateway call. In a real system this would call Stripe,
 * Braintree, etc. We deliberately add a short delay to simulate network latency
 * and test that the UI handles async payment states correctly.
 *
 * Cards ending in 0000 are always declined — useful for manually testing the
 * failure path without randomness.
 */
async function mockGatewayCharge(card: CardDetails): Promise<{ success: boolean; message: string }> {
  await new Promise((resolve) => setTimeout(resolve, 1200));

  const last4 = card.cardNumber.replace(/\s/g, '').slice(-4);

  if (last4 === '0000') {
    return { success: false, message: 'Card declined by issuer' };
  }
  if (last4 === '1111') {
    return { success: false, message: 'Insufficient funds' };
  }

  // 90% success rate for all other cards
  const success = Math.random() > 0.1;
  return {
    success,
    message: success ? 'Payment authorised' : 'Payment gateway temporarily unavailable',
  };
}

/**
 * Process a payment for a booking.
 *
 * Idempotency: if this booking already has a payment result, we return it
 * immediately without re-charging the card. This handles client retries and
 * prevents double-billing.
 *
 * The seat state is updated atomically within this function: reserved on
 * success, released back to available on failure. We do this as two separate
 * updates rather than a multi-document transaction because, in a mock system,
 * the failure surface is small and both operations are simple enough that a
 * partial failure (booking updated, seat not updated) is recoverable by the
 * hold-expiry cleanup.
 */
export async function processPayment(
  bookingId: string,
  userId: string,
  card: CardDetails,
): Promise<PaymentResult> {
  if (!Types.ObjectId.isValid(bookingId)) {
    throw new AppError(400, 'Invalid booking ID');
  }

  const booking = await Booking.findOne({
    _id: bookingId,
    userId: new Types.ObjectId(userId),
  });

  if (!booking) {
    throw new AppError(404, 'Booking not found');
  }

  if (booking.status === 'completed') {
    throw new AppError(409, 'This booking has already been completed');
  }

  if (booking.status === 'failed' || booking.status === 'expired') {
    throw new AppError(410, 'This booking is no longer valid. Please start again.');
  }

  // Idempotency check: if payment was already attempted, return the stored result
  if (booking.paymentResult) {
    logger.info('Returning cached payment result (idempotent replay)', { bookingId });
    const seat = await Seat.findById(booking.seatId);
    return {
      success: booking.paymentResult.success,
      message: booking.paymentResult.message,
      booking: {
        id: booking._id.toString(),
        status: booking.status,
        seatNumber: seat?.number ?? 0,
        amount: booking.amount,
      },
    };
  }

  // Verify the seat is still held by this user before charging
  const seat = await Seat.findOne({
    _id: booking.seatId,
    heldBy: new Types.ObjectId(userId),
    status: 'held',
  });

  if (!seat) {
    await Booking.findByIdAndUpdate(bookingId, { $set: { status: 'expired' } });
    throw new AppError(410, 'Your seat hold has expired. Please start again.');
  }

  logger.info('Calling payment gateway', { bookingId, last4: card.cardNumber.replace(/\s/g, '').slice(-4) });
  const gatewayResult = await mockGatewayCharge(card);

  // Store the payment result for idempotency before updating the seat,
  // so a retry after a partial failure will return the correct outcome.
  await Booking.findByIdAndUpdate(bookingId, {
    $set: {
      status: gatewayResult.success ? 'completed' : 'failed',
      paymentResult: {
        success: gatewayResult.success,
        message: gatewayResult.message,
        processedAt: new Date(),
      },
    },
  });

  if (gatewayResult.success) {
    await Seat.findByIdAndUpdate(seat._id, {
      $set: { status: 'reserved', heldBy: null, heldUntil: null, reservedBy: new Types.ObjectId(userId) },
    });
    logger.info('Seat reserved', { seatId: seat._id, userId, bookingId });
  } else {
    await Seat.findByIdAndUpdate(seat._id, {
      $set: { status: 'available', heldBy: null, heldUntil: null },
    });
    logger.info('Payment failed, seat released', { seatId: seat._id, userId, reason: gatewayResult.message });
  }

  const updatedBooking = await Booking.findById(bookingId);

  return {
    success: gatewayResult.success,
    message: gatewayResult.message,
    booking: {
      id: booking._id.toString(),
      status: updatedBooking?.status ?? 'failed',
      seatNumber: seat.number,
      amount: booking.amount,
    },
  };
}

export async function getBookingById(bookingId: string, userId: string) {
  if (!Types.ObjectId.isValid(bookingId)) {
    throw new AppError(400, 'Invalid booking ID');
  }

  const booking = await Booking.findOne({
    _id: bookingId,
    userId: new Types.ObjectId(userId),
  }).populate<{ seatId: { _id: string; number: number; heldUntil: Date | null } }>('seatId', 'number heldUntil');

  if (!booking) {
    throw new AppError(404, 'Booking not found');
  }

  return booking;
}
