import { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  Users,
  Home,
  LogOut,
  Menu,
  X,
  Gamepad2,
  List,
  Trophy,
  Sparkles,
  LogIn,
  Calculator,
  GraduationCap,
  Globe,
  Crown,
  Settings,
  Medal,
  ChevronDown,
  ChevronRight,
  BarChart2,
  BookOpen,
  History,
  Wrench,
  Layers,
  Award,
  PieChart,
  ShieldCheck,
  Swords,
  type LucideIcon,
} from 'lucide-react';
import { logout as logoutApi, getCurrentUser, isAdmin, isLoggedIn } from '@/api/auth';

const LANG_OPTIONS = [
  { code: 'zh-Hans', label: '简体中文' },
  { code: 'zh-Hant', label: '繁體中文' },
  { code: 'en', label: 'English' },
  { code: 'ja', label: '日本語' },
] as const;

type NavLeaf = {
  type: 'item';
  path: string;
  labelKey: string;
  icon: LucideIcon;
};

type NavGroup = {
  type: 'group';
  id: string;
  labelKey: string;
  icon: LucideIcon;
  adminOnly?: boolean;
  children: NavLeaf[];
};

type NavEntry = NavLeaf | NavGroup;

const NAV_STRUCTURE: NavEntry[] = [
  { type: 'item', path: '/', labelKey: 'nav.home', icon: Home },
  { type: 'item', path: '/player-list', labelKey: 'nav.playerList', icon: List },
  {
    type: 'item',
    path: '/leagues',
    labelKey: 'nav.leagues',
    icon: Swords,
  },
  {
    type: 'group',
    id: 'games',
    labelKey: 'nav.gamesGroup',
    icon: Gamepad2,
    children: [
      { type: 'item', path: '/games', labelKey: 'nav.gameList', icon: List },
      { type: 'item', path: '/rooms', labelKey: 'nav.rooms', icon: Layers },
    ],
  },
  {
    type: 'group',
    id: 'rankings',
    labelKey: 'nav.rankingsGroup',
    icon: Trophy,
    children: [
      { type: 'item', path: '/pt-ranking', labelKey: 'nav.ptRanking', icon: Award },
      { type: 'item', path: '/ranking', labelKey: 'nav.ranking', icon: Crown },
    ],
  },
  {
    type: 'group',
    id: 'stats',
    labelKey: 'nav.statsGroup',
    icon: PieChart,
    children: [
      { type: 'item', path: '/fun-ranking', labelKey: 'nav.funRanking', icon: Medal },
      { type: 'item', path: '/paipu-stats', labelKey: 'nav.paipuStats', icon: BarChart2 },
      { type: 'item', path: '/starting-hands', labelKey: 'nav.startingHands', icon: Sparkles },
      { type: 'item', path: '/yakumans', labelKey: 'nav.yakumans', icon: Sparkles },
    ],
  },
  {
    type: 'group',
    id: 'tools',
    labelKey: 'nav.toolsGroup',
    icon: Wrench,
    children: [
      { type: 'item', path: '/rules', labelKey: 'nav.rules', icon: BookOpen },
      { type: 'item', path: '/calculator', labelKey: 'nav.calculator', icon: Calculator },
      { type: 'item', path: '/practice', labelKey: 'nav.practice', icon: GraduationCap },
    ],
  },
  { type: 'item', path: '/changelog', labelKey: 'nav.changelog', icon: History },
  {
    type: 'group',
    id: 'admin',
    labelKey: 'nav.adminGroup',
    icon: ShieldCheck,
    adminOnly: true,
    children: [
      { type: 'item', path: '/players', labelKey: 'nav.playerManagement', icon: Users },
      { type: 'item', path: '/rooms/online', labelKey: 'nav.onlineImport', icon: Globe },
      { type: 'item', path: '/league-admin', labelKey: 'nav.leagueAdmin', icon: Swords },
      { type: 'item', path: '/ranking-admin', labelKey: 'nav.rankingAdmin', icon: Settings },
    ],
  },
];

function matchActive(pathname: string, target: string): boolean {
  if (target === '/') return pathname === '/';
  if (target === '/rooms') {
    if (pathname === '/rooms/online') return false;
    return pathname === '/rooms' || pathname.startsWith('/rooms/');
  }
  if (target === '/games') {
    return pathname === '/games' || pathname.startsWith('/games/');
  }
  if (target === '/player-list') {
    return pathname === '/player-list' || pathname.startsWith('/player-list/');
  }
  if (target === '/leagues') {
    return pathname === '/leagues' || pathname.startsWith('/leagues/');
  }
  if (target === '/league-admin') {
    return pathname === '/league-admin' || pathname.startsWith('/league-admin/');
  }
  return pathname === target;
}

const SIDEBAR_GROUP_OVERRIDES_KEY = 'mahjong-sidebar-group-overrides';

type GroupOverride = 'expanded' | 'collapsed';

function loadInitialOverrides(): Record<string, GroupOverride> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(SIDEBAR_GROUP_OVERRIDES_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') {
      const result: Record<string, GroupOverride> = {};
      for (const [k, v] of Object.entries(parsed)) {
        if (v === 'expanded' || v === 'collapsed') result[k] = v;
      }
      return result;
    }
  } catch {
    // ignore parse errors and fall through
  }
  return {};
}

export default function MainLayout() {
  const { t, i18n } = useTranslation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [langOpen, setLangOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const user = getCurrentUser();
  const admin = isAdmin();

  const filteredNav = useMemo<NavEntry[]>(
    () => NAV_STRUCTURE.filter((entry) => !(entry.type === 'group' && entry.adminOnly && !admin)),
    [admin],
  );

  const [groupOverrides, setGroupOverrides] = useState<Record<string, GroupOverride>>(() =>
    loadInitialOverrides(),
  );

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(SIDEBAR_GROUP_OVERRIDES_KEY, JSON.stringify(groupOverrides));
    } catch {
      // ignore storage errors (e.g. private mode)
    }
  }, [groupOverrides]);

  const isGroupExpanded = (group: NavGroup): boolean => {
    const override = groupOverrides[group.id];
    if (override) return override === 'expanded';
    return group.children.some((child) => matchActive(location.pathname, child.path));
  };

  const toggleGroup = (group: NavGroup) => {
    const expanded = isGroupExpanded(group);
    setGroupOverrides((prev) => ({ ...prev, [group.id]: expanded ? 'collapsed' : 'expanded' }));
  };

  useEffect(() => {
    document.title = t('app.name');
  }, [t]);

  const computeHeaderLabel = (): string => {
    for (const entry of filteredNav) {
      if (entry.type === 'item' && matchActive(location.pathname, entry.path)) {
        return t(entry.labelKey);
      }
      if (entry.type === 'group') {
        for (const child of entry.children) {
          if (matchActive(location.pathname, child.path)) {
            return t(child.labelKey);
          }
        }
      }
    }
    return t('app.name');
  };
  const headerLabel = computeHeaderLabel();

  const handleLogout = async () => {
    await logoutApi();
    navigate('/');
  };

  const renderLeaf = (item: NavLeaf, isChild = false) => {
    const Icon = item.icon;
    const active = matchActive(location.pathname, item.path);
    return (
      <Link
        key={item.path}
        to={item.path}
        onClick={() => setSidebarOpen(false)}
        className={`flex items-center gap-3 rounded-xl text-sm font-medium transition-all duration-150 ${
          isChild ? 'pl-9 pr-4 py-2' : 'px-4 py-2.5'
        }`}
        style={{
          background: active ? 'var(--color-primary-light)' : 'transparent',
          color: active ? 'var(--color-primary-dark)' : 'var(--color-text-light)',
        }}
      >
        <Icon size={isChild ? 14 : 18} />
        <span className="truncate">{t(item.labelKey)}</span>
      </Link>
    );
  };

  const renderGroup = (group: NavGroup) => {
    const Icon = group.icon;
    const expanded = isGroupExpanded(group);
    const hasActiveChild = group.children.some((child) =>
      matchActive(location.pathname, child.path),
    );
    return (
      <div key={group.id} className="space-y-1">
        <button
          type="button"
          onClick={() => toggleGroup(group)}
          className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-150 hover:bg-gray-50"
          style={{
            color: hasActiveChild ? 'var(--color-primary-dark)' : 'var(--color-text-light)',
          }}
          aria-expanded={expanded}
        >
          <Icon size={18} />
          <span className="flex-1 text-left truncate">{t(group.labelKey)}</span>
          {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        </button>
        {expanded && (
          <div className="space-y-1">{group.children.map((child) => renderLeaf(child, true))}</div>
        )}
      </div>
    );
  };

  return (
    <div className="h-screen flex overflow-hidden" style={{ background: 'var(--color-bg)' }}>
      <aside
        className={`fixed inset-y-0 left-0 z-40 w-64 transform transition-transform duration-200 ease-in-out md:relative md:translate-x-0 md:transform-none md:h-screen md:flex-shrink-0 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
        style={{
          background: 'white',
          borderRight: '1px solid var(--color-border)',
          boxShadow: sidebarOpen ? '4px 0 20px rgba(0,0,0,0.1)' : 'none',
        }}
      >
        <div className="p-6 flex flex-col h-full">
          <div className="flex items-center gap-3 mb-6 flex-shrink-0">
            <img
              src="https://www.majsoul.tw/homepage/character/1/yiji_0.png"
              alt="Logo"
              className="w-10 h-10 rounded-full object-cover"
            />
            <span className="text-lg font-bold" style={{ color: 'var(--color-primary-dark)' }}>
              {t('app.name')}
            </span>
          </div>

          <nav className="flex-1 space-y-1 overflow-y-auto -mr-3 pr-3">
            {filteredNav.map((entry) =>
              entry.type === 'item' ? renderLeaf(entry) : renderGroup(entry),
            )}
          </nav>

          <div
            className="border-t pt-4 mt-4 flex-shrink-0"
            style={{ borderColor: 'var(--color-border)' }}
          >
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

      <main className="flex-1 min-w-0 h-screen overflow-y-auto">
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
                <span className="hidden sm:inline">
                  {LANG_OPTIONS.find((l) => l.code === i18n.language)?.label || '简体中文'}
                </span>
                <ChevronDown size={14} />
              </button>
              {langOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setLangOpen(false)} />
                  <div
                    className="absolute right-0 top-full mt-1 z-50 bg-white rounded-xl shadow-lg border py-1 min-w-[120px]"
                    style={{ borderColor: 'var(--color-border)' }}
                  >
                    {LANG_OPTIONS.map((lang) => (
                      <button
                        key={lang.code}
                        onClick={() => {
                          i18n.changeLanguage(lang.code);
                          localStorage.setItem('mahjong-lang', lang.code);
                          setLangOpen(false);
                        }}
                        className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 transition-colors"
                        style={{
                          fontWeight: i18n.language === lang.code ? 600 : 400,
                          color:
                            i18n.language === lang.code
                              ? 'var(--color-primary-dark)'
                              : 'var(--color-text)',
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
              <svg
                xmlns="http://www.w3.org/2000/svg"
                aria-hidden="true"
                focusable="false"
                viewBox="0 0 24 24"
                width="18"
                height="18"
                fill="currentColor"
                display="inline-block"
                overflow="visible"
                style={{ verticalAlign: 'text-bottom' }}
              >
                <path d="M10.226 17.284c-2.965-.36-5.054-2.493-5.054-5.256 0-1.123.404-2.336 1.078-3.144-.292-.741-.247-2.314.09-2.965.898-.112 2.111.36 2.83 1.01.853-.269 1.752-.404 2.853-.404 1.1 0 1.999.135 2.807.382.696-.629 1.932-1.1 2.83-.988.315.606.36 2.179.067 2.942.72.854 1.101 2 1.101 3.167 0 2.763-2.089 4.852-5.098 5.234.763.494 1.28 1.572 1.28 2.807v2.336c0 .674.561 1.056 1.235.786 4.066-1.55 7.255-5.615 7.255-10.646C23.5 6.188 18.334 1 11.978 1 5.62 1 .5 6.188.5 12.545c0 4.986 3.167 9.12 7.435 10.669.606.225 1.19-.18 1.19-.786V20.63a2.9 2.9 0 0 1-1.078.224c-1.483 0-2.359-.808-2.987-2.313-.247-.607-.517-.966-1.034-1.033-.27-.023-.359-.135-.359-.27 0-.27.45-.471.898-.471.652 0 1.213.404 1.797 1.235.45.651.921.943 1.483.943.561 0 .92-.202 1.437-.719.382-.381.674-.718.944-.943" />
              </svg>
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
