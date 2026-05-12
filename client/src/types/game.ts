// Typy związane z rozegranymi grami i komunikacją w trakcie gry.
// GameHistory to dokument zapisany w kolekcji Game po zakończeniu partii.

export interface GameHistory {
  _id: string;
  gameType: 'chess' | 'checkers' | 'charades';
  players: { userId: string | null; displayName: string }[];
  // ObjectId zwycięzcy (tylko dla zalogowanych) lub null przy remisie / wygranej gościa.
  winner: string | null;
  // Wynik dla gier turowych: kolor zwycięzcy lub draw.
  result: 'white' | 'black' | 'draw' | null;
  // Szachy/warcaby - lista ruchów w notacji algebraicznej, wyświetlana na stronie historii.
  moves?: string[];
  // Kalambury - punkty per gracz (zwycięzca to ten z największą liczbą punktów).
  scores?: { userId: string | null; displayName: string; points: number }[];
  // Czas trwania partii w sekundach.
  duration: number;
  finishedAt: string;
  createdAt: string;
}

// Odpowiedź z paginowanego endpointu GET /api/games/history.
export interface GameHistoryResponse {
  games: GameHistory[];
  total: number;
  page: number;
  pages: number;
}

// Wiadomość w czacie pokoju lub DM.
export interface ChatMessage {
  from: string;
  fromId?: string;
  text: string;
  timestamp: string;
}

// Pojedyncza kreska narysowana w kalamburach. Wysyłana w całości po podniesieniu
// myszy/palca (event charades:stroke) - serwer rozsyła do pozostałych graczy.
export interface Stroke {
  points: { x: number; y: number }[];
  color: string;
  width: number;
}
