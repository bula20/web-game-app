import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/context/AuthContext';

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

export function RegisterPage() {
  const { t } = useTranslation();
  const { register } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (password !== confirmPassword) {
      setError(t('auth.passwordMismatch', 'Hasła nie są zgodne'));
      return;
    }
    setIsLoading(true);
    try {
      await register(username, email, password);
      navigate('/');
    } catch (err: any) {
      setError(err.response?.data?.error || t('auth.registerError', 'Rejestracja nie powiodła się'));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="pr-auth-shell">
      <div style={{ width: '100%', maxWidth: 460 }} className="fade-up">
        <div style={{ textAlign: 'center', marginBottom: -48 }}>
          <Link to="/" style={{ display: 'inline-block', textDecoration: 'none' }}>
            <img src="/logo.png" alt="PlayRoom" style={{ height: 300, width: 'auto' }} />
          </Link>
        </div>

        <div className="pr-auth-card">
          <h1 className="pr-auth-title" style={{ textAlign: 'center' }}>{t('auth.register', 'Załóż konto')}</h1>
          <p className="pr-auth-sub" style={{ textAlign: 'center' }}>
            {t('auth.registerSubtitle', 'Za chwilę będziesz grać.')}
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

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <label style={LABEL_STYLE}>{t('auth.username', 'Nazwa użytkownika')}</label>
              <input
                className="pr-input"
                value={username}
                onChange={e => setUsername(e.target.value)}
                placeholder="np. kasia.m"
                minLength={3}
                maxLength={30}
                pattern="[a-zA-Z0-9_]+"
                required
              />
            </div>
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
                minLength={6}
                required
              />
            </div>
            <div>
              <label style={LABEL_STYLE}>{t('auth.confirmPassword', 'Powtórz hasło')}</label>
              <input
                className="pr-input"
                type="password"
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
                minLength={6}
                required
              />
            </div>
            <button
              type="submit"
              className="pr-btn pr-btn-primary pr-btn-lg pr-btn-block"
              style={{ marginTop: 6 }}
              disabled={isLoading}
            >
              {isLoading ? '…' : t('auth.register', 'Załóż konto')}
            </button>
          </form>
        </div>

        <p style={{ textAlign: 'center', marginTop: 22, fontSize: 14, color: 'rgba(255,247,232,0.62)' }}>
          {t('auth.haveAccount', 'Masz już konto?')}{' '}
          <Link to="/login" style={{ color: 'var(--pr-primary)', textDecoration: 'none', fontWeight: 700 }}>
            {t('auth.login', 'Zaloguj się')}
          </Link>
        </p>
      </div>
    </div>
  );
}
