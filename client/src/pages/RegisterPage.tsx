import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/context/AuthContext';

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
    if (password !== confirmPassword) { setError('Passwords do not match'); return; }
    setIsLoading(true);
    try {
      await register(username, email, password);
      navigate('/');
    } catch (err: any) {
      setError(err.response?.data?.error || t('auth.registerError'));
    } finally {
      setIsLoading(false);
    }
  };

  const labelStyle = {
    display: 'block', fontFamily: 'var(--font-head)', fontSize: 12,
    fontWeight: 600, letterSpacing: '.08em', textTransform: 'uppercase' as const,
    color: 'var(--pr-text-secondary)', marginBottom: 6,
  };

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px',
      background: `radial-gradient(900px 600px at 70% 30%, rgba(92,70,156,.35), transparent 65%), var(--ink-900)`,
    }}>
      <div style={{ width: '100%', maxWidth: 420 }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <Link to="/" style={{ textDecoration: 'none' }}>
            <span className="pr-logo" style={{ fontSize: 42 }}>PlayRoom</span>
          </Link>
        </div>

        <div className="pr-card" style={{ padding: 32 }}>
          <h1 style={{ fontSize: 28, marginBottom: 6, textAlign: 'center' }}>{t('auth.register')}</h1>
          <p style={{ color: 'var(--pr-text-secondary)', fontSize: 14, textAlign: 'center', marginBottom: 28 }}>
            {t('auth.registerSubtitle', 'Za chwilę będziesz grać.')}
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

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <label style={labelStyle}>{t('auth.username')}</label>
              <input className="pr-input" value={username} onChange={e => setUsername(e.target.value)}
                placeholder="np. kasia.m" minLength={3} maxLength={30} pattern="[a-zA-Z0-9_]+" required />
            </div>
            <div>
              <label style={labelStyle}>{t('auth.email')}</label>
              <input className="pr-input" type="email" value={email} onChange={e => setEmail(e.target.value)}
                placeholder="ty@example.pl" required />
            </div>
            <div>
              <label style={labelStyle}>{t('auth.password')}</label>
              <input className="pr-input" type="password" value={password} onChange={e => setPassword(e.target.value)}
                placeholder="••••••••" minLength={6} required />
            </div>
            <div>
              <label style={labelStyle}>{t('auth.confirmPassword')}</label>
              <input className="pr-input" type="password" value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                placeholder="••••••••" minLength={6} required />
            </div>
            <button
              type="submit"
              className="pr-btn pr-btn-primary pr-btn-lg"
              style={{ width: '100%', marginTop: 6 }}
              disabled={isLoading}
            >
              {isLoading ? '…' : t('auth.register')}
            </button>
          </form>
        </div>

        <p style={{ textAlign: 'center', marginTop: 20, fontSize: 14, color: 'var(--pr-text-muted)' }}>
          {t('auth.haveAccount')}{' '}
          <Link to="/login" style={{ color: 'var(--pr-accent)', textDecoration: 'none', fontWeight: 600 }}>
            {t('auth.login')}
          </Link>
        </p>
      </div>
    </div>
  );
}
