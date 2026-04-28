import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/context/AuthContext';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

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
      setError(t('auth.loginError'));
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
      setError('Failed to login as guest');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '20px',
      background: `
        radial-gradient(900px 600px at 30% 30%, rgba(92,70,156,.35), transparent 65%),
        var(--ink-900)`,
    }}>
      <div style={{ width: '100%', maxWidth: 420 }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <Link to="/" style={{ textDecoration: 'none' }}>
            <span className="pr-logo" style={{ fontSize: 42 }}>PlayRoom</span>
          </Link>
        </div>

        {/* Card */}
        <div className="pr-card" style={{ padding: 32 }}>
          <h1 style={{ fontSize: 28, marginBottom: 6, textAlign: 'center' }}>{t('auth.login')}</h1>
          <p style={{ color: 'var(--pr-text-secondary)', fontSize: 14, textAlign: 'center', marginBottom: 28 }}>
            {t('auth.loginSubtitle', 'Zaloguj się i kontynuuj grę.')}
          </p>

          {error && (
            <div style={{
              background: 'rgba(248,113,113,.12)', border: '1px solid rgba(248,113,113,.3)',
              borderRadius: 8, padding: '10px 14px', marginBottom: 16,
              color: 'var(--pr-danger)', fontSize: 13,
            }}>
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <label style={{
                display: 'block', fontFamily: 'var(--font-head)', fontSize: 12,
                fontWeight: 600, letterSpacing: '.08em', textTransform: 'uppercase',
                color: 'var(--pr-text-secondary)', marginBottom: 6,
              }}>
                {t('auth.email')}
              </label>
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
              <label style={{
                display: 'block', fontFamily: 'var(--font-head)', fontSize: 12,
                fontWeight: 600, letterSpacing: '.08em', textTransform: 'uppercase',
                color: 'var(--pr-text-secondary)', marginBottom: 6,
              }}>
                {t('auth.password')}
              </label>
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
              className="pr-btn pr-btn-primary pr-btn-lg"
              style={{ width: '100%', marginTop: 4 }}
              disabled={isLoading}
            >
              {isLoading ? '…' : t('auth.login')}
            </button>
          </form>

          {/* Divider */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '24px 0', color: 'var(--pr-text-muted)', fontSize: 12 }}>
            <div style={{ flex: 1, height: 1, background: 'var(--pr-border-subtle)' }} />
            {t('auth.or', 'lub')}
            <div style={{ flex: 1, height: 1, background: 'var(--pr-border-subtle)' }} />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <a
              href={`${API_URL}/api/auth/google`}
              className="pr-btn pr-btn-secondary pr-btn-lg"
              style={{ width: '100%', textDecoration: 'none', justifyContent: 'center' }}
            >
              {t('auth.loginWithGoogle')}
            </a>
            <button
              className="pr-btn pr-btn-ghost pr-btn-lg"
              style={{ width: '100%' }}
              onClick={handleGuest}
              disabled={isLoading}
            >
              {t('auth.playAsGuest')}
            </button>
          </div>
        </div>

        {/* Footer link */}
        <p style={{ textAlign: 'center', marginTop: 20, fontSize: 14, color: 'var(--pr-text-muted)' }}>
          {t('auth.noAccount')}{' '}
          <Link to="/register" style={{ color: 'var(--pr-accent)', textDecoration: 'none', fontWeight: 600 }}>
            {t('auth.register')}
          </Link>
        </p>
      </div>
    </div>
  );
}
