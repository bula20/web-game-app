import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useSocket } from '@/context/SocketContext';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Users, Copy, Send, LogOut } from 'lucide-react';
import { toast } from 'sonner';
import type { Room, RoomPlayer } from '@/types/room';
import type { ChatMessage } from '@/types/game';

export function RoomPage() {
  const { t } = useTranslation();
  const { code } = useParams<{ code: string }>();
  const { socket } = useSocket();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [room, setRoom] = useState<Room | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [messageText, setMessageText] = useState('');
  const [hostAwaySeconds, setHostAwaySeconds] = useState<number | null>(null);

  // Countdown timer for host_away banner
  useEffect(() => {
    if (hostAwaySeconds === null || hostAwaySeconds <= 0) return;
    const timer = setInterval(() => {
      setHostAwaySeconds(s => (s !== null && s > 0) ? s - 1 : null);
    }, 1000);
    return () => clearInterval(timer);
  }, [hostAwaySeconds !== null]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!socket || !code) return;

    socket.on('room:player_joined', ({ player }: { player: RoomPlayer }) => {
      setRoom(prev => prev ? { ...prev, players: [...prev.players, player] } : prev);
    });

    socket.on('room:player_left', ({ socketId }: { socketId: string }) => {
      setRoom(prev => prev ? { ...prev, players: prev.players.filter(p => p.socketId !== socketId) } : prev);
    });

    socket.on('room:host_away', ({ expiresIn }: { expiresIn: number }) => {
      setHostAwaySeconds(expiresIn);
    });

    socket.on('room:host_returned', () => {
      setHostAwaySeconds(null);
    });

    socket.on('room:host_changed', ({ newHostSocketId, newHostName }: { newHostSocketId: string; newHostName: string }) => {
      setHostAwaySeconds(null);
      if (newHostSocketId === socket.id) {
        toast.success('Jesteś teraz hostem pokoju!');
      } else {
        toast.info(`Nowy host: ${newHostName}`);
      }
      // Refresh room data
      fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3001'}/api/rooms/${code}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      })
        .then(res => res.json())
        .then(data => setRoom(data))
        .catch(() => {});
    });

    socket.on('room:closed', () => {
      toast.error('Pokój został zamknięty');
      navigate('/');
    });

    socket.on('chat:room_message', (msg: ChatMessage) => {
      setMessages(prev => [...prev, msg]);
    });

    // Game start events will navigate to the game page
    socket.on('chess:start', (data: any) => navigate(`/game/chess/${code}`, { state: data }));
    socket.on('checkers:start', (data: any) => navigate(`/game/checkers/${code}`, { state: data }));
    socket.on('charades:start', (data: any) => navigate(`/game/charades/${code}`, { state: data }));
    // Joined a charades game already in progress
    socket.on('room:joined_in_progress', () => navigate(`/game/charades/${code}`));

    // Fetch room data
    fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3001'}/api/rooms/${code}`, {
      headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
    })
      .then(res => res.json())
      .then(data => setRoom(data))
      .catch(() => navigate('/'));

    return () => {
      socket.off('room:player_joined');
      socket.off('room:player_left');
      socket.off('room:host_away');
      socket.off('room:host_returned');
      socket.off('room:host_changed');
      socket.off('room:closed');
      socket.off('chat:room_message');
      socket.off('chess:start');
      socket.off('checkers:start');
      socket.off('charades:start');
      socket.off('room:joined_in_progress');
    };
  }, [socket, code]);

  const handleLeave = () => {
    if (socket && code) {
      socket.emit('room:leave', { code });
    }
    navigate('/');
  };

  const handleStartGame = () => {
    if (!socket || !code || !room) return;
    socket.emit('game:start', { code });
  };

  const sendMessage = () => {
    if (!messageText.trim() || !socket || !code) return;
    socket.emit('chat:room_message', { code, text: messageText.trim() });
    setMessages(prev => [...prev, {
      from: user?.username || 'You',
      fromId: user?.id,
      text: messageText.trim(),
      timestamp: new Date().toISOString(),
    }]);
    setMessageText('');
  };

  const copyCode = () => {
    if (code) navigator.clipboard.writeText(code);
  };

  const isHost = room && socket && room.players[0]?.socketId === socket.id;
  const canStart = room && room.players.length >= 2 && room.status === 'waiting';

  if (!room) {
    return <div className="text-center py-12 text-muted-foreground">{t('app.loading')}</div>;
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Room info */}
      <div className="lg:col-span-2 space-y-4">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                {t('room.code', { code: room.code })}
              </CardTitle>
              <Button variant="outline" size="sm" onClick={copyCode}>
                <Copy className="h-4 w-4 mr-1" />
                Copy
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Badge>{room.gameType}</Badge>
                <Badge variant="outline">
                  {t('lobby.players', { current: room.players.length, max: room.maxPlayers })}
                </Badge>
              </div>

              {hostAwaySeconds !== null && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-md p-3 text-sm text-yellow-800">
                  ⚠️ Host opuścił pokój. Zostanie przekazany lub zamknięty za{' '}
                  <span className="font-bold">{hostAwaySeconds}s</span>.
                </div>
              )}

              <div className="space-y-2">
                {room.players.map((player, i) => (
                  <div key={i} className="flex items-center gap-2 p-2 rounded bg-muted">
                    <div className="h-8 w-8 rounded-full bg-primary/20 flex items-center justify-center text-sm font-medium">
                      {player.displayName[0]?.toUpperCase()}
                    </div>
                    <span className="font-medium">{player.displayName}</span>
                    {i === 0 && <Badge variant="secondary">{t('room.host')}</Badge>}
                  </div>
                ))}
              </div>

              <p className="text-sm text-muted-foreground">{t('lobby.waiting')}</p>

              <div className="flex gap-2">
                {isHost && (
                  <Button onClick={handleStartGame} disabled={!canStart}>
                    {t('room.start')}
                  </Button>
                )}
                <Button variant="destructive" className="text-white" onClick={handleLeave}>
                  <LogOut className="h-4 w-4 mr-1" />
                  {t('room.leave')}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Chat */}
      <Card className="flex flex-col h-[500px]">
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
