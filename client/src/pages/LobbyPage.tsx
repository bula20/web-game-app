import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useSocket } from '@/context/SocketContext';
import { useAuth } from '@/context/AuthContext';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Plus, LogIn, Users, Lock, Globe } from 'lucide-react';
import type { Room, GameType } from '@/types/room';

const GAME_META: Record<string, { icon: string; color: string }> = {
  chess:    { icon: '♞', color: '#D4ADFC' },
  checkers: { icon: '◉', color: '#BB90E8' },
  charades: { icon: '🎨', color: '#F0DCFF' },
};

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
  const [pendingAction, setPendingAction] = useState<null | (() => void)>(null);

  useEffect(() => {
    if (!socket || !gameType) return;
    socket.emit('lobby:join', { gameType });
    socket.on('lobby:rooms', (data: Room[]) => setRooms(data));
    socket.on('lobby:room_created', (room: Room) => setRooms(prev => [room, ...prev]));
    socket.on('lobby:room_updated', (room: Room) => {
      const isJoinableCharades = room.gameType === 'charades' && room.status === 'in_progress' && room.players.length < room.maxPlayers;
      const isJoinable = room.status === 'waiting' || room.status === 'host_away' || isJoinableCharades;
      setRooms(prev => {
        const exists = prev.some(r => r._id === room._id);
        if (!isJoinable) return prev.filter(r => r._id !== room._id);
        if (exists) return prev.map(r => r._id === room._id ? room : r);
        return [room, ...prev];
      });
    });
    socket.on('lobby:room_removed', ({ roomId }: { roomId: string }) => setRooms(prev => prev.filter(r => r._id !== roomId)));
    socket.on('room:joined', ({ room }: { room: Room }) => navigate(`/room/${room.code}`));
    socket.on('room:joined_in_progress', ({ room }: { room: Room }) => navigate(`/game/charades/${room.code}`));
    socket.on('room:error', ({ message }: { message: string }) => alert(message));
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

  const guardAgainstExistingRoom = (targetCode: string | null, action: () => void) => {
    if (user?.activeRoomCode && user.activeRoomCode !== targetCode) {
      setPendingAction(() => action);
      return;
    }
    action();
  };

  const confirmLeaveAndContinue = () => {
    if (!socket || !user?.activeRoomCode) return;
    socket.emit('room:leave', { code: user.activeRoomCode });
    const action = pendingAction;
    setPendingAction(null);
    setTimeout(() => action && action(), 50);
  };

  const handleCreate = () => {
    if (!socket || !gameType) return;
    const run = () => {
      socket.emit('room:create', {
        gameType: gameType as GameType,
        isPublic,
        maxPlayers: gameType === 'charades' ? maxPlayers : 2,
        ...(gameType === 'charades' ? { rounds, drawingTime } : { timerMinutes }),
      });
      setShowCreate(false);
    };
    guardAgainstExistingRoom(null, run);
  };

  const handleJoinByCode = () => {
    if (!socket || !joinCode.trim()) return;
    const code = joinCode.trim().toUpperCase();
    const run = () => { socket.emit('room:join', { code }); setShowJoinCode(false); setJoinCode(''); };
    guardAgainstExistingRoom(code, run);
  };

  const handleJoinRoom = (code: string) => {
    if (!socket) return;
    guardAgainstExistingRoom(code, () => socket.emit('room:join', { code }));
  };

  const gameNames: Record<string, string> = {
    chess: t('home.chess'), checkers: t('home.checkers'), charades: t('home.charades'),
  };

  if (!user) { navigate('/login'); return null; }

  const meta = GAME_META[gameType || 'chess'] || GAME_META.chess;

  return (
    <div>
      {/* Header */}
      <div className="pr-page-head">
        <div>
          <h1>{t('lobby.title', { game: gameNames[gameType || ''] || gameType })}</h1>
          <div className="pr-page-sub">
            {t('lobby.subtitle', 'Dołącz do pokoju lub stwórz własny')} · {rooms.length} {t('lobby.rooms', 'pokojów')}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="pr-btn pr-btn-secondary" onClick={() => setShowJoinCode(true)}>
            <LogIn size={15} /> {t('lobby.joinByCode')}
          </button>
          <button className="pr-btn pr-btn-primary" onClick={() => setShowCreate(true)}>
            <Plus size={15} /> {t('lobby.createRoom')}
          </button>
        </div>
      </div>

      {/* Room list */}
      {rooms.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--pr-text-muted)' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>{meta.icon}</div>
          <div style={{ fontFamily: 'var(--font-head)', fontSize: 16 }}>{t('lobby.noRooms')}</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {rooms.map(room => {
            const m = GAME_META[room.gameType] || GAME_META.chess;
            const full = room.players.length >= room.maxPlayers;
            return (
              <div
                key={room._id}
                className="pr-room-card"
                onClick={() => !full && handleJoinRoom(room.code)}
                style={{ opacity: full ? 0.6 : 1 }}
              >
                <div className="pr-room-icon">{m.icon}</div>

                <div style={{ minWidth: 0 }}>
                  <div style={{
                    fontFamily: 'var(--font-head)', fontWeight: 600, fontSize: 15,
                    display: 'flex', alignItems: 'center', gap: 8,
                    color: 'var(--pr-text-primary)',
                  }}>
                    {room.code}
                    {!room.isPublic && <Lock size={13} style={{ color: 'var(--pr-text-muted)' }} />}
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--pr-text-secondary)', marginTop: 2, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span>{t('room.host', 'Host')}: <span style={{ color: 'var(--pr-text-secondary)' }}>{room.players[0]?.displayName}</span></span>
                    <span>·</span>
                    <span style={{ textTransform: 'capitalize' }}>{t(`home.${room.gameType}`, room.gameType)}</span>
                    {room.gameType !== 'charades' && room.timerMinutes && (
                      <><span>·</span><span>{room.timerMinutes} min</span></>
                    )}
                  </div>
                </div>

                <div style={{ fontFamily: 'var(--font-head)', fontWeight: 600, color: 'var(--pr-accent)', fontSize: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Users size={13} style={{ color: 'var(--pr-text-muted)' }} />
                  {room.players.length}/{room.maxPlayers}
                </div>

                <button
                  className={`pr-btn pr-btn-sm ${full ? 'pr-btn-secondary' : 'pr-btn-primary'}`}
                  disabled={full}
                  onClick={e => { e.stopPropagation(); if (!full) handleJoinRoom(room.code); }}
                  style={{ opacity: full ? 0.5 : 1 }}
                >
                  {full ? t('lobby.full', 'Pełny') : t('lobby.join')}
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Create Room Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent style={{ background: 'linear-gradient(180deg,#141D6A,#0C134F)', border: '1px solid var(--pr-border-regular)', color: 'var(--pr-text-primary)' }}>
          <DialogHeader>
            <DialogTitle style={{ color: 'var(--pr-text-primary)', fontFamily: 'var(--font-head)' }}>{t('lobby.createRoom')}</DialogTitle>
            <DialogDescription style={{ color: 'var(--pr-text-muted)' }}>{gameNames[gameType || '']}</DialogDescription>
          </DialogHeader>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <Label style={{ color: 'var(--pr-text-secondary)', fontFamily: 'var(--font-head)', fontSize: 12, textTransform: 'uppercase', letterSpacing: '.08em' }}>
                {t('lobby.visibility')}
              </Label>
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <button className={`pr-btn pr-btn-sm ${isPublic ? 'pr-btn-primary' : 'pr-btn-secondary'}`} onClick={() => setIsPublic(true)}>
                  <Globe size={13} /> {t('lobby.public')}
                </button>
                <button className={`pr-btn pr-btn-sm ${!isPublic ? 'pr-btn-primary' : 'pr-btn-secondary'}`} onClick={() => setIsPublic(false)}>
                  <Lock size={13} /> {t('lobby.private')}
                </button>
              </div>
            </div>
            {gameType === 'charades' ? (
              <>
                <div>
                  <Label style={{ color: 'var(--pr-text-secondary)', fontFamily: 'var(--font-head)', fontSize: 12, textTransform: 'uppercase', letterSpacing: '.08em' }}>
                    {t('lobby.maxPlayers')}
                  </Label>
                  <Input type="number" min={2} max={12} value={maxPlayers} onChange={e => setMaxPlayers(Number(e.target.value))} className="mt-2" style={{ background: 'rgba(5,8,31,.6)', border: '1px solid var(--pr-border-regular)', color: 'var(--pr-text-primary)' }} />
                </div>
                <div>
                  <Label style={{ color: 'var(--pr-text-secondary)', fontFamily: 'var(--font-head)', fontSize: 12, textTransform: 'uppercase', letterSpacing: '.08em' }}>
                    {t('lobby.rounds')}
                  </Label>
                  <Input type="number" min={1} max={10} value={rounds} onChange={e => setRounds(Number(e.target.value))} className="mt-2" style={{ background: 'rgba(5,8,31,.6)', border: '1px solid var(--pr-border-regular)', color: 'var(--pr-text-primary)' }} />
                </div>
                <div>
                  <Label style={{ color: 'var(--pr-text-secondary)', fontFamily: 'var(--font-head)', fontSize: 12, textTransform: 'uppercase', letterSpacing: '.08em' }}>
                    {t('lobby.drawingTime')}
                  </Label>
                  <Input type="number" min={30} max={120} value={drawingTime} onChange={e => setDrawingTime(Number(e.target.value))} className="mt-2" style={{ background: 'rgba(5,8,31,.6)', border: '1px solid var(--pr-border-regular)', color: 'var(--pr-text-primary)' }} />
                </div>
              </>
            ) : (
              <div>
                <Label style={{ color: 'var(--pr-text-secondary)', fontFamily: 'var(--font-head)', fontSize: 12, textTransform: 'uppercase', letterSpacing: '.08em' }}>
                  {t('lobby.timerMinutes')}
                </Label>
                <Input type="number" min={1} max={60} value={timerMinutes} onChange={e => setTimerMinutes(Number(e.target.value))} className="mt-2" style={{ background: 'rgba(5,8,31,.6)', border: '1px solid var(--pr-border-regular)', color: 'var(--pr-text-primary)' }} />
              </div>
            )}
          </div>
          <DialogFooter>
            <button className="pr-btn pr-btn-ghost" onClick={() => setShowCreate(false)}>{t('lobby.cancel')}</button>
            <button className="pr-btn pr-btn-primary" onClick={handleCreate}>{t('lobby.create')}</button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Already-in-room dialog */}
      <Dialog open={!!pendingAction} onOpenChange={open => !open && setPendingAction(null)}>
        <DialogContent style={{ background: 'linear-gradient(180deg,#141D6A,#0C134F)', border: '1px solid var(--pr-border-regular)', color: 'var(--pr-text-primary)' }}>
          <DialogHeader>
            <DialogTitle style={{ color: 'var(--pr-text-primary)' }}>{t('lobby.alreadyInRoom')}</DialogTitle>
            <DialogDescription style={{ color: 'var(--pr-text-muted)' }}>
              {t('lobby.alreadyInRoomDesc', { code: user?.activeRoomCode || '' })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <button className="pr-btn pr-btn-ghost" onClick={() => setPendingAction(null)}>{t('lobby.cancel')}</button>
            <button className="pr-btn pr-btn-primary" onClick={confirmLeaveAndContinue}>{t('lobby.leaveAndJoin')}</button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Join by Code dialog */}
      <Dialog open={showJoinCode} onOpenChange={setShowJoinCode}>
        <DialogContent style={{ background: 'linear-gradient(180deg,#141D6A,#0C134F)', border: '1px solid var(--pr-border-regular)', color: 'var(--pr-text-primary)' }}>
          <DialogHeader>
            <DialogTitle style={{ color: 'var(--pr-text-primary)' }}>{t('lobby.joinByCode')}</DialogTitle>
          </DialogHeader>
          <div>
            <Label style={{ color: 'var(--pr-text-secondary)', fontFamily: 'var(--font-head)', fontSize: 12, textTransform: 'uppercase', letterSpacing: '.08em' }}>
              {t('lobby.roomCode')}
            </Label>
            <input
              className="pr-input"
              style={{ marginTop: 8 }}
              value={joinCode}
              onChange={e => setJoinCode(e.target.value.toUpperCase())}
              onKeyDown={e => e.key === 'Enter' && handleJoinByCode()}
              placeholder="ABC123"
              maxLength={6}
            />
          </div>
          <DialogFooter>
            <button className="pr-btn pr-btn-primary" onClick={handleJoinByCode}>{t('lobby.join')}</button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
