// Główny layout aplikacji - Navbar na górze, opcjonalny Sidebar po lewej (znajomi/DM,
// tylko dla zalogowanych nie-gości), <Outlet /> z React Router renderujący zawartość
// strony. Stan zwinięcia sidebara zapisujemy w localStorage, żeby preferencja
// przeżywała odświeżenie.
import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { Navbar } from './Navbar';
import { Sidebar } from './Sidebar';
import { useAuth } from '@/context/AuthContext';
import { ChevronRight } from 'lucide-react';

export function Layout() {
  const { user } = useAuth();
  const showSidebar = !!(user && !user.isGuest);
  const [sidebarOpen, setSidebarOpen] = useState(() => localStorage.getItem('sidebarOpen') !== 'false');

  const toggle = () => setSidebarOpen(v => {
    localStorage.setItem('sidebarOpen', String(!v));
    return !v;
  });

  return (
    <div className="pr-app">
      <Navbar />
      <div
        className={`pr-app-body${!showSidebar ? ' no-sidebar' : !sidebarOpen ? ' sidebar-collapsed' : ''}`}
        style={{ height: 'calc(100vh - var(--pr-navbar-h))' }}
      >
        {showSidebar && (
          sidebarOpen
            ? <Sidebar onCollapse={toggle} />
            : (
              <div className="pr-sidebar-strip" style={{
                background: 'rgba(6,27,63,0.55)',
                borderRight: '1px solid var(--pr-border-dark)',
                display: 'flex', flexDirection: 'column', alignItems: 'center',
                paddingTop: 12,
              }}>
                <button
                  onClick={toggle}
                  title="Pokaż panel znajomych"
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: 'var(--pr-text-muted)', padding: '6px', borderRadius: 8,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    transition: 'color .15s',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.color = 'var(--pr-light)')}
                  onMouseLeave={e => (e.currentTarget.style.color = 'var(--pr-text-muted)')}
                >
                  <ChevronRight size={18} />
                </button>
              </div>
            )
        )}
        <main className="pr-main">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
