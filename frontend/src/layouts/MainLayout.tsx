import { useState } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Users, Home, LogOut, Menu, X, Gamepad2, List, Trophy, Sparkles } from 'lucide-react';
import { logout as logoutApi, getCurrentUser } from '@/api/auth';

const navItems = [
  { path: '/', label: '首页', icon: Home },
  { path: '/players', label: '雀士管理', icon: Users },
  { path: '/player-list', label: '雀士列表', icon: List },
  { path: '/rooms', label: '房间', icon: Gamepad2 },
  { path: '/games', label: '对局列表', icon: Gamepad2 },
  { path: '/pt-ranking', label: 'PT排名', icon: Trophy },
  { path: '/yakumans', label: '役满列表', icon: Sparkles },
];

export default function MainLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const user = getCurrentUser();

  const handleLogout = async () => {
    await logoutApi();
    navigate('/login');
  };

  return (
    <div className="min-h-screen flex" style={{ background: 'var(--color-bg)' }}>
      <aside
        className={`fixed inset-y-0 left-0 z-40 w-64 transform transition-transform duration-200 ease-in-out md:relative md:translate-x-0 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
        style={{
          background: 'white',
          borderRight: '1px solid var(--color-border)',
          boxShadow: sidebarOpen ? '4px 0 20px rgba(0,0,0,0.1)' : 'none',
        }}
      >
        <div className="p-6 flex flex-col h-full">
          <div className="flex items-center gap-3 mb-8">
            <img
              src="https://www.majsoul.tw/homepage/character/1/yiji_0.png"
              alt="Logo"
              className="w-10 h-10 rounded-full object-cover"
            />
            <span className="text-lg font-bold" style={{ color: 'var(--color-primary-dark)' }}>
              嘉の雀桩
            </span>
          </div>

          <nav className="flex-1 space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = location.pathname === item.path || 
                (item.path !== '/' && location.pathname.startsWith(item.path));
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  onClick={() => setSidebarOpen(false)}
                  className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-150"
                  style={{
                    background: isActive ? 'var(--color-primary-light)' : 'transparent',
                    color: isActive ? 'var(--color-primary-dark)' : 'var(--color-text-light)',
                  }}
                >
                  <Icon size={18} />
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="border-t pt-4 mt-4" style={{ borderColor: 'var(--color-border)' }}>
            <div className="flex items-center gap-3 px-4 py-2 mb-2">
              <div className="avatar-placeholder text-xs">
                {(user?.username || 'U').charAt(0).toUpperCase()}
              </div>
              <span className="text-sm font-medium truncate">{user?.username || 'User'}</span>
            </div>
            <button
              onClick={handleLogout}
              className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium w-full transition-all duration-150 hover:bg-red-50 text-gray-400 hover:text-red-500"
            >
              <LogOut size={18} />
              退出登录
            </button>
          </div>
        </div>
      </aside>

      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/20 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <main className="flex-1 min-h-screen overflow-y-auto">
        <header
          className="sticky top-0 z-20 px-4 py-3 md:px-8 md:py-4 flex items-center gap-4"
          style={{
            background: 'rgba(254, 249, 244, 0.85)',
            backdropFilter: 'blur(12px)',
            borderBottom: '1px solid var(--color-border)',
          }}
        >
          <button
            className="md:hidden p-2 rounded-lg hover:bg-gray-100"
            onClick={() => setSidebarOpen(!sidebarOpen)}
          >
            {sidebarOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
          <h1 className="text-lg font-bold" style={{ color: 'var(--color-text)' }}>
            {navItems.find(
              (item) =>
                item.path === location.pathname ||
                (item.path !== '/' && location.pathname.startsWith(item.path))
            )?.label || '嘉の雀桩'}
          </h1>
        </header>

        <div className="p-4 md:p-8 max-w-5xl mx-auto">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
