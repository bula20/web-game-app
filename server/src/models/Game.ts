import mongoose, { Schema, Document, Types } from 'mongoose';

export interface IGamePlayer {
  userId: Types.ObjectId | null;
  displayName: string;
}

export interface ICharadesScore {
  userId: Types.ObjectId | null;
  displayName: string;
  points: number;
}

export interface IGame extends Document {
  roomId: Types.ObjectId;
  gameType: 'chess' | 'checkers' | 'charades';
  players: IGamePlayer[];
  winner: Types.ObjectId | null;
  result: 'white' | 'black' | 'draw' | null;
  moves?: string[];
  scores?: ICharadesScore[];
  duration: number;
  finishedAt: Date;
  createdAt: Date;
}

const gameSchema = new Schema<IGame>({
  roomId: { type: Schema.Types.ObjectId, ref: 'Room', required: true },
  gameType: { type: String, enum: ['chess', 'checkers', 'charades'], required: true },
  players: [{
    userId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    displayName: { type: String, required: true },
  }],
  winner: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  result: { type: String, enum: ['white', 'black', 'draw', null], default: null },
  moves: [{ type: String }],
  scores: [{
    userId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    displayName: { type: String, required: true },
    points: { type: Number, default: 0 },
  }],
  duration: { type: Number, default: 0 },
  finishedAt: { type: Date },
}, { timestamps: true });

gameSchema.index({ 'players.userId': 1, createdAt: -1 });

export const Game = mongoose.model<IGame>('Game', gameSchema);
