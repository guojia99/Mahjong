.PHONY: dev stop restart check init migrate

PIDDIR := .make-pids
ADMIN_USER ?= admin
ADMIN_PASS ?= admin123

## 初始化项目 (迁移数据库 + 创建管理员)
init: migrate
	@echo "\033[36mCreating admin user...\033[0m"
	@ADMIN_USER="$(ADMIN_USER)" ADMIN_PASS="$(ADMIN_PASS)" cd backend && .venv/bin/python create_admin.py
	@echo "\033[32mDone.\033[0m"

## 数据库迁移
migrate:
	@cd backend && .venv/bin/python manage.py migrate

## 一键启动前后端
dev:
	@mkdir -p $(PIDDIR)
	@$(MAKE) stop > /dev/null 2>&1; sleep 0.5
	@trap '$(MAKE) stop; rm -rf $(PIDDIR); exit 0' INT TERM; \
	$(MAKE) _run-backend & \
	$(MAKE) _run-frontend & \
	$(MAKE) _wait-ready; \
	echo "\n\033[36m  Frontend: \033[4;34mhttp://localhost:3000\033[0m\033[36m\033[0m"; \
	echo "\033[36m  Backend:  \033[4;34mhttp://localhost:8000\033[0m\033[36m\033[0m"; \
	echo "\033[32m  All services running. Press Ctrl+C to stop.\033[0m\n"; \
	wait

## 停止所有服务
stop:
	@echo "\033[33mStopping services...\033[0m"
	@-if [ -f $(PIDDIR)/backend.pid ]; then \
		kill $$(cat $(PIDDIR)/backend.pid) 2>/dev/null && echo "  Backend stopped"; \
	fi
	@-if [ -f $(PIDDIR)/frontend.pid ]; then \
		kill $$(cat $(PIDDIR)/frontend.pid) 2>/dev/null && echo "  Frontend stopped"; \
	fi
	@-rm -rf $(PIDDIR)
	@pkill -f "manage.py runserver" 2>/dev/null; \
	pkill -f "vite.*3000" 2>/dev/null; \
	echo "\033[32mDone.\033[0m"

## 重启所有服务
restart:
	@$(MAKE) stop
	@echo "\033[33mRestarting...\033[0m"
	@$(MAKE) dev

## 检查服务状态
check:
	@echo "\033[36mChecking services...\033[0m"
	@curl -so /dev/null -w "  Backend  (8000): %{http_code}\n" http://localhost:8000/api/v1/auth/me/ 2>/dev/null || \
		echo "  Backend  (8000): \033[31mDOWN\033[0m"
	@curl -so /dev/null -w "  Frontend (3000): %{http_code}\n" http://localhost:3000/ 2>/dev/null || \
		echo "  Frontend (3000): \033[31mDOWN\033[0m"

# ---------- internal ----------

_run-backend:
	@cd backend && .venv/bin/python manage.py runserver 8000 > /dev/null 2>&1 & echo $$! > ../$(PIDDIR)/backend.pid

_run-frontend:
	@cd frontend && npm run dev > /dev/null 2>&1 & echo $$! > ../$(PIDDIR)/frontend.pid

_wait-ready:
	@echo "\033[33mWaiting for services to be ready...\033[0m"
	@for i in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20 21 22 23 24 25 26 27 28 29 30; do \
		BACKEND=$$(curl -so /dev/null -w "%{http_code}" http://localhost:8000/api/v1/auth/me/ 2>/dev/null); \
		FRONTEND=$$(curl -so /dev/null -w "%{http_code}" http://localhost:3000/ 2>/dev/null); \
		if [ "$$FRONTEND" != "000" ]; then \
			echo "  Frontend ready \033[32m✓\033[0m"; \
			break; \
		fi; \
		if [ $$((i % 5)) -eq 0 ]; then echo "  Waiting... ($$i s)"; fi; \
		sleep 1; \
	done; \
	for i in 1 2 3 4 5; do \
		BACKEND=$$(curl -so /dev/null -w "%{http_code}" http://localhost:8000/api/v1/auth/me/ 2>/dev/null); \
		if [ "$$BACKEND" != "000" ]; then \
			echo "  Backend ready  \033[32m✓\033[0m"; \
			break; \
		fi; \
		sleep 1; \
	done
