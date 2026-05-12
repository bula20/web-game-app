// Model pokoju gry. Pokój jest pojemnikiem, w którym gracze czekają i ostatecznie
// rozgrywają partię. Przepływ statusów:
//   waiting       - utworzony, host dodaje graczy, czeka na start.
//   host_away     - host stracił połączenie; pokój żyje 120 s, czekając na powrót.
//   in_progress   - gra trwa (zegary tykają, eventy chess:* / checkers:* / charades:*).
//   finished      - gra skończona; rekord pozostaje w bazie do końca migracji,
//                   a zwykle endGame od razu po zapisie do Game kasuje pokój.
import mongoose, { Schema, Document, Types } from 'mongoose';

export type GameType = 'chess' | 'checkers' | 'charades';
export type RoomStatus = 'waiting' | 'host_away' | 'in_progress' | 'finished';

export interface IRoomPlayer {
  userId: Types.ObjectId | null;
  guestId: string | null;
  displayName: string;
  socketId: string;
  avatarPreset?: string;
}

// Wpis dla gracza, który stracił połączenie - klient pokazuje banner z countdownem
// liczonym od disconnectedAt + expiresIn. Po wygaśnięciu wpisu (presenceHandler)
// gracz jest usuwany z pokoju lub partia kończy się walkowerem.
export interface IDisconnectedPlayer {
  userId: Types.ObjectId | null;
  guestId: string | null;
  displayName: string;
  disconnectedAt: Date;
  expiresIn: number;
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
  rounds: number;
  drawingTime: number;
  // Timestamp od którego liczy się 120 s ochrony hosta (HOST_AWAY_TTL).
  hostDisconnectedAt: Date | null;
  disconnectedPlayers: IDisconnectedPlayer[];
  createdAt: Date;
}

const roomPlayerSchema = new Schema<IRoomPlayer>({
  userId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  guestId: { type: String, default: null },
  displayName: { type: String, required: true },
  socketId: { type: String, required: true },
  avatarPreset: { type: String, default: undefined },
}, { _id: false });

const disconnectedPlayerSchema = new Schema<IDisconnectedPlayer>({
  userId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  guestId: { type: String, default: null },
  displayName: { type: String, required: true },
  disconnectedAt: { type: Date, required: true },
  expiresIn: { type: Number, required: true },
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
  rounds: { type: Number, default: 3 },
  drawingTime: { type: Number, default: 60 },
  hostDisconnectedAt: { type: Date, default: null },
  disconnectedPlayers: { type: [disconnectedPlayerSchema], default: [] },
}, { timestamps: true });

// Indeks pod zapytania w Lobby (lista publicznych pokojów konkretnej gry, status waiting).
roomSchema.index({ gameType: 1, isPublic: 1, status: 1 });

export const Room = mongoose.model<IRoom>('Room', roomSchema);
