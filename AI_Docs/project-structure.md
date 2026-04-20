# Mahjong 项目目录结构

> 排除 `.git/`、`backend/.venv/`、`frontend/node_modules/`、`__pycache__/`、`frontend/dist/`、`.idea/` 等生成目录

```
Mahjong/
│
├── .gitignore
├── LICENSE
├── README.md
│
├── AI_Docs/                            # 项目文档与开发规范
│   ├── init.md                         # 第一期需求文档
│   ├── architecture.md                 # 架构设计文档 (DDD分层、数据模型、API、页面路由)
│   ├── getting-started.md              # 启动指南
│   ├── project-structure.md            # 本文件 - 项目目录结构说明
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
│   ├── db.sqlite3                      # SQLite 数据库
│   │
│   ├── config/                         # Django 项目配置
│   │   ├── __init__.py
│   │   ├── settings.py                 # 主配置 (REST_FRAMEWORK, CORS, AUTH_USER_MODEL, 时区Asia/Shanghai)
│   │   ├── urls.py                     # 根路由 (注册 auth/players/games 三组路由)
│   │   ├── exception_handler.py        # 全局异常处理 (BusinessException -> JSON响应)
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
│   │   │   ├── services.py             # AuthService (login/register/logout)
│   │   │   ├── serializers.py          # Login/Register/User 序列化器
│   │   │   ├── views.py                # LoginView, RegisterView, LogoutView, MeView
│   │   │   ├── urls.py                 # /auth/login, /auth/register, /auth/logout, /auth/me
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
│   │   │   ├── services.py             # PlayerService (CRUD, majsoul绑定/搜索)
│   │   │   ├── serializers.py          # Player/MajsoulAccount 序列化器 (列表/详情/创建/更新)
│   │   │   ├── views.py                # PlayerListView, PlayerDetailView, PlayerMajsoulAccountListView, MajsoulAccountDetailView
│   │   │   ├── urls.py                 # /players/, /players/<uuid>/, /players/<uuid>/majsoul-accounts/
│   │   │   ├── admin.py                # PlayerAdmin, MahjongSoulAccountAdmin
│   │   │   ├── tests.py
│   │   │   └── migrations/
│   │   │       ├── 0001_initial.py     # Player + MahjongSoulAccount
│   │   │       ├── 0002_initial.py     # 添加 created_by, player FK
│   │   │       └── __init__.py
│   │   │
│   │   └── games/                      # --- 对局管理上下文 (房间+对局) ---
│   │       ├── __init__.py
│   │       ├── apps.py                 # GamesConfig (name='apps.games')
│   │       ├── models.py               # Room, RoomPlayer, Game, GamePlayer 领域模型
│   │       ├── services.py             # RoomService (CRUD/开关房间/增删成员), GameService (创建/换人/录分/导入线上局)
│   │       ├── serializers.py          # Room/Game/GamePlayer/Score/OnlineImport 序列化器
│   │       ├── views.py                # Room/Game/OnlineGame 相关视图 (列表/详情/关闭/录分/换人/导入)
│   │       ├── urls.py                 # /rooms/, /rooms/<uuid>/, /rooms/<uuid>/close/, /rooms/<uuid>/players/, /rooms/<uuid>/games/
│   │       ├── game_urls.py            # /games/<uuid>/, /games/<uuid>/scores/, /games/<uuid>/players/, /games/online/
│   │       ├── admin.py                # RoomAdmin, RoomPlayerAdmin, GameAdmin, GamePlayerAdmin
│   │       ├── tests.py
│   │       └── migrations/
│   │           ├── 0001_initial.py     # Game, GamePlayer, Room, RoomPlayer
│   │           ├── 0002_initial.py     # 添加 FK 关系
│   │           └── __init__.py
│   │
│   ├── common/                         # 公共工具层
│   │   ├── __init__.py
│   │   └── exceptions.py              # BusinessException, ScoreValidationError, PlayerAlreadyInGame, GameAlreadyScored
│   │
│   ├── services/                       # 基础设施服务层
│   │   └── __init__.py                 # (预留 majsoul.py 雀魂WebSocket+Protobuf对接)
│   │
│   └── media/                          # 上传文件
│       └── avatars/                    # 雀士头像存储
│
└── frontend/                           # ====== React TypeScript 前端 ======
    ├── package.json                    # 依赖 (react, react-router-dom, axios, lucide-react, tailwindcss)
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
    │   └── icons.svg
    │
    └── src/
        ├── main.tsx                    # 应用入口
        ├── App.tsx                     # 路由配置 (ProtectedRoute + 嵌套布局)
        ├── index.css                   # 全局样式 (Tailwind + 自定义CSS变量/按钮/卡片/表单/模态框/Toast)
        │
        ├── types/
        │   └── index.ts                # TypeScript类型定义 (User, Player, Room, Game, GamePlayer, MajsoulAccount, 枚举常量)
        │
        ├── api/                        # API 请求层
        │   ├── client.ts               # Axios 实例 (Token拦截器, 401自动跳转登录)
        │   ├── auth.ts                 # 认证API (login, register, logout, getMe, isLoggedIn, getCurrentUser)
        │   ├── players.ts              # 雀士API (CRUD, majsoul账号管理)
        │   └── games.ts                # 房间/对局API (房间CRUD, 对局CRUD, 录分, 换人, 线上导入)
        │
        ├── layouts/
        │   └── MainLayout.tsx          # 主布局 (侧边栏导航 + 顶部栏 + 响应式抽屉菜单)
        │
        ├── components/                 # 通用组件
        │   ├── Modal.tsx               # 模态框 (overlay + 动画)
        │   ├── PlayerCard.tsx          # 雀士卡片 (头像/昵称/分数/东起标记/可移除)
        │   └── SearchBar.tsx           # 搜索框 (带图标)
        │
        ├── hooks/
        │   └── useToast.tsx            # Toast提示hook (成功/错误, 3秒自动消失)
        │
        ├── pages/                      # 页面组件
        │   ├── LoginPage.tsx           # 登录/注册页 (渐变背景, 一姬头像, 表单切换)
        │   ├── HomePage.tsx            # 首页仪表盘 (雀士数/房间数/对局数统计卡片, 进行中房间列表)
        │   ├── PlayersPage.tsx         # 雀士管理页 (搜索/创建/编辑/删除, 雀魂账号绑定弹窗)
        │   ├── RoomsPage.tsx           # 房间列表页 (筛选全部/进行中/已关闭, 创建/关闭房间)
        │   ├── RoomDetailPage.tsx      # 房间详情页 (成员管理, 新建对局:选选手+选模式+选时间)
        │   ├── GameDetailPage.tsx      # 对局详情页 (选手列表, 录入分数弹窗:4人=1000/3人=1050, 更换选手弹窗)
        │   └── OnlineGamePage.tsx      # 线上对局导入页 (牌谱链接, 手动添加选手+分数, 导入历史列表)
        │
        ├── assets/                     # 静态资源
        │   ├── hero.png
        │   ├── react.svg
        │   └── vite.svg
        │
        └── utils/                      # (预留工具函数目录)
```
