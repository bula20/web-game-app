// Karta na dashboardzie pokazywana, gdy zalogowany użytkownik ma aktywny pokój
// (activeRoomCode). Klik prowadzi na /my-room, skąd można wrócić do trwającej gry.
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { DoorOpen, ArrowRight } from 'lucide-react';

interface ActiveRoomCardProps {
  code: string;
}

export function ActiveRoomCard({ code }: ActiveRoomCardProps) {
  const { t } = useTranslation();

  return (
    <Link to="/my-room" className="pr-active-room" style={{ textDecoration: 'none' }}>
      <div style={{
        width: 56, height: 56, borderRadius: 14,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(255,106,0,0.20)',
        border: '1px solid rgba(255,106,0,0.40)',
        color: '#FFC299',
        flexShrink: 0,
      }}>
        <DoorOpen size={26} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontFamily: 'var(--font-head)', fontWeight: 700, fontSize: 14,
          color: 'rgba(255,247,232,0.72)',
          textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4,
        }}>
          {t('home.dashboard.activeRoom', 'Aktywny pokój')}
        </div>
        <div className="pr-active-room-code">{code}</div>
      </div>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        fontFamily: 'var(--font-head)', fontWeight: 700, fontSize: 14,
        color: 'var(--pr-primary)',
      }}>
        {t('home.dashboard.goToRoom', 'Wróć do pokoju')}
        <ArrowRight size={16} />
      </div>
    </Link>
  );
}
