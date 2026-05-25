.PHONY: dev

dev:
	@trap 'kill 0 2>/dev/null; exit 0' INT TERM EXIT; \
 	cd backend/go && go build -o mahjong-backend . && ./mahjong-backend --config ../../backend/db_config.json --port 9997 & \
	cd frontend && npm install --silent && npm run dev & \
	echo ""; \
	echo "  Frontend: http://localhost:9998"; \
	echo "  Backend:  http://localhost:9997"; \
	echo ""; \
	wait
