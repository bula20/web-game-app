

export type Piece = null | "w" | "b" | "W" | "B";
export type Board = Piece[][];


export function createInitialBoard(): Board {
  const board: Board = Array(8)
    .fill(null)
    .map(() => Array(8).fill(null));

  
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 8; col++) {
      if ((row + col) % 2 === 1) board[row][col] = "b";
    }
  }

  
  for (let row = 5; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      if ((row + col) % 2 === 1) board[row][col] = "w";
    }
  }

  return board;
}


export function getValidMoves(
  board: Board,
  row: number,
  col: number,
): [number, number][] {
  const piece = board[row][col];
  if (!piece) return [];

  const color = piece.toLowerCase();
  const isKing = piece === piece.toUpperCase();

  const captures = getCaptures(board, row, col, color, isKing);
  if (captures.length > 0) return captures;

  if (hasAnyCaptureForColor(board, color)) return [];

  
  const moves: [number, number][] = [];
  const directions = getDirections(color, isKing);

  for (const [dr, dc] of directions) {
    const nr = row + dr;
    const nc = col + dc;
    if (isInBounds(nr, nc) && board[nr][nc] === null) {
      moves.push([nr, nc]);
    }
  }

  return moves;
}

function getCaptures(
  board: Board,
  row: number,
  col: number,
  color: string,
  isKing: boolean,
): [number, number][] {
  const captures: [number, number][] = [];
  const directions = isKing
    ? [
        [-1, -1],
        [-1, 1],
        [1, -1],
        [1, 1],
      ]
    : color === "w"
      ? [
          [-1, -1],
          [-1, 1],
          [1, -1],
          [1, 1],
        ] 
      : [
          [-1, -1],
          [-1, 1],
          [1, -1],
          [1, 1],
        ];

  const opponent = color === "w" ? "b" : "w";

  for (const [dr, dc] of directions) {
    const midR = row + dr;
    const midC = col + dc;
    const endR = row + 2 * dr;
    const endC = col + 2 * dc;

    if (
      isInBounds(endR, endC) &&
      board[midR][midC]?.toLowerCase() === opponent &&
      board[endR][endC] === null
    ) {
      captures.push([endR, endC]);
    }
  }

  return captures;
}

function hasAnyCaptureForColor(board: Board, color: string): boolean {
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const piece = board[r][c];
      if (piece && piece.toLowerCase() === color) {
        const isKing = piece === piece.toUpperCase();
        if (getCaptures(board, r, c, color, isKing).length > 0) return true;
      }
    }
  }
  return false;
}

export function makeMove(
  board: Board,
  from: [number, number],
  to: [number, number],
): {
  board: Board;
  captured: boolean;
  kinged: boolean;
  canContinue: boolean;
} {
  const newBoard = board.map((row) => [...row]);
  const [fr, fc] = from;
  const [tr, tc] = to;

  const piece = newBoard[fr][fc]!;
  const color = piece.toLowerCase();
  const isKing = piece === piece.toUpperCase();

  let captured = false;
  const dr = Math.sign(tr - fr);
  const dc = Math.sign(tc - fc);

  if (Math.abs(tr - fr) === 2) {
    const midR = fr + dr;
    const midC = fc + dc;
    newBoard[midR][midC] = null;
    captured = true;
  }

  newBoard[tr][tc] = piece;
  newBoard[fr][fc] = null;

  
  let kinged = false;
  if (!isKing) {
    if ((color === "w" && tr === 0) || (color === "b" && tr === 7)) {
      newBoard[tr][tc] = piece.toUpperCase() as Piece;
      kinged = true;
    }
  }

  
  let canContinue = false;
  if (captured && !kinged) {
    const newIsKing = newBoard[tr][tc] === newBoard[tr][tc]!.toUpperCase();
    const moreCaps = getCaptures(newBoard, tr, tc, color, newIsKing);
    canContinue = moreCaps.length > 0;
  }

  return { board: newBoard, captured, kinged, canContinue };
}

export function isValidMove(
  board: Board,
  from: [number, number],
  to: [number, number],
  turn: string,
): boolean {
  const [fr, fc] = from;
  const piece = board[fr][fc];
  if (!piece || piece.toLowerCase() !== turn) return false;

  const validMoves = getValidMoves(board, fr, fc);
  return validMoves.some(([r, c]) => r === to[0] && c === to[1]);
}

export function hasMovesForColor(board: Board, color: string): boolean {
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const piece = board[r][c];
      if (piece && piece.toLowerCase() === color) {
        if (getValidMoves(board, r, c).length > 0) return true;
      }
    }
  }
  return false;
}

export function countPieces(board: Board, color: string): number {
  let count = 0;
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      if (board[r][c]?.toLowerCase() === color) count++;
    }
  }
  return count;
}

function getDirections(color: string, isKing: boolean): [number, number][] {
  if (isKing)
    return [
      [-1, -1],
      [-1, 1],
      [1, -1],
      [1, 1],
    ];
  return color === "w"
    ? [
        [-1, -1],
        [-1, 1],
      ]
    : [
        [1, -1],
        [1, 1],
      ];
}

function isInBounds(r: number, c: number): boolean {
  return r >= 0 && r < 8 && c >= 0 && c < 8;
}
