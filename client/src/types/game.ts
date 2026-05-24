


export interface GameHistory {
  _id: string;
  gameType: 'chess' | 'checkers' | 'charades';
  players: { userId: string | null; displayName: string }[];
  
  winner: string | null;
  
  result: 'white' | 'black' | 'draw' | null;
  
  moves?: string[];
  
  scores?: { userId: string | null; displayName: string; points: number }[];
  
  duration: number;
  finishedAt: string;
  createdAt: string;
}


export interface GameHistoryResponse {
  games: GameHistory[];
  total: number;
  page: number;
  pages: number;
}


export interface ChatMessage {
  from: string;
  fromId?: string;
  text: string;
  timestamp: string;
}


export interface Stroke {
  points: { x: number; y: number }[];
  color: string;
  width: number;
}
