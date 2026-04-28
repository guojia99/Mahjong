import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Users, Home, LogOut, Menu, X, Gamepad2, List, Trophy, Sparkles, LogIn, Calculator, GraduationCap, Globe, Crown, Settings, Medal, ChevronDown } from 'lucide-react';
import { logout as logoutApi, getCurrentUser, isAdmin, isLoggedIn } from '@/api/auth';

const LANG_OPTIONS = [
  { code: 'zh-Hans', label: '简体中文' },
  { code: 'zh-Hant', label: '繁體中文' },
  { code: 'en', label: 'English' },
  { code: 'ja', label: '日本語' },
] as const;

const publicNavItems = [
  { path: '/', labelKey: 'nav.home', icon: Home },
  { path: '/player-list', labelKey: 'nav.playerList', icon: List },
  { path: '/rooms', labelKey: 'nav.rooms', icon: Gamepad2 },
  { path: '/games', labelKey: 'nav.gameList', icon: Gamepad2 },
  { path: '/pt-ranking', labelKey: 'nav.ptRanking', icon: Trophy },
  { path: '/fun-ranking', labelKey: 'nav.funRanking', icon: Medal },
  { path: '/ranking', labelKey: 'nav.ranking', icon: Crown },
  { path: '/yakumans', labelKey: 'nav.yakumans', icon: Sparkles },
  { path: '/calculator', labelKey: 'nav.calculator', icon: Calculator },
  { path: '/practice', labelKey: 'nav.practice', icon: GraduationCap },
];

const adminNavItems = [
  { path: '/players', labelKey: 'nav.playerManagement', icon: Users },
  { path: '/ranking-admin', labelKey: 'nav.rankingAdmin', icon: Settings },
];

const roomsAdminSubItem = { path: '/rooms/online', labelKey: 'nav.onlineImport', icon: Globe };

export default function MainLayout() {
  const { t, i18n } = useTranslation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [langOpen, setLangOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const user = getCurrentUser();
  const admin = isAdmin();

  const navItems = admin ? [...publicNavItems, ...adminNavItems] : publicNavItems;

  useEffect(() => {
    document.title = t('app.name');
  }, [t]);

              const exactPaths = ['/', '/player-list', '/games', '/pt-ranking', '/fun-ranking', '/ranking', '/rooms/online', '/ranking-admin', '/yakumans', '/calculator', '/practice'];

  const renderNavItem = (item: typeof navItems[number]) => {
    const Icon = item.icon;
    const isActive = location.pathname === item.path ||
      (item.path !== '/' && !exactPaths.includes(item.path) && location.pathname.startsWith(item.path));
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
        {t(item.labelKey)}
      </Link>
    );
  };

  const headerLabel = (() => {
    if (location.pathname === roomsAdminSubItem.path) return t(roomsAdminSubItem.labelKey);
    const matched = navItems.find(
      (item) =>
        item.path === location.pathname ||
        (item.path !== '/' && location.pathname.startsWith(item.path))
    );
    return matched ? t(matched.labelKey) : t('app.name');
  })();

  const handleLogout = async () => {
    await logoutApi();
    navigate('/');
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
              {t('app.name')}
            </span>
          </div>

          <nav className="flex-1 space-y-1">
            {navItems.map((item) => {
              if (item.path === '/rooms' && admin) {
                return (
                  <div key={item.path}>
                    {renderNavItem(item)}
                    <Link
                      to={roomsAdminSubItem.path}
                      onClick={() => setSidebarOpen(false)}
                      className="flex items-center gap-3 pl-10 pr-4 py-2 rounded-lg text-xs font-medium transition-all duration-150"
                      style={{
                        background: location.pathname === roomsAdminSubItem.path ? 'var(--color-primary-light)' : 'transparent',
                        color: location.pathname === roomsAdminSubItem.path ? 'var(--color-primary-dark)' : 'var(--color-text-light)',
                      }}
                    >
                      <roomsAdminSubItem.icon size={14} />
                      {t(roomsAdminSubItem.labelKey)}
                    </Link>
                  </div>
                );
              }
              return renderNavItem(item);
            })}
          </nav>

          <div className="border-t pt-4 mt-4" style={{ borderColor: 'var(--color-border)' }}>
            {isLoggedIn() ? (
              <>
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
                  {t('app.logout')}
                </button>
              </>
            ) : (
              <Link
                to="/login"
                onClick={() => setSidebarOpen(false)}
                className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium w-full transition-all duration-150 hover:bg-gray-50"
                style={{ color: 'var(--color-text-light)' }}
              >
                <LogIn size={18} />
                {t('app.adminLogin')}
              </Link>
            )}
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
          <h1 className="text-lg font-bold flex-1" style={{ color: 'var(--color-text)' }}>
            {headerLabel}
          </h1>
          <div className="flex items-center gap-2">
            <div className="relative">
              <button
                onClick={() => setLangOpen(!langOpen)}
                className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-medium transition-all duration-150 hover:bg-gray-100"
                style={{ color: 'var(--color-text-light)' }}
              >
                <Globe size={16} />
                <span className="hidden sm:inline">{LANG_OPTIONS.find(l => l.code === i18n.language)?.label || '简体中文'}</span>
                <ChevronDown size={14} />
              </button>
              {langOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setLangOpen(false)} />
                  <div
                    className="absolute right-0 top-full mt-1 z-50 bg-white rounded-xl shadow-lg border py-1 min-w-[120px]"
                    style={{ borderColor: 'var(--color-border)' }}
                  >
                    {LANG_OPTIONS.map(lang => (
                      <button
                        key={lang.code}
                        onClick={() => { i18n.changeLanguage(lang.code); setLangOpen(false); }}
                        className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 transition-colors"
                        style={{
                          fontWeight: i18n.language === lang.code ? 600 : 400,
                          color: i18n.language === lang.code ? 'var(--color-primary-dark)' : 'var(--color-text)',
                        }}
                      >
                        {lang.label}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
            <a
              href="https://github.com/guojia99/Mahjong"
              target="_blank"
              rel="noopener noreferrer"
              className="p-1.5 rounded-lg transition-all duration-150 hover:bg-gray-100"
              style={{ color: 'var(--color-text-light)' }}
              aria-label="GitHub"
            >
              <svg xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false" viewBox="0 0 24 24" width="18" height="18" fill="currentColor" display="inline-block" overflow="visible" style={{ verticalAlign: 'text-bottom' }}><path d="M10.226 17.284c-2.965-.36-5.054-2.493-5.054-5.256 0-1.123.404-2.336 1.078-3.144-.292-.741-.247-2.314.09-2.965.898-.112 2.111.36 2.83 1.01.853-.269 1.752-.404 2.853-.404 1.1 0 1.999.135 2.807.382.696-.629 1.932-1.1 2.83-.988.315.606.36 2.179.067 2.942.72.854 1.101 2 1.101 3.167 0 2.763-2.089 4.852-5.098 5.234.763.494 1.28 1.572 1.28 2.807v2.336c0 .674.561 1.056 1.235.786 4.066-1.55 7.255-5.615 7.255-10.646C23.5 6.188 18.334 1 11.978 1 5.62 1 .5 6.188.5 12.545c0 4.986 3.167 9.12 7.435 10.669.606.225 1.19-.18 1.19-.786V20.63a2.9 2.9 0 0 1-1.078.224c-1.483 0-2.359-.808-2.987-2.313-.247-.607-.517-.966-1.034-1.033-.27-.023-.359-.135-.359-.27 0-.27.45-.471.898-.471.652 0 1.213.404 1.797 1.235.45.651.921.943 1.483.943.561 0 .92-.202 1.437-.719.382-.381.674-.718.944-.943"/></svg>
            </a>
          </div>
        </header>

        <div className="p-4 md:p-8 max-w-5xl mx-auto">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
