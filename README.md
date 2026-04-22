# 嘉の雀桩

> 日本立麻雀对局记录助手 - 用于线下雀庄计分、统计、排名

![Python](https://img.shields.io/badge/Python-3.12+-blue?logo=python&logoColor=white)
![Django](https://img.shields.io/badge/Django-5.x-green?logo=django&logoColor=white)
![React](https://img.shields.io/badge/React-19-61dafb?logo=react&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-6-3178c6?logo=typescript&logoColor=white)

## 功能

- **雀士管理** - 创建、编辑、删除雀士，绑定雀魂账号
- **房间管理** - 开启/关闭房间，管理房间成员
- **对局录分** - 支持3麻/4麻，东风/半庄/南风，分数总和自动校验
- **随机桩位** - 一键随机分配东、南、西、北座位
- **PT 排名** - 自动计算 PT 积分，按规则排名
- **个人统计** - 雀士详情默认四麻半庄；一位～四位率、总 PT；可按线下/线上筛选；最近 10/20/50/100 局的顺位折线与从 0 起累计的 PT 曲线
- **役满牌谱** - 记录役满牌谱，含手牌、副露、胡牌方式
- **再开一局** - 快速复制上局选手开新局
- **公开浏览** - 所有人可查看主页、房间、对局、排名，仅管理员可操作

## 技术栈

| 层级 | 技术 |
|------|------|
| 后端 | Python / Django 5.x / Django REST Framework / SQLite |
| 前端 | React 19 / TypeScript / Vite / Tailwind CSS |
| 代理 | Node.js / http-proxy (反向代理统一端口) |

## 项目结构

```
Mahjong/
├── Makefile              # 一键启动、环境检查、服务管理
├── proxy.cjs             # 统一端口反向代理 (9999)
├── package.json          # 代理依赖
├── backend/              # Django 后端 (DDD 架构)
│   ├── config/           # Django 项目配置
│   ├── apps/users/       # 用户认证
│   ├── apps/players/     # 雀士管理
│   ├── apps/games/       # 对局管理 (房间 + 对局 + 牌谱)
│   ├── common/           # 公共权限、异常
│   └── db_config.json    # 数据库路径配置
└── frontend/             # React 前端
    └── src/
        ├── api/          # API 请求层
        ├── pages/        # 页面组件
        ├── components/   # 通用组件
        └── layouts/      # 布局
```

## 快速开始

### 环境要求

- Python 3.12+
- Node.js 18+ (含 npm)
- Make

### 安装

```bash
# 克隆项目
git clone <repo-url>
cd Mahjong

# 自动检查环境、安装依赖
make env

# 初始化数据库 + 创建管理员
# 默认账号 admin / admin123，可通过环境变量覆盖:
# ADMIN_USER=xxx ADMIN_PASS=xxx make init
make init
```

### 启动

```bash
make dev
```

启动后访问:

| 地址 | 服务 |
|------|------|
| http://localhost:9999 | 统一入口 (推荐) |
| http://localhost:9998 | 前端 (开发服务器) |
| http://localhost:9997 | 后端 API |

### 其他命令

```bash
make check      # 检查三个服务运行状态
make stop       # 停止所有服务
make restart    # 重启所有服务
make migrate    # 执行数据库迁移
make env        # 检查并安装环境依赖
```

## 计分规则

- **4人对局**: 分数总和 = 1000
- **3人对局**: 分数总和 = 1050
- 分数为整数，可以为负数
- 必须指定一名东起选手
- 录分后不可修改

### PT 计算

| 排名 | 4人 | 3人 |
|------|-----|-----|
| 1位 | +30 | +30 |
| 2位 | +10 | 0 |
| 3位 | -10 | -30 |
| 4位 | -30 | - |

## 管理员

- 仅管理员可登录 (页面上的"管理员登录"入口)
- 管理员可进行所有写操作 (创建房间、录分、管理雀士等)
- 其他人可自由浏览所有页面
- 通过 Django 命令创建管理员:

```bash
cd backend
.venv/bin/python manage.py createsuperuser
```

## 配置

### 数据库路径

编辑 `backend/db_config.json`:

```json
{
    "database": {
        "sqlite_path": "db.sqlite3"
    }
}
```

默认放在 `backend/` 目录下，可改为绝对路径如 `/data/mahjong/db.sqlite3`。

## License

[MIT](LICENSE)
