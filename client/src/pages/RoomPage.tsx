// Strona pokoju gry (poczekalnia). Pokazuje listę graczy, czat, przycisk "Start"
// (tylko dla hosta, gdy wszyscy są w pokoju), banner "host away" z countdownem.
//
// Race-condition fix przy starcie gry: gdy host wciska "Start", serwer wysyła
// chess:start / checkers:start / charades:start do wszystkich graczy. Tu
// nasłuchujemy tych eventów i NAVIGUJEMY na stronę gry, przekazując dane przez
// router state (drugi argument navigate) - dzięki temu strona gry dostaje
// początkowy stan natychmiast, bez czekania na drugi event po mountcie.
import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useSocket } from '@/context/SocketContext';
import { useAuth } from '@/context/AuthContext';
import { Copy, Send, LogOut, Clock, Users, Globe, Lock } from 'lucide-react';
import { avatarClass, avatarImgSrc } from '@/lib/avatar';
import { toast } from 'sonner';
import { DisconnectBanner } from '@/components/DisconnectBanner';
import type { Room, RoomPlayer } from '@/types/room';
import type { ChatMessage } from '@/types/game';

const GAME_ICONS: Record<string, string> = {
  chess: '♞', checkers: '◉', charades: '🎨',
};

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
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

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
    socket.on('room:host_returned', () => setHostAwaySeconds(null));
    socket.on('room:host_changed', ({ newHostSocketId, newHostName }: { newHostSocketId: string; newHostName: string }) => {
      setHostAwaySeconds(null);
      if (newHostSocketId === socket.id) toast.success('Jesteś teraz hostem pokoju!');
      else toast.info(`Nowy host: ${newHostName}`);
      // Bezpośredni fetch zamiast lib/api - odświeża pełny stan pokoju po promocji
      // hosta (event nie zawiera całego pokoju, tylko nowego hosta). Do rozważenia
      // refaktor na funkcję getRoom() w lib/api.ts.
      fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3001'}/api/rooms/${code}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      }).then(r => r.json()).then(data => setRoom(data)).catch(() => { /* odśwież się przy następnym evencie */ });
    });
    socket.on('room:closed', () => { toast.error('Pokój został zamknięty'); navigate('/'); });
    socket.on('chat:room_message', (msg: ChatMessage) => setMessages(prev => [...prev, msg]));
    // Race-condition fix: przekazujemy dane startowe przez router state, żeby
    // strona gry mogła wyrenderować planszę bez czekania na chess:get_state.
    socket.on('chess:start', (data: any) => navigate(`/game/chess/${code}`, { state: data }));
    socket.on('checkers:start', (data: any) => navigate(`/game/checkers/${code}`, { state: data }));
    socket.on('charades:start', (data: any) => navigate(`/game/charades/${code}`, { state: data }));
    // Charades pozwala dołączyć do trwającej gry - od razu nawigujemy na grę.
    socket.on('room:joined_in_progress', () => navigate(`/game/charades/${code}`));

    // Initial load - pełny stan pokoju (potrzebny np. po wejściu z /lobby przez navigate).
    fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3001'}/api/rooms/${code}`, {
      headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
    }).then(r => r.json()).then(data => setRoom(data)).catch(() => navigate('/'));

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
    if (socket && code) socket.emit('room:leave', { code });
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

  const copyCode = () => { if (code) { navigator.clipboard.writeText(code); toast.success('Skopiowano kod!'); } };

  const isHost = room && socket && room.players[0]?.socketId === socket.id;
  const canStart = room && room.players.length >= 2 && room.status === 'waiting';
  const gameIcon = GAME_ICONS[room?.gameType || 'chess'] || '♞';

  if (!room) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '50vh', color: 'var(--pr-text-muted)', fontFamily: 'var(--font-head)' }}>
        {t('app.loading')}
      </div>
    );
  }

  return (
    <div className="pr-room-grid">
      {/* Left: room info + players */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* Host-away banner */}
        {hostAwaySeconds !== null && (
          <div className="pr-banner">
            <div>
              <div style={{ fontFamily: 'var(--font-head)', fontWeight: 600, fontSize: 14, color: '#FEC5C5' }}>
                ⚠ {t('room.hostDisconnected', 'Host się rozłączył')}
              </div>
              <div style={{ fontSize: 13, color: 'var(--pr-text-secondary)', marginTop: 2 }}>
                {t('room.hostDisconnectedDesc', 'Pokój zostanie przekazany lub zamknięty.')}
              </div>
            </div>
            <div className="pr-banner-countdown">
              {String(Math.floor(hostAwaySeconds / 60)).padStart(2, '0')}:{String(hostAwaySeconds % 60).padStart(2, '0')}
            </div>
          </div>
        )}

        <DisconnectBanner />

        {/* Room header card */}
        <div className="pr-card">
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
            <div className="pr-room-icon" style={{ width: 60, height: 60, fontSize: 28 }}>{gameIcon}</div>
            <div style={{ flex: 1 }}>
              <h1 style={{ fontSize: 22, marginBottom: 6 }}>
                {t('room.code', { code: room.code })}
              </h1>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span className="pr-badge">{t(`home.${room.gameType}`, room.gameType)}</span>
                <span className={`pr-badge ${room.isPublic ? 'pr-badge-neutral' : 'pr-badge-warn'}`}>
                  {room.isPublic ? <Globe size={11} /> : <Lock size={11} />}
                  {room.isPublic ? t('lobby.public') : t('lobby.private')}
                </span>
                {room.gameType !== 'charades' && room.timerMinutes && (
                  <span className="pr-badge pr-badge-neutral">
                    <Clock size={11} /> {room.timerMinutes} min
                  </span>
                )}
                {room.gameType === 'charades' && (
                  <>
                    <span className="pr-badge pr-badge-neutral">{t('room.rounds', { rounds: room.rounds ?? 3 })}</span>
                    <span className="pr-badge pr-badge-neutral">{t('room.drawingTime', { seconds: room.drawingTime ?? 60 })}</span>
                  </>
                )}
              </div>
            </div>
            <button className="pr-btn pr-btn-secondary pr-btn-sm" onClick={copyCode}>
              <Copy size={13} /> {room.code}
            </button>
          </div>

          {/* Settings row */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 20 }}>
            <SettingBox icon={<Users size={13} />} label={t('lobby.players', { current: '', max: '' }).split('  ')[0] || 'Gracze'} value={`${room.players.length} / ${room.maxPlayers}`} />
            <SettingBox icon={<Clock size={13} />} label={t('lobby.timerMinutes', 'Czas')} value={room.timerMinutes ? `${room.timerMinutes} min` : '—'} />
            <SettingBox icon={<Globe size={13} />} label={t('lobby.visibility', 'Typ')} value={room.isPublic ? t('lobby.public') : t('lobby.private')} />
          </div>
        </div>

        {/* Players grid */}
        <div>
          <div style={{
            fontFamily: 'var(--font-head)', fontSize: 11, fontWeight: 600,
            letterSpacing: '.1em', textTransform: 'uppercase',
            color: 'var(--pr-text-muted)', marginBottom: 10,
          }}>
            {t('room.players', 'Gracze')} · {room.players.length}/{room.maxPlayers}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(220px, 100%), 1fr))', gap: 10 }}>
            {room.players.map((player, i) => (
              <PlayerCard key={player.socketId} player={player} isHost={i === 0} hostLabel={t('room.host', 'Host')} />
            ))}
            {Array.from({ length: Math.max(0, room.maxPlayers - room.players.length) }).map((_, i) => (
              <div key={i} className="pr-card" style={{
                padding: 14, borderStyle: 'dashed', opacity: 0.5,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                minHeight: 80, color: 'var(--pr-text-muted)', fontSize: 13,
              }}>
                {t('lobby.waiting', 'Oczekiwanie…')}
              </div>
            ))}
          </div>
        </div>

        {/* Action buttons */}
        <div style={{ display: 'flex', gap: 10 }}>
          {isHost && (
            <button
              className="pr-btn pr-btn-primary pr-btn-lg"
              style={{ flex: 1, opacity: canStart ? 1 : 0.5, pointerEvents: canStart ? 'auto' : 'none' }}
              onClick={handleStartGame}
              disabled={!canStart}
            >
              {t('room.start')} →
            </button>
          )}
          {!isHost && (
            <div style={{
              flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontFamily: 'var(--font-head)', fontSize: 14, color: 'var(--pr-text-muted)',
              padding: '12px 0',
            }}>
              {t('lobby.waiting', 'Czekamy na hosta…')}
            </div>
          )}
          <button
            className="pr-btn pr-btn-danger"
            onClick={handleLeave}
          >
            <LogOut size={15} /> {t('room.leave')}
          </button>
        </div>
      </div>

      {/* Right: chat */}
      <div className="pr-card pr-room-chat" style={{ padding: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 0 }}>
        <div className="pr-chat">
          <div className="pr-chat-header">Chat</div>
          <div className="pr-chat-body" style={{ flex: 1, overflowY: 'auto' }}>
            {messages.map((msg, i) => (
              <div key={i} className="pr-chat-msg">
                <span className="pr-chat-author">{msg.from}:</span>
                <span className="pr-chat-text">{msg.text}</span>
              </div>
            ))}
            <div ref={chatEndRef} />
          </div>
          <div className="pr-chat-input">
            <input
              className="pr-input"
              style={{ height: 36, fontSize: 13, flex: 1 }}
              value={messageText}
              onChange={e => setMessageText(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && sendMessage()}
              placeholder={t('friends.sendMessage', 'Napisz wiadomość…')}
            />
            <button className="pr-btn pr-btn-primary pr-btn-sm" style={{ padding: '0 10px', height: 36 }} onClick={sendMessage}>
              <Send size={14} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function SettingBox({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div style={{
      padding: 12, background: 'rgba(6,27,63,0.45)',
      border: '1px solid var(--pr-border-subtle)', borderRadius: 12,
    }}>
      <div style={{ fontSize: 11, color: 'var(--pr-text-muted)', textTransform: 'uppercase', letterSpacing: '.06em', display: 'flex', alignItems: 'center', gap: 5, marginBottom: 4 }}>
        {icon} {label}
      </div>
      <div style={{ fontFamily: 'var(--font-head)', fontWeight: 600, fontSize: 15, color: 'var(--pr-text-primary)' }}>
        {value}
      </div>
    </div>
  );
}

function PlayerCard({ player, isHost, hostLabel }: { player: RoomPlayer; isHost: boolean; hostLabel: string }) {
  const initials = player.displayName.slice(0, 2).toUpperCase();
  const src = avatarImgSrc(player.avatarPreset);
  const cls = avatarClass(player.avatarPreset);
  return (
    <div className="pr-card" style={{ padding: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
        <div className={`pr-avatar pr-avatar-lg ${cls}`}>
          {src
            ? <img src={src} alt="avatar" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }} onError={e => { (e.currentTarget.parentElement as HTMLElement).textContent = initials; }} />
            : initials}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontFamily: 'var(--font-head)', fontWeight: 600, fontSize: 15,
            color: 'var(--pr-text-primary)', display: 'flex', alignItems: 'center', gap: 6,
          }}>
            {player.displayName}
            {isHost && (
              <span className="pr-badge pr-badge-warn" style={{ fontSize: 10 }}>HOST</span>
            )}
          </div>
        </div>
      </div>
      <div style={{
        padding: '6px 10px', borderRadius: 6,
        background: isHost ? 'rgba(74,222,128,.1)' : 'rgba(252,211,77,.08)',
        border: `1px solid ${isHost ? 'rgba(74,222,128,.25)' : 'rgba(252,211,77,.2)'}`,
        display: 'flex', alignItems: 'center', gap: 6,
        fontSize: 12, fontWeight: 500,
        color: isHost ? 'var(--pr-success)' : 'var(--pr-warn)',
      }}>
        <span style={{
          width: 6, height: 6, borderRadius: '50%',
          background: isHost ? 'var(--pr-success)' : 'var(--pr-warn)',
          display: 'inline-block',
        }} />
        {isHost ? hostLabel : 'Oczekuje…'}
      </div>
    </div>
  );
}
