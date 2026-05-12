// Wiadomości - zarówno DM (type=direct, from+to) jak i czat pokojowy (type=room, roomId).
// Zapisujemy tylko od zalogowanych userów (goście nie mają referencji User).
// Limit 1000 znaków na wiadomość w schemacie + dodatkowy clamp w handlerze.
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

// Indeks pod historię DM (chat:get_history) i pod wiadomości pokojowe.
messageSchema.index({ from: 1, to: 1, createdAt: -1 });
messageSchema.index({ roomId: 1, createdAt: 1 });

export const Message = mongoose.model<IMessage>('Message', messageSchema);
