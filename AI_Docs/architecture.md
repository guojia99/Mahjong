# Mahjong Assistant - 架构设计文档

## 技术栈
- **后端**: Python 3.12+ / Django 5.x / Django REST Framework / SQLite
- **前端**: React 18 / TypeScript / Vite / Tailwind CSS
- **架构模式**: DDD (领域驱动设计)

## 后端 DDD 分层架构

```
backend/
├── manage.py
├── requirements.txt
├── db_config.json                  # 数据库配置 (SQLite路径)
├── config/                         # Django 项目配置
│   ├── __init__.py
│   ├── settings.py
│   ├── urls.py
│   └── asgi.py
├── apps/                           # 应用层 (DDD 限界上下文)
│   ├── users/                      # 用户认证上下文
│   │   ├── models.py               # 领域模型
│   │   ├── services.py             # 领域服务
│   │   ├── serializers.py          # 接口序列化
│   │   ├── views.py                # API 视图
│   │   └── urls.py                 # 路由
│   ├── players/                    # 雀士管理上下文
│   │   ├── models.py
│   │   ├── services.py
│   │   ├── serializers.py
│   │   ├── views.py
│   │   └── urls.py
│   └── games/                      # 对局管理上下文 (房间+对局)
│       ├── models.py
│       ├── services.py
│       ├── serializers.py
│       ├── views.py
│       └── urls.py
├── services/                       # 基础设施服务
│   ├── __init__.py
│   └── majsoul.py                  # 雀魂数据获取服务
└── common/                         # 公共工具
    ├── __init__.py
    ├── exceptions.py              # 业务异常
    └── permissions.py             # 自定义权限 (IsAdminUserOrReadOnly)
```

## 数据模型设计

### User (用户) - users app
| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID (PK) | 主键 |
| username | CharField | 用户名 |
| password | CharField | 密码哈希 |
| created_at | DateTimeField | 创建时间 |

### Player (雀士) - players app
| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID (PK) | 主键 |
| nickname | CharField | 昵称 (必填) |
| real_name | CharField | 真实姓名 (可选) |
| avatar | ImageField | 头像 |
| extra_info | JSONField | 预留扩展信息 |
| created_by | FK(User) | 创建者 |
| created_at | DateTimeField | 创建时间 |
| updated_at | DateTimeField | 更新时间 |

### MahjongSoulAccount (雀魂账号) - players app
| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID (PK) | 主键 |
| player | FK(Player, nullable) | 关联雀士 |
| uid | BigIntegerField | 雀魂 UID |
| nickname | CharField | 雀魂昵称 |
| created_at | DateTimeField | 创建时间 |

### Room (房间) - games app
| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID (PK) | 主键 |
| name | CharField | 房间名称 |
| location | CharField | 地点/雀庄 (可选) |
| status | CharField | open/closed |
| created_by | FK(User) | 创建者 |
| created_at | DateTimeField | 创建时间 |
| closed_at | DateTimeField | 关闭时间 |

### RoomPlayer (房间参与者) - games app
| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID (PK) | 主键 |
| room | FK(Room) | 所属房间 |
| player | FK(Player) | 雀士 |
| joined_at | DateTimeField | 加入时间 |

### Game (对局) - games app
| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID (PK) | 主键 |
| room | FK(Room, nullable) | 所属房间 (线上可为空) |
| game_type | CharField | offline/online |
| game_mode | CharField | east_wind(东风)/half_match(半庄)/south_wind(南风) |
| start_time | DateTimeField | 对局时间 (精确到分钟) |
| source_url | URLField | 雀魂牌谱链接 (线上对局) |
| created_by | FK(User) | 创建者 |
| created_at | DateTimeField | 创建时间 |

### GamePlayer (对局参与者) - games app
| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID (PK) | 主键 |
| game | FK(Game) | 所属对局 |
| player | FK(Player) | 雀士 |
| seat_number | SmallIntegerField | 座位号 (0-3) |
| score | IntegerField | 分数 (可为负整数) |
| is_dealer_start | BooleanField | 是否东起 |

## API 接口设计

### 认证与权限
- **登录限制**: 仅管理员 (is_staff) 可登录，无注册功能
- **权限策略**: GET 请求公开访问 (AllowAny)，写操作 (POST/PUT/DELETE) 需要管理员权限 (IsAdminUser)
- **管理入口**: "雀士管理" 导航仅在管理员登录后显示
- **公开页面**: 首页、雀士列表、房间、对局、PT排名、役满列表均无需登录

### 认证 API
| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| POST | /api/v1/auth/login/ | 管理员登录 | AllowAny |
| POST | /api/v1/auth/logout/ | 登出 | IsAuthenticated |
| GET | /api/v1/auth/me/ | 获取当前用户 | IsAuthenticated |

### 雀士 API
| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| GET | /api/v1/players/ | 雀士列表 | 公开 |
| POST | /api/v1/players/ | 创建雀士 | 管理员 |
| GET | /api/v1/players/{id}/ | 雀士详情 | 公开 |
| PUT | /api/v1/players/{id}/ | 更新雀士 | 管理员 |
| DELETE | /api/v1/players/{id}/ | 删除雀士 | 管理员 |
| POST | /api/v1/players/{id}/majsoul-accounts/ | 添加雀魂账号 | 管理员 |
| DELETE | /api/v1/players/majsoul-accounts/{id}/ | 删除雀魂账号 | 管理员 |

### 房间 API
| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| GET | /api/v1/rooms/ | 房间列表 (含最早/最晚对局时间) | 公开 |
| POST | /api/v1/rooms/ | 创建房间 | 管理员 |
| GET | /api/v1/rooms/{id}/ | 房间详情 | 公开 |
| PUT | /api/v1/rooms/{id}/ | 更新房间 | 管理员 |
| POST | /api/v1/rooms/{id}/close/ | 关闭房间 | 管理员 |
| POST | /api/v1/rooms/{id}/players/ | 添加玩家到房间 | 管理员 |
| DELETE | /api/v1/rooms/{id}/players/{player_id}/ | 从房间移除玩家 | 管理员 |

### 对局 API
| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/v1/rooms/{id}/games/ | 房间对局列表 |
| POST | /api/v1/rooms/{id}/games/ | 创建对局 |
| GET | /api/v1/games/{id}/ | 对局详情 |
| PUT | /api/v1/games/{id}/ | 更新对局 |
| PUT | /api/v1/games/{id}/scores/ | 提交分数 |
| POST | /api/v1/games/{id}/players/ | 添加对局选手 |
| PUT | /api/v1/games/{id}/players/ | 更换对局选手 (未录分前) |
| POST | /api/v1/games/online/ | 导入线上对局 |
| GET | /api/v1/games/online/parse/ | 解析雀魂链接 (返回对局信息) |

### 牌谱 API
| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/v1/games/{id}/hand-records/ | 对局牌谱列表 |
| POST | /api/v1/games/{id}/hand-records/ | 创建牌谱 |
| DELETE | /api/v1/games/{id}/hand-records/{record_id}/ | 删除牌谱 |

### 役满 API
| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/v1/games/yakumans/ | 全部役满列表 |
| GET | /api/v1/games/yakumans/recent/ | 最近役满列表 (?limit=N) |
| GET | /api/v1/players/{id}/yakumans/ | 玩家役满列表 |

### HandRecord (牌谱) - games app
| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID (PK) | 主键 |
| game | FK(Game) | 所属对局 |
| player | FK(Player) | 胡牌雀士 |
| record_type | CharField | yakuman/yakuman_confirmed/yakuman_chance |
| yakuman_names | JSONField | 役种列表 (至少一个，如 ["国士无双", "字一色"]) |
| hand_tiles | JSONField | 手牌 |
| melds | JSONField | 吃碰杠牌 |
| winning_tile | CharField | 胡牌张 |
| win_type | CharField | tsumo(自摸)/ron(荣胡) |
| created_at | DateTimeField | 创建时间 |

### 计分规则
- 4人对局: 分数总和 = 1000
- 3人对局: 分数总和 = 1050
- 分数为整数，可以为负数

## 前端页面设计

### 页面路由
| 路径 | 页面 | 说明 | 访问权限 |
|------|------|------|------|
| /login | 登录页 | 管理员登录表单 | 公开 |
| / | 首页/仪表盘 | 统计概览、最近役满列表 | 公开 |
| /players | 雀士管理 | 雀士增删改 | 管理员 |
| /player-list | 雀士列表 | 雀士搜索浏览 | 公开 |
| /player-list/:id | 雀士详情 | 统计数据、对局记录、役满列表、个人信息 | 公开 |
| /rooms | 房间列表 | 活跃房间列表 (含最早/最晚对局时间) | 公开 |
| /rooms/:id | 房间详情 | 房间成员、对局列表 | 公开 |
| /rooms/:id/games/:gameId | 对局详情 | 选手列表、录分、役满牌谱 | 公开 |
| /games | 对局列表 | 全部对局筛选浏览 | 公开 |
| /pt-ranking | PT排名 | PT排名排行榜 | 公开 |
| /yakumans | 役满列表 | 全部役满记录 | 公开 |

### 响应式设计断点
- Mobile: < 640px
- Tablet: 640px - 1024px
- Desktop: > 1024px

### UI 风格
- 可爱清新风格
- 柔和的配色方案 (粉色、淡蓝、淡绿)
- 圆角设计
- Logo: 雀魂一姬头像
