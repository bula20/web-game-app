// Lobby konkretnej gry (chess/checkers/charades). Pokazuje listę dostępnych
// publicznych pokojów, pozwala stworzyć nowy lub dołączyć po kodzie. Listę
// pokojów subskrybujemy przez socket (lobby:join), serwer wysyła aktualizacje
// (lobby:room_created/updated/removed) - dzięki temu UI reaguje live na zmiany.
// Jeśli user ma już aktywny pokój, zamiast przejścia pokazujemy dialog z pytaniem
// czy najpierw wyjść (guardAgainstExistingRoom).
import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Plus, LogIn, Users, Lock, X } from 'lucide-react';
import { useSocket } from '@/context/SocketContext';
import { useAuth } from '@/context/AuthContext';
import { CreateRoomDialog } from '@/components/room/CreateRoomDialog';
import { JoinByCodeDialog } from '@/components/room/JoinByCodeDialog';
import type { Room, GameType } from '@/types/room';

const GAME_META: Record<string, { icon: string; pl: string; en: string }> = {
  chess:    { icon: '♞', pl: 'Szachy',    en: 'Chess' },
  checkers: { icon: '◉', pl: 'Warcaby',   en: 'Checkers' },
  charades: { icon: '🎨', pl: 'Kalambury', en: 'Charades' },
};

export function LobbyPage() {
  const { t, i18n } = useTranslation();
  const { gameType } = useParams<{ gameType: string }>();
  const { socket } = useSocket();
  const { user } = useAuth();
  const navigate = useNavigate();
  const isPl = i18n.language === 'pl';

  const [rooms, setRooms] = useState<Room[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [showJoinCode, setShowJoinCode] = useState(false);
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

  const handleJoinRoom = (code: string) => {
    if (!socket) return;
    guardAgainstExistingRoom(code, () => socket.emit('room:join', { code }));
  };

  if (!user) { navigate('/login'); return null; }

  const meta = GAME_META[gameType || 'chess'] || GAME_META.chess;
  const gameLabel = isPl ? meta.pl : meta.en;

  return (
    <div>
      {/* Header */}
      <div className="pr-page-head">
        <div>
          <h1>{t('lobby.title', { game: gameLabel })}</h1>
          <div className="pr-page-sub">
            {t('lobby.subtitle', 'Dołącz do pokoju lub stwórz własny')} · {rooms.length} {t('lobby.rooms', 'pokojów')}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="pr-btn pr-btn-secondary" onClick={() => setShowJoinCode(true)}>
            <LogIn size={15} /> {t('lobby.joinByCode', 'Dołącz po kodzie')}
          </button>
          <button className="pr-btn pr-btn-primary" onClick={() => setShowCreate(true)}>
            <Plus size={15} /> {t('lobby.createRoom', 'Stwórz pokój')}
          </button>
        </div>
      </div>

      {/* Room list */}
      {rooms.length === 0 ? (
        <div className="pr-card" style={{ textAlign: 'center', padding: '48px 24px', color: 'var(--pr-text-muted)' }}>
          <div style={{ fontSize: 44, marginBottom: 14 }}>{meta.icon}</div>
          <div style={{ fontFamily: 'var(--font-head)', fontSize: 17, color: 'rgba(255,247,232,0.78)', marginBottom: 6 }}>
            {t('lobby.noRooms', 'Brak otwartych pokoi')}
          </div>
          <div style={{ fontSize: 14 }}>
            {t('lobby.noRoomsHint', 'Stwórz pierwszy pokój i zaproś znajomych.')}
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }} className="fade-up-stagger">
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
                    fontFamily: 'var(--font-head)', fontWeight: 700, fontSize: 16,
                    display: 'flex', alignItems: 'center', gap: 8,
                    color: 'var(--pr-light)',
                    letterSpacing: '0.04em',
                  }}>
                    {room.code}
                    {!room.isPublic && <Lock size={13} style={{ color: 'var(--pr-text-muted)' }} />}
                  </div>
                  <div style={{ fontSize: 13, color: 'rgba(255,247,232,0.62)', marginTop: 3, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span>
                      {t('room.host', 'Host')}: <span style={{ color: 'rgba(255,247,232,0.82)' }}>{room.players[0]?.displayName}</span>
                    </span>
                    <span>·</span>
                    <span>{isPl ? (GAME_META[room.gameType]?.pl) : (GAME_META[room.gameType]?.en)}</span>
                    {room.gameType !== 'charades' && room.timerMinutes && (
                      <><span>·</span><span>{room.timerMinutes} min</span></>
                    )}
                  </div>
                </div>

                <div style={{
                  fontFamily: 'var(--font-head)', fontWeight: 700,
                  color: full ? 'var(--pr-text-muted)' : 'var(--pr-accent)',
                  fontSize: 14, display: 'flex', alignItems: 'center', gap: 6,
                }}>
                  <Users size={14} style={{ color: 'var(--pr-text-muted)' }} />
                  {room.players.length}/{room.maxPlayers}
                </div>

                <button
                  className={`pr-btn pr-btn-sm ${full ? 'pr-btn-secondary' : 'pr-btn-primary'}`}
                  disabled={full}
                  onClick={e => { e.stopPropagation(); if (!full) handleJoinRoom(room.code); }}
                  style={{ opacity: full ? 0.5 : 1 }}
                >
                  {full ? t('lobby.full', 'Pełny') : t('lobby.join', 'Dołącz')}
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Create Room Dialog (game type locked to current lobby) */}
      <CreateRoomDialog
        open={showCreate}
        onOpenChange={setShowCreate}
        gameType={gameType as GameType}
      />

      {/* Join by Code Dialog */}
      <JoinByCodeDialog open={showJoinCode} onOpenChange={setShowJoinCode} />

      {/* Already-in-room dialog */}
      {pendingAction && (
        <div className="pr-modal-backdrop" onClick={() => setPendingAction(null)}>
          <div className="pr-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 460 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16 }}>
              <div>
                <h2 style={{ fontSize: 22, marginBottom: 4 }}>{t('lobby.alreadyInRoom', 'Jesteś już w pokoju')}</h2>
                <p style={{ color: 'var(--pr-text-muted)', fontSize: 14, lineHeight: 1.55 }}>
                  {t('lobby.alreadyInRoomDesc', { code: user?.activeRoomCode || '' })}
                </p>
              </div>
              <button
                onClick={() => setPendingAction(null)}
                aria-label="Close"
                style={{ background: 'transparent', border: 'none', color: 'var(--pr-text-muted)', padding: 6, cursor: 'pointer', display: 'flex' }}
              >
                <X size={18} />
              </button>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button className="pr-btn pr-btn-ghost" onClick={() => setPendingAction(null)}>
                {t('lobby.cancel', 'Anuluj')}
              </button>
              <button className="pr-btn pr-btn-primary" onClick={confirmLeaveAndContinue}>
                {t('lobby.leaveAndJoin', 'Opuść i dołącz')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
