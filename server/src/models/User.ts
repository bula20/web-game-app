// Model zarejestrowanego użytkownika. Goście NIE są tutaj zapisywani - są ulotni
// (id z prefixem "guest_..." istnieje tylko w tokenie i in-memory mapach).
// passwordHash jest opcjonalny, bo użytkownicy zalogowani przez Google nie mają
// hasła; podobnie googleId jest puste dla rejestracji email/hasło.
import mongoose, { Schema, Document, Types } from 'mongoose';

export interface IUser extends Document {
  _id: Types.ObjectId;
  username: string;
  email: string;
  passwordHash?: string;
  googleId?: string;
  // isGuest nie jest praktycznie używany dla rekordów User (goście nie trafiają do bazy),
  // pole zostało dla przyszłej rozbudowy "guest -> registered" upgrade flow.
  isGuest: boolean;
  friends: Types.ObjectId[];
  // Kod aktywnego pokoju - wykorzystywany przez auto-redirect i room:join reconnect path.
  activeRoomCode: string | null;
  // Awatar: "color:N" (1..8) lub "img:plik.png" (z client/public/avatars/).
  avatarPreset: string;
  // Data ostatniej zmiany username - server pozwala zmienić raz na 7 dni (users.ts).
  lastUsernameChange?: Date;
  createdAt: Date;
}

const userSchema = new Schema<IUser>({
  username: { type: String, required: true, unique: true, trim: true, minlength: 3, maxlength: 30 },
  email: { type: String, required: true, unique: true, trim: true, lowercase: true },
  passwordHash: { type: String },
  googleId: { type: String, sparse: true },
  isGuest: { type: Boolean, default: false },
  friends: [{ type: Schema.Types.ObjectId, ref: 'User' }],
  activeRoomCode: { type: String, default: null },
  avatarPreset: { type: String, default: 'color:1' },
  lastUsernameChange: { type: Date },
}, { timestamps: true });

// Indeks tekstowy dla wyszukiwania userów (np. "dodaj znajomego" w ProfilePanel).
userSchema.index({ username: 'text' });

export const User = mongoose.model<IUser>('User', userSchema);
