import { Outlet } from 'react-router-dom';
import { Navbar } from './Navbar';
import { Sidebar } from './Sidebar';
import { useAuth } from '@/context/AuthContext';

export function Layout() {
  const { user } = useAuth();
  const showSidebar = !!(user && !user.isGuest);

  return (
    <div className="pr-app">
      <Navbar />
      <div className={showSidebar ? 'pr-app-body' : ''} style={showSidebar ? {} : { overflow: 'auto' }}>
        {showSidebar && <Sidebar />}
        <main className="pr-main">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
