import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import { SocketProvider } from '@/context/SocketContext';
import { Layout } from '@/components/layout/Layout';
import { HomePage } from '@/pages/HomePage';
import { LoginPage } from '@/pages/LoginPage';
import { RegisterPage } from '@/pages/RegisterPage';
import { AuthCallbackPage } from '@/pages/AuthCallbackPage';
import { LobbyPage } from '@/pages/LobbyPage';
import { RoomPage } from '@/pages/RoomPage';
import { HistoryPage } from '@/pages/HistoryPage';
import { ChessPage } from '@/pages/ChessPage';
import { CheckersPage } from '@/pages/CheckersPage';
import { CharadesPage } from '@/pages/CharadesPage';
import { MyRoomPage } from '@/pages/MyRoomPage';
import { Toaster } from 'sonner';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  if (isLoading) return <div className="flex items-center justify-center min-h-[80vh]">Loading...</div>;
  if (!user) return <Navigate to="/login" />;
  return <>{children}</>;
}

function AppRoutes() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<HomePage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/auth/callback" element={<AuthCallbackPage />} />
        <Route path="/lobby/:gameType" element={<ProtectedRoute><LobbyPage /></ProtectedRoute>} />
        <Route path="/room/:code" element={<ProtectedRoute><RoomPage /></ProtectedRoute>} />
        <Route path="/game/chess/:code" element={<ProtectedRoute><ChessPage /></ProtectedRoute>} />
        <Route path="/game/checkers/:code" element={<ProtectedRoute><CheckersPage /></ProtectedRoute>} />
        <Route path="/game/charades/:code" element={<ProtectedRoute><CharadesPage /></ProtectedRoute>} />
        <Route path="/history" element={<ProtectedRoute><HistoryPage /></ProtectedRoute>} />
        <Route path="/my-room" element={<ProtectedRoute><MyRoomPage /></ProtectedRoute>} />
      </Route>
    </Routes>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <SocketProvider>
          <AppRoutes />
          <Toaster />
        </SocketProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
