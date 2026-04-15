import mongoose, { Schema, Document, Types } from 'mongoose';

export type GameType = 'chess' | 'checkers' | 'charades';
export type RoomStatus = 'waiting' | 'host_away' | 'in_progress' | 'finished';

export interface IRoomPlayer {
  userId: Types.ObjectId | null;
  displayName: string;
  socketId: string;
}

export interface IRoom extends Document {
  code: string;
  gameType: GameType;
  isPublic: boolean;
  host: Types.ObjectId | null;
  players: IRoomPlayer[];
  maxPlayers: number;
  status: RoomStatus;
  timerMinutes: number;
  hostDisconnectedAt: Date | null;
  createdAt: Date;
}

const roomPlayerSchema = new Schema<IRoomPlayer>({
  userId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  displayName: { type: String, required: true },
  socketId: { type: String, required: true },
}, { _id: false });

const roomSchema = new Schema<IRoom>({
  code: { type: String, required: true, unique: true },
  gameType: { type: String, enum: ['chess', 'checkers', 'charades'], required: true },
  isPublic: { type: Boolean, default: true },
  host: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  players: [roomPlayerSchema],
  maxPlayers: { type: Number, required: true, min: 2, max: 12 },
  status: { type: String, enum: ['waiting', 'host_away', 'in_progress', 'finished'], default: 'waiting' },
  timerMinutes: { type: Number, default: 10 },
  hostDisconnectedAt: { type: Date, default: null },
}, { timestamps: true });

roomSchema.index({ gameType: 1, isPublic: 1, status: 1 });

export const Room = mongoose.model<IRoom>('Room', roomSchema);
