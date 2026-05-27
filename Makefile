.PHONY: dev prod build-prod

BACKEND_PORT := 9997
GATEWAY_PORT := 9999
LOG_FILE := /tmp/mahjong_dev.log

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

# Production: static frontend via Go gateway on $(GATEWAY_PORT), backend on $(BACKEND_PORT).
# Supervisor monitors ports and restarts; logs errors to $(LOG_FILE).
# Stops restarting after 10 failures within 5 minutes.
prod: build-prod
	@trap 'kill 0 2>/dev/null; exit 0' INT TERM EXIT; \
	cd backend && ./mahjong-prodsupervisor \
		--backend-bin ./mahjong-backend \
		--gateway-bin ./mahjong-gateway \
		--static-dir ../frontend/dist \
		--config db_config.json \
		--backend-port $(BACKEND_PORT) \
		--gateway-port $(GATEWAY_PORT) \
		--log $(LOG_FILE)
