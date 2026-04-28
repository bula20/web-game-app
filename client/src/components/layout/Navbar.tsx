import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/context/AuthContext';
import { Globe, Bell, Plus, LogOut, History, DoorOpen } from 'lucide-react';

export function Navbar() {
  const { t, i18n } = useTranslation();
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const toggleLanguage = () => {
    i18n.changeLanguage(i18n.language === 'pl' ? 'en' : 'pl');
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const isActive = (path: string) => location.pathname.startsWith(path);

  const initials = user
    ? (user.username || 'G').slice(0, 2).toUpperCase()
    : '?';

  return (
    <header className="pr-navbar">
      {/* Left: logo + nav links */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 28 }}>
        <Link to="/" style={{ textDecoration: 'none' }}>
          <img src="/logo.png" alt="PlayRoom" style={{ height: 100, width: 'auto', display: 'block' }} />
        </Link>

        <nav style={{ display: 'flex', gap: 4 }}>
          <Link
            to="/lobby/chess"
            className={`pr-nav-link ${isActive('/lobby') ? 'active' : ''}`}
          >
            {t('nav.lobby', 'Lobby')}
          </Link>
          {user && !user.isGuest && (
            <Link
              to="/history"
              className={`pr-nav-link ${isActive('/history') ? 'active' : ''}`}
            >
              <History size={14} />
              {t('nav.history', 'Historia')}
            </Link>
          )}
          {user?.activeRoomCode && (
            <Link
              to="/my-room"
              className={`pr-nav-link ${isActive('/my-room') ? 'active' : ''}`}
              style={{ color: 'var(--pr-warn)' }}
            >
              <DoorOpen size={14} />
              {t('nav.myRoom', 'Mój pokój')}
            </Link>
          )}
        </nav>
      </div>

      {/* Right: actions + user */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <button className="pr-nav-link" onClick={toggleLanguage} title={t('nav.language')}>
          <Globe size={15} />
          <span style={{ fontFamily: 'var(--font-head)', fontSize: 12, fontWeight: 600, letterSpacing: '.05em' }}>
            {i18n.language.toUpperCase()}
          </span>
        </button>

        <button className="pr-nav-link" style={{ padding: '0 10px', position: 'relative' }}>
          <Bell size={17} />
        </button>

        {user ? (
          <>
            <button
              className="pr-btn pr-btn-primary pr-btn-sm"
              onClick={() => navigate('/lobby/chess')}
            >
              <Plus size={14} /> {t('nav.play', 'Graj')}
            </button>

            <button
              onClick={() => navigate('/history')}
              style={{ background: 'none', border: 'none', padding: 0, display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}
            >
              <div className="pr-avatar pr-avatar-md av-1">
                {initials}
              </div>
              <div style={{ textAlign: 'left' }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--pr-text-primary)', fontFamily: 'var(--font-head)' }}>
                  {user.username}
                </div>
                <div style={{ fontSize: 11, color: 'var(--pr-text-muted)' }}>
                  {user.isGuest ? t('auth.guest', 'Gość') : 'ELO 1486'}
                </div>
              </div>
            </button>

            <button className="pr-nav-link" onClick={handleLogout} title={t('nav.logout')}>
              <LogOut size={15} />
            </button>
          </>
        ) : (
          <>
            <Link to="/login" className="pr-btn pr-btn-secondary pr-btn-sm" style={{ textDecoration: 'none' }}>
              {t('nav.login', 'Logowanie')}
            </Link>
            <Link to="/register" className="pr-btn pr-btn-primary pr-btn-sm" style={{ textDecoration: 'none' }}>
              {t('nav.register', 'Rejestracja')}
            </Link>
          </>
        )}
      </div>
    </header>
  );
}
