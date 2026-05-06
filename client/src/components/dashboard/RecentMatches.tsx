import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/context/AuthContext';
import api from '@/lib/api';
import type { GameHistory, GameHistoryResponse } from '@/types/game';

const GAME_ICON: Record<string, string> = {
  chess: '♞',
  checkers: '◉',
  charades: '🎨',
};

interface RecentMatchesProps {
  limit?: number;
  onNavigate?: () => void;
}

export function RecentMatches({ limit = 5, onNavigate }: RecentMatchesProps) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [games, setGames] = useState<GameHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api.get<GameHistoryResponse>('/games/history?page=1')
      .then(res => {
        if (cancelled) return;
        setGames(res.data.games.slice(0, limit));
      })
      .catch(() => { if (!cancelled) setError(true); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [limit]);

  const getResult = (game: GameHistory): 'won' | 'lost' | 'drew' => {
    if (game.gameType === 'charades') {
      const myScore = game.scores?.find(s => s.userId === user?.id);
      const maxScore = Math.max(...(game.scores?.map(s => s.points) || [0]));
      if (myScore && myScore.points === maxScore) return 'won';
      return 'lost';
    }
    if (game.result === 'draw') return 'drew';
    if (game.winner === user?.id) return 'won';
    return 'lost';
  };

  const resultBadgeClass = (r: 'won' | 'lost' | 'drew') =>
    r === 'won' ? 'pr-badge-success' : r === 'drew' ? 'pr-badge-warn' : 'pr-badge-danger';

  if (loading) {
    return <div className="pr-card" style={{ textAlign: 'center', color: 'var(--pr-text-muted)' }}>{t('app.loading', 'Ładowanie…')}</div>;
  }

  if (error || games.length === 0) {
    return (
      <div className="pr-card" style={{ textAlign: 'center', padding: '32px 22px', color: 'var(--pr-text-muted)' }}>
        <div style={{ fontSize: 32, marginBottom: 8 }}>🎮</div>
        <div style={{ fontFamily: 'var(--font-head)', fontSize: 15 }}>
          {t('home.dashboard.noMatches', 'Brak rozegranych partii')}
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {games.map(game => {
        const result = getResult(game);
        const date = new Date(game.finishedAt);
        return (
          <div key={game._id} className="pr-room-card" style={{ cursor: 'default' }}>
            <div className="pr-room-icon">{GAME_ICON[game.gameType] || '🎮'}</div>
            <div style={{ minWidth: 0 }}>
              <div style={{
                fontFamily: 'var(--font-head)', fontWeight: 700, fontSize: 15,
                color: 'var(--pr-light)', marginBottom: 4,
              }}>
                {game.players.map(p => p.displayName).join(' vs ')}
              </div>
              <div style={{ fontSize: 13, color: 'rgba(255,247,232,0.62)' }}>
                <span style={{ textTransform: 'capitalize' }}>{t(`home.${game.gameType}`, game.gameType)}</span>
                {' · '}
                {date.toLocaleDateString()}
              </div>
            </div>
            <div />
            <span className={`pr-badge ${resultBadgeClass(result)}`}>
              {t(`history.${result}`, result)}
            </span>
          </div>
        );
      })}
      <Link
        to="/history"
        onClick={onNavigate}
        style={{
          alignSelf: 'flex-end',
          fontFamily: 'var(--font-head)', fontWeight: 700, fontSize: 13,
          color: 'var(--pr-secondary-300)',
          padding: '6px 0',
        }}
      >
        {t('home.dashboard.viewAll', 'Zobacz całą historię')} →
      </Link>
    </div>
  );
}
