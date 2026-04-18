import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useSocket } from '@/context/SocketContext';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Send, Flag } from 'lucide-react';
import { ChessPiece } from '@/components/chess/ChessPiece';
import type { ChatMessage } from '@/types/game';

type Square = string | null;
type Board = Square[][];

const BOARD_SIZE = 8;
const SQUARE_SIZE = 64;
const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
const RANKS = ['8', '7', '6', '5', '4', '3', '2', '1'];

function squareToAlgebraic(row: number, col: number): string {
  return String.fromCharCode(97 + col) + String(8 - row);
}

function algebraicToSquare(sq: string): [number, number] {
  const col = sq.charCodeAt(0) - 97;
  const row = 8 - parseInt(sq[1], 10);
  return [row, col];
}

export function ChessPage() {
  const { t } = useTranslation();
  const { code } = useParams<{ code: string }>();
  const { socket } = useSocket();
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [board, setBoard] = useState<Board>([]);
  const [turn, setTurn] = useState<'w' | 'b'>('w');
  const [playerColor, setPlayerColor] = useState<'w' | 'b'>('w');
  const [selectedSquare, setSelectedSquare] = useState<string | null>(null);
  const [validMoves, setValidMoves] = useState<string[]>([]);
  const [isMyTurn, setIsMyTurn] = useState(false);
  const [timeWhite, setTimeWhite] = useState(600);
  const [timeBlack, setTimeBlack] = useState(600);
  const [gameOver, setGameOver] = useState(false);
  const [result, setResult] = useState('');
  const [moveHistory, setMoveHistory] = useState<{ san: string; color: string }[]>([]);
  const [showPromotion, setShowPromotion] = useState<{ from: string; to: string } | null>(null);
  const [inCheck, setInCheck] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [messageText, setMessageText] = useState('');

  const playerColorRef = useRef(playerColor);
  playerColorRef.current = playerColor;

  const historyEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    historyEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [moveHistory]);

  useEffect(() => {
    if (!socket || !code) return;

    const initFromData = (data: {
      white: string; black: string; board: Board; turn: 'w' | 'b';
      timeWhite: number; timeBlack: number; moves?: string[]; isCheck?: boolean;
    }) => {
      setBoard(data.board);
      setTurn(data.turn);
      const myColor = data.white === socket.id ? 'w' : 'b';
      setPlayerColor(myColor);
      setIsMyTurn(data.turn === myColor);
      setTimeWhite(data.timeWhite);
      setTimeBlack(data.timeBlack);
      setInCheck(data.isCheck ?? false);
      if (data.moves) {
        setMoveHistory(data.moves.map((san, i) => ({
          san, color: i % 2 === 0 ? 'w' : 'b',
        })));
      }
    };

    socket.on('chess:start', initFromData);
    socket.on('chess:state', initFromData);

    socket.on('chess:moved', (data: {
      board: Board; turn: 'w' | 'b'; timeWhite: number; timeBlack: number;
      san: string; color: string; isCheck: boolean;
    }) => {
      setBoard(data.board);
      setTurn(data.turn);
      setIsMyTurn(data.turn === playerColorRef.current);
      setTimeWhite(data.timeWhite);
      setTimeBlack(data.timeBlack);
      setMoveHistory(prev => [...prev, { san: data.san, color: data.color }]);
      setSelectedSquare(null);
      setValidMoves([]);
      setInCheck(data.isCheck);
    });

    socket.on('chess:valid_moves', (data: { moves: string[] }) => {
      setValidMoves(data.moves);
    });

    socket.on('chess:invalid_move', ({ message }: { message: string }) => {
      console.warn('Invalid move:', message);
    });

    socket.on('chess:game_over', ({ result: r, reason }: { result: string; reason: string }) => {
      setGameOver(true);
      setResult(`${r} - ${reason}`);
    });

    socket.on('chess:timer_update', ({ timeWhite: tw, timeBlack: tb }: { timeWhite: number; timeBlack: number }) => {
      setTimeWhite(tw);
      setTimeBlack(tb);
    });

    socket.on('chat:room_message', (msg: ChatMessage) => {
      setMessages(prev => [...prev, msg]);
    });

    // Use router state if available
    if (location.state?.white && location.state?.board) {
      initFromData(location.state as any);
    }

    // Request current state (race condition fix)
    socket.emit('chess:get_state', { code });

    return () => {
      socket.off('chess:start');
      socket.off('chess:state');
      socket.off('chess:moved');
      socket.off('chess:valid_moves');
      socket.off('chess:invalid_move');
      socket.off('chess:game_over');
      socket.off('chess:timer_update');
      socket.off('chat:room_message');
    };
  }, [socket, code]);

  const handleSquareClick = useCallback((row: number, col: number) => {
    if (gameOver || !socket || !code || !isMyTurn || showPromotion) return;

    const clickedAlg = squareToAlgebraic(row, col);
    const piece = board[row]?.[col];

    // If a square is selected and we clicked a valid move target
    if (selectedSquare) {
      const isValid = validMoves.includes(clickedAlg);
      if (isValid) {
        // Check for promotion (pawn reaching last rank)
        const [fromRow] = algebraicToSquare(selectedSquare);
        const fromPiece = board[fromRow]?.[algebraicToSquare(selectedSquare)[1]];
        const isPawn = fromPiece?.toLowerCase() === 'p';
        const isLastRank = (playerColor === 'w' && row === 0) || (playerColor === 'b' && row === 7);

        if (isPawn && isLastRank) {
          setShowPromotion({ from: selectedSquare, to: clickedAlg });
          return;
        }

        socket.emit('chess:move', { code, from: selectedSquare, to: clickedAlg });
        setSelectedSquare(null);
        setValidMoves([]);
        return;
      }
    }

    // Click on own piece — select it and request valid moves
    const myColorChar = playerColor;
    if (piece) {
      const pieceColor = piece === piece.toUpperCase() ? 'w' : 'b';
      if (pieceColor === myColorChar) {
        setSelectedSquare(clickedAlg);
        socket.emit('chess:get_moves', { code, position: clickedAlg });
        return;
      }
    }

    // Click on empty / opponent square without selection
    setSelectedSquare(null);
    setValidMoves([]);
  }, [board, selectedSquare, validMoves, isMyTurn, gameOver, socket, code, playerColor, showPromotion]);

  const handlePromotion = useCallback((piece: string) => {
    if (!showPromotion || !socket || !code) return;
    socket.emit('chess:move', {
      code,
      from: showPromotion.from,
      to: showPromotion.to,
      promotion: piece,
    });
    setShowPromotion(null);
    setSelectedSquare(null);
    setValidMoves([]);
  }, [showPromotion, socket, code]);

  const handleResign = () => {
    if (socket && code) socket.emit('chess:resign', { code });
  };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const sendMessage = () => {
    if (!messageText.trim() || !socket || !code) return;
    socket.emit('chat:room_message', { code, text: messageText.trim() });
    setMessages(prev => [...prev, {
      from: user?.username || 'You',
      text: messageText.trim(),
      timestamp: new Date().toISOString(),
    }]);
    setMessageText('');
  };

  // Find king position for check highlight
  const findKingSquare = (): string | null => {
    if (!inCheck || board.length === 0) return null;
    const kingPiece = turn === 'w' ? 'K' : 'k';
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        if (board[r][c] === kingPiece) return squareToAlgebraic(r, c);
      }
    }
    return null;
  };

  const kingInCheckSquare = findKingSquare();

  const renderBoard = () => {
    const flipped = playerColor === 'b';
    const rows = flipped ? [...Array(BOARD_SIZE).keys()].reverse() : [...Array(BOARD_SIZE).keys()];
    const cols = flipped ? [...Array(BOARD_SIZE).keys()].reverse() : [...Array(BOARD_SIZE).keys()];

    const displayFiles = flipped ? [...FILES].reverse() : FILES;

    return (
      <div className="inline-block">
        <div className="flex">
          {/* Rank labels column */}
          <div className="flex flex-col" style={{ width: 24 }}>
            {rows.map(row => (
              <div
                key={row}
                className="flex items-center justify-center text-xs font-medium text-muted-foreground"
                style={{ height: SQUARE_SIZE }}
              >
                {RANKS[row] /* RANKS[0]='8', RANKS[7]='1' — maps row index to rank */}
              </div>
            ))}
          </div>

          {/* Board */}
          <div className="border-2 border-foreground/20 rounded">
            {rows.map(row => (
              <div key={row} className="flex">
                {cols.map(col => {
                  const isLight = (row + col) % 2 === 0;
                  const piece = board[row]?.[col];
                  const alg = squareToAlgebraic(row, col);
                  const isSelected = selectedSquare === alg;
                  const isValid = validMoves.includes(alg);
                  const isKingCheck = kingInCheckSquare === alg;

                  return (
                    <div
                      key={col}
                      className={`relative flex items-center justify-center cursor-pointer transition-colors
                        ${isLight ? 'bg-amber-100' : 'bg-green-700'}
                        ${isSelected ? 'ring-2 ring-yellow-400 ring-inset' : ''}
                        ${isKingCheck ? 'bg-red-500/60' : ''}
                      `}
                      style={{ width: SQUARE_SIZE, height: SQUARE_SIZE }}
                      onClick={() => handleSquareClick(row, col)}
                    >
                      {piece && (
                        <ChessPiece piece={piece} size={SQUARE_SIZE - 8} />
                      )}
                      {isValid && !piece && (
                        <div className="w-4 h-4 rounded-full bg-black/25" />
                      )}
                      {isValid && piece && (
                        <div
                          className="absolute inset-0 rounded-sm"
                          style={{
                            background: 'radial-gradient(transparent 55%, rgba(0, 0, 0, 0.3) 55%)',
                          }}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>

        {/* File labels row */}
        <div className="flex" style={{ paddingLeft: 24 }}>
          {displayFiles.map(file => (
            <div
              key={file}
              className="flex items-center justify-center text-xs font-medium text-muted-foreground"
              style={{ width: SQUARE_SIZE, height: 20 }}
            >
              {file}
            </div>
          ))}
        </div>
      </div>
    );
  };

  const renderPromotionDialog = () => {
    if (!showPromotion) return null;

    const pieces = playerColor === 'w'
      ? ['Q', 'R', 'B', 'N']
      : ['q', 'r', 'b', 'n'];
    const promotionValues = ['q', 'r', 'b', 'n'];

    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
        <Card className="p-4">
          <CardContent className="flex flex-col items-center gap-3 pt-2">
            <p className="text-sm font-medium">{t('game.promotion', 'Choose promotion piece')}</p>
            <div className="flex gap-2">
              {pieces.map((piece, i) => (
                <button
                  key={piece}
                  className="w-16 h-16 flex items-center justify-center border-2 border-foreground/20 rounded hover:bg-accent transition-colors"
                  onClick={() => handlePromotion(promotionValues[i])}
                >
                  <ChessPiece piece={piece} size={48} />
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2 flex flex-col items-center gap-4">
        {/* Opponent timer */}
        <div className="text-2xl font-mono font-bold">
          {formatTime(playerColor === 'w' ? timeBlack : timeWhite)}
        </div>

        {board.length > 0 ? renderBoard() : (
          <div className="text-muted-foreground">{t('game.waiting')}</div>
        )}

        {/* Player timer */}
        <div className="text-2xl font-mono font-bold">
          {formatTime(playerColor === 'w' ? timeWhite : timeBlack)}
        </div>

        <div className="flex items-center gap-4">
          <Badge variant={isMyTurn ? 'default' : 'secondary'}>
            {isMyTurn ? t('game.yourTurn') : t('game.opponentTurn')}
          </Badge>
          <Badge variant="outline">
            {playerColor === 'w' ? t('game.white') : t('game.black')}
          </Badge>
          {inCheck && (
            <Badge variant="destructive">
              {t('game.check', 'Check!')}
            </Badge>
          )}
          {!gameOver && (
            <Button variant="destructive" size="sm" onClick={handleResign}>
              <Flag className="h-4 w-4 mr-1" />
              {t('game.resign')}
            </Button>
          )}
        </div>

        {gameOver && (
          <Card className="w-full max-w-md text-center">
            <CardContent className="py-6">
              <h2 className="text-2xl font-bold mb-2">{t('game.gameOver')}</h2>
              <p className="text-muted-foreground">{result}</p>
              <Button className="mt-4" onClick={() => navigate('/')}>
                {t('nav.home')}
              </Button>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Sidebar: Move History + Chat */}
      <div className="flex flex-col gap-4">
        {/* Move History */}
        <Card className="flex flex-col h-[280px]">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">{t('game.moveHistory', 'Move History')}</CardTitle>
          </CardHeader>
          <CardContent className="flex-1 overflow-hidden">
            <ScrollArea className="h-full">
              <div className="space-y-1 text-sm font-mono">
                {Array.from({ length: Math.ceil(moveHistory.length / 2) }).map((_, i) => {
                  const whiteMove = moveHistory[i * 2];
                  const blackMove = moveHistory[i * 2 + 1];
                  return (
                    <div key={i} className="flex gap-2">
                      <span className="text-muted-foreground w-8 text-right">{i + 1}.</span>
                      <span className="w-20 font-semibold">{whiteMove?.san || ''}</span>
                      <span className="w-20 text-muted-foreground">{blackMove?.san || ''}</span>
                    </div>
                  );
                })}
                <div ref={historyEndRef} />
              </div>
            </ScrollArea>
          </CardContent>
        </Card>

        {/* Chat */}
        <Card className="flex flex-col h-[300px]">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">Chat</CardTitle>
          </CardHeader>
          <CardContent className="flex-1 flex flex-col overflow-hidden min-h-0 pb-3">
            <ScrollArea className="flex-1 min-h-0 mb-3">
              <div className="space-y-2">
                {messages.map((msg, i) => (
                  <div key={i} className="text-sm">
                    <span className="font-medium">{msg.from}: </span>
                    <span className="text-muted-foreground">{msg.text}</span>
                  </div>
                ))}
              </div>
            </ScrollArea>
            <div className="flex gap-2">
              <Input
                value={messageText}
                onChange={e => setMessageText(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && sendMessage()}
                placeholder={t('friends.sendMessage')}
                className="flex-1"
              />
              <Button size="icon" onClick={sendMessage}>
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {renderPromotionDialog()}
    </div>
  );
}
