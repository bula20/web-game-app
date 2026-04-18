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
import type { ChatMessage } from '@/types/game';

type Piece = null | 'w' | 'b' | 'W' | 'B'; // lowercase=regular, uppercase=king
type Board = Piece[][];

const BOARD_SIZE = 8;
const SQUARE_SIZE = 64;

export function CheckersPage() {
  const { t } = useTranslation();
  const { code } = useParams<{ code: string }>();
  const { socket } = useSocket();
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [board, setBoard] = useState<Board>([]);
  const [playerColor, setPlayerColor] = useState<'w' | 'b'>('w');
  const [selectedSquare, setSelectedSquare] = useState<[number, number] | null>(null);
  const [validMoves, setValidMoves] = useState<[number, number][]>([]);
  const [isMyTurn, setIsMyTurn] = useState(false);
  const [timeWhite, setTimeWhite] = useState(600);
  const [timeBlack, setTimeBlack] = useState(600);
  const [gameOver, setGameOver] = useState(false);
  const [result, setResult] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [messageText, setMessageText] = useState('');
  const [moveHistory, setMoveHistory] = useState<{ move: string; color: 'w' | 'b' }[]>([]);

  const playerColorRef = useRef(playerColor);
  playerColorRef.current = playerColor;

  const historyEndRef = useRef<HTMLDivElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll move history to bottom
  useEffect(() => {
    historyEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [moveHistory]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (!socket || !code) return;

    const initFromData = (data: { board: Board; playerColor: 'w' | 'b'; turn?: 'w' | 'b'; times: { white: number; black: number }; moves?: string[] }) => {
      setBoard(data.board);
      setPlayerColor(data.playerColor);
      const turn = data.turn ?? 'w';
      setIsMyTurn(turn === data.playerColor);
      setTimeWhite(data.times.white);
      setTimeBlack(data.times.black);
      if (data.moves) {
        setMoveHistory(data.moves.map((m, i) => ({
          move: m, color: i % 2 === 0 ? 'w' as const : 'b' as const,
        })));
      }
    };

    socket.on('checkers:start', initFromData);
    socket.on('checkers:state', initFromData);

    socket.on('checkers:moved', (data: { board: Board; turn: 'w' | 'b'; times: { white: number; black: number }; lastMove?: string; moveBy?: 'w' | 'b' }) => {
      setBoard(data.board);
      setIsMyTurn(data.turn === playerColorRef.current);
      setTimeWhite(data.times.white);
      setTimeBlack(data.times.black);
      setSelectedSquare(null);
      setValidMoves([]);
      if (data.lastMove && data.moveBy) {
        setMoveHistory(prev => [...prev, { move: data.lastMove!, color: data.moveBy! }]);
      }
    });

    socket.on('checkers:valid_moves', (data: { moves: [number, number][] }) => {
      setValidMoves(data.moves);
    });

    socket.on('checkers:game_over', ({ result: r, reason }: { result: string; reason: string }) => {
      setGameOver(true);
      setResult(`${r} - ${reason}`);
    });

    socket.on('checkers:timer_update', ({ white, black }: { white: number; black: number }) => {
      setTimeWhite(white);
      setTimeBlack(black);
    });

    socket.on('chat:room_message', (msg: ChatMessage) => {
      setMessages(prev => [...prev, msg]);
    });

    // Use router state if available (passed from RoomPage) for instant init
    if (location.state?.board && location.state?.playerColor) {
      initFromData(location.state as any);
    }

    // Request current game state (handles race condition where checkers:start was missed)
    socket.emit('checkers:get_state', { code });

    return () => {
      socket.off('checkers:start');
      socket.off('checkers:state');
      socket.off('checkers:moved');
      socket.off('checkers:valid_moves');
      socket.off('checkers:game_over');
      socket.off('checkers:timer_update');
      socket.off('chat:room_message');
    };
  }, [socket, code]);

  const handleSquareClick = useCallback((row: number, col: number) => {
    if (gameOver || !socket || !code || !isMyTurn) return;

    const piece = board[row]?.[col];

    if (selectedSquare) {
      const isValid = validMoves.some(([r, c]) => r === row && c === col);
      if (isValid) {
        socket.emit('checkers:move', {
          code,
          from: selectedSquare,
          to: [row, col],
        });
        setSelectedSquare(null);
        setValidMoves([]);
        return;
      }
    }

    if (piece && piece.toLowerCase() === playerColor) {
      setSelectedSquare([row, col]);
      socket.emit('checkers:get_moves', { code, position: [row, col] });
    } else {
      setSelectedSquare(null);
      setValidMoves([]);
    }
  }, [board, selectedSquare, validMoves, isMyTurn, gameOver, socket, code, playerColor]);

  const handleResign = () => {
    if (socket && code) socket.emit('checkers:resign', { code });
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

  const formatCheckerMove = (move: string): string => {
    const [from, to] = move.split('-');
    return `${from} \u2192 ${to}`;
  };

  const renderBoard = () => {
    const flipped = playerColor === 'b';
    const rows = flipped ? [...Array(BOARD_SIZE).keys()].reverse() : [...Array(BOARD_SIZE).keys()];
    const cols = flipped ? [...Array(BOARD_SIZE).keys()].reverse() : [...Array(BOARD_SIZE).keys()];

    return (
      <div className="border-2 border-foreground/20 rounded inline-block">
        {rows.map(row => (
          <div key={row} className="flex">
            {cols.map(col => {
              const isDark = (row + col) % 2 === 1;
              const piece = board[row]?.[col];
              const isSelected = selectedSquare?.[0] === row && selectedSquare?.[1] === col;
              const isValid = validMoves.some(([r, c]) => r === row && c === col);

              return (
                <div
                  key={col}
                  className={`relative flex items-center justify-center cursor-pointer transition-colors
                    ${isDark ? 'bg-amber-800' : 'bg-amber-100'}
                    ${isSelected ? 'ring-2 ring-yellow-400 ring-inset' : ''}
                    ${isValid ? 'ring-2 ring-green-400 ring-inset' : ''}
                  `}
                  style={{ width: SQUARE_SIZE, height: SQUARE_SIZE }}
                  onClick={() => handleSquareClick(row, col)}
                >
                  {piece && (
                    <div
                      className={`rounded-full border-2 flex items-center justify-center text-sm font-bold
                        ${piece.toLowerCase() === 'w'
                          ? 'bg-gray-100 border-gray-300 text-gray-800'
                          : 'bg-gray-800 border-gray-600 text-gray-100'}
                      `}
                      style={{ width: SQUARE_SIZE - 16, height: SQUARE_SIZE - 16 }}
                    >
                      {piece === piece.toUpperCase() ? 'K' : ''}
                    </div>
                  )}
                  {isValid && !piece && (
                    <div className="w-4 h-4 rounded-full bg-green-400/50" />
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2 flex flex-col items-center gap-4">
        <div className="text-2xl font-mono font-bold">
          {formatTime(playerColor === 'w' ? timeBlack : timeWhite)}
        </div>

        {board.length > 0 ? renderBoard() : (
          <div className="text-muted-foreground">{t('game.waiting')}</div>
        )}

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
                {moveHistory.map((entry, i) => (
                  <div key={i} className="flex gap-2">
                    <span className="text-muted-foreground w-8 text-right">{i + 1}.</span>
                    <span className={entry.color === 'w' ? 'font-semibold' : 'text-muted-foreground'}>
                      {formatCheckerMove(entry.move)}
                    </span>
                    <Badge variant="outline" className="text-xs h-5">
                      {entry.color === 'w' ? t('game.white') : t('game.black')}
                    </Badge>
                  </div>
                ))}
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
                <div ref={chatEndRef} />
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
    </div>
  );
}
