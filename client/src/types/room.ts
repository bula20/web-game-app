// Typy pokojów gier. Pokój jest pojemnikiem, w którym gracze czekają (status=waiting),
// host może wystartować grę (status=in_progress), a po zakończeniu jest archiwizowany
// w kolekcji Game (status=finished). Stan host_away to "łaska" 120 s na powrót hosta
// po rozłączeniu.

export type GameType = 'chess' | 'checkers' | 'charades';
export type RoomStatus = 'waiting' | 'host_away' | 'in_progress' | 'finished';

// Gracz w pokoju. userId=null oznacza gościa (niezalogowanego). socketId pozwala
// serwerowi adresować eventy do konkretnego klienta.
export interface RoomPlayer {
  userId: string | null;
  displayName: string;
  socketId: string;
  avatarPreset?: string;
}

export interface Room {
  _id: string;
  // 6-znakowy kod pokoju używany w URL (/room/:code) i przy "Join by code".
  code: string;
  gameType: GameType;
  // Pokój publiczny pojawia się na liście w Lobby; prywatny jest dostępny tylko po kodzie.
  isPublic: boolean;
  host: string | null;
  players: RoomPlayer[];
  maxPlayers: number;
  status: RoomStatus;
  // Limit czasu na partię (szachy/warcaby) w minutach.
  timerMinutes: number;
  // Pola specyficzne dla kalamburów - liczba rund i sekundy na rysowanie.
  rounds?: number;
  drawingTime?: number;
  createdAt: string;
}
