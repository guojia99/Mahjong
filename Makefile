.PHONY: dev stop restart check init migrate env _check-python _check-npm

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

## 检查并初始化开发环境 (Python + npm)
env:
	@echo "\033[36mChecking development environment...\033[0m"
	@$(MAKE) --no-print-directory _check-python
	@$(MAKE) --no-print-directory _check-npm
	@echo "\033[32mEnvironment ready ✓\033[0m"

_check-python:
	@if ! command -v python3 > /dev/null 2>&1; then \
		echo "\033[31m  ✗ python3 not found.\033[0m Please install Python 3.12+"; \
		exit 1; \
	fi
	@echo "\033[32m  ✓ python3\033[0m $$(python3 --version 2>&1)"
	@if [ ! -d backend/.venv ]; then \
		echo "  Creating Python venv..."; \
		python3 -m venv backend/.venv; \
	fi
	@if [ ! -f backend/.venv/bin/pip ]; then \
		echo "  Bootstrap pip..."; \
		python3 -m venv backend/.venv --clear; \
		backend/.venv/bin/python -m ensurepip --upgrade 2>/dev/null; \
	fi
	@backend/.venv/bin/pip install -q -r backend/requirements.txt 2>&1 | grep -v "already satisfied" || true
	@echo "\033[32m  ✓ Python venv + dependencies\033[0m"

_check-npm:
	@if ! command -v node > /dev/null 2>&1; then \
		echo "\033[31m  ✗ node not found.\033[0m Please install Node.js 18+"; \
		exit 1; \
	fi
	@if ! command -v npm > /dev/null 2>&1; then \
		echo "\033[31m  ✗ npm not found.\033[0m Please install Node.js 18+"; \
		exit 1; \
	fi
	@echo "\033[32m  ✓ node\033[0m $$(node --version)"
	@echo "\033[32m  ✓ npm\033[0m $$(npm --version)"
	@if [ ! -d frontend/node_modules ]; then \
		echo "  Installing frontend dependencies..."; \
		cd frontend && npm install; \
	else \
		cd frontend && npm install --prefer-offline; \
	fi
	@echo "\033[32m  ✓ Frontend dependencies\033[0m"
	@if [ ! -d node_modules ]; then \
		echo "  Installing proxy dependencies..."; \
		npm install --no-save; \
	fi
	@echo "\033[32m  ✓ Proxy dependencies\033[0m"

## 一键启动前后端 + 反向代理
dev:
	@$(MAKE) stop > /dev/null 2>&1; sleep 0.5
	@mkdir -p $(PIDDIR)
	@trap '$(MAKE) stop; exit 0' INT TERM; \
	$(MAKE) _install-proxy; \
	$(MAKE) _run-backend & \
	$(MAKE) _run-frontend & \
	$(MAKE) _wait-ready; \
	$(MAKE) _run-proxy & \
	echo "\n\033[36m  Unified : \033[4;34mhttp://localhost:9999\033[0m\033[36m\033[0m"; \
	echo "\033[36m  Frontend: \033[4;34mhttp://localhost:9998\033[0m\033[36m\033[0m"; \
	echo "\033[36m  Backend:  \033[4;34mhttp://localhost:9997\033[0m\033[36m\033[0m"; \
	echo "\033[32m  All services running. Press Ctrl+C to stop.\033[0m\n"; \
	wait

_kill-pid:
	@-if [ -f $(PIDDIR)/$(1).pid ]; then \
		PID=$$(cat $(PIDDIR)/$(1).pid); \
		kill -TERM -$$PID 2>/dev/null; \
		kill -TERM $$PID 2>/dev/null; \
		kill -KILL $$PID 2>/dev/null; \
		echo "  $(1) stopped"; \
	fi

## 停止所有服务
stop:
	@echo "\033[33mStopping services...\033[0m"
	@$(MAKE) --no-print-directory _kill-pid PID=proxy
	@$(MAKE) --no-print-directory _kill-pid PID=frontend
	@$(MAKE) --no-print-directory _kill-pid PID=backend
	@-rm -rf $(PIDDIR)
	@echo "\033[32mDone.\033[0m"

## 重启所有服务
restart:
	@$(MAKE) stop
	@echo "\033[33mRestarting...\033[0m"
	@$(MAKE) dev

## 检查服务状态
check:
	@echo "\033[36mChecking services...\033[0m"
	@curl -so /dev/null -w "  Proxy    (9999): %{http_code}\n" http://localhost:9999/ 2>/dev/null || \
		echo "  Proxy    (9999): \033[31mDOWN\033[0m"
	@curl -so /dev/null -w "  Backend  (9997): %{http_code}\n" http://localhost:9997/api/v1/auth/me/ 2>/dev/null || \
		echo "  Backend  (9997): \033[31mDOWN\033[0m"
	@curl -so /dev/null -w "  Frontend (9998): %{http_code}\n" http://localhost:9998/ 2>/dev/null || \
		echo "  Frontend (9998): \033[31mDOWN\033[0m"

# ---------- internal ----------

_install-proxy:
	@if [ ! -d node_modules ]; then \
		echo "\033[33mInstalling proxy dependencies...\033[0m"; \
		npm install --no-save; \
	fi

_run-backend:
	@cd backend && .venv/bin/python manage.py runserver 9997 > /dev/null 2>&1 & echo $$! > ../$(PIDDIR)/backend.pid

_run-frontend:
	@cd frontend && npm run dev > /dev/null 2>&1 & echo $$! > ../$(PIDDIR)/frontend.pid

_run-proxy:
	@node proxy.cjs > /dev/null 2>&1 & echo $$! > $(PIDDIR)/proxy.pid

_wait-ready:
	@echo "\033[33mWaiting for services to be ready...\033[0m"
	@for i in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20 21 22 23 24 25 26 27 28 29 30; do \
		FRONTEND=$$(curl -so /dev/null -w "%{http_code}" http://localhost:9998/ 2>/dev/null); \
		if [ "$$FRONTEND" != "000" ]; then \
			echo "  Frontend ready \033[32m✓\033[0m"; \
			break; \
		fi; \
		if [ $$((i % 5)) -eq 0 ]; then echo "  Waiting... ($$i s)"; fi; \
		sleep 1; \
	done; \
	for i in 1 2 3 4 5; do \
		BACKEND=$$(curl -so /dev/null -w "%{http_code}" http://localhost:9997/api/v1/auth/me/ 2>/dev/null); \
		if [ "$$BACKEND" != "000" ]; then \
			echo "  Backend ready  \033[32m✓\033[0m"; \
			break; \
		fi; \
		sleep 1; \
	done
