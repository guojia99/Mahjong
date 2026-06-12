import { useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { changePassword, isLoggedIn } from '@/api/auth';
import { useToast } from '@/hooks/useToast';

export default function ChangePasswordPage() {
  const { t } = useTranslation();
  const { showToast, ToastComponent } = useToast();
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);

  if (!isLoggedIn()) {
    return <Navigate to="/login" replace />;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      showToast(t('changePassword.mismatch'));
      return;
    }
    setLoading(true);
    try {
      await changePassword(oldPassword, newPassword);
      showToast(t('changePassword.success'), 'success');
      setOldPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ||
        t('changePassword.failed');
      showToast(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-md mx-auto">
      {ToastComponent}
      <div className="card">
        <h2 className="text-xl font-bold mb-2" style={{ color: 'var(--color-primary-dark)' }}>
          {t('changePassword.title')}
        </h2>
        <p className="text-sm mb-6" style={{ color: 'var(--color-text-light)' }}>
          {t('changePassword.hint')}
        </p>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">{t('changePassword.oldPassword')}</label>
            <input
              type="password"
              value={oldPassword}
              onChange={(e) => setOldPassword(e.target.value)}
              className="form-input"
              required
              autoComplete="current-password"
            />
          </div>
          <div className="form-group">
            <label className="form-label">{t('changePassword.newPassword')}</label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="form-input"
              required
              minLength={6}
              autoComplete="new-password"
            />
          </div>
          <div className="form-group">
            <label className="form-label">{t('changePassword.confirmPassword')}</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="form-input"
              required
              minLength={6}
              autoComplete="new-password"
            />
          </div>
          <button type="submit" className="btn btn-primary w-full" disabled={loading}>
            {loading ? t('changePassword.submitting') : t('changePassword.submit')}
          </button>
        </form>
        <p className="text-xs text-center mt-4" style={{ color: 'var(--color-text-light)' }}>
          <Link to="/" className="hover:underline">
            {t('changePassword.backHome')}
          </Link>
        </p>
      </div>
    </div>
  );
}
