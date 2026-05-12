// Strona historii partii zalogowanego usera. Paginacja po stronie serwera
// (10 partii na stronę), wynik per partia (won/lost/drew) liczony lokalnie
// na podstawie pól GameHistory. Partie kalamburów - wygrywa najlepszy w punktach.
import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/context/AuthContext';
import api from '@/lib/api';
import type { GameHistory, GameHistoryResponse } from '@/types/game';

const GAME_ICON: Record<string, string> = {
  chess: '♞',
  checkers: '◉',
  charades: '🎨',
};


export function HistoryPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [games, setGames] = useState<GameHistory[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    setIsLoading(true);
    api.get<GameHistoryResponse>(`/games/history?page=${page}&limit=10`)
      .then(res => {
        setGames(res.data.games);
        setTotalPages(res.data.pages);
      })
      .catch(() => { /* przy błędzie pokażemy pustą listę */ })
      .finally(() => setIsLoading(false));
  }, [page]);

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

  const formatDuration = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}m ${s}s`;
  };

  const resultBadgeClass = (r: 'won' | 'lost' | 'drew') =>
    r === 'won' ? 'pr-badge-success' : r === 'drew' ? 'pr-badge-warn' : 'pr-badge-danger';

  const resultLabel = (r: 'won' | 'lost' | 'drew') =>
    r === 'won' ? t('history.won', 'Wygrana') : r === 'drew' ? t('history.drew', 'Remis') : t('history.lost', 'Przegrana');

  return (
    <div style={{ maxWidth: 760, margin: '0 auto' }}>
      <div className="pr-page-head">
        <h1 style={{ fontFamily: 'var(--font-head)', fontWeight: 800, fontSize: 28, color: 'var(--pr-light)', margin: 0 }}>
          {t('history.title', 'Historia gier')}
        </h1>
        {totalPages > 1 && (
          <span style={{ fontSize: 13, color: 'var(--pr-text-muted)', fontFamily: 'var(--font-head)' }}>
            {t('history.pageOf', { page, total: totalPages })}
          </span>
        )}
      </div>

      {isLoading ? (
        <div style={{ textAlign: 'center', padding: '64px 0', color: 'var(--pr-text-muted)', fontSize: 15 }}>
          {t('app.loading', 'Ładowanie…')}
        </div>
      ) : games.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '64px 0' }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>🎮</div>
          <div style={{ fontFamily: 'var(--font-head)', fontSize: 16, color: 'var(--pr-text-muted)' }}>
            {t('history.noGames', 'Brak rozegranych gier')}
          </div>
        </div>
      ) : (
        <div className="fade-up-stagger" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {games.map(game => {
            const result = getResult(game);
            const date = new Date(game.finishedAt);
            return (
              <div key={game._id} className="pr-room-card" style={{ cursor: 'default', alignItems: 'center' }}>
                <div className="pr-room-icon" style={{ fontSize: 22 }}>
                  {GAME_ICON[game.gameType] || '🎮'}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontFamily: 'var(--font-head)', fontWeight: 700, fontSize: 15,
                    color: 'var(--pr-light)', marginBottom: 3,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {game.players.map(p => p.displayName).join(' vs ')}
                  </div>
                  <div style={{ fontSize: 13, color: 'rgba(255,247,232,0.55)', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    <span style={{ color: 'var(--pr-text-muted)' }}>{t(`home.${game.gameType}`, game.gameType)}</span>
                    <span>·</span>
                    <span>{t('history.duration', { minutes: Math.floor(game.duration / 60), seconds: game.duration % 60 }) || formatDuration(game.duration)}</span>
                    <span>·</span>
                    <span>{date.toLocaleDateString()}</span>
                  </div>
                </div>
                <span className={`pr-badge ${resultBadgeClass(result)}`} style={{ flexShrink: 0 }}>
                  {resultLabel(result)}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 12, marginTop: 28 }}>
          <button
            className="pr-btn pr-btn-ghost pr-btn-sm"
            disabled={page <= 1}
            onClick={() => setPage(p => p - 1)}
            style={{ opacity: page <= 1 ? 0.4 : 1 }}
          >
            {t('history.previous')}
          </button>
          <span style={{ fontFamily: 'var(--font-head)', fontSize: 13, color: 'var(--pr-text-muted)' }}>
            {page} / {totalPages}
          </span>
          <button
            className="pr-btn pr-btn-ghost pr-btn-sm"
            disabled={page >= totalPages}
            onClick={() => setPage(p => p + 1)}
            style={{ opacity: page >= totalPages ? 0.4 : 1 }}
          >
            {t('history.next')}
          </button>
        </div>
      )}
    </div>
  );
}
