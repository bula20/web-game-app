import mongoose, { Schema, Document, Types } from 'mongoose';

export interface IMessage extends Document {
  type: 'direct' | 'room';
  roomId?: Types.ObjectId;
  from: Types.ObjectId;
  to?: Types.ObjectId;
  content: string;
  createdAt: Date;
}

const messageSchema = new Schema<IMessage>({
  type: { type: String, enum: ['direct', 'room'], required: true },
  roomId: { type: Schema.Types.ObjectId, ref: 'Room' },
  from: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  to: { type: Schema.Types.ObjectId, ref: 'User' },
  content: { type: String, required: true, maxlength: 1000 },
}, { timestamps: true });

messageSchema.index({ from: 1, to: 1, createdAt: -1 });
messageSchema.index({ roomId: 1, createdAt: 1 });

export const Message = mongoose.model<IMessage>('Message', messageSchema);
