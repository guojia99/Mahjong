# 嘉の雀桩 - 启动指南

## 快速启动

### 后端 (Django)

```bash
cd backend
python -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate
pip install -r requirements.txt
python manage.py migrate
python manage.py createsuperuser  # 可选
python manage.py runserver 8000
```

### 前端 (React + TypeScript)

```bash
cd frontend
npm install
npm run dev
```

访问 http://localhost:3000 即可使用。

## 开发说明

- 后端 API: http://localhost:8000/api/v1/
- 后端 Admin: http://localhost:8000/admin/
- 前端已配置代理，开发模式下会自动转发 `/api` 请求到后端
