# 嘉の雀桩 - 启动指南

## 环境要求
- **Go**: 1.26+
- **Node.js**: 18+
- **npm**: 9+

## 快速启动

### 一键启动 (推荐)

```bash
make dev
```

该命令会同时启动后端和前端，访问：
- 前端: http://localhost:9998
- 后端: http://localhost:9997

### 后端 (Go)

```bash
cd backend/go
go build -o mahjong-backend .
./mahjong-backend --config ../../backend/db_config.json --port 9997
```

后端启动参数：
- `--config, -c`: 数据库配置文件路径 (默认 `backend/db_config.json`)
- `--port, -p`: 监听端口 (默认 8000)

### 前端 (React + TypeScript)

```bash
cd frontend
npm install
npm run dev
```

### 数据库配置

复制示例配置文件并修改：

```bash
cp backend/db_config.example.json backend/db_config.json
```

`db_config.json` 格式：

```json
{
    "database": {
        "sqlite_path": "db.sqlite3"
    },
    "majsoul_account": "",
    "majsoul_password": ""
}
```

## 开发说明

- 后端 API: http://localhost:9997/api/v1/
- 前端开发端口: http://localhost:9998
- 前端已配置 Vite 代理，开发模式下自动转发 `/api` 和 `/media` 请求到后端 `127.0.0.1:9997`
- 数据库使用 SQLite，数据文件为 `backend/marjong.db`
- 时区固定为 CST (UTC+8)
