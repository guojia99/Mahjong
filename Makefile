.PHONY: dev prod prod-stop prod\:stop build-prod free-dev-ports free-prod-ports venv \
	mortal mortal-stop mortal\:stop mortal-prod mortal-prod-stop mortal-prod\:stop

ROOT_DIR := $(abspath $(dir $(lastword $(MAKEFILE_LIST))))
UNAME_S := $(shell uname -s)
VENV := $(ROOT_DIR)/.venv
VENV_PYTHON := $(VENV)/bin/python
MORTAL_DIR := mortal-server
MORTAL_PID := /tmp/mahjong_mortal.pid
MORTAL_LOG := /tmp/mahjong_mortal.log

BACKEND_PORT := 9997
FRONTEND_PORT := 9998
GATEWAY_PORT := 9999
LOG_DIR := $(ROOT_DIR)/logs
LOG_FILE := $(LOG_DIR)/mahjong-prod.log
PID_FILE := /tmp/mahjong_prod.pid
SYSTEMD_SCRIPT := $(ROOT_DIR)/scripts/systemd-service.sh

PROD_SUPERVISOR_FLAGS := \
	--backend-bin ./mahjong-backend \
	--gateway-bin ./mahjong-gateway \
	--static-dir ../frontend/dist \
	--config db_config.json \
	--backend-port $(BACKEND_PORT) \
	--gateway-port $(GATEWAY_PORT) \
	--log $(LOG_FILE) \
	--pidfile $(PID_FILE) \
	--quiet

# Python venv for mortal-server (Tsinghua pip mirror). Idempotent.
venv:
	@bash "$(ROOT_DIR)/scripts/ensure-venv.sh"

# Kill orphaned backend / vite from a previous `make dev`.
free-dev-ports:
	@for port in $(BACKEND_PORT) $(FRONTEND_PORT); do \
		pids=$$(lsof -tiTCP:$$port -sTCP:LISTEN 2>/dev/null); \
		if [ -n "$$pids" ]; then \
			echo "Releasing dev port $$port (pid $$pids)"; \
			kill -TERM $$pids 2>/dev/null || true; \
			sleep 1; \
			pids=$$(lsof -tiTCP:$$port -sTCP:LISTEN 2>/dev/null); \
			[ -n "$$pids" ] && kill -KILL $$pids 2>/dev/null || true; \
		fi; \
	done

dev: venv free-dev-ports
	@trap 'kill 0 2>/dev/null; exit 0' INT TERM EXIT; \
	cd backend && go build -o mahjong-backend . && ./mahjong-backend --config db_config.json --port $(BACKEND_PORT) & \
	cd frontend && npm install --silent && npm run dev & \
	echo ""; \
	echo "  Frontend: http://localhost:$(FRONTEND_PORT)"; \
	echo "  Backend:  http://localhost:$(BACKEND_PORT)"; \
	echo "  Python:   $(VENV_PYTHON) (mortal: make mortal or make mortal-prod on Linux)"; \
	echo ""; \
	wait

# Build frontend static assets + backend/gateway/supervisor binaries.
build-prod:
	cd frontend && npm install --silent && npm run build
	cd backend && go build -o mahjong-backend .
	cd backend && go build -o mahjong-gateway ./cmd/gateway
	cd backend && go build -o mahjong-prodsupervisor ./cmd/prodsupervisor

# Kill any process still listening on prod ports (e.g. orphaned gateway / old node proxy).
free-prod-ports:
	@for port in $(BACKEND_PORT) $(GATEWAY_PORT); do \
		pids=$$(lsof -tiTCP:$$port -sTCP:LISTEN 2>/dev/null); \
		if [ -n "$$pids" ]; then \
			echo "Releasing port $$port (pid $$pids)"; \
			kill -TERM $$pids 2>/dev/null || true; \
			sleep 1; \
			pids=$$(lsof -tiTCP:$$port -sTCP:LISTEN 2>/dev/null); \
			[ -n "$$pids" ] && kill -KILL $$pids 2>/dev/null || true; \
		fi; \
	done

# Production (Linux): build + install systemd service. Other OS: daemonized nohup.
prod: build-prod
	@mkdir -p "$(LOG_DIR)"
	@if [ ! -f backend/db_config.json ]; then \
		echo "Missing backend/db_config.json"; \
		echo "  cp backend/db_config.example.json backend/db_config.json"; \
		echo "  Edit sqlite_path (e.g. marjong.db or db.sqlite3) relative to backend/"; \
		exit 1; \
	fi
ifeq ($(UNAME_S),Linux)
	@ROOT_DIR="$(ROOT_DIR)" LOG_DIR="$(LOG_DIR)" PROD_LOG="$(LOG_FILE)" \
		BACKEND_PORT="$(BACKEND_PORT)" GATEWAY_PORT="$(GATEWAY_PORT)" \
		bash "$(SYSTEMD_SCRIPT)" prod install
else
	@if [ -f $(PID_FILE) ] && kill -0 $$(cat $(PID_FILE)) 2>/dev/null; then \
		echo "prod already running (pid $$(cat $(PID_FILE)))"; \
		echo "  App: http://127.0.0.1:$(GATEWAY_PORT)"; \
		echo "  Stop: make prod-stop  (or make prod:stop)"; \
		exit 1; \
	fi
	@$(MAKE) free-prod-ports
	@rm -f $(PID_FILE)
	@cd backend && nohup ./mahjong-prodsupervisor $(PROD_SUPERVISOR_FLAGS) >> $(LOG_FILE) 2>&1 </dev/null &
	@sleep 1; \
	if [ -f $(PID_FILE) ] && kill -0 $$(cat $(PID_FILE)) 2>/dev/null; then \
		echo "Production started (pid $$(cat $(PID_FILE)))"; \
		echo "  App: http://127.0.0.1:$(GATEWAY_PORT)"; \
		echo "  Log: $(LOG_FILE)"; \
		echo "  Stop: make prod-stop  (or make prod:stop)"; \
	else \
		echo "Failed to start prod, see $(LOG_FILE)"; \
		rm -f $(PID_FILE); \
		exit 1; \
	fi
endif

prod-stop:
ifeq ($(UNAME_S),Linux)
	@ROOT_DIR="$(ROOT_DIR)" bash "$(SYSTEMD_SCRIPT)" prod remove || true
	@$(MAKE) free-prod-ports
else
	@if [ ! -f $(PID_FILE) ]; then \
		echo "prod supervisor is not running"; \
		$(MAKE) free-prod-ports; \
		exit 0; \
	fi
	@PID=$$(cat $(PID_FILE)); \
	if ! kill -0 $$PID 2>/dev/null; then \
		echo "prod not running (stale pid $$PID)"; \
		rm -f $(PID_FILE); \
		exit 0; \
	fi; \
	echo "Stopping prod (pid $$PID)..."; \
	kill -TERM $$PID 2>/dev/null; \
	for i in 1 2 3 4 5 6 7 8 9 10; do \
		kill -0 $$PID 2>/dev/null || break; \
		sleep 1; \
	done; \
	kill -0 $$PID 2>/dev/null && { echo "Force killing supervisor..."; kill -KILL $$PID 2>/dev/null; sleep 1; }; \
	rm -f $(PID_FILE); \
	$(MAKE) free-prod-ports; \
	echo "Stopped."
endif

# `make prod:stop` — colon must be escaped in the Makefile target name.
prod\:stop: prod-stop
	@:

# Mortal AI inference server (http://127.0.0.1:9996) — foreground-style daemon (dev / macOS).
mortal: venv
	@if [ -f $(MORTAL_PID) ] && kill -0 $$(cat $(MORTAL_PID)) 2>/dev/null; then \
		echo "mortal already running (pid $$(cat $(MORTAL_PID)))"; \
		echo "  Health: curl http://127.0.0.1:9996/health"; \
		echo "  Stop: make mortal-stop"; \
		exit 0; \
	fi
	@cd $(MORTAL_DIR) && nohup env PYTHON="$(VENV_PYTHON)" ./start.sh >> $(MORTAL_LOG) 2>&1 </dev/null & echo $$! > $(MORTAL_PID); \
	sleep 2; \
	if kill -0 $$(cat $(MORTAL_PID)) 2>/dev/null; then \
		echo "Mortal started (pid $$(cat $(MORTAL_PID)))"; \
		echo "  Python: $(VENV_PYTHON)"; \
		echo "  Health: curl http://127.0.0.1:9996/health"; \
		echo "  Log:  $(MORTAL_LOG)"; \
		echo "  Stop: make mortal-stop"; \
	else \
		echo "Failed to start mortal, see $(MORTAL_LOG)"; \
		rm -f $(MORTAL_PID); \
		exit 1; \
	fi

mortal-stop:
	@if [ -f $(MORTAL_PID) ]; then \
		PID=$$(cat $(MORTAL_PID)); \
		if kill -0 $$PID 2>/dev/null; then kill -TERM $$PID 2>/dev/null; sleep 1; fi; \
		if kill -0 $$PID 2>/dev/null; then kill -KILL $$PID 2>/dev/null; fi; \
		rm -f $(MORTAL_PID); \
	fi
	@pids=$$(lsof -tiTCP:9996 -sTCP:LISTEN 2>/dev/null); \
	if [ -n "$$pids" ]; then echo "Releasing port 9996 (pid $$pids)"; kill -TERM $$pids 2>/dev/null || true; fi
	@echo "Mortal stopped."

mortal\:stop: mortal-stop
	@:

# Mortal AI — Linux systemd service (install + enable + start).
mortal-prod: venv
ifeq ($(UNAME_S),Linux)
	@ROOT_DIR="$(ROOT_DIR)" bash "$(SYSTEMD_SCRIPT)" mortal install
else
	@echo "mortal-prod is Linux-only; use: make mortal" >&2; \
	exit 1
endif

mortal-prod-stop:
ifeq ($(UNAME_S),Linux)
	@ROOT_DIR="$(ROOT_DIR)" bash "$(SYSTEMD_SCRIPT)" mortal remove || true
	@pids=$$(lsof -tiTCP:9996 -sTCP:LISTEN 2>/dev/null); \
	if [ -n "$$pids" ]; then echo "Releasing port 9996 (pid $$pids)"; kill -TERM $$pids 2>/dev/null || true; fi
else
	@echo "mortal-prod-stop is Linux-only" >&2; \
	exit 1
endif

mortal-prod\:stop: mortal-prod-stop
	@:
