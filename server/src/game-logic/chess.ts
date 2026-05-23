// ============================================================================
// Custom Chess Engine — zero external dependencies
// ============================================================================
// Silnik szachowy bez zewnętrznych bibliotek - czyste funkcje operujące
// na strukturze stanu (board + metadane). Plansza 8x8: board[0]=rank 8 (czarne
// na górze), board[7]=rank 1 (białe na dole). Wielkie litery=białe, male=czarne.
// Implementuje pełne zasady FIDE: roszada, en passant, promocja, mat/pat,
// reguła 50 ruchów oraz niewystarczający materiał.

// --- Types ---

export type ChessPiece =
  | "P"
  | "N"
  | "B"
  | "R"
  | "Q"
  | "K"
  | "p"
  | "n"
  | "b"
  | "r"
  | "q"
  | "k";
export type Square = ChessPiece | null;
export type Board = Square[][];
export type Color = "w" | "b";
export type Position = [number, number]; // [row, col]

export interface CastlingRights {
  whiteKingside: boolean;
  whiteQueenside: boolean;
  blackKingside: boolean;
  blackQueenside: boolean;
}

export interface ChessState {
  board: Board;
  turn: Color;
  castling: CastlingRights;
  enPassantTarget: Position | null;
  halfmoveClock: number;
  fullmoveNumber: number;
}

export interface MoveResult {
  state: ChessState;
  san: string;
  captured: ChessPiece | null;
  isCheck: boolean;
  isCheckmate: boolean;
  isStalemate: boolean;
  isDraw: boolean;
  promotion?: ChessPiece;
  isCastling: boolean;
  isEnPassant: boolean;
}

// --- Constants ---

// Board layout: row 0 = rank 8 (top/black), row 7 = rank 1 (bottom/white)
// col 0 = file a, col 7 = file h

const KNIGHT_OFFSETS: Position[] = [
  [-2, -1],
  [-2, 1],
  [-1, -2],
  [-1, 2],
  [1, -2],
  [1, 2],
  [2, -1],
  [2, 1],
];

const BISHOP_DIRS: Position[] = [
  [-1, -1],
  [-1, 1],
  [1, -1],
  [1, 1],
];
const ROOK_DIRS: Position[] = [
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
];
const ALL_DIRS: Position[] = [...BISHOP_DIRS, ...ROOK_DIRS];

// --- Basic helpers ---

function isInBounds(row: number, col: number): boolean {
  return row >= 0 && row < 8 && col >= 0 && col < 8;
}

function getColor(piece: Square): Color | null {
  if (!piece) return null;
  return piece === piece.toUpperCase() ? "w" : "b";
}

function isOpponent(piece: Square, color: Color): boolean {
  if (!piece) return false;
  return getColor(piece) !== color;
}

function isFriendly(piece: Square, color: Color): boolean {
  if (!piece) return false;
  return getColor(piece) === color;
}

function oppositeColor(color: Color): Color {
  return color === "w" ? "b" : "w";
}

function findKing(board: Board, color: Color): Position {
  const king: ChessPiece = color === "w" ? "K" : "k";
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      if (board[r][c] === king) return [r, c];
    }
  }
  // Should never happen in a valid game state
  return [-1, -1];
}

function cloneBoard(board: Board): Board {
  return board.map((row) => [...row]);
}

function cloneState(state: ChessState): ChessState {
  return {
    board: cloneBoard(state.board),
    turn: state.turn,
    castling: { ...state.castling },
    enPassantTarget: state.enPassantTarget
      ? ([...state.enPassantTarget] as Position)
      : null,
    halfmoveClock: state.halfmoveClock,
    fullmoveNumber: state.fullmoveNumber,
  };
}

// --- Attack detection ---

// Check if a square is attacked by any piece of the given color.
// Uses "reverse ray" approach: look outward from the target square.
// Sprawdza czy dane pole jest atakowane przez figury kolorow byColor.
// Zamiast iterowac po wszystkich figurach przeciwnika, "wysylamy promienie"
// z atakowanego pola we wszystkich kierunkach - duzo szybsze przy wykrywaniu szacha.
function isSquareAttackedBy(
  board: Board,
  row: number,
  col: number,
  byColor: Color,
): boolean {
  // 1. Pawn attacks
  const pawnDir = byColor === "w" ? 1 : -1; // white pawns attack from below (higher row)
  const pawn: ChessPiece = byColor === "w" ? "P" : "p";
  for (const dc of [-1, 1]) {
    const pr = row + pawnDir;
    const pc = col + dc;
    if (isInBounds(pr, pc) && board[pr][pc] === pawn) return true;
  }

  // 2. Knight attacks
  const knight: ChessPiece = byColor === "w" ? "N" : "n";
  for (const [dr, dc] of KNIGHT_OFFSETS) {
    const nr = row + dr;
    const nc = col + dc;
    if (isInBounds(nr, nc) && board[nr][nc] === knight) return true;
  }

  // 3. King attacks
  const king: ChessPiece = byColor === "w" ? "K" : "k";
  for (const [dr, dc] of ALL_DIRS) {
    const kr = row + dr;
    const kc = col + dc;
    if (isInBounds(kr, kc) && board[kr][kc] === king) return true;
  }

  // 4. Diagonal sliding (bishop/queen)
  const bishop: ChessPiece = byColor === "w" ? "B" : "b";
  const queen: ChessPiece = byColor === "w" ? "Q" : "q";
  for (const [dr, dc] of BISHOP_DIRS) {
    let r = row + dr,
      c = col + dc;
    while (isInBounds(r, c)) {
      const p = board[r][c];
      if (p) {
        if (p === bishop || p === queen) return true;
        break; // blocked by another piece
      }
      r += dr;
      c += dc;
    }
  }

  // 5. Straight sliding (rook/queen)
  const rook: ChessPiece = byColor === "w" ? "R" : "r";
  for (const [dr, dc] of ROOK_DIRS) {
    let r = row + dr,
      c = col + dc;
    while (isInBounds(r, c)) {
      const p = board[r][c];
      if (p) {
        if (p === rook || p === queen) return true;
        break;
      }
      r += dr;
      c += dc;
    }
  }

  return false;
}

function isInCheckRaw(board: Board, color: Color): boolean {
  const [kr, kc] = findKing(board, color);
  return isSquareAttackedBy(board, kr, kc, oppositeColor(color));
}

// --- Pseudo-legal move generators ---
// These return geometrically valid destinations without checking if the king remains safe.

function getKnightMovesPseudo(
  board: Board,
  row: number,
  col: number,
  color: Color,
): Position[] {
  const moves: Position[] = [];
  for (const [dr, dc] of KNIGHT_OFFSETS) {
    const nr = row + dr,
      nc = col + dc;
    if (isInBounds(nr, nc) && !isFriendly(board[nr][nc], color)) {
      moves.push([nr, nc]);
    }
  }
  return moves;
}

function getSlidingMovesPseudo(
  board: Board,
  row: number,
  col: number,
  color: Color,
  dirs: Position[],
): Position[] {
  const moves: Position[] = [];
  for (const [dr, dc] of dirs) {
    let r = row + dr,
      c = col + dc;
    while (isInBounds(r, c)) {
      const target = board[r][c];
      if (isFriendly(target, color)) break;
      moves.push([r, c]);
      if (target) break; // capture, stop sliding
      r += dr;
      c += dc;
    }
  }
  return moves;
}

function getBishopMovesPseudo(
  board: Board,
  row: number,
  col: number,
  color: Color,
): Position[] {
  return getSlidingMovesPseudo(board, row, col, color, BISHOP_DIRS);
}

function getRookMovesPseudo(
  board: Board,
  row: number,
  col: number,
  color: Color,
): Position[] {
  return getSlidingMovesPseudo(board, row, col, color, ROOK_DIRS);
}

function getQueenMovesPseudo(
  board: Board,
  row: number,
  col: number,
  color: Color,
): Position[] {
  return getSlidingMovesPseudo(board, row, col, color, ALL_DIRS);
}

function getPawnMovesPseudo(
  board: Board,
  row: number,
  col: number,
  color: Color,
  enPassantTarget: Position | null,
): Position[] {
  const moves: Position[] = [];
  const dir = color === "w" ? -1 : 1; // white moves up (decreasing row), black moves down
  const startRow = color === "w" ? 6 : 1;

  // Single push
  const oneR = row + dir;
  if (isInBounds(oneR, col) && !board[oneR][col]) {
    moves.push([oneR, col]);
    // Double push from starting position
    const twoR = row + 2 * dir;
    if (row === startRow && !board[twoR][col]) {
      moves.push([twoR, col]);
    }
  }

  // Diagonal captures
  for (const dc of [-1, 1]) {
    const nr = row + dir,
      nc = col + dc;
    if (!isInBounds(nr, nc)) continue;

    // Normal capture
    if (isOpponent(board[nr][nc], color)) {
      moves.push([nr, nc]);
    }

    // En passant
    if (
      enPassantTarget &&
      enPassantTarget[0] === nr &&
      enPassantTarget[1] === nc
    ) {
      moves.push([nr, nc]);
    }
  }

  return moves;
}

function getKingMovesPseudo(
  board: Board,
  row: number,
  col: number,
  color: Color,
  castling: CastlingRights,
): Position[] {
  const moves: Position[] = [];

  // Normal king moves (8 directions)
  for (const [dr, dc] of ALL_DIRS) {
    const nr = row + dr,
      nc = col + dc;
    if (isInBounds(nr, nc) && !isFriendly(board[nr][nc], color)) {
      moves.push([nr, nc]);
    }
  }

  // Castling
  const enemy = oppositeColor(color);
  const inCheck = isSquareAttackedBy(board, row, col, enemy);
  if (inCheck) return moves; // can't castle while in check

  if (color === "w" && row === 7 && col === 4) {
    // White kingside: e1→g1, rook h1→f1
    if (
      castling.whiteKingside &&
      board[7][7] === "R" &&
      !board[7][5] &&
      !board[7][6] &&
      !isSquareAttackedBy(board, 7, 5, enemy) &&
      !isSquareAttackedBy(board, 7, 6, enemy)
    ) {
      moves.push([7, 6]);
    }
    // White queenside: e1→c1, rook a1→d1
    if (
      castling.whiteQueenside &&
      board[7][0] === "R" &&
      !board[7][1] &&
      !board[7][2] &&
      !board[7][3] &&
      !isSquareAttackedBy(board, 7, 3, enemy) &&
      !isSquareAttackedBy(board, 7, 2, enemy)
    ) {
      moves.push([7, 2]);
    }
  } else if (color === "b" && row === 0 && col === 4) {
    // Black kingside: e8→g8
    if (
      castling.blackKingside &&
      board[0][7] === "r" &&
      !board[0][5] &&
      !board[0][6] &&
      !isSquareAttackedBy(board, 0, 5, enemy) &&
      !isSquareAttackedBy(board, 0, 6, enemy)
    ) {
      moves.push([0, 6]);
    }
    // Black queenside: e8→c8
    if (
      castling.blackQueenside &&
      board[0][0] === "r" &&
      !board[0][1] &&
      !board[0][2] &&
      !board[0][3] &&
      !isSquareAttackedBy(board, 0, 3, enemy) &&
      !isSquareAttackedBy(board, 0, 2, enemy)
    ) {
      moves.push([0, 2]);
    }
  }

  return moves;
}

function getPseudoLegalMoves(
  state: ChessState,
  row: number,
  col: number,
): Position[] {
  const piece = state.board[row][col];
  if (!piece) return [];

  const color = getColor(piece);
  if (!color) return [];

  const type = piece.toLowerCase();
  switch (type) {
    case "p":
      return getPawnMovesPseudo(
        state.board,
        row,
        col,
        color,
        state.enPassantTarget,
      );
    case "n":
      return getKnightMovesPseudo(state.board, row, col, color);
    case "b":
      return getBishopMovesPseudo(state.board, row, col, color);
    case "r":
      return getRookMovesPseudo(state.board, row, col, color);
    case "q":
      return getQueenMovesPseudo(state.board, row, col, color);
    case "k":
      return getKingMovesPseudo(state.board, row, col, color, state.castling);
    default:
      return [];
  }
}

// --- Legal move filtering ---

// Apply a move on a cloned board (minimal, only for legality check).
// Does NOT update castling/en passant/clocks — only moves pieces.
function applyMoveOnBoard(
  board: Board,
  from: Position,
  to: Position,
  color: Color,
): Board {
  const newBoard = cloneBoard(board);
  const [fr, fc] = from;
  const [tr, tc] = to;
  const piece = newBoard[fr][fc];

  // En passant capture: pawn moves diagonally to empty square
  if (piece && piece.toLowerCase() === "p" && fc !== tc && !newBoard[tr][tc]) {
    newBoard[fr][tc] = null; // remove captured pawn
  }

  // Castling: move the rook too
  if (piece && piece.toLowerCase() === "k" && Math.abs(tc - fc) === 2) {
    if (tc === 6) {
      // kingside
      newBoard[fr][5] = newBoard[fr][7];
      newBoard[fr][7] = null;
    } else if (tc === 2) {
      // queenside
      newBoard[fr][3] = newBoard[fr][0];
      newBoard[fr][0] = null;
    }
  }

  newBoard[tr][tc] = piece;
  newBoard[fr][fc] = null;

  return newBoard;
}

// --- Exported API ---

export function getValidMoves(
  state: ChessState,
  row: number,
  col: number,
): Position[] {
  const piece = state.board[row][col];
  if (!piece) return [];

  const color = getColor(piece);
  if (color !== state.turn) return [];

  const pseudoMoves = getPseudoLegalMoves(state, row, col);
  const legalMoves: Position[] = [];

  for (const [tr, tc] of pseudoMoves) {
    const newBoard = applyMoveOnBoard(state.board, [row, col], [tr, tc], color);
    if (!isInCheckRaw(newBoard, color)) {
      legalMoves.push([tr, tc]);
    }
  }

  return legalMoves;
}

export function isValidMove(
  state: ChessState,
  from: Position,
  to: Position,
): boolean {
  const moves = getValidMoves(state, from[0], from[1]);
  return moves.some(([r, c]) => r === to[0] && c === to[1]);
}

export function hasMovesForColor(state: ChessState, color: Color): boolean {
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const piece = state.board[r][c];
      if (piece && getColor(piece) === color) {
        // Temporarily set turn to this color to check moves
        const tempState = { ...state, turn: color };
        if (getValidMoves(tempState, r, c).length > 0) return true;
      }
    }
  }
  return false;
}

// --- Board creation ---

export function createInitialBoard(): Board {
  return [
    ["r", "n", "b", "q", "k", "b", "n", "r"], // row 0 = rank 8
    ["p", "p", "p", "p", "p", "p", "p", "p"], // row 1 = rank 7
    [null, null, null, null, null, null, null, null],
    [null, null, null, null, null, null, null, null],
    [null, null, null, null, null, null, null, null],
    [null, null, null, null, null, null, null, null],
    ["P", "P", "P", "P", "P", "P", "P", "P"], // row 6 = rank 2
    ["R", "N", "B", "Q", "K", "B", "N", "R"], // row 7 = rank 1
  ];
}

export function createInitialState(): ChessState {
  return {
    board: createInitialBoard(),
    turn: "w",
    castling: {
      whiteKingside: true,
      whiteQueenside: true,
      blackKingside: true,
      blackQueenside: true,
    },
    enPassantTarget: null,
    halfmoveClock: 0,
    fullmoveNumber: 1,
  };
}

// --- Coordinate conversion ---

export function squareToAlgebraic(row: number, col: number): string {
  return String.fromCharCode(97 + col) + String(8 - row);
}

export function algebraicToSquare(sq: string): Position {
  const col = sq.charCodeAt(0) - 97;
  const row = 8 - parseInt(sq[1], 10);
  return [row, col];
}

// --- SAN generation ---

// Generate Standard Algebraic Notation for a move BEFORE it is applied.
// The move must be legal (caller should have validated).
function generateSAN(
  state: ChessState,
  from: Position,
  to: Position,
  promotion?: string,
): string {
  const [fr, fc] = from;
  const [tr, tc] = to;
  const piece = state.board[fr][fc]!;
  const pieceType = piece.toLowerCase();
  const color = getColor(piece)!;
  const captured = state.board[tr][tc];

  // Castling
  if (pieceType === "k" && Math.abs(tc - fc) === 2) {
    const base = tc === 6 ? "O-O" : "O-O-O";
    // Apply move to check for check/checkmate suffix
    const newBoard = applyMoveOnBoard(state.board, from, to, color);
    const opp = oppositeColor(color);
    const oppInCheck = isInCheckRaw(newBoard, opp);
    if (oppInCheck) {
      const tempState = cloneState(state);
      tempState.board = newBoard;
      tempState.turn = opp;
      const hasMoves = hasMovesForColor(tempState, opp);
      return base + (hasMoves ? "+" : "#");
    }
    return base;
  }

  let san = "";

  if (pieceType === "p") {
    // Pawn move
    const isCapture = fc !== tc;
    if (isCapture) {
      san += String.fromCharCode(97 + fc) + "x";
    }
    san += squareToAlgebraic(tr, tc);
    if (promotion) {
      san += "=" + promotion.toUpperCase();
    }
  } else {
    // Piece letter
    san += pieceType.toUpperCase();

    // Disambiguation: check if other pieces of same type/color can reach the same square
    const disambig = getDisambiguation(state, from, to, piece);
    san += disambig;

    // Capture
    if (captured) {
      san += "x";
    }

    san += squareToAlgebraic(tr, tc);
  }

  // Check/checkmate suffix
  const newBoard = applyMoveOnBoard(state.board, from, to, color);
  // Handle promotion on the board for check detection
  if (promotion && pieceType === "p") {
    const promRow = color === "w" ? 0 : 7;
    if (tr === promRow) {
      const promPiece = (
        color === "w" ? promotion.toUpperCase() : promotion.toLowerCase()
      ) as Square;
      newBoard[tr][tc] = promPiece;
    }
  }
  const opp = oppositeColor(color);
  if (isInCheckRaw(newBoard, opp)) {
    const tempState = cloneState(state);
    tempState.board = newBoard;
    tempState.turn = opp;
    const hasMoves = hasMovesForColor(tempState, opp);
    san += hasMoves ? "+" : "#";
  }

  return san;
}

function getDisambiguation(
  state: ChessState,
  from: Position,
  to: Position,
  piece: ChessPiece,
): string {
  const [fr, fc] = from;
  const [tr, tc] = to;
  const color = getColor(piece)!;

  // Find all other pieces of the same type and color that can also move to the target
  const others: Position[] = [];
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      if (r === fr && c === fc) continue;
      if (state.board[r][c] !== piece) continue;
      const moves = getValidMoves(state, r, c);
      if (moves.some(([mr, mc]) => mr === tr && mc === tc)) {
        others.push([r, c]);
      }
    }
  }

  if (others.length === 0) return "";

  // Try file disambiguation first
  const sameFile = others.some(([, oc]) => oc === fc);
  const sameRank = others.some(([or]) => or === fr);

  if (!sameFile) {
    return String.fromCharCode(97 + fc); // file letter
  }
  if (!sameRank) {
    return String(8 - fr); // rank number
  }
  // Both file and rank needed
  return String.fromCharCode(97 + fc) + String(8 - fr);
}

// --- Move execution ---

export function makeMove(
  state: ChessState,
  from: Position,
  to: Position,
  promotion?: string,
): MoveResult {
  const [fr, fc] = from;
  const [tr, tc] = to;
  const piece = state.board[fr][fc]!;
  const pieceType = piece.toLowerCase();
  const color = getColor(piece)!;
  const captured = state.board[tr][tc];

  // Generate SAN before applying the move
  const san = generateSAN(state, from, to, promotion);

  // Clone state for the new position
  const newState = cloneState(state);

  let isEnPassant = false;
  let isCastling = false;
  let capturedPiece: ChessPiece | null = captured as ChessPiece | null;
  let promotionPiece: ChessPiece | undefined;

  // En passant capture
  if (pieceType === "p" && fc !== tc && !captured) {
    isEnPassant = true;
    capturedPiece = newState.board[fr][tc] as ChessPiece;
    newState.board[fr][tc] = null;
  }

  // Castling: move the rook
  if (pieceType === "k" && Math.abs(tc - fc) === 2) {
    isCastling = true;
    if (tc === 6) {
      // kingside
      newState.board[fr][5] = newState.board[fr][7];
      newState.board[fr][7] = null;
    } else if (tc === 2) {
      // queenside
      newState.board[fr][3] = newState.board[fr][0];
      newState.board[fr][0] = null;
    }
  }

  // Move the piece
  newState.board[tr][tc] = piece;
  newState.board[fr][fc] = null;

  // Promotion
  if (pieceType === "p") {
    const promRow = color === "w" ? 0 : 7;
    if (tr === promRow) {
      const prom = promotion || "q";
      const promPiece = (
        color === "w" ? prom.toUpperCase() : prom.toLowerCase()
      ) as ChessPiece;
      newState.board[tr][tc] = promPiece;
      promotionPiece = promPiece;
    }
  }

  // Update castling rights
  // King moved
  if (pieceType === "k") {
    if (color === "w") {
      newState.castling.whiteKingside = false;
      newState.castling.whiteQueenside = false;
    } else {
      newState.castling.blackKingside = false;
      newState.castling.blackQueenside = false;
    }
  }
  // Rook moved or captured
  if (fr === 7 && fc === 0) newState.castling.whiteQueenside = false;
  if (fr === 7 && fc === 7) newState.castling.whiteKingside = false;
  if (fr === 0 && fc === 0) newState.castling.blackQueenside = false;
  if (fr === 0 && fc === 7) newState.castling.blackKingside = false;
  // Rook captured on starting square
  if (tr === 7 && tc === 0) newState.castling.whiteQueenside = false;
  if (tr === 7 && tc === 7) newState.castling.whiteKingside = false;
  if (tr === 0 && tc === 0) newState.castling.blackQueenside = false;
  if (tr === 0 && tc === 7) newState.castling.blackKingside = false;

  // Update en passant target
  if (pieceType === "p" && Math.abs(tr - fr) === 2) {
    const epRow = (fr + tr) / 2;
    newState.enPassantTarget = [epRow, fc];
  } else {
    newState.enPassantTarget = null;
  }

  // Update halfmove clock
  if (pieceType === "p" || capturedPiece) {
    newState.halfmoveClock = 0;
  } else {
    newState.halfmoveClock++;
  }

  // Update fullmove number
  if (color === "b") {
    newState.fullmoveNumber++;
  }

  // Switch turn
  newState.turn = oppositeColor(color);

  // Evaluate end-of-game conditions
  const opp = newState.turn;
  const oppInCheck = isInCheckRaw(newState.board, opp);
  const oppHasMoves = hasMovesForColor(newState, opp);

  const isCheckmate = oppInCheck && !oppHasMoves;
  const isStalemate = !oppInCheck && !oppHasMoves;
  const insufficientMat = isInsufficientMaterial(newState.board);
  const fiftyMoveRule = newState.halfmoveClock >= 100;
  const drawResult = isStalemate || insufficientMat || fiftyMoveRule;

  return {
    state: newState,
    san,
    captured: capturedPiece,
    isCheck: oppInCheck && !isCheckmate,
    isCheckmate,
    isStalemate,
    isDraw: drawResult,
    promotion: promotionPiece,
    isCastling,
    isEnPassant,
  };
}

// --- Game state queries ---

export function isCheck(state: ChessState): boolean {
  return isInCheckRaw(state.board, state.turn);
}

export function isCheckmate(state: ChessState): boolean {
  return (
    isInCheckRaw(state.board, state.turn) &&
    !hasMovesForColor(state, state.turn)
  );
}

export function isStalemate(state: ChessState): boolean {
  return (
    !isInCheckRaw(state.board, state.turn) &&
    !hasMovesForColor(state, state.turn)
  );
}

function isInsufficientMaterial(board: Board): boolean {
  const pieces: { color: Color; type: string; squareColor: number }[] = [];

  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const p = board[r][c];
      if (p) {
        pieces.push({
          color: getColor(p)!,
          type: p.toLowerCase(),
          squareColor: (r + c) % 2,
        });
      }
    }
  }

  // K vs K
  if (pieces.length === 2) return true;

  // K+B vs K or K+N vs K
  if (pieces.length === 3) {
    const nonKing = pieces.find((p) => p.type !== "k");
    if (nonKing && (nonKing.type === "b" || nonKing.type === "n")) return true;
  }

  // K+B vs K+B with bishops on same color squares
  if (pieces.length === 4) {
    const bishops = pieces.filter((p) => p.type === "b");
    if (bishops.length === 2) {
      const whiteB = bishops.find((b) => b.color === "w");
      const blackB = bishops.find((b) => b.color === "b");
      if (whiteB && blackB && whiteB.squareColor === blackB.squareColor)
        return true;
    }
  }

  return false;
}

export function isDraw(state: ChessState): boolean {
  return (
    isStalemate(state) ||
    isInsufficientMaterial(state.board) ||
    state.halfmoveClock >= 100
  );
}
