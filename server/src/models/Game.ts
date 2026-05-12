// Model historii rozegranych partii. Każda partia (chess/checkers/charades) trafia
// tu po endGame z uczestnikami, wynikiem i listą ruchów lub punktów. Jeden z graczy
// może być gościem (userId=null), wtedy nie liczymy go do statystyk usera, ale
// zachowujemy jego displayName w dokumencie.
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

// Indeks pod listę partii konkretnego usera (HistoryPage paginacja).
gameSchema.index({ 'players.userId': 1, createdAt: -1 });

export const Game = mongoose.model<IGame>('Game', gameSchema);

// Limit przechowywanych partii per user, żeby kolekcja Game nie rosła w nieskończoność.
const MAX_GAMES_PER_USER = 50;

// Po każdej zakończonej partii czyścimy najstarsze rekordy uczestników, jeśli mają
// więcej niż MAX_GAMES_PER_USER. Goście (id z prefixem "guest_") są pomijani -
// nie mają persystencji, więc i historii też nie.
export async function pruneOldGames(userIds: (string | null)[]): Promise<void> {
  const validIds = userIds.filter((id): id is string => !!id && !id.startsWith('guest_'));
  for (const userId of validIds) {
    let objectId: Types.ObjectId;
    try {
      objectId = new Types.ObjectId(userId);
    } catch {
      continue;
    }
    const oldest = await Game.find({ 'players.userId': objectId })
      .sort({ createdAt: -1 })
      .skip(MAX_GAMES_PER_USER)
      .select('_id')
      .lean();
    if (oldest.length > 0) {
      await Game.deleteMany({ _id: { $in: oldest.map((g) => g._id) } });
    }
  }
}
