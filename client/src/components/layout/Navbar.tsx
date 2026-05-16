// Górny pasek nawigacji - logo, linki do historii i my-room, przycisk Create Room
// (otwiera CreateRoomDialog), avatar otwierający slide-in ProfilePanel, przełącznik
// języka (PL/EN) i logout. Niezalogowani widzą skrócony wariant z linkami login/register.
import { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Globe, LogOut, History, DoorOpen, Plus } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { CreateRoomDialog } from '@/components/room/CreateRoomDialog';
import { ProfilePanel } from '@/components/profile/ProfilePanel';
import { avatarClass, avatarImgSrc, avatarClassFromId } from '@/lib/avatar';

export function Navbar() {
  const { t, i18n } = useTranslation();
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [createOpen, setCreateOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);

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
    <>
    <header className="pr-navbar">
      {/* Left: logo + nav links */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 28 }}>
        <Link to="/" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none' }}>
          <img src="/logo.png" alt="PlayRoom" style={{ height: 52, width: 'auto', display: 'block' }} />
          <span className="pr-logo pr-navbar-logo-text" style={{ fontSize: 22, lineHeight: 1 }}>PlayRoom</span>
        </Link>

        <nav style={{ display: 'flex', gap: 4 }}>
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
              style={{ color: 'var(--pr-accent)' }}
            >
              <DoorOpen size={14} />
              {t('nav.myRoom', 'Mój pokój')}
            </Link>
          )}
        </nav>
      </div>

      {/* Right: actions + user */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <button className="pr-nav-link" onClick={toggleLanguage} title={t('nav.language', 'Język')}>
          <Globe size={15} />
          <span style={{ fontFamily: 'var(--font-head)', fontSize: 12, fontWeight: 700, letterSpacing: '.06em' }}>
            {i18n.language.toUpperCase()}
          </span>
        </button>

        {user ? (
          <>
            <button
              className="pr-btn pr-btn-primary pr-btn-sm"
              onClick={() => setCreateOpen(true)}
            >
              <Plus size={14} /> {t('nav.play', 'Graj')}
            </button>

            <button
              onClick={() => setProfileOpen(true)}
              style={{ background: 'none', border: 'none', padding: 0, display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}
            >
              {avatarImgSrc(user.avatarPreset) ? (
                <div className={`pr-avatar pr-avatar-md ${avatarClass(user.avatarPreset)}`}>
                  <img src={avatarImgSrc(user.avatarPreset)!} alt="avatar" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }} />
                </div>
              ) : (
                <div className={`pr-avatar pr-avatar-md ${user.isGuest ? avatarClassFromId(user.id) : avatarClass(user.avatarPreset)}`}>{initials}</div>
              )}
              <div className="pr-navbar-username" style={{ textAlign: 'left' }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--pr-light)', fontFamily: 'var(--font-head)' }}>
                  {user.username}
                </div>
                <div style={{ fontSize: 11, color: 'var(--pr-text-muted)' }}>
                  {user.isGuest ? t('auth.guest', 'Gość') : t('nav.player', 'Gracz')}
                </div>
              </div>
            </button>

            <button className="pr-nav-link" onClick={handleLogout} title={t('nav.logout', 'Wyloguj')}>
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

    <CreateRoomDialog open={createOpen} onOpenChange={setCreateOpen} />
    <ProfilePanel open={profileOpen} onClose={() => setProfileOpen(false)} />
    </>
  );
}
