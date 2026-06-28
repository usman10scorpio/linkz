import mongoose, { Document, Schema, Types } from 'mongoose';

export type BookingStatus = 'pending' | 'completed' | 'failed' | 'expired';

export interface IBooking extends Document {
  seatId: Types.ObjectId;
  userId: Types.ObjectId;
  status: BookingStatus;
  idempotencyKey: string;
  amount: number;
  paymentResult: {
    success: boolean;
    message: string;
    processedAt: Date;
  } | null;
  createdAt: Date;
  updatedAt: Date;
}

const bookingSchema = new Schema<IBooking>(
  {
    seatId: {
      type: Schema.Types.ObjectId,
      ref: 'Seat',
      required: true,
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    status: {
      type: String,
      enum: ['pending', 'completed', 'failed', 'expired'],
      default: 'pending',
      required: true,
    },
    // Prevents duplicate charges if the client retries the same payment request
    idempotencyKey: {
      type: String,
      required: true,
      unique: true,
    },
    amount: {
      type: Number,
      required: true,
      default: 5000, // $50.00 in cents
    },
    paymentResult: {
      type: {
        success: Boolean,
        message: String,
        processedAt: Date,
      },
      default: null,
    },
  },
  { timestamps: true },
);

bookingSchema.index({ userId: 1, createdAt: -1 });
bookingSchema.index({ seatId: 1, status: 1 });

export const Booking = mongoose.model<IBooking>('Booking', bookingSchema);
