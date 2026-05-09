# Mahjong 项目目录结构

> 排除 `.git/`、`backend/.venv/`、`frontend/node_modules/`、`__pycache__/`、`frontend/dist/`、`.idea/` 等生成目录

**产品概览**：日本立直麻将对局记录与 PT 统计助手；雀士详情页提供四麻半庄默认视角、一位～四位率、线上线下筛选、最近 N 局顺位折线与 PT 累计曲线等统计能力（详见根目录 `README.md` 与 `architecture.md`）。

```
Mahjong/
│
├── .gitignore
├── LICENSE
├── README.md
│
├── AI_Docs/                            # 项目文档与开发规范
│   ├── init.md                         # 第一期需求文档
│   ├── v1.2.0.md                       # v1.2.0 版本需求
│   ├── architecture.md                 # 架构设计文档 (DDD分层、数据模型、API、页面路由)
│   ├── getting-started.md              # 启动指南
│   ├── project-structure.md            # 本文件 - 项目目录结构说明
│   ├── log.md                          # 更新日志主文件 (zh-Hans，前端镜像存放于 frontend/public/changelog/)
│   ├── django-skills/                  # Django 开发提示词规范
│   │   ├── LICENSE
│   │   ├── README.md
│   │   └── skills/
│   │       ├── fix-types/
│   │       │   └── SKILL.md
│   │       ├── upgrade-js-deps/
│   │       │   └── SKILL.md
│   │       └── upgrade-python-deps/
│   │           └── SKILL.md
│   └── react-agent-skills/             # React 开发提示词规范
│       ├── AGENTS.md
│       ├── CLAUDE.md -> AGENTS.md
│       ├── README.md
│       ├── packages/
│       │   └── react-best-practices-build/
│       │       ├── package.json
│       │       ├── pnpm-lock.yaml
│       │       ├── test-cases.json
│       │       ├── tsconfig.json
│       │       └── src/
│       │           ├── build.ts
│       │           ├── config.ts
│       │           ├── extract-tests.ts
│       │           ├── migrate.ts
│       │           ├── parser.ts
│       │           ├── types.ts
│       │           └── validate.ts
│       └── skills/
│           ├── composition-patterns/
│           │   ├── AGENTS.md
│           │   ├── metadata.json
│           │   ├── README.md
│           │   ├── rules/
│           │   └── SKILL.md
│           ├── deploy-to-vercel/
│           │   ├── Archive.zip
│           │   ├── resources/
│           │   └── SKILL.md
│           ├── react-best-practices/
│           │   ├── AGENTS.md
│           │   ├── metadata.json
│           │   ├── README.md
│           │   ├── rules/              # (65个 .md 规则文件)
│           │   └── SKILL.md
│           ├── react-native-skills/
│           │   ├── AGENTS.md
│           │   ├── metadata.json
│           │   ├── README.md
│           │   ├── rules/              # (35个 .md 规则文件)
│           │   └── SKILL.md
│           ├── react-view-transitions/
│           │   ├── AGENTS.md
│           │   ├── metadata.json
│           │   ├── README.md
│           │   ├── references/
│           │   └── SKILL.md
│           ├── vercel-cli-with-tokens/
│           │   └── SKILL.md
│           └── web-design-guidelines/
│               └── SKILL.md
│
├── backend/                            # ====== Django 后端 (DDD架构) ======
│   ├── manage.py                       # Django 管理入口
│   ├── requirements.txt                # Python 依赖 (django, djangorestframework, django-cors-headers, Pillow)
│   ├── db_config.json                  # 数据库配置文件 (管理SQLite路径)
│   ├── db.sqlite3                      # SQLite 数据库
│   │
│   ├── config/                         # Django 项目配置
│   │   ├── __init__.py
│   │   ├── settings.py                 # 主配置 (REST_FRAMEWORK, CORS, AUTH_USER_MODEL, 时区Asia/Shanghai; USE_I18N=True, LocaleMiddleware, LANGUAGES 四语言, LOCALE_PATHS)
│   │   ├── urls.py                     # 根路由 (注册 auth/players/games/ranking 四组路由 + /api/v1/i18n/languages/ 语言列表接口)
│   │   ├── exception_handler.py        # 全局异常处理 (BusinessException -> JSON响应; gettext_lazy 自动解析)
│   │   ├── asgi.py
│   │   └── wsgi.py
│   │
│   ├── apps/                           # DDD 限界上下文 (应用层)
│   │   ├── __init__.py
│   │   │
│   │   ├── users/                      # --- 用户认证上下文 ---
│   │   │   ├── __init__.py
│   │   │   ├── apps.py                 # UsersConfig (name='apps.users')
│   │   │   ├── models.py               # User(AbstractUser) 领域模型
│   │   │   ├── services.py             # AuthService (login/logout; 错误信息使用 gettext_lazy 国际化)
│   │   │   ├── serializers.py          # Login/User 序列化器
│   │   │   ├── views.py                # LoginView, LogoutView, MeView; 响应消息使用 gettext_lazy
│   │   │   ├── urls.py                 # /auth/login, /auth/logout, /auth/me
│   │   │   ├── admin.py                # UserAdmin
│   │   │   ├── tests.py
│   │   │   └── migrations/
│   │   │       ├── 0001_initial.py
│   │   │       └── __init__.py
│   │   │
│   │   ├── players/                    # --- 雀士管理上下文 ---
│   │   │   ├── __init__.py
│   │   │   ├── apps.py                 # PlayersConfig (name='apps.players')
│   │   │   ├── models.py               # Player, MahjongSoulAccount 领域模型
│   │   │   ├── services.py             # PlayerService (CRUD, majsoul绑定/搜索; 错误信息使用 gettext_lazy)
│   │   │   ├── serializers.py          # Player/MajsoulAccount 序列化器 (列表/详情/创建/更新; 校验信息使用 gettext_lazy)
│   │   │   ├── views.py                # PlayerListView, PlayerDetailView, PlayerMajsoulAccountListView, MajsoulAccountDetailView; 响应使用 gettext_lazy
│   │   │   ├── urls.py                 # /players/, /players/<uuid>/, /players/<uuid>/majsoul-accounts/
│   │   │   ├── admin.py                # PlayerAdmin, MahjongSoulAccountAdmin
│   │   │   ├── tests.py
│   │   │   └── migrations/
│   │   │       ├── 0001_initial.py     # Player + MahjongSoulAccount
│   │   │       ├── 0002_initial.py     # 添加 created_by, player FK
│   │   │       └── __init__.py
│   │   │
│   │   ├── games/                      # --- 对局管理上下文 (房间+对局) ---
│   │   │   ├── __init__.py
│   │   │   ├── apps.py                 # GamesConfig (name='apps.games')
│   │   │   ├── models.py               # Room, RoomPlayer, Game, GamePlayer, HandRecord 领域模型
│   │   │   ├── services.py             # RoomService (CRUD/开关房间/增删成员), GameService (创建/换人/录分/导入线上局; 错误信息使用 gettext_lazy)
│   │   │   ├── serializers.py          # Room/Game/GamePlayer/Score/OnlineImport/HandRecord 序列化器; 校验信息使用 gettext_lazy
│   │   │   ├── views.py                # Room/Game/OnlineGame 相关视图；含 PlayerStatsView；所有响应消息使用 gettext_lazy
│   │   │   ├── urls.py                 # /rooms/, /rooms/<uuid>/, /rooms/<uuid>/close/, /rooms/<uuid>/players/, /rooms/<uuid>/games/
│   │   │   ├── game_urls.py            # /games/<uuid>/, /games/<uuid>/scores/, /games/<uuid>/players/, /games/online/
│   │   │   ├── admin.py                # RoomAdmin, RoomPlayerAdmin, GameAdmin, GamePlayerAdmin
│   │   │   ├── tests.py
│   │   │   └── migrations/
│   │   │       ├── 0001_initial.py     # Game, GamePlayer, Room, RoomPlayer
│   │   │       ├── 0002_initial.py     # 添加 FK 关系
│   │   │       └── __init__.py
│   │   │
│   │   └── ranking/                    # --- 天梯排位上下文 ---
│   │       ├── __init__.py
│   │       ├── apps.py                 # RankingConfig
│   │       ├── models.py               # UmaConfig, RankTier, PlayerRankingScore, GameRankingResult 领域模型
│   │       ├── services.py             # 排位分结算/重算/排行榜服务
│   │       ├── serializers.py          # 排位配置/排行榜/对局结算 序列化器
│   │       ├── views.py                # 排位CRUD/排行榜/结算/重算视图; 响应消息使用 gettext_lazy
│   │       ├── urls.py                 # /ranking/ 路由
│   │       ├── admin.py
│   │       ├── tests.py
│   │       └── migrations/
│   │           ├── 0001_initial.py
│   │           ├── 0002_default_tiers_and_uma.py
│   │           ├── 0003_gamerankingresult.py
│   │           └── __init__.py
│   │
│   ├── common/                         # 公共工具层
│   │   ├── __init__.py
│   │   ├── exceptions.py              # BusinessException, ScoreValidationError, PlayerAlreadyInGame, GameAlreadyScored
│   │   └── permissions.py             # IsAdminUserOrReadOnly (GET公开, 写操作需管理员)
│   │
│   ├── services/                       # 基础设施服务层
│   │   ├── __init__.py
│   │   └── majsoul.py                  # 雀魂牌谱（Node paipu.js --detail：完整 actions 入库；validate_paipu_detail_record；见 docs/paipu-data-schema.md）
│   │
│   ├── locale/                         # 国际化翻译文件 (v1.5.0 新增)
│   │   ├── zh_Hans/LC_MESSAGES/        # 简体中文 (默认语言)
│   │   │   ├── django.po
│   │   │   └── django.mo
│   │   ├── zh_Hant/LC_MESSAGES/        # 繁體中文
│   │   │   ├── django.po
│   │   │   └── django.mo
│   │   ├── en/LC_MESSAGES/             # English
│   │   │   ├── django.po
│   │   │   └── django.mo
│   │   └── ja/LC_MESSAGES/             # 日本語
│   │       ├── django.po
│   │       └── django.mo
│   │
│   └── media/                          # 上传文件
│       └── avatars/                    # 雀士头像存储
│
└── frontend/                           # ====== React TypeScript 前端 ======
    ├── package.json                    # 依赖 (react, react-router-dom, axios, lucide-react, tailwindcss, i18next, react-i18next)
    ├── package-lock.json
    ├── vite.config.ts                  # Vite配置 (别名@, 代理/api和/media到后端8000端口)
    ├── tsconfig.json
    ├── tsconfig.app.json               # 应用TS配置 (路径别名@/*)
    ├── tsconfig.node.json
    ├── eslint.config.js
    ├── index.html                      # 入口HTML (favicon使用一姬头像)
    ├── README.md
    │
    ├── public/
    │   ├── favicon.svg
    │   ├── icons.svg
    │   ├── marjongs/                    # 麻将牌图片 (.webp)
    │   └── changelog/                   # 更新日志静态资源 (按语言切换)
    │       ├── zh-Hans.md
    │       ├── zh-Hant.md
    │       ├── en.md
    │       └── ja.md
    │
    └── src/
        ├── main.tsx                    # 应用入口 (导入 i18n 初始化)
        ├── App.tsx                     # 路由配置 (ProtectedRoute + 嵌套布局)
        ├── index.css                   # 全局样式 (Tailwind + 自定义CSS变量/按钮/卡片/表单/模态框/Toast)
        │
        ├── i18n/                       # 国际化配置 (v1.5.0 新增)
        │   ├── index.ts                # i18next 初始化 (语言检测/持久化/fallback=zh-Hans, 支持四语言)
        │   └── locales/                # 翻译文件 (~656 key/语言)
        │       ├── zh-Hans.ts          # 简体中文 (默认)
        │       ├── zh-Hant.ts          # 繁體中文
        │       ├── en.ts               # English
        │       └── ja.ts               # 日本語
        │
        ├── types/
        │   └── index.ts                # TypeScript类型定义 (User, Player, Room, Game, GamePlayer, MajsoulAccount, 枚举常量)
        │
        ├── api/                        # API 请求层
        │   ├── client.ts               # Axios 实例 (Token拦截器, 401自动跳转登录)
        │   ├── auth.ts                 # 认证API (login, register, logout, getMe, isLoggedIn, getCurrentUser)
        │   ├── players.ts              # 雀士API (CRUD, majsoul账号管理)
        │   ├── games.ts                # 房间/对局API (房间CRUD, 对局CRUD, 录分, 换人, 线上导入)
        │   └── ranking.ts              # 排位API (段位/马点/排行榜/雀士排位)
        │
        ├── layouts/
        │   └── MainLayout.tsx          # 主布局 (侧边栏导航 + 顶部栏 + 语言切换下拉 + GitHub图标链接 + 响应式抽屉菜单)
        │
        ├── components/                 # 通用组件
        │   ├── Modal.tsx               # 模态框 (overlay + 动画)
        │   ├── PlayerCard.tsx          # 雀士卡片 (头像/昵称/分数/东起标记/可移除)
        │   ├── SearchBar.tsx           # 搜索框 (带图标)
        │   ├── YakumanCard.tsx         # 役满卡片 (手牌/副露展示)
        │   ├── HandRecordModal.tsx     # 役满牌谱录入弹窗 (选雀士/选役种/选牌)
        │   ├── PlayerStatsLineChart.tsx # 雀士统计折线图 (顺位趋势/PT累计)
        │   ├── PointsQuickReference.tsx # 点数速查表 (亲家/子家, 翻符对照)
        │   ├── SortablePlayerList.tsx  # 可排序雀士列表
        │   └── RankTierBadge.tsx       # 段位徽章
        │
        ├── hooks/
        │   └── useToast.tsx            # Toast提示hook (成功/错误, 3秒自动消失)
        │
        ├── mahjong-calc/               # 麻雀点数计算引擎
        │   ├── types.ts                # 计算类型定义
        │   ├── calc.ts                 # 点数/符计算核心逻辑
        │   ├── yaku.ts                 # 役种判定 (getName 国际化)
        │   ├── definition.ts           # 满贯/跳满等点数定义 (MAN_TYPE_NAMES)
        │   ├── kifuText.ts             # 牌谱文本解析/序列化
        │   ├── scoringQuickTable.ts    # 点数速查表数据
        │   ├── yakuPracticeGenerator.ts # 役种练习题目生成器
        │   └── problem.ts              # 练习题数据结构
        │
        ├── pages/                      # 页面组件
        │   ├── LoginPage.tsx           # 登录/注册页 (渐变背景, 一姬头像, 表单切换)
        │   ├── HomePage.tsx            # 首页仪表盘 (雀士数/房间数/对局数统计卡片, 进行中房间列表, 排位规则说明, 段位表, 马点配置)
        │   ├── PlayersPage.tsx         # 雀士管理页 (搜索/创建/编辑/删除, 雀魂账号绑定弹窗)
        │   ├── PlayerListPage.tsx      # 雀士列表 (搜索/浏览/排序)
        │   ├── PlayerProfilePage.tsx   # 雀士详情 (统计/对局/役满/信息；统计含位率与曲线；排位分与段位)
        │   ├── RoomsPage.tsx           # 房间列表页 (筛选全部/进行中/已关闭, 创建/关闭房间)
        │   ├── RoomDetailPage.tsx      # 房间详情页 (成员管理, 新建对局:选选手+选模式+选时间)
        │   ├── GameDetailPage.tsx      # 对局详情页 (选手列表, 录入分数弹窗:4人=1000/3人=1050, 更换选手弹窗, 役满牌谱管理)
        │   ├── GameListPage.tsx        # 对局列表页 (筛选人数/模式/类型, 牌谱链接)
        │   ├── OnlineGamePage.tsx      # 线上对局导入页 (批量粘贴牌谱链接, 自动解析, 雀魂UID关联, 批量导入)
        │   ├── PtRankingPage.tsx       # PT排名页 (全量/线下/线上筛选, 人数/模式筛选)
        │   ├── FunRankingPage.tsx      # 趣味排行页 (一位率/平均顺位/最高得点等, 最少局数筛选)
        │   ├── YakumanListPage.tsx     # 役满列表页 (类型筛选)
        │   ├── CalculatorPage.tsx      # 点数计算器 (手牌/副露/宝牌输入, 翻符结果, 牌谱复制粘贴)
        │   ├── PracticePage.tsx        # 点数练习 (随机出题, 答案输入, 正确率统计, 牌谱导入)
        │   ├── YakuPracticePage.tsx    # 役种专项练习 (按役种分类, 牌谱导入)
        │   ├── RankingLeaderboardPage.tsx # 天梯排位排行榜 (段位/排位分)
        │   ├── RankingAdminPage.tsx    # 排位配置管理 (段位表CRUD, 马点配置CRUD, 一键重算)
        │   ├── RankingInfoPage.tsx     # 排位分说明 (计分规则, 段位一览, 马点配置)
        │   └── ChangelogPage.tsx       # 更新日志 (从 /changelog/{lang}.md 读取，复用 RulesMdReader)
        │
        ├── assets/                     # 静态资源
        │   ├── hero.png
        │   ├── react.svg
        │   └── vite.svg
        │
        ├── services/                   # 前端服务层
        │   └── playerAvatarCache.ts    # 雀士头像缓存
        │
        └── utils/                      # (预留工具函数目录)
    ```
