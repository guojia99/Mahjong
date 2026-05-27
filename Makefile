.PHONY: dev prod prod-stop prod\:stop build-prod free-prod-ports

BACKEND_PORT := 9997
GATEWAY_PORT := 9999
LOG_FILE := /tmp/mahjong_dev.log
PID_FILE := /tmp/mahjong_prod.pid

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

dev:
	@trap 'kill 0 2>/dev/null; exit 0' INT TERM EXIT; \
	cd backend && go build -o mahjong-backend . && ./mahjong-backend --config db_config.json --port $(BACKEND_PORT) & \
	cd frontend && npm install --silent && npm run dev & \
	echo ""; \
	echo "  Frontend: http://localhost:9998"; \
	echo "  Backend:  http://localhost:$(BACKEND_PORT)"; \
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

# Production: daemonized; use `make prod-stop` to stop (not Ctrl+C).
prod: build-prod
	@if [ -f $(PID_FILE) ] && kill -0 $$(cat $(PID_FILE)) 2>/dev/null; then \
		echo "prod already running (pid $$(cat $(PID_FILE)))"; \
		echo "  App: http://127.0.0.1:$(GATEWAY_PORT)"; \
		echo "  Stop: make prod-stop  (or make prod:stop)"; \
		exit 1; \
	fi
	@if [ ! -f backend/db_config.json ]; then \
		echo "Missing backend/db_config.json"; \
		echo "  cp backend/db_config.example.json backend/db_config.json"; \
		echo "  Edit sqlite_path (e.g. marjong.db or db.sqlite3) relative to backend/"; \
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

prod-stop:
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

# `make prod:stop` — colon must be escaped in the Makefile target name.
prod\:stop: prod-stop
	@:
