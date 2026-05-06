export interface User {
  id: string;
  username: string;
  email?: string;
  isGuest: boolean;
  activeRoomCode?: string | null;
  avatarPreset?: string;
  lastUsernameChange?: string | null;
  createdAt?: string;
}

export interface ActiveRoomInfo {
  code: string;
  gameType: 'chess' | 'checkers' | 'charades';
  status: 'waiting' | 'host_away' | 'in_progress' | 'finished';
}

export interface AuthResponse {
  token: string;
  user: User;
}

export interface Friend {
  _id: string;
  username: string;
  avatarPreset?: string;
  online?: boolean;
}

export interface FriendRequest {
  _id: string;
  from: { _id: string; username: string; avatarPreset?: string };
  to: { _id: string; username: string };
  status: 'pending' | 'accepted' | 'rejected';
  createdAt: string;
}
