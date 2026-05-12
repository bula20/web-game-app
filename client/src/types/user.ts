// Współdzielone interfejsy dotyczące użytkownika i jego relacji (znajomi, zaproszenia).
// Te same kształty są zwracane przez backendowe routes /auth, /users, /friends.

// Główny obiekt użytkownika trzymany w AuthContext po zalogowaniu.
export interface User {
  id: string;
  username: string;
  email?: string;
  isGuest: boolean;
  // Kod aktywnego pokoju - używany do auto-redirectu po wejściu na aplikację,
  // jeśli user wcześniej nie zakończył gry / nie wyszedł świadomie.
  activeRoomCode?: string | null;
  avatarPreset?: string;
  // Backend pozwala zmienić nazwę raz na 7 dni - data ostatniej zmiany jest tu zapisana.
  lastUsernameChange?: string | null;
  createdAt?: string;
}

// Krótki opis aktywnego pokoju - zwracany przez GET /api/users/me/active-room.
export interface ActiveRoomInfo {
  code: string;
  gameType: 'chess' | 'checkers' | 'charades';
  status: 'waiting' | 'host_away' | 'in_progress' | 'finished';
}

// Odpowiedź z /auth/login, /auth/register, /auth/guest - token JWT + dane usera.
export interface AuthResponse {
  token: string;
  user: User;
}

// Pojedynczy znajomy z listy w Sidebar. Pole `online` jest doklejane przez
// SocketContext na podstawie eventów friend:online_status.
export interface Friend {
  _id: string;
  username: string;
  avatarPreset?: string;
  online?: boolean;
}

// Zaproszenie do znajomych - przychodzące lub wychodzące, w zależności od pól from/to.
export interface FriendRequest {
  _id: string;
  from: { _id: string; username: string; avatarPreset?: string };
  to: { _id: string; username: string };
  status: 'pending' | 'accepted' | 'rejected';
  createdAt: string;
}
