// Modal "Dołącz po kodzie" - input na 6-znakowy kod pokoju. Po room:join
// i odebraniu room:joined nawigujemy na /room/:code. Błędy (room not found,
// full, gra w toku) trafiają z socketa jako room:error i pokazujemy je inline.
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { LogIn, X } from 'lucide-react';
import { useSocket } from '@/context/SocketContext';
import { useAuth } from '@/context/AuthContext';
import type { Room } from '@/types/room';

interface JoinByCodeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function JoinByCodeDialog({ open, onOpenChange }: JoinByCodeDialogProps) {
  const { t } = useTranslation();
  const { socket } = useSocket();
  const { user, loginAsGuest } = useAuth();
  const navigate = useNavigate();

  const [code, setCode] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setCode('');
      setSubmitting(false);
      setError(null);
    }
  }, [open]);

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
    if (!socket || !code.trim()) return;
    setSubmitting(true);
    setError(null);
    socket.emit('room:join', { code: code.trim().toUpperCase() });
  };

  return (
    <div className="pr-modal-backdrop" onClick={() => onOpenChange(false)}>
      <div className="pr-modal" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true" style={{ maxWidth: 440 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 18 }}>
          <div>
            <h2 style={{ fontSize: 24, marginBottom: 4 }}>{t('lobby.joinByCode', 'Dołącz po kodzie')}</h2>
            <p style={{ color: 'var(--pr-text-muted)', fontSize: 14 }}>
              {t('home.join.subtitle', 'Wpisz 6-znakowy kod pokoju')}
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
              {t('home.join.requireAuth', 'Aby dołączyć do pokoju, zaloguj się lub kontynuuj jako gość.')}
            </p>
            <div style={{ display: 'flex', gap: 10 }}>
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
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <input
              autoFocus
              className="pr-input"
              value={code}
              onChange={e => setCode(e.target.value.toUpperCase())}
              onKeyDown={e => e.key === 'Enter' && submit()}
              placeholder="ABC123"
              maxLength={6}
              style={{
                fontFamily: 'var(--font-head)',
                fontSize: 24,
                letterSpacing: '0.3em',
                textAlign: 'center',
                height: 60,
                fontWeight: 700,
              }}
            />

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

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button className="pr-btn pr-btn-ghost" onClick={() => onOpenChange(false)}>
                {t('lobby.cancel', 'Anuluj')}
              </button>
              <button
                className="pr-btn pr-btn-primary"
                onClick={submit}
                disabled={!code.trim() || submitting}
              >
                <LogIn size={15} /> {t('lobby.join', 'Dołącz')}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
