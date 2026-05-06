interface ChessPieceProps {
  piece: string; // 'P','N','B','R','Q','K','p','n','b','r','q','k'
  size: number;
}

const PIECE_FILE: Record<string, string> = {
  P: 'wP', N: 'wN', B: 'wB', R: 'wR', Q: 'wQ', K: 'wK',
  p: 'bP', n: 'bN', b: 'bB', r: 'bR', q: 'bQ', k: 'bK',
};

export function ChessPiece({ piece, size }: ChessPieceProps) {
  const file = PIECE_FILE[piece];
  if (!file) return null;
  return (
    <img
      src={`/pieces/${file}.svg`}
      width={size}
      height={size}
      alt={piece}
      style={{ pointerEvents: 'none', display: 'block' }}
    />
  );
}
