// Strona "Mój pokój" - pokazuje aktualny aktywny pokój usera (jeśli jest) z
// przyciskiem powrotu albo empty state z linkiem do lobby. Pobiera dane przez
// GET /api/users/me/active-room (ten sam endpoint czyści też nieaktualne wpisy).
import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import api from '@/lib/api';

interface ActiveRoomResponse {
  code: string;
  gameType: 'chess' | 'checkers' | 'charades';
  status: 'waiting' | 'host_away' | 'in_progress' | 'finished';
  players: { displayName: string; userId: string | null }[];
  maxPlayers: number;
}

export function MyRoomPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [room, setRoom] = useState<ActiveRoomResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get<ActiveRoomResponse | null>('/users/me/active-room')
      .then(res => setRoom(res.data))
      .catch(() => setRoom(null))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="text-center py-12 text-muted-foreground">{t('app.loading')}</div>;
  }

  if (!room) {
    return (
      <div className="space-y-6 max-w-2xl mx-auto">
        <h1 className="text-3xl font-bold">{t('myRoom.title')}</h1>
        <Card>
          <CardContent className="py-10 text-center space-y-4">
            <p className="text-muted-foreground">{t('myRoom.notInRoom')}</p>
            <Button asChild>
              <Link to="/">{t('myRoom.goHome')}</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const target = room.status === 'in_progress'
    ? `/game/${room.gameType}/${room.code}`
    : `/room/${room.code}`;

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      <h1 className="text-3xl font-bold">{t('myRoom.title')}</h1>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>{t('room.code', { code: room.code })}</CardTitle>
            <Badge variant="secondary">{t(`home.${room.gameType}`)}</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="text-sm text-muted-foreground">
            {t('myRoom.status')}: {room.status === 'in_progress' ? t('myRoom.playing') : t('myRoom.waiting')}
          </div>
          <div className="text-sm">
            {t('lobby.players', { current: room.players.length, max: room.maxPlayers })}
          </div>
          <ul className="text-sm space-y-1">
            {room.players.map((p, i) => (
              <li key={i}>• {p.displayName}</li>
            ))}
          </ul>
          <Button className="w-full" onClick={() => navigate(target)}>
            {t('myRoom.backToRoom')}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
