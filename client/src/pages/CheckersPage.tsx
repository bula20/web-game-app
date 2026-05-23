// Strona rozgrywki w warcaby. Logika analogiczna do ChessPage: dwustopniowy ruch
// (get_moves -> move), plansza obracana zależnie od koloru, race-condition fix
// przez router state. Specyfika warcabów: bicia są wymuszone, multi-capture
// (po biciu możesz dalej bić tym samym pionkiem), promocja na damkę przy
// dotarciu do końca planszy. Detale logiki rozstrzyga serwer (checkersHandler),
// klient tylko wysyła czytelne zdarzenia i renderuje stan.
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
import { DisconnectBanner } from '@/components/DisconnectBanner';
import type { ChatMessage } from '@/types/game';

type Piece = null | 'w' | 'b' | 'W' | 'B'; // lowercase=regular, uppercase=king
type Board = Piece[][];

const BOARD_SIZE = 8;
const SQUARE_SIZE = 78;

export function CheckersPage() {
  const { t } = useTranslation();
  const { code } = useParams<{ code: string }>();
  const { socket } = useSocket();
  const { user, setActiveRoomCode } = useAuth();
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
  const [mobileView, setMobileView] = useState<'board' | 'chat'>('board');

  const playerColorRef = useRef(playerColor);
  useEffect(() => { playerColorRef.current = playerColor; }, [playerColor]);

  const boardContainerRef = useRef<HTMLDivElement>(null);
  const [squareSize, setSquareSize] = useState(SQUARE_SIZE);
  const historyEndRef = useRef<HTMLDivElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = boardContainerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => {
      const { width, height } = e.contentRect;
      const byW = Math.floor((width - 4) / 8);
      const byH = Math.floor((height - 4) / 8);
      setSquareSize(Math.max(38, Math.min(SQUARE_SIZE, byW, byH)));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

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
      setActiveRoomCode(null);
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
      initFromData(location.state as Parameters<typeof initFromData>[0]);
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
    setActiveRoomCode(null);
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
      <div className="pr-board-frame inline-block">
        <div style={{ borderRadius: 8, overflow: 'hidden', boxShadow: '0 0 0 1px rgba(217,227,240,0.18)' }}>
          {rows.map(row => (
            <div key={row} className="flex">
              {cols.map(col => {
                const isDark = (row + col) % 2 === 1;
                const piece = board[row]?.[col];
                const isSelected = selectedSquare?.[0] === row && selectedSquare?.[1] === col;
                const isValid = validMoves.some(([r, c]) => r === row && c === col);

                const baseBg = isDark ? '#0E3270' : '#FFF7E8';
                const ring = isSelected
                  ? 'inset 0 0 0 3px var(--pr-primary)'
                  : isValid
                    ? 'inset 0 0 0 3px var(--pr-accent)'
                    : 'none';

                return (
                  <div
                    key={col}
                    className="relative flex items-center justify-center cursor-pointer"
                    style={{
                      width: squareSize, height: squareSize,
                      background: baseBg, boxShadow: ring,
                      transition: 'background-color .12s',
                    }}
                    onClick={() => handleSquareClick(row, col)}
                  >
                    {piece && (
                      <div
                        style={{
                          width: squareSize - 16, height: squareSize - 16,
                          borderRadius: '50%',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontFamily: 'var(--font-head)', fontWeight: 800, fontSize: 16,
                          background: piece.toLowerCase() === 'w'
                            ? 'linear-gradient(180deg, #FFFFFF, #E5E7EB)'
                            : 'linear-gradient(180deg, #1F2937, #0B1220)',
                          border: piece.toLowerCase() === 'w'
                            ? '2px solid rgba(0,0,0,0.18)'
                            : '2px solid rgba(255,255,255,0.18)',
                          color: piece.toLowerCase() === 'w' ? '#0B1220' : '#FFF7E8',
                          boxShadow: '0 4px 10px rgba(0,0,0,0.30)',
                        }}
                      >
                        {piece === piece.toUpperCase() ? 'K' : ''}
                      </div>
                    )}
                    {isValid && !piece && (
                      <div style={{
                        width: 14, height: 14, borderRadius: '50%',
                        background: 'rgba(126,211,33,0.55)',
                      }} />
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="pr-game-root flex h-full gap-4 overflow-hidden">
      <div className="pr-game-tabs">
        <button
          className={`pr-game-tab ${mobileView === 'board' ? 'is-active' : ''}`}
          onClick={() => setMobileView('board')}
        >
          {t('game.tabBoard', 'Plansza')}
        </button>
        <button
          className={`pr-game-tab ${mobileView === 'chat' ? 'is-active' : ''}`}
          onClick={() => setMobileView('chat')}
        >
          {t('game.tabChat', 'Czat')}
        </button>
      </div>
      <div
        className="pr-game-board-col flex flex-col items-center gap-2 flex-1 min-w-0 overflow-hidden py-1"
        data-mobile-hidden={mobileView !== 'board'}
      >
        <div className="w-full shrink-0">
          <DisconnectBanner />
        </div>
        <div className="text-xl font-mono font-bold shrink-0">
          {formatTime(playerColor === 'w' ? timeBlack : timeWhite)}
        </div>

        <div ref={boardContainerRef} className="flex-1 w-full flex items-center justify-center min-h-0">
          {board.length > 0 ? renderBoard() : (
            <div className="text-muted-foreground">{t('game.waiting')}</div>
          )}
        </div>

        <div className="text-xl font-mono font-bold shrink-0">
          {formatTime(playerColor === 'w' ? timeWhite : timeBlack)}
        </div>

        <div className="flex items-center gap-3 shrink-0 flex-wrap justify-center pb-1">
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

        {gameOver && (() => {
          const [winner, reason] = result.split(' - ');
          const isWin = (winner === 'white' && playerColor === 'w') || (winner === 'black' && playerColor === 'b');
          const isDraw = winner === 'draw';
          return (
            <div style={{
              position: 'fixed', inset: 0, zIndex: 60,
              background: 'rgba(4,18,43,0.78)', backdropFilter: 'blur(6px)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <div className="pr-card" style={{
                width: 'min(380px, 92vw)', textAlign: 'center', padding: '48px 40px',
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16,
              }}>
                <h2 style={{
                  fontFamily: 'var(--font-head)', fontWeight: 800, fontSize: 32,
                  color: isWin ? 'var(--pr-accent)' : isDraw ? 'var(--pr-light)' : '#FCA5A5',
                  margin: 0,
                }}>
                  {isWin ? t('game.youWin') : isDraw ? t('game.draw') : t('game.youLose')}
                </h2>
                {reason && (
                  <p style={{ color: 'var(--pr-text-secondary)', fontSize: 15, margin: 0 }}>
                    {isDraw
                      ? t(`game.reason.${reason}`, reason)
                      : t(
                          `game.reason.${reason}_${isWin ? 'win' : 'loss'}`,
                          t(`game.reason.${reason}`, reason),
                        )}
                  </p>
                )}
                <button className="pr-btn pr-btn-primary" style={{ marginTop: 8, width: '100%' }} onClick={() => navigate('/')}>
                  {t('game.backHome')}
                </button>
              </div>
            </div>
          );
        })()}
      </div>

      {/* Sidebar: Move History + Chat */}
      <div
        className="pr-game-side-col flex flex-col gap-4 w-80 shrink-0 h-full min-h-0"
        data-mobile-hidden={mobileView !== 'chat'}
      >
        {/* Move History */}
        <Card className="flex flex-col flex-1 min-h-0">
          <CardHeader className="pb-2 shrink-0">
            <CardTitle className="text-base">{t('game.moveHistory', 'Move History')}</CardTitle>
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
        <Card className="flex flex-col h-72 shrink-0">
          <CardHeader className="pb-2 shrink-0">
            <CardTitle className="text-base">Chat</CardTitle>
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
