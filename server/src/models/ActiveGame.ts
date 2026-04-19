import mongoose, { Schema, Document, Types } from 'mongoose';
import { GameType } from './Room.js';

export interface IActiveGame extends Document {
  roomId: Types.ObjectId;
  code: string;
  gameType: GameType;
  state: unknown;
  updatedAt: Date;
}

const activeGameSchema = new Schema<IActiveGame>({
  roomId: { type: Schema.Types.ObjectId, ref: 'Room', required: true },
  code: { type: String, required: true, unique: true, index: true },
  gameType: { type: String, enum: ['chess', 'checkers', 'charades'], required: true },
  state: { type: Schema.Types.Mixed, required: true },
}, { timestamps: true });

export const ActiveGame = mongoose.model<IActiveGame>('ActiveGame', activeGameSchema);
