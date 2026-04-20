import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { login } from '@/api/auth';
import { useToast } from '@/hooks/useToast';

export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { showToast, ToastComponent } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await login(username, password);
      navigate('/');
    } catch (err: unknown) {
      const message = (err as { response?: { data?: { error?: string } } })?.response?.data?.error || '登录失败';
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
            嘉の雀桩
          </h1>
          <p className="text-sm mt-1" style={{ color: 'var(--color-text-light)' }}>
            管理员登录
          </p>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">用户名</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="form-input"
              placeholder="请输入用户名"
              required
            />
          </div>
          <div className="form-group">
            <label className="form-label">密码</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="form-input"
              placeholder="请输入密码"
              required
              minLength={6}
            />
          </div>
          <button
            type="submit"
            disabled={loading || !username || !password}
            className="btn btn-primary w-full"
            style={{ padding: '0.75rem' }}
          >
            {loading ? '请稍候...' : '登录'}
          </button>
        </form>
      </div>
    </div>
  );
}
