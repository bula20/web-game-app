// Strona-pośrednik dla Google OAuth. Backend po sukcesie przekierowuje tu z tokenem
// w query stringu (?token=...). Wyciągamy go, przekazujemy do AuthContext (zapis
// w localStorage + connectSocket) i wracamy na home. Brak tokenu => login.
import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { useTranslation } from 'react-i18next';

export function AuthCallbackPage() {
  const { t } = useTranslation();
  const { handleGoogleCallback } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  useEffect(() => {
    const token = searchParams.get('token');
    if (token) {
      handleGoogleCallback(token).then(() => navigate('/'));
    } else {
      navigate('/login');
    }
  }, []);

  return (
    <div className="flex items-center justify-center min-h-[80vh]">
      <p className="text-muted-foreground">{t('app.loading')}</p>
    </div>
  );
}
