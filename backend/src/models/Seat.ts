import mongoose, { Document, Schema, Types } from 'mongoose';

export type SeatStatus = 'available' | 'held' | 'reserved';

export interface ISeat extends Document {
  number: number;
  status: SeatStatus;
  heldBy: Types.ObjectId | null;
  heldUntil: Date | null;
  reservedBy: Types.ObjectId | null;
  updatedAt: Date;
}

const seatSchema = new Schema<ISeat>(
  {
    number: {
      type: Number,
      required: true,
      unique: true,
      min: 1,
      max: 3,
    },
    status: {
      type: String,
      enum: ['available', 'held', 'reserved'],
      default: 'available',
      required: true,
    },
    heldBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    heldUntil: {
      type: Date,
      default: null,
    },
    reservedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
  },
  { timestamps: true },
);

// Index to efficiently find and expire held seats
seatSchema.index({ status: 1, heldUntil: 1 });

export const Seat = mongoose.model<ISeat>('Seat', seatSchema);
