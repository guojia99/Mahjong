import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { confirmResetPassword, sendVerificationCode } from '@/api/auth';
import { useToast } from '@/hooks/useToast';

export default function ResetPasswordPage() {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { showToast, ToastComponent } = useToast();

  const [username, setUsername] = useState(searchParams.get('username') || '');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [systemPassword] = useState(searchParams.get('system_password') || '');
  const [codeSent, setCodeSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);

  const handleSendCode = async () => {
    if (!username.trim() || !email.trim()) {
      showToast(t('resetPassword.fillUsernameEmail'));
      return;
    }
    setSending(true);
    try {
      await sendVerificationCode(username.trim(), email.trim(), 'reset_password');
      setCodeSent(true);
      showToast(t('resetPassword.codeSent'), 'success');
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ||
        t('resetPassword.codeSendFailed');
      showToast(message);
    } finally {
      setSending(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await confirmResetPassword({
        username: username.trim(),
        email: email.trim(),
        code: code.trim(),
        new_password: newPassword,
        system_password: systemPassword || undefined,
      });
      showToast(t('resetPassword.success'), 'success');
      navigate('/login');
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ||
        t('resetPassword.failed');
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
      <div className="card" style={{ maxWidth: '28rem', width: '100%' }}>
        <div className="text-center mb-6">
          <img
            src="https://www.majsoul.tw/homepage/character/1/yiji_0.png"
            alt="Logo"
            className="w-16 h-16 rounded-full mx-auto mb-3 object-cover"
            style={{ boxShadow: '0 4px 20px rgba(232, 160, 191, 0.3)' }}
          />
          <h1 className="text-xl font-bold" style={{ color: 'var(--color-primary-dark)' }}>
            {t('resetPassword.title')}
          </h1>
          {systemPassword && (
            <p className="text-xs mt-2" style={{ color: 'var(--color-text-light)' }}>
              {t('resetPassword.systemPasswordHint')}
            </p>
          )}
          <p className="text-xs mt-2" style={{ color: 'var(--color-text-light)' }}>
            {t('resetPassword.emailRequiredHint')}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="form-group">
            <label className="form-label">{t('login.username')}</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="form-input"
              required
            />
          </div>
          <div className="form-group">
            <label className="form-label">{t('resetPassword.email')}</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="form-input"
              required
            />
          </div>
          <button
            type="button"
            className="btn btn-outline w-full"
            onClick={handleSendCode}
            disabled={sending || !username || !email}
          >
            {sending ? t('resetPassword.sending') : t('resetPassword.sendCode')}
          </button>
          {codeSent && (
            <>
              <div className="form-group">
                <label className="form-label">{t('resetPassword.code')}</label>
                <input
                  type="text"
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  className="form-input tracking-widest text-center"
                  maxLength={6}
                  required
                />
              </div>
              <div className="form-group">
                <label className="form-label">{t('resetPassword.newPassword')}</label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="form-input"
                  minLength={6}
                  required
                />
              </div>
              <button type="submit" className="btn btn-primary w-full" disabled={loading}>
                {loading ? t('resetPassword.submitting') : t('resetPassword.submit')}
              </button>
            </>
          )}
        </form>

        <p className="text-center text-xs mt-4" style={{ color: 'var(--color-text-light)' }}>
          <Link to="/login" className="hover:underline">
            {t('resetPassword.backToLogin')}
          </Link>
        </p>
      </div>
    </div>
  );
}
