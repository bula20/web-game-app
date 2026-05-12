// Strona logowania. Trzy ścieżki: email/hasło (login z AuthContext), gość
// (loginAsGuest), Google OAuth (przekierowanie na /api/auth/google - serwer
// po sukcesie wraca z tokenem na /auth/callback).
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/context/AuthContext';

// Bezpośredni link do Google OAuth (poza axios, bo to przekierowanie pełnej strony).
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

const LABEL_STYLE = {
  display: 'block',
  fontFamily: 'var(--font-head)',
  fontSize: 12,
  fontWeight: 700,
  letterSpacing: '.08em',
  textTransform: 'uppercase' as const,
  color: 'rgba(255,247,232,0.65)',
  marginBottom: 6,
};

export function LoginPage() {
  const { t } = useTranslation();
  const { login, loginAsGuest } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);
    try {
      await login(email, password);
      navigate('/');
    } catch {
      setError(t('auth.loginError', 'Nieprawidłowy email lub hasło'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleGuest = async () => {
    setIsLoading(true);
    try {
      await loginAsGuest();
      navigate('/');
    } catch {
      setError(t('auth.guestError', 'Nie udało się zalogować jako gość'));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="pr-auth-shell">
      <div style={{ width: '100%', maxWidth: 460 }} className="fade-up">
        <div style={{ textAlign: 'center', marginBottom: -48}}>
          <Link to="/" style={{ display: 'inline-block', textDecoration: 'none' }}>
            <img src="/logo.png" alt="PlayRoom" style={{ height: 300, width: 'auto' }} />
          </Link>
        </div>

        <div className="pr-auth-card">
          <h1 className="pr-auth-title" style={{ textAlign: 'center' }}>{t('auth.login', 'Zaloguj się')}</h1>
          <p className="pr-auth-sub" style={{ textAlign: 'center' }}>
            {t('auth.loginSubtitle', 'Zaloguj się i kontynuuj grę.')}
          </p>

          {error && (
            <div style={{
              background: 'rgba(239,68,68,0.14)',
              border: '1px solid rgba(239,68,68,0.36)',
              borderRadius: 12, padding: '10px 14px', marginBottom: 18,
              color: '#FCA5A5', fontSize: 13,
            }}>
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <label style={LABEL_STYLE}>{t('auth.email', 'Email')}</label>
              <input
                className="pr-input"
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="ty@example.pl"
                required
              />
            </div>
            <div>
              <label style={LABEL_STYLE}>{t('auth.password', 'Hasło')}</label>
              <input
                className="pr-input"
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                required
              />
            </div>

            <button
              type="submit"
              className="pr-btn pr-btn-primary pr-btn-lg pr-btn-block"
              style={{ marginTop: 4 }}
              disabled={isLoading}
            >
              {isLoading ? '…' : t('auth.login', 'Zaloguj się')}
            </button>
          </form>

          <div className="pr-divider">{t('auth.or', 'lub')}</div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <a
              href={`${API_URL}/api/auth/google`}
              className="pr-btn-google"
            >
              <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
                <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.17-1.84H9v3.49h4.84a4.14 4.14 0 0 1-1.8 2.71v2.26h2.92c1.71-1.57 2.68-3.88 2.68-6.62z"/>
                <path fill="#34A853" d="M9 18c2.43 0 4.47-.81 5.96-2.18l-2.92-2.26c-.81.54-1.84.86-3.04.86a5.27 5.27 0 0 1-4.96-3.65H1v2.3A9 9 0 0 0 9 18z"/>
                <path fill="#FBBC05" d="M4.04 10.77a5.4 5.4 0 0 1 0-3.54v-2.3H1a9 9 0 0 0 0 8.13l3.04-2.29z"/>
                <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58A9 9 0 0 0 9 0 9 9 0 0 0 1 4.93l3.04 2.3A5.27 5.27 0 0 1 9 3.58z"/>
              </svg>
              {t('auth.loginWithGoogle', 'Zaloguj z Google')}
            </a>
            <button
              className="pr-btn pr-btn-ghost pr-btn-lg pr-btn-block"
              onClick={handleGuest}
              disabled={isLoading}
            >
              {t('auth.playAsGuest', 'Graj jako gość')}
            </button>
          </div>
        </div>

        <p style={{ textAlign: 'center', marginTop: 22, fontSize: 14, color: 'rgba(255,247,232,0.62)' }}>
          {t('auth.noAccount', 'Nie masz konta?')}{' '}
          <Link to="/register" style={{ color: 'var(--pr-primary)', textDecoration: 'none', fontWeight: 700 }}>
            {t('auth.register', 'Zarejestruj się')}
          </Link>
        </p>
      </div>
    </div>
  );
}
