import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Crown, Circle, Pencil } from 'lucide-react';

const games = [
  { key: 'chess', icon: Crown, color: 'text-amber-600', bg: 'bg-amber-50 dark:bg-amber-950/30' },
  { key: 'checkers', icon: Circle, color: 'text-red-600', bg: 'bg-red-50 dark:bg-red-950/30' },
  { key: 'charades', icon: Pencil, color: 'text-blue-600', bg: 'bg-blue-50 dark:bg-blue-950/30' },
];

export function HomePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  return (
    <div className="flex flex-col items-center gap-8 py-12">
      <div className="text-center">
        <h1 className="text-4xl font-bold tracking-tight">{t('home.welcome')}</h1>
        <p className="text-muted-foreground mt-2 text-lg">{t('home.subtitle')}</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full max-w-4xl">
        {games.map(({ key, icon: Icon, color, bg }) => (
          <Card
            key={key}
            className={`cursor-pointer transition-all hover:shadow-lg hover:scale-105 ${bg}`}
            onClick={() => navigate(`/lobby/${key}`)}
          >
            <CardHeader className="text-center">
              <div className="flex justify-center mb-3">
                <Icon className={`h-16 w-16 ${color}`} />
              </div>
              <CardTitle className="text-xl">{t(`home.${key}`)}</CardTitle>
              <CardDescription>{t(`home.${key}Desc`)}</CardDescription>
            </CardHeader>
            <CardContent className="text-center">
              <span className="text-sm text-primary font-medium">
                {t('lobby.join')} &rarr;
              </span>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
