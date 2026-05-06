import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Globe, Lock, X, Plus } from 'lucide-react';
import { useSocket } from '@/context/SocketContext';
import { useAuth } from '@/context/AuthContext';
import type { GameType, Room } from '@/types/room';

interface CreateRoomDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  gameType?: GameType;
}

const GAME_OPTIONS: Array<{ key: GameType; icon: string; pl: string; en: string }> = [
  { key: 'chess',    icon: '♞', pl: 'Szachy',    en: 'Chess' },
  { key: 'checkers', icon: '◉', pl: 'Warcaby',   en: 'Checkers' },
  { key: 'charades', icon: '🎨', pl: 'Kalambury', en: 'Charades' },
];

export function CreateRoomDialog({ open, onOpenChange, gameType: lockedGameType }: CreateRoomDialogProps) {
  const { t, i18n } = useTranslation();
  const { socket } = useSocket();
  const { user, loginAsGuest } = useAuth();
  const navigate = useNavigate();
  const isPl = i18n.language === 'pl';

  const [selectedGame, setSelectedGame] = useState<GameType | undefined>(lockedGameType);
  const [isPublic, setIsPublic] = useState(true);
  const [maxPlayers, setMaxPlayers] = useState(8);
  const [timerMinutes, setTimerMinutes] = useState(10);
  const [rounds, setRounds] = useState(3);
  const [drawingTime, setDrawingTime] = useState(60);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setSelectedGame(lockedGameType);
      setSubmitting(false);
      setError(null);
    }
  }, [open, lockedGameType]);

  useEffect(() => {
    if (!open || !socket) return;
    const onJoined = ({ room }: { room: Room }) => {
      onOpenChange(false);
      navigate(`/room/${room.code}`);
    };
    const onJoinedInProgress = ({ room }: { room: Room }) => {
      onOpenChange(false);
      navigate(`/game/charades/${room.code}`);
    };
    const onError = ({ message }: { message: string }) => {
      setSubmitting(false);
      setError(message);
    };
    socket.on('room:joined', onJoined);
    socket.on('room:joined_in_progress', onJoinedInProgress);
    socket.on('room:error', onError);
    return () => {
      socket.off('room:joined', onJoined);
      socket.off('room:joined_in_progress', onJoinedInProgress);
      socket.off('room:error', onError);
    };
  }, [open, socket, navigate, onOpenChange]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onOpenChange(false); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onOpenChange]);

  if (!open) return null;

  const requireAuth = !user;

  const submit = () => {
    if (!socket || !selectedGame) return;
    setSubmitting(true);
    setError(null);
    socket.emit('room:create', {
      gameType: selectedGame,
      isPublic,
      maxPlayers: selectedGame === 'charades' ? maxPlayers : 2,
      ...(selectedGame === 'charades'
        ? { rounds, drawingTime }
        : { timerMinutes }),
    });
  };

  return (
    <div className="pr-modal-backdrop" onClick={() => onOpenChange(false)}>
      <div className="pr-modal" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true">
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 18 }}>
          <div>
            <h2 style={{ fontSize: 24, marginBottom: 4 }}>{t('lobby.createRoom', 'Stwórz pokój')}</h2>
            <p style={{ color: 'var(--pr-text-muted)', fontSize: 14 }}>
              {t('home.create.subtitle', 'Skonfiguruj nowy pokój i zaproś znajomych')}
            </p>
          </div>
          <button
            onClick={() => onOpenChange(false)}
            aria-label="Close"
            style={{
              background: 'transparent', border: 'none', color: 'var(--pr-text-muted)',
              padding: 6, borderRadius: 8, cursor: 'pointer', display: 'flex',
            }}
          >
            <X size={18} />
          </button>
        </div>

        {requireAuth ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <p style={{ color: 'rgba(255,247,232,0.78)', fontSize: 14, lineHeight: 1.6 }}>
              {t('home.create.requireAuth', 'Aby utworzyć pokój, zaloguj się lub kontynuuj jako gość.')}
            </p>
            <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
              <button
                className="pr-btn pr-btn-primary"
                onClick={() => { onOpenChange(false); navigate('/login'); }}
              >
                {t('nav.login', 'Logowanie')}
              </button>
              <button
                className="pr-btn pr-btn-secondary"
                onClick={async () => { await loginAsGuest(); }}
              >
                {t('auth.playAsGuest', 'Kontynuuj jako gość')}
              </button>
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            {/* Game picker (only when not locked) */}
            {!lockedGameType && (
              <div>
                <div className="pr-label">{t('home.create.chooseGame', 'Wybierz grę')}</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginTop: 10 }}>
                  {GAME_OPTIONS.map(g => {
                    const active = selectedGame === g.key;
                    return (
                      <button
                        key={g.key}
                        type="button"
                        onClick={() => setSelectedGame(g.key)}
                        style={{
                          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
                          padding: '14px 10px',
                          background: active ? 'rgba(255,106,0,0.16)' : 'rgba(6,27,63,0.55)',
                          border: `1px solid ${active ? 'rgba(255,106,0,0.55)' : 'var(--pr-border-dark)'}`,
                          borderRadius: 14, cursor: 'pointer', color: 'var(--pr-light)',
                          fontFamily: 'var(--font-head)', fontWeight: 600, fontSize: 14,
                          transition: 'all .15s',
                        }}
                      >
                        <span style={{ fontSize: 26 }}>{g.icon}</span>
                        {isPl ? g.pl : g.en}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Visibility */}
            <div>
              <div className="pr-label">{t('lobby.visibility', 'Widoczność')}</div>
              <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
                <button
                  type="button"
                  className={`pr-btn pr-btn-sm ${isPublic ? 'pr-btn-primary' : 'pr-btn-secondary'}`}
                  onClick={() => setIsPublic(true)}
                >
                  <Globe size={14} /> {t('lobby.public', 'Publiczny')}
                </button>
                <button
                  type="button"
                  className={`pr-btn pr-btn-sm ${!isPublic ? 'pr-btn-primary' : 'pr-btn-secondary'}`}
                  onClick={() => setIsPublic(false)}
                >
                  <Lock size={14} /> {t('lobby.private', 'Prywatny')}
                </button>
              </div>
            </div>

            {/* Game-specific config */}
            {selectedGame === 'charades' && (
              <>
                <NumberField
                  label={t('lobby.maxPlayers', 'Max graczy')}
                  value={maxPlayers}
                  onChange={setMaxPlayers}
                  min={2}
                  max={12}
                />
                <NumberField
                  label={t('lobby.rounds', 'Rundy')}
                  value={rounds}
                  onChange={setRounds}
                  min={1}
                  max={10}
                />
                <NumberField
                  label={t('lobby.drawingTime', 'Czas rysowania (s)')}
                  value={drawingTime}
                  onChange={setDrawingTime}
                  min={30}
                  max={120}
                />
              </>
            )}
            {selectedGame && selectedGame !== 'charades' && (
              <NumberField
                label={t('lobby.timerMinutes', 'Czas (min)')}
                value={timerMinutes}
                onChange={setTimerMinutes}
                min={1}
                max={60}
              />
            )}

            {error && (
              <div style={{
                padding: '10px 12px', borderRadius: 10,
                background: 'rgba(239,68,68,0.12)',
                border: '1px solid rgba(239,68,68,0.32)',
                color: '#FCA5A5', fontSize: 13,
              }}>
                {error}
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 6 }}>
              <button className="pr-btn pr-btn-ghost" onClick={() => onOpenChange(false)}>
                {t('lobby.cancel', 'Anuluj')}
              </button>
              <button
                className="pr-btn pr-btn-primary"
                onClick={submit}
                disabled={!selectedGame || submitting}
              >
                <Plus size={15} /> {t('lobby.create', 'Utwórz')}
              </button>
            </div>
          </div>
        )}
      </div>

      <style>{`
        .pr-label {
          font-family: var(--font-head);
          font-weight: 700;
          font-size: 11px;
          letter-spacing: 0.10em;
          text-transform: uppercase;
          color: rgba(255,247,232,0.65);
        }
      `}</style>
    </div>
  );
}

function NumberField({
  label, value, onChange, min, max,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  min: number;
  max: number;
}) {
  return (
    <div>
      <div className="pr-label">{label}</div>
      <input
        type="number"
        className="pr-input"
        style={{ marginTop: 8 }}
        min={min}
        max={max}
        value={value}
        onChange={e => onChange(Number(e.target.value))}
      />
    </div>
  );
}
