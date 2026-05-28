# Mahjong 项目目录结构

> 排除 `.git/`、`backend/go/mahjong-backend`、`frontend/node_modules/`、`backend/majsoul_node/node_modules/`、`frontend/dist/`、`.idea/` 等生成目录

**产品概览**：日本立直麻将对局记录与 PT 统计助手；雀士详情页提供四麻半庄默认视角、一位～四位率、线上线下筛选、最近 N 局顺位折线与 PT 累计曲线等统计能力；支持天梯排位系统与联赛管理（详见根目录 `README.md` 与 `architecture.md`）。

```
Mahjong/
│
├── .gitignore
├── LICENSE
├── README.md
├── Makefile                             # 一键启动 (make dev: 后端9997 + 前端9998)
├── package.json                         # 根级依赖 (http-proxy)
├── proxy.cjs                            # 开发代理配置
│
├── docs/                                # 项目文档与开发规范
│   ├── architecture.md                  # 架构设计文档 (技术栈、数据模型、API、页面路由)
│   ├── getting-started.md               # 启动指南
│   ├── project-structure.md             # 本文件 - 项目目录结构说明
│   ├── log.md                           # 更新日志主文件
│   ├── paipu-data-schema.md             # 牌谱数据结构说明
│   ├── django-skills/                   # Django 开发提示词规范 (历史存档)
│   ├── react-agent-skills/              # React 开发提示词规范
│   ├── v2.0.0.md ~ v2.4.0.md           # 各版本更新日志
│   └── image/                           # 文档图片资源
│
├── scripts/                             # 辅助脚本
│   ├── emit_mleague_locales.py          # M 联赛国际化生成
│   └── mleague_html_to_md.py            # M 联赛 HTML 转 Markdown
│
├── backend/                             # ====== Go 后端 (MVC架构) ======
│   ├── db_config.json                   # 数据库配置 (SQLite路径、雀魂账号)
│   ├── db_config.example.json           # 数据库配置示例
│   ├── marjong.db                       # SQLite 数据库文件
│   ├── media/                           # 上传文件
│   │   └── avatars/                     # 雀士头像存储
│   │
│   ├── go/                              # Go 后端源码
│   │   ├── main.go                      # 应用入口 (Gin Engine + 路由注册 + Cobra CLI)
│   │   ├── go.mod                       # Go 模块定义 (mahjong-backend)
│   │   ├── go.sum                       # 依赖校验
│   │   │
│   │   ├── config/                      # 配置层
│   │   │   └── config.go               # 数据库配置加载 + GORM 初始化 + 时区 CST(UTC+8)
│   │   │
│   │   ├── models/                      # 数据模型层 (GORM)
│   │   │   └── models.go               # 全部领域模型: User, Player, MahjongSoulAccount, Room,
│   │   │                               #   RoomPlayer, Game, GamePlayer, HandRecord, UmaConfig,
│   │   │                               #   RankTier, PlayerRankingScore, GameRankingResult,
│   │   │                               #   LeagueSeries, LeagueSeason, LeagueStage,
│   │   │                               #   LeagueSeasonPlayer, LeagueStagePlayer,
│   │   │                               #   LeagueMatch, LeagueImageAsset,
│   │   │                               #   JSONField 自定义类型 (Value/Scan)
│   │   │
│   │   ├── handlers/                    # 控制器层 (Gin Handler)
│   │   │   ├── auth.go                 # 认证: Login/Logout/Me
│   │   │   ├── players.go              # 雀士 CRUD + 雀魂账号管理 + 批量头像
│   │   │   ├── rooms.go                # 房间 CRUD + 成员管理
│   │   │   ├── games_main.go           # 对局 CRUD + 录分 + 牌谱 + PT/趣味排名 + 起手牌统计
│   │   │   ├── ranking.go              # 天梯排位: 段位/马点/结算/排行榜/雀士排位
│   │   │   ├── leagues.go              # 联赛系统: Series/Season/Stage/Match 全生命周期管理
│   │   │   ├── i18n.go                 # 国际化语言列表接口
│   │   │   └── helpers.go              # 公共工具函数
│   │   │
│   │   └── middleware/                  # 中间件层
│   │       └── auth.go                 # JWT Session 认证中间件
│   │
│   └── majsoul_node/                    # 雀魂牌谱解析工具 (Node.js)
│       ├── package.json                # Node 依赖
│       ├── paipu.js                    # 牌谱解析脚本 (paipu.js --detail)
│       └── node_modules/
│
└── frontend/                            # ====== React TypeScript 前端 ======
    ├── package.json                     # 依赖 (react 19, react-router-dom 7, axios, lucide-react,
    │                                   #   tailwindcss 4, i18next, react-i18next, chart.js,
    │                                   #   react-chartjs-2, react-markdown, dnd-kit)
    ├── vite.config.ts                   # Vite 配置 (别名@, 代理/api和/media到127.0.0.1:9997)
    ├── tsconfig.json
    ├── tsconfig.app.json                # 应用 TS 配置 (路径别名 @/*)
    ├── tsconfig.node.json
    ├── eslint.config.js
    ├── index.html                       # 入口 HTML (favicon 使用一姬头像)
    │
    ├── public/
    │   ├── favicon.svg                 # 网站图标
    │   ├── icons.svg                   # 图标集
    │   ├── marjongs/                   # 麻将牌图片 (.webp)
    │   └── changelog/                  # 更新日志静态资源 (按语言切换)
    │       ├── zh-Hans.md
    │       ├── zh-Hant.md
    │       ├── en.md
    │       └── ja.md
    │
    └── src/
        ├── main.tsx                    # 应用入口 (导入 i18n 初始化)
        ├── App.tsx                     # 路由配置 (ProtectedRoute + 嵌套布局)
        ├── index.css                   # 全局样式 (Tailwind + 自定义 CSS 变量)
        │
        ├── i18n/                       # 国际化配置
        │   ├── index.ts               # i18next 初始化 (语言检测/持久化/fallback=zh-Hans, 四语言)
        │   └── locales/               # 翻译文件
        │       ├── zh-Hans.ts         # 简体中文 (默认)
        │       ├── zh-Hant.ts         # 繁體中文
        │       ├── en.ts              # English
        │       └── ja.ts              # 日本語
        │
        ├── rules/                      # 规则文档 (Markdown 按语言管理)
        │   ├── terms-index.ts         # 术语索引
        │   ├── en/                    # English
        │   ├── ja/                    # 日本語
        │   ├── zh-Hans/               # 简体中文
        │   └── zh-Hant/               # 繁體中文
        │
        ├── types/
        │   └── index.ts               # TypeScript 类型定义 (User, Player, Room, Game, League 等)
        │
        ├── api/                        # API 请求层
        │   ├── client.ts              # Axios 实例 (Token 拦截器, 401 自动跳转登录)
        │   ├── auth.ts                # 认证 API
        │   ├── players.ts             # 雀士 API (CRUD, 雀魂账号管理)
        │   ├── games.ts               # 房间/对局 API (CRUD, 录分, 换人, 线上导入)
        │   ├── ranking.ts             # 排位 API (段位/马点/排行榜)
        │   └── leagues.ts             # 联赛 API (Series/Season/Stage/Match)
        │
        ├── layouts/
        │   └── MainLayout.tsx         # 主布局 (侧边栏导航 + 顶部栏 + 语言切换 + 响应式抽屉菜单)
        │
        ├── components/                 # 通用组件
        │   ├── Modal.tsx              # 模态框 (overlay + 动画)
        │   ├── PlayerCard.tsx         # 雀士卡片 (头像/昵称/分数/东起标记)
        │   ├── SearchBar.tsx          # 搜索框 (带图标)
        │   ├── YakumanCard.tsx        # 役满卡片 (手牌/副露展示)
        │   ├── HandRecordModal.tsx    # 役满牌谱录入弹窗
        │   ├── PlayerStatsLineChart.tsx # 雀士统计折线图 (顺位趋势/PT累计)
        │   ├── PointsQuickReference.tsx # 点数速查表
        │   ├── SortablePlayerList.tsx # 可排序雀士列表
        │   ├── RankTierBadge.tsx      # 段位徽章
        │   ├── PaipuDetailModal.tsx   # 牌谱详情弹窗
        │   ├── PaipuDetailPanel.tsx   # 牌谱详情面板（各局得分/汇总统计）
        │   ├── PaipuReplayPanel.tsx   # 线上牌谱可视化重放（牌桌/步进/牌山）
        │   ├── StartingHandsWeightsModal.tsx # 起手牌权重弹窗
        │   ├── RulesMdReader.tsx      # Markdown 规则文档渲染器
        │   ├── LeagueMarkdownBody.tsx # 联赛 Markdown 正文渲染
        │   └── LeagueMarkdownEditor.tsx # 联赛 Markdown 编辑器
        │
        ├── hooks/
        │   └── useToast.tsx           # Toast 提示 hook
        │
        ├── mahjong-calc/              # 麻雀点数计算引擎
        │   ├── types.ts               # 计算类型定义
        │   ├── calc.ts                # 点数/符计算核心逻辑
        │   ├── yaku.ts                # 役种判定
        │   ├── definition.ts          # 满贯/跳满等点数定义
        │   ├── kifuText.ts            # 棋谱文本解析/序列化
        │   ├── scoringQuickTable.ts   # 点数速查表数据
        │   ├── yakuPracticeGenerator.ts # 役种练习题目生成器
        │   └── problem.ts             # 练习题数据结构
        │
        ├── paipu/                     # 牌谱解析模型
        │   ├── paipuDetailModel.ts    # 牌谱详情数据模型（各局得分/统计）
        │   └── paipuReplayModel.ts     # 牌谱重放帧模型（手牌/副露/牌河/宝牌）
        │
        ├── pages/                     # 页面组件
        │   ├── LoginPage.tsx          # 登录页
        │   ├── HomePage.tsx           # 首页仪表盘
        │   ├── PlayersPage.tsx        # 雀士管理页 (管理员)
        │   ├── PlayerListPage.tsx     # 雀士列表 (公开)
        │   ├── PlayerProfilePage.tsx  # 雀士详情 (统计/对局/役满/排位)
        │   ├── RoomsPage.tsx          # 房间列表页
        │   ├── RoomDetailPage.tsx     # 房间详情页
        │   ├── GameDetailPage.tsx     # 对局详情页 (录分/换人/牌谱)
        │   ├── GameListPage.tsx       # 对局列表页
        │   ├── OnlineGamePage.tsx     # 线上对局导入页
        │   ├── PtRankingPage.tsx      # PT排名页
        │   ├── FunRankingPage.tsx     # 趣味排行页
        │   ├── YakumanListPage.tsx    # 役满列表页
        │   ├── OnlinePaipuStatsPage.tsx # 线上牌谱统计页
        │   ├── StartingHandsPage.tsx  # 起手牌统计页
        │   ├── CalculatorPage.tsx     # 点数计算器
        │   ├── PracticePage.tsx       # 点数练习
        │   ├── YakuPracticePage.tsx   # 役种专项练习
        │   ├── RankingLeaderboardPage.tsx # 天梯排位排行榜
        │   ├── RankingAdminPage.tsx   # 排位配置管理
        │   ├── RankingInfoPage.tsx    # 排位分说明
        │   ├── RulesPage.tsx          # 规则说明页
        │   ├── LeaguesPage.tsx        # 联赛列表页
        │   ├── LeagueSeriesAdminPage.tsx     # 联赛系列管理
        │   ├── LeagueSeasonAdminPage.tsx     # 赛季管理
        │   ├── LeagueSeasonDetailPage.tsx    # 赛季详情
        │   ├── LeagueSeasonPlayersAdminPage.tsx # 赛季选手管理
        │   ├── LeagueSeasonStagesAdminPage.tsx # 赛季阶段管理
        │   ├── LeagueStageAdminPage.tsx      # 阶段管理
        │   ├── LeagueStageDetailPage.tsx     # 阶段详情 (排名/对局)
        │   └── ChangelogPage.tsx      # 更新日志
        │
        ├── services/                  # 前端服务层
        │   └── playerAvatarCache.ts   # 雀士头像缓存
        │
        ├── assets/                    # 静态资源
        │   ├── hero.png
        │   ├── react.svg
        │   └── vite.svg
        │
        └── utils/                     # 工具函数 (预留)
```
