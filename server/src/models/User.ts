import mongoose, { Schema, Document, Types } from 'mongoose';

export interface IUser extends Document {
  _id: Types.ObjectId;
  username: string;
  email: string;
  passwordHash?: string;
  googleId?: string;
  isGuest: boolean;
  friends: Types.ObjectId[];
  createdAt: Date;
}

const userSchema = new Schema<IUser>({
  username: { type: String, required: true, unique: true, trim: true, minlength: 3, maxlength: 30 },
  email: { type: String, required: true, unique: true, trim: true, lowercase: true },
  passwordHash: { type: String },
  googleId: { type: String, sparse: true },
  isGuest: { type: Boolean, default: false },
  friends: [{ type: Schema.Types.ObjectId, ref: 'User' }],
}, { timestamps: true });

userSchema.index({ username: 'text' });

export const User = mongoose.model<IUser>('User', userSchema);
