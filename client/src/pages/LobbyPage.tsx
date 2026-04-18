import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useSocket } from '@/context/SocketContext';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Plus, LogIn, Users, Lock, Globe } from 'lucide-react';
import type { Room, GameType } from '@/types/room';

export function LobbyPage() {
  const { t } = useTranslation();
  const { gameType } = useParams<{ gameType: string }>();
  const { socket } = useSocket();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [rooms, setRooms] = useState<Room[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [showJoinCode, setShowJoinCode] = useState(false);
  const [joinCode, setJoinCode] = useState('');
  const [isPublic, setIsPublic] = useState(true);
  const [maxPlayers, setMaxPlayers] = useState(8);
  const [timerMinutes, setTimerMinutes] = useState(10);
  const [rounds, setRounds] = useState(3);
  const [drawingTime, setDrawingTime] = useState(60);

  useEffect(() => {
    if (!socket || !gameType) return;

    socket.emit('lobby:join', { gameType });

    socket.on('lobby:rooms', (data: Room[]) => setRooms(data));
    socket.on('lobby:room_created', (room: Room) => {
      setRooms(prev => [room, ...prev]);
    });
    socket.on('lobby:room_updated', (room: Room) => {
      // For charades in_progress rooms with open slots — keep/add them in the list
      const isJoinableCharades = room.gameType === 'charades'
        && room.status === 'in_progress'
        && room.players.length < room.maxPlayers;
      const isJoinable = room.status === 'waiting' || room.status === 'host_away' || isJoinableCharades;

      setRooms(prev => {
        const exists = prev.some(r => r._id === room._id);
        if (!isJoinable) return prev.filter(r => r._id !== room._id);
        if (exists) return prev.map(r => r._id === room._id ? room : r);
        return [room, ...prev];
      });
    });
    socket.on('lobby:room_removed', ({ roomId }: { roomId: string }) => {
      setRooms(prev => prev.filter(r => r._id !== roomId));
    });

    socket.on('room:joined', ({ room }: { room: Room }) => {
      navigate(`/room/${room.code}`);
    });

    socket.on('room:joined_in_progress', ({ room }: { room: Room }) => {
      navigate(`/game/charades/${room.code}`);
    });

    socket.on('room:error', ({ message }: { message: string }) => {
      alert(message);
    });

    return () => {
      socket.emit('lobby:leave', { gameType });
      socket.off('lobby:rooms');
      socket.off('lobby:room_created');
      socket.off('lobby:room_updated');
      socket.off('lobby:room_removed');
      socket.off('room:joined');
      socket.off('room:joined_in_progress');
      socket.off('room:error');
    };
  }, [socket, gameType]);

  const handleCreate = () => {
    if (!socket || !gameType) return;
    socket.emit('room:create', {
      gameType: gameType as GameType,
      isPublic,
      maxPlayers: gameType === 'charades' ? maxPlayers : 2,
      ...(gameType === 'charades'
        ? { rounds, drawingTime }
        : { timerMinutes }),
    });
    setShowCreate(false);
  };

  const handleJoinByCode = () => {
    if (!socket || !joinCode.trim()) return;
    socket.emit('room:join', { code: joinCode.trim().toUpperCase() });
    setShowJoinCode(false);
    setJoinCode('');
  };

  const handleJoinRoom = (code: string) => {
    if (!socket) return;
    socket.emit('room:join', { code });
  };

  const gameNames: Record<string, string> = {
    chess: t('home.chess'),
    checkers: t('home.checkers'),
    charades: t('home.charades'),
  };

  if (!user) {
    navigate('/login');
    return null;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">
          {t('lobby.title', { game: gameNames[gameType || ''] || gameType })}
        </h1>
        <div className="flex gap-2">
          <Button onClick={() => setShowJoinCode(true)} variant="outline">
            <LogIn className="h-4 w-4 mr-2" />
            {t('lobby.joinByCode')}
          </Button>
          <Button onClick={() => setShowCreate(true)}>
            <Plus className="h-4 w-4 mr-2" />
            {t('lobby.createRoom')}
          </Button>
        </div>
      </div>

      {rooms.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-muted-foreground">{t('lobby.noRooms')}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {rooms.map(room => (
            <Card key={room._id} className="hover:shadow-md transition-shadow">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg flex items-center gap-2">
                    {room.isPublic ? <Globe className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
                    {room.code}
                  </CardTitle>
                  <Badge variant={room.players.length < room.maxPlayers ? 'default' : 'secondary'}>
                    <Users className="h-3 w-3 mr-1" />
                    {t('lobby.players', { current: room.players.length, max: room.maxPlayers })}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between">
                  <div className="text-sm text-muted-foreground">
                    {room.players.map(p => p.displayName).join(', ')}
                  </div>
                  <Button
                    size="sm"
                    onClick={() => handleJoinRoom(room.code)}
                    disabled={room.players.length >= room.maxPlayers}
                  >
                    {t('lobby.join')}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create Room Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('lobby.createRoom')}</DialogTitle>
            <DialogDescription>{gameNames[gameType || '']}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{t('lobby.visibility')}</Label>
              <div className="flex gap-2">
                <Button variant={isPublic ? 'default' : 'outline'} size="sm" onClick={() => setIsPublic(true)}>
                  <Globe className="h-4 w-4 mr-1" /> {t('lobby.public')}
                </Button>
                <Button variant={!isPublic ? 'default' : 'outline'} size="sm" onClick={() => setIsPublic(false)}>
                  <Lock className="h-4 w-4 mr-1" /> {t('lobby.private')}
                </Button>
              </div>
            </div>
            {gameType === 'charades' ? (
              <>
                <div className="space-y-2">
                  <Label>{t('lobby.maxPlayers')}</Label>
                  <Input
                    type="number"
                    min={2}
                    max={12}
                    value={maxPlayers}
                    onChange={e => setMaxPlayers(Number(e.target.value))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>{t('lobby.rounds')}</Label>
                  <Input
                    type="number"
                    min={1}
                    max={10}
                    value={rounds}
                    onChange={e => setRounds(Number(e.target.value))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>{t('lobby.drawingTime')}</Label>
                  <Input
                    type="number"
                    min={30}
                    max={120}
                    value={drawingTime}
                    onChange={e => setDrawingTime(Number(e.target.value))}
                  />
                </div>
              </>
            ) : (
              <div className="space-y-2">
                <Label>{t('lobby.timerMinutes')}</Label>
                <Input
                  type="number"
                  min={1}
                  max={60}
                  value={timerMinutes}
                  onChange={e => setTimerMinutes(Number(e.target.value))}
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button onClick={handleCreate}>{t('lobby.create')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Join by Code Dialog */}
      <Dialog open={showJoinCode} onOpenChange={setShowJoinCode}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('lobby.joinByCode')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{t('lobby.roomCode')}</Label>
              <Input
                value={joinCode}
                onChange={e => setJoinCode(e.target.value.toUpperCase())}
                onKeyDown={e => e.key === 'Enter' && handleJoinByCode()}
                placeholder="ABC123"
                maxLength={6}
              />
            </div>
          </div>
          <DialogFooter>
            <Button onClick={handleJoinByCode}>{t('lobby.join')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
