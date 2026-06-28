import mongoose, { Document, Schema } from 'mongoose';
import bcrypt from 'bcryptjs';

export interface IUser extends Document {
  email: string;
  passwordHash: string;
  createdAt: Date;
  comparePassword(candidate: string): Promise<boolean>;
}

const userSchema = new Schema<IUser>(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    passwordHash: {
      type: String,
      required: true,
    },
  },
  { timestamps: true },
);

userSchema.methods.comparePassword = async function (candidate: string): Promise<boolean> {
  return bcrypt.compare(candidate, this.passwordHash);
};

// Never return the password hash in JSON responses
// eslint-disable-next-line @typescript-eslint/no-explicit-any
userSchema.set('toJSON', {
  transform: (_doc: unknown, ret: any) => {
    delete ret.passwordHash;
    return ret;
  },
});

export const User = mongoose.model<IUser>('User', userSchema);
