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
        style={showSidebar ? {
          display: 'grid',
          gridTemplateColumns: sidebarOpen ? 'var(--pr-sidebar-w) 1fr' : '40px 1fr',
          overflow: 'hidden',
          height: 'calc(100vh - var(--pr-navbar-h))',
        } : { height: 'calc(100vh - var(--pr-navbar-h))', overflow: 'hidden' }}
      >
        {showSidebar && (
          sidebarOpen
            ? <Sidebar onCollapse={toggle} />
            : (
              <div style={{
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
