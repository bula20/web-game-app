// Renderuje pojedynczą figurę szachową jako <img> z pliku SVG w public/pieces/.
// Używana konwencja jak w silniku FEN/PGN: wielkie litery (P, N, B, R, Q, K) to białe
// figury, małe (p, n, b, r, q, k) to czarne. Używany styl Cburnett (popularne ikony szachowe).

interface ChessPieceProps {
  piece: string; // 'P','N','B','R','Q','K','p','n','b','r','q','k'
  size: number;
}

// Mapowanie litery figury na nazwę pliku SVG (wP = white pawn, bK = black king itd.).
const PIECE_FILE: Record<string, string> = {
  P: 'wP', N: 'wN', B: 'wB', R: 'wR', Q: 'wQ', K: 'wK',
  p: 'bP', n: 'bN', b: 'bB', r: 'bR', q: 'bQ', k: 'bK',
};

export function ChessPiece({ piece, size }: ChessPieceProps) {
  const file = PIECE_FILE[piece];
  if (!file) return null;
  // pointerEvents: none żeby kliknięcia trafiały do pola planszy pod figurą,
  // a nie były pochłaniane przez sam <img>.
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
