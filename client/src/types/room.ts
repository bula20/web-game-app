export type GameType = 'chess' | 'checkers' | 'charades';
export type RoomStatus = 'waiting' | 'in_progress' | 'finished';

export interface RoomPlayer {
  userId: string | null;
  displayName: string;
  socketId: string;
}

export interface Room {
  _id: string;
  code: string;
  gameType: GameType;
  isPublic: boolean;
  host: string | null;
  players: RoomPlayer[];
  maxPlayers: number;
  status: RoomStatus;
  timerMinutes: number;
  createdAt: string;
}
