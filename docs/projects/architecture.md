# Mahjong Assistant - 架构设计文档

## 技术栈
- **后端**: Go 1.26+ / Gin / GORM / SQLite
- **前端**: React 19 / TypeScript / Vite 8 / Tailwind CSS 4
- **架构模式**: MVC (Model-View-Controller)

## 后端架构

```
backend/go/
├── main.go                          # 应用入口 (Gin Engine + 路由注册 + Cobra CLI)
├── go.mod / go.sum                  # Go 模块依赖
│
├── config/                          # 配置层
│   └── config.go                    # 数据库配置加载 + GORM 初始化 + 时区设置
│
├── models/                          # 数据模型层 (GORM)
│   └── models.go                    # 全部领域模型 + JSONField 自定义类型
│
├── handlers/                        # 控制器层 (Gin Handler)
│   ├── auth.go                      # 认证 (Login/Logout/Me)
│   ├── players.go                   # 雀士 CRUD + 雀魂账号管理
│   ├── rooms.go                     # 房间管理
│   ├── games_main.go                # 对局管理 + 录分 + 牌谱 + PT/趣味排名
│   ├── ranking.go                   # 天梯排位 (段位/马点/结算/排行榜)
│   ├── leagues.go                   # 联赛系统 (Series/Season/Stage/Match)
│   ├── i18n.go                      # 国际化语言列表
│   └── helpers.go                   # 公共工具函数
│
└── middleware/                      # 中间件层
    └── auth.go                      # JWT Session 认证中间件
```

## 数据模型设计

### User (用户)
| 字段 | 类型 | 说明 |
|------|------|------|
| id | uint64 (PK, auto increment) | 主键 |
| username | string(150) | 用户名 (唯一) |
| password | string(128) | 密码哈希（空表示无密码） |
| system_password | string(36) | 系统密码 UUID，仅无密码用户可登录 |
| email | string(254) | 邮箱（重置/绑定验证码用） |
| is_staff | bool | 是否管理员 |
| is_active | bool | 是否激活 |
| login_fail_count | int | 近期登录失败次数 |
| last_login_attempt_at | datetime | 最近尝试登录时间 |
| last_login_ip | string | 最近登录 IP |
| locked_until | datetime | 锁定截止时间 |
| created_at | datetime | 创建时间 |

### VerificationCode (验证码)
| 字段 | 类型 | 说明 |
|------|------|------|
| user_id | FK(User) | 所属用户 |
| purpose | string | bind_email / change_email / reset_password |
| code | string(6) | 6 位字母数字码 |
| expires_at | datetime | 过期时间 |
| used_at | datetime | 使用后标记 |

### LoginLog (登录日志)
| 字段 | 类型 | 说明 |
|------|------|------|
| user_id | FK(User, nullable) | 用户 |
| username | string | 用户名 |
| ip | string | IP |
| action | string | login_success / login_fail / logout / password_reset |
| created_at | datetime | 时间 |

### Player (雀士)
| 字段 | 类型 | 说明 |
|------|------|------|
| id | string(36, UUID) | 主键 |
| nickname | string(50) | 昵称 (必填) |
| real_name | string(50) | 真实姓名 (可选) |
| avatar | text | 头像路径 |
| extra_info | JSONField | 预留扩展信息 |
| created_by_id | FK(User) | 创建者 |
| created_at | datetime | 创建时间 |
| updated_at | datetime | 更新时间 |

### MahjongSoulAccount (雀魂账号)
| 字段 | 类型 | 说明 |
|------|------|------|
| id | string(36, UUID) | 主键 |
| player_id | FK(Player, nullable) | 关联雀士 |
| uid | int64 | 雀魂 UID (唯一) |
| nickname | string(50) | 雀魂昵称 |
| created_at | datetime | 创建时间 |

### Room (房间)
| 字段 | 类型 | 说明 |
|------|------|------|
| id | string(36, UUID) | 主键 |
| name | string(100) | 房间名称 |
| location | string(100) | 地点/雀庄 (可选) |
| room_type | string(20) | offline/online |
| session_time | datetime (nullable) | 集合时间 |
| status | string(20) | open/closed |
| created_by_id | FK(User) | 创建者 |
| created_at | datetime | 创建时间 |
| closed_at | datetime (nullable) | 关闭时间 |

### RoomPlayer (房间参与者)
| 字段 | 类型 | 说明 |
|------|------|------|
| id | string(36, UUID) | 主键 |
| room_id | FK(Room) | 所属房间 |
| player_id | FK(Player) | 雀士 |
| joined_at | datetime | 加入时间 |

### Game (对局)
| 字段 | 类型 | 说明 |
|------|------|------|
| id | string(36, UUID) | 主键 |
| room_id | FK(Room, nullable) | 所属房间 |
| game_type | string(20) | offline/online |
| game_mode | string(20) | east_wind(东风)/half_match(半庄)/south_wind(南风) |
| player_count | int | 人数 (默认 4) |
| start_time | datetime | 对局时间 |
| end_time | datetime (nullable) | 结束时间 |
| source_url | string(500) | 雀魂牌谱链接 |
| paipu_data | JSONField | 牌谱原始数据 |
| created_by_id | FK(User) | 创建者 |
| created_at | datetime | 创建时间 |

### GamePlayer (对局参与者)
| 字段 | 类型 | 说明 |
|------|------|------|
| id | string(36, UUID) | 主键 |
| game_id | FK(Game) | 所属对局 |
| player_id | FK(Player) | 雀士 |
| seat_number | int | 座位号 (0-3) |
| score | int (nullable) | 分数 (可为负整数) |
| is_dealer_start | bool | 是否东起 |

### HandRecord (牌谱)
| 字段 | 类型 | 说明 |
|------|------|------|
| id | string(36, UUID) | 主键 |
| game_id | FK(Game) | 所属对局 |
| player_id | FK(Player) | 胡牌雀士 |
| record_type | string(30) | yakuman/yakuman_confirmed/yakuman_chance |
| yakuman_names | JSONField | 役种列表 |
| hand_tiles | JSONField | 手牌 |
| melds | JSONField | 吃碰杠牌 |
| winning_tile | string(10) | 胡牌张 |
| win_type | string(10) | tsumo(自摸)/ron(荣胡) |
| created_at | datetime | 创建时间 |

### UmaConfig (马点配置)
| 字段 | 类型 | 说明 |
|------|------|------|
| id | string(36, UUID) | 主键 |
| name | string(50) | 配置名称 (唯一) |
| player_count | int | 人数 |
| game_mode | string(20) | 游戏模式 |
| uma_1st ~ uma_4th | float64 | 各位次马点 |
| base_score | float64 | 基础点数 (默认 250) |
| is_active | bool | 是否启用 |

### RankTier (段位)
| 字段 | 类型 | 说明 |
|------|------|------|
| id | string(36, UUID) | 主键 |
| name | string(50) | 段位名称 (唯一) |
| level_order | int | 排序等级 (唯一) |
| initial_score | float64 | 起始排位分 |
| promotion_score | float64 | 升段分数 |
| dajiang_score | float64 | 打回分数 |
| fourth_penalty | float64 | 四位扣分 |
| is_protected | bool | 是否保级 |
| bg_color | string(20) | 背景色 |
| bg_gradient | string(100) | 渐变色 |
| description | string(200) | 描述 |

### PlayerRankingScore (雀士排位分)
| 字段 | 类型 | 说明 |
|------|------|------|
| id | string(36, UUID) | 主键 |
| player_id | FK(Player) | 雀士 (唯一) |
| tier_id | FK(RankTier) | 当前段位 |
| score | float64 | 排位分 |
| game_count | int | 对局数 |
| updated_at | datetime | 更新时间 |

### GameRankingResult (对局排位结算)
| 字段 | 类型 | 说明 |
|------|------|------|
| id | string(36, UUID) | 主键 |
| game_id | FK(Game) | 对局 |
| player_id | FK(Player) | 雀士 |
| rank | int | 顺位 |
| delta | float64 | 分数变动 |
| old_tier_name | string | 原段位 |
| new_tier_name | string | 新段位 |
| old_score | float64 | 原分数 |
| new_score | float64 | 新分数 |

### 联赛模型 (League)

| 模型 | 说明 |
|------|------|
| LeagueSeries | 联赛系列 (名称/描述/Logo/封面) |
| LeagueSeason | 赛季 (编号/名称/状态/起止时间/线上线下开关) |
| LeagueStage | 阶段 (类型/顺序/每人局数/马点/基础点数/晋级规则) |
| LeagueSeasonPlayer | 赛季参赛雀士 |
| LeagueStagePlayer | 阶段参赛雀士 (组别/淘汰/晋级/PT/排名) |
| LeagueMatch | 对局安排 (桌号/轮次/指定雀士/陪打) |
| LeagueImageAsset | 图片资源 (Logo/Markdown 图片) |

## API 接口设计

### 认证与权限
- **登录**: 活跃用户可登录；支持常规密码或系统密码（无密码用户）
- **登录限流**: 5 分钟内失败 5 次锁定 15 分钟；成功登录重置
- **权限策略**: GET 请求公开访问，写操作 (POST/PUT/DELETE) 需要管理员权限
- **管理入口**: 管理导航组仅在管理员登录后显示
- **公开页面**: 首页、雀士列表、房间、对局、PT排名、役满列表均无需登录

### 认证 API
| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| POST | /api/v1/auth/login/ | 登录（密码或系统密码） | 公开 |
| POST | /api/v1/auth/logout/ | 登出 | 认证 |
| GET | /api/v1/auth/me/ | 获取当前用户 | 认证 |
| POST | /api/v1/auth/verification/send/ | 发送验证码邮件 | 公开 |
| POST | /api/v1/auth/reset-password/confirm/ | 验证码重置密码 | 公开 |
| POST | /api/v1/auth/bind-email/confirm/ | 绑定邮箱 | 公开 |
| POST | /api/v1/auth/change-email/confirm/ | 修改邮箱 | 认证 |

雀士与网站用户 1:1 关联（`users.player_id`）。账号管理在雀士 API 中：

| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| POST | /api/v1/players/:pk/enable-account/ | 为雀士开通账号 | 管理员 |
| PUT | /api/v1/players/:pk/account/ | 更新雀士账号 | 管理员 |
| POST | /api/v1/players/:pk/reset-system-password/ | 重置系统密码 | 管理员 |
| GET | /api/v1/admin/login-logs/ | 登录日志 | 管理员 |

### 雀士 API
| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| GET | /api/v1/players/ | 雀士列表 | 公开 |
| POST | /api/v1/players/ | 创建雀士 | 管理员 |
| GET | /api/v1/players/:pk/ | 雀士详情 | 公开 |
| GET | /api/v1/players/:pk/stats/ | 雀士统计 | 公开 |
| GET | /api/v1/players/:pk/games/ | 雀士对局列表 | 公开 |
| GET | /api/v1/players/:pk/yakumans/ | 雀士役满列表 | 公开 |
| PUT | /api/v1/players/:pk/ | 更新雀士 | 管理员 |
| DELETE | /api/v1/players/:pk/ | 删除雀士 | 管理员 |
| GET | /api/v1/players/:pk/majsoul-accounts/ | 雀魂账号列表 | 公开 |
| POST | /api/v1/players/:pk/majsoul-accounts/ | 添加雀魂账号 | 管理员 |
| DELETE | /api/v1/players/majsoul-accounts/:account_pk/ | 删除雀魂账号 | 管理员 |
| GET/POST | /api/v1/players/batch-avatars/ | 批量头像 | 公开/管理员 |

### 房间 API
| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| GET | /api/v1/rooms/ | 房间列表 | 公开 |
| POST | /api/v1/rooms/ | 创建房间 | 管理员 |
| GET | /api/v1/rooms/:pk/ | 房间详情 | 公开 |
| PUT | /api/v1/rooms/:pk/ | 更新房间 | 管理员 |
| DELETE | /api/v1/rooms/:pk/ | 删除房间 | 管理员 |
| POST | /api/v1/rooms/:pk/close/ | 关闭房间 | 管理员 |
| GET | /api/v1/rooms/:pk/players/ | 房间成员列表 | 公开 |
| POST | /api/v1/rooms/:pk/players/ | 添加玩家到房间 | 管理员 |
| DELETE | /api/v1/rooms/:pk/players/:player_pk/ | 从房间移除玩家 | 管理员 |
| GET | /api/v1/rooms/:pk/games/ | 房间对局列表 | 公开 |
| POST | /api/v1/rooms/:pk/games/ | 创建对局 | 管理员 |

### 对局 API
| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/v1/games/ | 对局列表 |
| GET | /api/v1/games/:pk/ | 对局详情 |
| PUT | /api/v1/games/:pk/ | 更新对局 |
| DELETE | /api/v1/games/:pk/ | 删除对局 |
| PUT | /api/v1/games/:pk/scores/ | 提交分数 |
| PUT | /api/v1/games/:pk/players/ | 更换对局选手 |
| POST | /api/v1/games/:pk/shuffle-seats/ | 随机换座 |
| POST | /api/v1/games/online/ | 导入线上对局 |
| GET | /api/v1/games/online/parse/ | 解析雀魂链接 |
| POST | /api/v1/games/online/parse-batch/ | 批量解析雀魂链接 |
| POST | /api/v1/games/online/retry/:pk/ | 重试导入 |
| POST | /api/v1/games/online/bind-account/ | 绑定雀魂账号 |
| GET | /api/v1/games/online/unbound-accounts/ | 未绑定雀魂账号列表 |

### 牌谱 API
| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/v1/games/:pk/hand-records/ | 对局牌谱列表 |
| POST | /api/v1/games/:pk/hand-records/ | 创建牌谱 |
| DELETE | /api/v1/games/:pk/hand-records/:record_pk/ | 删除牌谱 |

### 排名 API
| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/v1/games/pt-ranking/ | PT排名 |
| GET | /api/v1/games/fun-ranking/ | 趣味排名 |
| GET | /api/v1/games/paipu-stats/ | 牌谱统计排名 |
| GET | /api/v1/games/starting-hands/ | 起手牌统计 |
| GET | /api/v1/games/starting-hands/player-averages/ | 雀士起手牌均值 |
| GET | /api/v1/games/yakumans/ | 全部役满列表 |
| GET | /api/v1/games/yakumans/recent/ | 最近役满列表 (?limit=N) |

### 排位 API
| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/v1/ranking/uma-configs/ | 马点配置列表 |
| POST | /api/v1/ranking/uma-configs/ | 创建马点配置 |
| GET | /api/v1/ranking/uma-configs/:pk/ | 马点配置详情 |
| PUT | /api/v1/ranking/uma-configs/:pk/ | 更新马点配置 |
| DELETE | /api/v1/ranking/uma-configs/:pk/ | 删除马点配置 |
| GET | /api/v1/ranking/tiers/ | 段位列表 |
| POST | /api/v1/ranking/tiers/ | 创建段位 |
| GET/PUT/DELETE | /api/v1/ranking/tiers/:pk/ | 段位 CRUD |
| POST | /api/v1/ranking/recalculate/ | 一键重算排位 |
| GET | /api/v1/ranking/leaderboard/ | 排行榜 |
| GET | /api/v1/ranking/player/:pk/ | 雀士排位信息 |
| GET | /api/v1/ranking/player/:pk/game-results/ | 雀士排位对局记录 |
| POST | /api/v1/ranking/game/:pk/settle/ | 对局排位结算 |

### 联赛 API
| 方法 | 路径 | 说明 |
|------|------|------|
| GET/POST | /api/v1/leagues/series/ | 联赛系列 CRUD |
| GET/PUT/DELETE | /api/v1/leagues/series/:pk/ | 联赛系列详情 |
| POST | /api/v1/leagues/series/:pk/logo/ | 上传 Logo |
| GET | /api/v1/leagues/seasons/current/ | 当前赛季列表 |
| GET | /api/v1/leagues/seasons/ | 全部赛季列表 |
| GET/POST | /api/v1/leagues/series/:pk/seasons/ | 赛季管理 |
| GET/PUT/DELETE | /api/v1/leagues/seasons/:pk/ | 赛季详情 |
| POST | /api/v1/leagues/seasons/:pk/start/ | 开始赛季 |
| POST | /api/v1/leagues/seasons/:pk/finish/ | 结束赛季 |
| POST | /api/v1/leagues/seasons/:pk/reopen/ | 重新开放赛季 |
| POST | /api/v1/leagues/seasons/:pk/register/ | 报名参赛 |
| DELETE | /api/v1/leagues/seasons/:pk/register/ | 退赛 |
| POST | /api/v1/leagues/seasons/:pk/batch-register/ | 批量报名 |
| POST | /api/v1/leagues/seasons/:pk/markdown-image/ | 上传 Markdown 图片 |
| POST | /api/v1/leagues/seasons/:pk/standard-stages/ | 创建标准阶段 |
| GET/POST | /api/v1/leagues/seasons/:pk/stages/ | 阶段管理 |
| POST | /api/v1/leagues/seasons/:pk/stages/reorder/ | 阶段排序 |
| GET/PUT/DELETE | /api/v1/leagues/stages/:pk/ | 阶段详情 |
| POST | /api/v1/leagues/stages/:pk/start/ | 开始阶段 |
| POST | /api/v1/leagues/stages/:pk/finish/ | 结束阶段 |
| POST | /api/v1/leagues/stages/:pk/recalculate/ | 重算阶段 PT |
| POST | /api/v1/leagues/stages/:pk/promote/ | 晋级处理 |
| GET | /api/v1/leagues/stages/:pk/players/ | 阶段选手列表 |
| POST | /api/v1/leagues/stages/:pk/players/sync/ | 同步选手 |
| POST/PUT/DELETE | /api/v1/leagues/stages/:pk/players/manage/ | 选手增删改 |
| GET | /api/v1/leagues/stages/:pk/ranking/ | 阶段排名 |
| GET | /api/v1/leagues/stages/:pk/matches/ | 阶段对局列表 |
| POST | /api/v1/leagues/stages/:pk/matches/new/ | 创建对局 |
| PUT/DELETE | /api/v1/leagues/stages/matches/:match_pk/ | 对局修改/删除 |
| POST | /api/v1/leagues/stages/:pk/generate-semifinal/ | 生成半决赛 |
| POST | /api/v1/leagues/stages/:pk/matches/offline/ | 创建线下对局 |
| POST | /api/v1/leagues/stages/:pk/matches/online/ | 创建线上对局 |
| GET | /api/v1/leagues/media/:pk/ | 获取联赛图片 |

### 计分规则
- 4人对局: 分数总和 = 1000
- 3人对局: 分数总和 = 1050
- 分数为整数，可以为负数

## 前端页面设计

### 页面路由
| 路径 | 页面 | 说明 | 访问权限 |
|------|------|------|------|
| /login | 登录页 | 登录表单 | 公开 |
| /reset-password | 重置密码 | 邮箱验证码重置 | 公开 |
| / | 首页/仪表盘 | 统计概览、最近役满列表 | 公开 |
| /players | 雀士管理 | 雀士增删改 | 管理员 |
| /player-list | 雀士列表 | 雀士搜索浏览 | 公开 |
| /player-list/:id | 雀士详情 | 统计、对局记录、役满列表、个人信息、排位分与段位 | 公开 |
| /rooms | 房间列表 | 活跃房间列表 | 公开 |
| /rooms/:id | 房间详情 | 房间成员、对局列表 | 公开 |
| /rooms/:id/games/:gameId | 对局详情 | 选手列表、录分、役满牌谱 | 公开 |
| /games | 对局列表 | 全部对局筛选浏览 | 公开 |
| /pt-ranking | PT排名 | PT排名排行榜 | 公开 |
| /yakumans | 役满列表 | 全部役满记录 | 公开 |
| /ranking | 天梯排位 | 段位/排位分排行榜 | 公开 |
| /ranking/info | 排位说明 | 计分规则、段位一览、马点配置 | 公开 |
| /ranking/admin | 排位管理 | 段位表/马点配置 CRUD、一键重算 | 管理员 |
| /leagues | 联赛列表 | 联赛系列浏览 | 公开 |
| /changelog | 更新日志 | 站点版本演进记录 | 公开 |

### 响应式设计断点
- Mobile: < 640px
- Tablet: 640px - 1024px
- Desktop: > 1024px

### UI 风格
- 可爱清新风格
- 柔和的配色方案 (粉色、淡蓝、淡绿)
- 圆角设计
- Logo: 雀魂一姬头像
