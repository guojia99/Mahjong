<p align="center">
  <h1 align="center">嘉の雀桩</h1>
  <p align="center">
    <strong>日本立麻雀对局记录助手</strong><br/>
    线下雀庄计分 &middot; 线上雀魂牌谱导入 &middot; 统计排名
  </p>
  <p>
    <img src="https://img.shields.io/badge/Python-3.12+-blue?logo=python&logoColor=white" alt="Python"/>
    <img src="https://img.shields.io/badge/Django-5.x-green?logo=django&logoColor=white" alt="Django"/>
    <img src="https://img.shields.io/badge/React-19-61dafb?logo=react&logoColor=white" alt="React"/>
    <img src="https://img.shields.io/badge/TypeScript-6-3178c6?logo=typescript&logoColor=white" alt="TypeScript"/>
  </p>
  <p align="center">
    <a href="README.md">中文</a> &middot;
    <a href="README.en.md">English</a> &middot;
    <a href="README.ja.md">日本語</a>
  </p>
</p>

<img src="docs/image/img.png" alt="homepage" width="100%"/>

---

## 功能一览

### 雀士管理
- 创建、编辑、删除雀士
- 绑定雀魂账号（UID → 雀士自动关联）
- 雀士档案：PT 曲线、顺位分布、役满记录

### 线下对局
- 创建房间（雀庄），管理房间成员
- 支持 **3 麻 / 4 麻**，**东风 / 半庄**
- 分数总和自动校验（4 人 = 1000，3 人 = 1050）
- 一键随机分配座席（东・南・西・北）
- 快速复制上局选手，再开一局

### 线上雀魂牌谱导入
- 批量粘贴雀魂牌谱链接，自动解析
- 通过雀魂 WebSocket 协议**本地获取**对局详情（开始/结束时间、玩家分数）
- 雀魂 UID 自动匹配已绑定雀士，未绑定可一键创建并关联
- 并发限流 20 次/分钟，避免触发雀魂风控
- 检测重复链接，防止重复导入

### 统计与排名
- **PT 排名** — 自动计算 PT 积分，按规则排名
- **趣味排名** — 一位率、平均顺位、最高/最低分等维度
- **个人统计** — 顺位分布、总 PT、最近 N 局顺位折线与累计 PT 曲线，支持按线下/线上筛选

### 役满牌谱
- 记录役满牌谱（手牌、副露、胡牌方式）
- 役满一览页面，支持按役满/确定/机会筛选

### 段位系统
- 自定义段位（名称、分值、升降规则）
- 自动计算段位分，实时排名与升降提示

### 其他
- **点数计算器** — 手动计算和牌点数
- **役练习** — 交互式役种练习
- **公开浏览** — 所有人可查看主页、房间、对局、排名，仅管理员可操作

---

## 技术栈

| 层级 | 技术 |
|:----:|:----:|
| 后端 | Python / Django 5.x / Django REST Framework / SQLite |
| 前端 | React 19 / TypeScript / Vite / Tailwind CSS |
| 牌谱 | Node.js / WebSocket / Protobuf（雀魂协议） |
| 代理 | Node.js / http-proxy（统一端口） |

## 项目结构

```
Mahjong/
├── Makefile                  # 一键启动、环境检查、服务管理
├── proxy.cjs                 # 统一端口反向代理 (9999)
├── backend/                  # Django 后端
│   ├── config/               # Django 项目配置
│   ├── apps/users/           # 用户认证
│   ├── apps/players/         # 雀士管理
│   ├── apps/games/           # 对局管理（房间 + 对局 + 牌谱）
│   ├── apps/ranking/         # 段位排名
│   ├── services/             # 业务服务（雀魂牌谱解析）
│   ├── majsoul_node/         # 雀魂牌谱 Node 脚本
│   ├── db_config.json        # 本地配置（不入库）
│   └── db_config.example.json
└── frontend/                 # React 前端
    └── src/
        ├── api/              # API 请求层
        ├── pages/            # 页面组件
        ├── components/       # 通用组件
        └── layouts/          # 布局
```

## 快速开始

### 环境要求

- Python 3.12+
- Node.js 18+（含 npm）
- Make

### 安装

```bash
git clone <repo-url>
cd Mahjong

# 检查环境并安装依赖
make env

# 初始化数据库 + 创建管理员
# 默认账号 admin / admin123
# 可通过环境变量覆盖：ADMIN_USER=xxx ADMIN_PASS=xxx make init
make init
```

### 启动

```bash
make dev
```

| 地址 | 服务 |
|:----:|:----:|
| http://localhost:9999 | 统一入口（推荐） |
| http://localhost:9998 | 前端开发服务器 |
| http://localhost:9997 | 后端 API |

### 常用命令

| 命令 | 说明 |
|:----:|:----:|
| `make dev` | 启动开发环境（后端 + 前端） |
| `make prod` | 构建并部署生产环境（Linux 注册 systemd 服务） |
| `make prod-stop` | 停止并移除生产 systemd 服务 |
| `make mortal` | 后台启动 Mortal AI 推理（开发 / 非 Linux） |
| `make mortal-prod` | 构建 venv 并注册 Mortal systemd 服务（Linux） |
| `make mortal-prod-stop` | 停止并移除 Mortal systemd 服务 |

### 生产部署（Linux）

在项目目录下执行，systemd 服务会以**当前目录**为工作路径：

```bash
# 1. 配置数据库（首次）
cp backend/db_config.example.json backend/db_config.json

# 2. 构建并注册主应用服务（网关 :9999）
make prod

# 3. 可选：注册 Mortal AI 推理服务（:9996）
#    需先配置 mortal-server/config.toml 中的模型权重
make mortal-prod
```

停止并移除服务：

```bash
make prod-stop
make mortal-prod-stop
```

日志位置：

- 主应用：`logs/mahjong-prod.log`
- Mortal：`journalctl -u mahjong-mortal.service -f`

非 Linux 环境（如 macOS）下 `make prod` / `make mortal` 仍使用后台进程方式运行。

## 配置

### 数据库与雀魂账号

编辑 `backend/db_config.json`（从 `db_config.example.json` 复制）：

```json
{
    "database": {
        "sqlite_path": "db.sqlite3"
    },
    "majsoul_account": "你的雀魂账号",
    "majsoul_password": "你的雀魂密码"
}
```

- `sqlite_path`：相对于 `backend/` 目录，也可使用绝对路径
- `majsoul_account` / `majsoul_password`：用于通过雀魂 WebSocket 协议获取牌谱详情
- 该文件已在 `.gitignore` 中，不会被提交

> 也可通过环境变量 `MAJSOUL_ACCOUNT` / `MAJSOUL_PASSWORD` 覆盖

### 雀魂牌谱 Node 依赖

首次使用牌谱导入功能前，需安装 Node 依赖：

```bash
cd backend/majsoul_node && npm install
```

## 计分规则

### 分数

- **4 人对局**：分数总和 = 1000
- **3 人对局**：分数总和 = 1050
- 分数为整数，可以为负数
- 必须指定一名东起选手

### PT 计算

| 排名 | 4 人 | 3 人 |
|:----:|:----:|:----:|
| 1 位 | +30 | +30 |
| 2 位 | +10 | 0 |
| 3 位 | -10 | -30 |
| 4 位 | -30 | — |

## 管理员

- 页面右上角「管理员登录」入口
- 管理员可进行所有写操作（创建房间、录分、管理雀士等）
- 其他人可自由浏览所有页面
- 通过 Django 命令创建管理员：

```bash
cd backend
.venv/bin/python manage.py createsuperuser
```

## License

[MIT](LICENSE)

---

<p align="center">
  <a href="README.md">中文</a> &middot;
  <a href="README.en.md">English</a> &middot;
  <a href="README.ja.md">日本語</a>
</p>
