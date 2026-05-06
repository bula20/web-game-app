export type GameType = 'chess' | 'checkers' | 'charades';
export type RoomStatus = 'waiting' | 'host_away' | 'in_progress' | 'finished';

export interface RoomPlayer {
  userId: string | null;
  displayName: string;
  socketId: string;
  avatarPreset?: string;
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
  rounds?: number;
  drawingTime?: number;
  createdAt: string;
}
