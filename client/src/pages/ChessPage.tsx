import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Chessboard } from 'react-chessboard';
import { Chess } from 'chess.js';
import { useSocket } from '@/context/SocketContext';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Send, Flag } from 'lucide-react';
import type { ChatMessage } from '@/types/game';

export function ChessPage() {
  const { t } = useTranslation();
  const { code } = useParams<{ code: string }>();
  const { socket } = useSocket();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [game, setGame] = useState(new Chess());
  const [playerColor, setPlayerColor] = useState<'white' | 'black'>('white');
  const [timeWhite, setTimeWhite] = useState(600);
  const [timeBlack, setTimeBlack] = useState(600);
  const [gameOver, setGameOver] = useState(false);
  const [result, setResult] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [messageText, setMessageText] = useState('');

  useEffect(() => {
    if (!socket || !code) return;

    socket.on('chess:start', (data: { white: string; black: string; fen: string; timeWhite: number; timeBlack: number }) => {
      const newGame = new Chess(data.fen);
      setGame(newGame);
      setTimeWhite(data.timeWhite);
      setTimeBlack(data.timeBlack);
      setPlayerColor(data.white === socket.id ? 'white' : 'black');
    });

    socket.on('chess:moved', (data: { from: string; to: string; fen: string; timeWhite: number; timeBlack: number }) => {
      const newGame = new Chess(data.fen);
      setGame(newGame);
      setTimeWhite(data.timeWhite);
      setTimeBlack(data.timeBlack);
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

    return () => {
      socket.off('chess:start');
      socket.off('chess:moved');
      socket.off('chess:invalid_move');
      socket.off('chess:game_over');
      socket.off('chess:timer_update');
      socket.off('chat:room_message');
    };
  }, [socket, code]);

  const onDrop = useCallback((sourceSquare: string, targetSquare: string) => {
    if (gameOver || !socket || !code) return false;

    const isMyTurn = (game.turn() === 'w' && playerColor === 'white') ||
                     (game.turn() === 'b' && playerColor === 'black');
    if (!isMyTurn) return false;

    // Check if promotion
    const piece = game.get(sourceSquare as any);
    const isPromotion = piece?.type === 'p' &&
      ((piece.color === 'w' && targetSquare[1] === '8') ||
       (piece.color === 'b' && targetSquare[1] === '1'));

    socket.emit('chess:move', {
      code,
      from: sourceSquare,
      to: targetSquare,
      promotion: isPromotion ? 'q' : undefined,
    });

    return true;
  }, [game, playerColor, gameOver, socket, code]);

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

  const isMyTurn = (game.turn() === 'w' && playerColor === 'white') ||
                   (game.turn() === 'b' && playerColor === 'black');

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2 flex flex-col items-center gap-4">
        {/* Opponent timer */}
        <div className="text-2xl font-mono font-bold">
          {formatTime(playerColor === 'white' ? timeBlack : timeWhite)}
        </div>

        <div className="w-full max-w-[600px]">
          <Chessboard
            position={game.fen()}
            onPieceDrop={onDrop}
            boardOrientation={playerColor}
            boardWidth={Math.min(600, typeof window !== 'undefined' ? window.innerWidth - 32 : 600)}
          />
        </div>

        {/* Player timer */}
        <div className="text-2xl font-mono font-bold">
          {formatTime(playerColor === 'white' ? timeWhite : timeBlack)}
        </div>

        <div className="flex items-center gap-4">
          <Badge variant={isMyTurn ? 'default' : 'secondary'}>
            {isMyTurn ? t('game.yourTurn') : t('game.opponentTurn')}
          </Badge>
          <Badge variant="outline">
            {playerColor === 'white' ? t('game.white') : t('game.black')}
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

      {/* Chat */}
      <Card className="flex flex-col h-[600px]">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Chat</CardTitle>
        </CardHeader>
        <CardContent className="flex-1 flex flex-col">
          <ScrollArea className="flex-1 mb-3">
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
  );
}
