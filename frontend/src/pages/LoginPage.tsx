import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { login } from '@/api/auth';
import { useToast } from '@/hooks/useToast';

export default function LoginPage() {
  const { t } = useTranslation();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [useSystemPassword, setUseSystemPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { showToast, ToastComponent } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const data = await login(
        username,
        useSystemPassword ? undefined : password,
        useSystemPassword ? password : undefined,
      );
      if (data.requires_password_reset) {
        const params = new URLSearchParams({
          username,
          system_password: password,
        });
        navigate(`/reset-password?${params.toString()}`);
        return;
      }
      navigate('/');
    } catch (err: unknown) {
      const message = (err as { response?: { data?: { error?: string } } })?.response?.data?.error || t('login.failed');
      showToast(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4"
      style={{ background: 'linear-gradient(135deg, #fef9f4 0%, #f5cde0 50%, #d0eef7 100%)' }}
    >
      {ToastComponent}
      <div className="card" style={{ maxWidth: '24rem', width: '100%' }}>
        <div className="text-center mb-6">
          <img
            src="https://www.majsoul.tw/homepage/character/1/yiji_0.png"
            alt="Logo"
            className="w-20 h-20 rounded-full mx-auto mb-3 object-cover"
            style={{ boxShadow: '0 4px 20px rgba(232, 160, 191, 0.3)' }}
          />
          <h1 className="text-2xl font-bold" style={{ color: 'var(--color-primary-dark)' }}>
            {t('app.name')}
          </h1>
          <p className="text-sm mt-1" style={{ color: 'var(--color-text-light)' }}>
            {t('login.title')}
          </p>
          <p className="text-xs mt-1" style={{ color: 'var(--color-text-light)' }}>
            {t('login.nicknameHint')}
          </p>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">{t('login.username')}</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="form-input"
              placeholder={t('login.usernamePlaceholder')}
              required
            />
          </div>
          <div className="form-group">
            <label className="form-label">
              {useSystemPassword ? t('login.systemPassword') : t('login.password')}
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="form-input"
              placeholder={
                useSystemPassword ? t('login.systemPasswordPlaceholder') : t('login.passwordPlaceholder')
              }
              required
              minLength={useSystemPassword ? 1 : 6}
            />
          </div>
          <button
            type="submit"
            disabled={loading || !username || !password}
            className="btn btn-primary w-full"
            style={{ padding: '0.75rem' }}
          >
            {loading ? t('login.submitting') : t('login.submit')}
          </button>
        </form>

        <div className="mt-4 flex flex-col gap-2 text-center text-xs" style={{ color: 'var(--color-text-light)' }}>
          <button
            type="button"
            className="hover:underline"
            onClick={() => {
              setUseSystemPassword((v) => !v);
              setPassword('');
            }}
          >
            {useSystemPassword ? t('login.useRegularPassword') : t('login.useSystemPassword')}
          </button>
          {!useSystemPassword && (
            <Link to="/reset-password" className="hover:underline">
              {t('login.forgotPassword')}
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
