import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/context/AuthContext';
import api from '@/lib/api';
import type { GameHistory, GameHistoryResponse } from '@/types/game';

export function HistoryPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [games, setGames] = useState<GameHistory[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadHistory();
  }, [page]);

  const loadHistory = async () => {
    setIsLoading(true);
    try {
      const res = await api.get<GameHistoryResponse>(`/games/history?page=${page}`);
      setGames(res.data.games);
      setTotalPages(res.data.pages);
    } catch { /* ignore */ }
    setIsLoading(false);
  };

  const getResult = (game: GameHistory) => {
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
    return t('history.duration', { minutes: m, seconds: s });
  };

  const resultColors = {
    won: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
    lost: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
    drew: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
  };

  if (isLoading) {
    return <div className="text-center py-12 text-muted-foreground">{t('app.loading')}</div>;
  }

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">{t('history.title')}</h1>

      {games.length === 0 ? (
        <p className="text-center py-12 text-muted-foreground">{t('history.noGames')}</p>
      ) : (
        <div className="space-y-3">
          {games.map(game => {
            const result = getResult(game);
            return (
              <Card key={game._id}>
                <CardContent className="flex items-center justify-between py-4">
                  <div className="flex items-center gap-4">
                    <Badge>{game.gameType}</Badge>
                    <div>
                      <div className="font-medium">
                        {game.players.map(p => p.displayName).join(' vs ')}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {formatDuration(game.duration)} &middot; {new Date(game.finishedAt).toLocaleDateString()}
                      </div>
                    </div>
                  </div>
                  <Badge className={resultColors[result]}>
                    {t(`history.${result}`)}
                  </Badge>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex justify-center gap-2">
          <Button variant="outline" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
            &larr;
          </Button>
          <span className="flex items-center px-3 text-sm">{page} / {totalPages}</span>
          <Button variant="outline" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>
            &rarr;
          </Button>
        </div>
      )}
    </div>
  );
}
